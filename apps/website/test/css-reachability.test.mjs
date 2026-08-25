import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  analyseReachability,
  builtPages,
  ownedSelectors,
} from './css-reachability.mjs';

const pages = builtPages();
const selectors = ownedSelectors();

describe('ADR-055 built-output CSS selector reachability', () => {
  it('has a non-empty built corpus and site-owned selector inventory', () => {
    assert.ok(pages.length >= 6, `expected at least 6 built pages, found ${pages.length}`);
    assert.ok(
      selectors.length >= 100,
      `expected at least 100 site-authored selectors, found ${selectors.length}`,
    );
  });

  it('fails when the status header loses the id required by its compound selector', () => {
    const mutated = pages.map(([file, html]) => [
      file,
      html.replace('<header id="header" class="alt status-header">', '<header class="alt status-header">'),
    ]);
    const result = analyseReachability({ pages: mutated, selectors });
    assert.ok(
      result.forward.some((finding) => finding.includes('status-header')),
      'removing the status header id did not break forward reachability',
    );
    assert.ok(
      result.reverse.some((selector) => selector.includes('#header.status-header')),
      'removing the status header id did not orphan its site selector',
    );
  });

  it('fails when the responsive menu wrapper is no longer a nav', () => {
    const mutated = pages.map(([file, html]) => [
      file,
      html.replace(
        /<nav><button([^>]*class="menu-link"[\s\S]*?<\/button>)<\/nav>/g,
        '<div class="nav"><button$1</div>',
      ),
    ]);
    const result = analyseReachability({ pages: mutated, selectors });
    assert.ok(
      result.reverse.some((selector) => selector.includes('#header nav')),
      'changing the wrapper did not orphan the responsive header nav selectors',
    );
  });

  it('fails loudly on empty page or selector corpora', () => {
    assert.throws(() => analyseReachability({ pages: [], selectors }), /zero built HTML pages/);
    assert.throws(() => analyseReachability({ pages, selectors: [] }), /zero site-authored selectors/);
  });
});
