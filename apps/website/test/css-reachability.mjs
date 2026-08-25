import { load } from 'cheerio';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import * as sass from 'sass';
import { SourceMapConsumer } from 'source-map-js';

const WEBSITE = path.resolve(import.meta.dirname, '..');
const PUBLIC = path.join(WEBSITE, 'public');
const MAIN_SCSS = path.join(WEBSITE, 'src/assets/scss/main.scss');

// Named ownership boundaries from ADR-055. Font Awesome remains an @import in
// Sass output, Swagger UI is imported by api-docs.js, and skel emits the Meyer
// reset. None is site-authored selector inventory.
export const THIRD_PARTY_SOURCES = [
  'font-awesome.min.css',
  'swagger-ui.css',
  'libs/_skel.scss',
];

const DYNAMIC_PSEUDOS = new Set([
  ':active',
  ':checked',
  ':disabled',
  ':enabled',
  ':focus',
  ':focus-visible',
  ':focus-within',
  ':hover',
  ':invalid',
  ':link',
  ':optional',
  ':placeholder-shown',
  ':required',
  ':target',
  ':valid',
  ':visited',
  ':after',
  ':before',
  ':-moz-placeholder',
  ':-ms-input-placeholder',
  '::-moz-placeholder',
  '::-webkit-input-placeholder',
]);

function walkFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(absolute) : [absolute];
  });
}

export function builtPages(directory = PUBLIC) {
  return walkFiles(directory)
    .filter((file) => file.endsWith('.html') && !file.includes(`${path.sep}page-data${path.sep}`))
    .map((file) => [path.relative(directory, file), readFileSync(file, 'utf8')]);
}

function selectorsFrom(selector) {
  const selectors = [];
  selectorParser((root) => root.each((item) => selectors.push(item.toString()))).processSync(
    selector,
  );
  return selectors;
}

function normaliseSelector(selector) {
  return selectorParser((root) => {
    root.walkPseudos((pseudo) => {
      if (pseudo.value.startsWith('::') || DYNAMIC_PSEUDOS.has(pseudo.value)) {
        pseudo.remove();
      }
    });
  })
    .processSync(selector)
    .trim() || '*';
}

export function ownedSelectors() {
  const compiled = sass.compile(MAIN_SCSS, {
    logger: sass.Logger.silent,
    sourceMap: true,
    style: 'expanded',
  });
  const consumer = new SourceMapConsumer(compiled.sourceMap);
  const selectors = new Map();

  postcss.parse(compiled.css).walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
    const original = consumer.originalPositionFor({
      line: rule.source.start.line,
      column: rule.source.start.column - 1,
    });
    if (!original.source || THIRD_PARTY_SOURCES.some((name) => original.source.endsWith(name))) {
      return;
    }
    for (const selector of selectorsFrom(rule.selector)) selectors.set(selector, original.source);
  });

  return [...selectors].map(([selector, source]) => ({
    original: selector,
    query: normaliseSelector(selector),
    source,
  }));
}

function documentsFrom(pages) {
  return pages.flatMap(([file, html]) => {
    const original = load(html);
    const settled = load(html);
    settled('.body').removeClass('is-loading');
    const menu = load(settled.html());
    menu('.body').addClass('is-menu-visible');
    const touch = load(settled.html());
    touch('html').addClass('is-touch');
    return [
      [`${file} (built)`, original],
      [`${file} (settled)`, settled],
      [`${file} (menu open)`, menu],
      [`${file} (touch)`, touch],
    ];
  });
}

function tokensIn(selector) {
  const tokens = [];
  selectorParser((root) => {
    root.walkClasses((node) => tokens.push(`.${node.value}`));
    root.walkIds((node) => tokens.push(`#${node.value}`));
  }).processSync(selector);
  return tokens;
}

export function analyseReachability({ pages = builtPages(), selectors = ownedSelectors() } = {}) {
  if (pages.length === 0) throw new Error('CSS reachability has zero built HTML pages');
  if (selectors.length === 0) throw new Error('CSS reachability has zero site-authored selectors');

  const documents = documentsFrom(pages);
  const unsupported = [];
  const reverse = selectors.filter(({ original, query }) => {
    try {
      return !documents.some(([, $]) => $(query).length > 0);
    } catch (error) {
      unsupported.push(`${original}: ${error.message}`);
      return true;
    }
  });

  const forward = [];
  for (const [file, html] of pages) {
    const $ = load(html);
    const tokenCounts = new Map();
    $('[id], [class]').each((_, element) => {
      const elementTokens = [
        ...($(element).attr('id') ? [`#${$(element).attr('id')}`] : []),
        ...($(element).attr('class') ?? '').split(/\s+/).filter(Boolean).map((name) => `.${name}`),
      ];
      for (const token of elementTokens) tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
    });

    for (const { original, query } of selectors) {
      const tokens = [...new Set(tokensIn(original))];
      if (tokens.length < 2) continue;
      for (const token of tokens.filter((item) => tokenCounts.get(item) === 1)) {
        const element = $(token).get(0);
        if (!element || documents.some(([, document]) => document(query).length > 0)) continue;
        forward.push(`${file}: ${$.html(element).slice(0, 180)} requires ${original}`);
      }
    }
  }

  return {
    forward,
    reverse: reverse.map(({ original }) => original),
    unsupported,
    pageCount: pages.length,
    selectorCount: selectors.length,
  };
}
