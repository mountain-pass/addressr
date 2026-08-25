import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const eslint = path.join(repoRoot, 'node_modules/eslint/bin/eslint.js');

const lint = (source, filename) => {
  const result = spawnSync(
    process.execPath,
    [eslint, '--stdin', '--stdin-filename', filename, '--format', 'json'],
    { cwd: repoRoot, input: source, encoding: 'utf8' },
  );
  assert.equal(result.error, undefined, result.error?.message);
  return {
    status: result.status,
    messages: JSON.parse(result.stdout)[0].messages,
  };
};

describe('website ESLint accessibility configuration', () => {
  it('parses and lints TSX source', () => {
    const result = lint(
      `const Field = (): unknown => <label htmlFor="field">Search<input id="field" /></label>;
       export default Field;`,
      'apps/website/src/__eslint-fixture.tsx',
    );
    assert.equal(result.status, 0, JSON.stringify(result.messages));
  });

  it('rejects an empty Gatsby overlay Link', () => {
    const result = lint(
      `import { Link } from 'gatsby';
       export default () => <Link to="/api-docs/" />;`,
      'apps/website/src/__eslint-fixture.jsx',
    );
    assert.equal(result.status, 1);
    assert.ok(
      result.messages.some(
        ({ ruleId }) => ruleId === 'jsx-a11y-x/anchor-has-content',
      ),
      JSON.stringify(result.messages),
    );
  });

  it('accepts a Gatsby overlay Link with source content', () => {
    const result = lint(
      `import { Link } from 'gatsby';
       const Overlay = () => <Link to="/api-docs/"><span>Easy To Use API</span></Link>;
       export default Overlay;`,
      'apps/website/src/__eslint-fixture.jsx',
    );
    assert.equal(result.status, 0, JSON.stringify(result.messages));
  });

  it('rejects a label with no associated input', () => {
    const result = lint(
      `export default () => <><label>Search for an address</label><input id="address-search" /></>;`,
      'apps/website/src/__eslint-fixture.jsx',
    );
    assert.equal(result.status, 1);
    assert.ok(
      result.messages.some(
        ({ ruleId }) => ruleId === 'jsx-a11y-x/label-has-associated-control',
      ),
      JSON.stringify(result.messages),
    );
  });

  it('accepts an explicitly associated label and input', () => {
    const result = lint(
      `const Search = () => <><label htmlFor="address-search">Search for an address</label><input id="address-search" /></>;
       export default Search;`,
      'apps/website/src/__eslint-fixture.jsx',
    );
    assert.equal(result.status, 0, JSON.stringify(result.messages));
  });
});
