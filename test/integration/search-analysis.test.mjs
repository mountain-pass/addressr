// @jtbd JTBD-203 (Acquire and Refresh the G-NAF Dataset on a Self-Hosted Install)
//
// Integration test for ADR-041 / P069 — the partial-prefix superset property.
//
// This talks to a REAL OpenSearch on purpose. The property under test is Lucene
// analysis behaviour: a mock would assert only that we wrote the config we
// wrote, which is the source-inspection anti-pattern (P033) in a different
// costume. It builds the index from the same exported builders production uses,
// so the config cannot drift from what is asserted here.
//
// Deliberately NOT under test/js/__tests__/ — that glob is `test:js`, which runs
// in pre-commit. A test that silently skips on every commit because no engine is
// listening is a false green sitting in the hook.
//
// Skip/fail polarity: skips when the port is unreachable AND CI is unset; FAILS
// when CI is set. A conditional skip is only honest if something guarantees it
// ran somewhere, and ADR-041's confirmation criterion requires a test that fails
// against the old config and passes against the new — a skipped test satisfies
// neither half.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAddressIndexBody,
  buildAnalysis,
  mapAuthCodeTableToSynonymList,
} from '../../src/init-index-config.js';

const HOST = process.env.ELASTIC_TEST_HOST || 'http://localhost:9200';
const INDEX = 'addressr-adr041-integration';
const OLD_INDEX = `${INDEX}-old`;

// A representative slice of the real G-NAF authority tables, covering both
// directions and a multi-word member.
const AUTH_ROWS = [
  { CODE: 'BRIDGE', NAME: 'BDGE' }, // STREET_TYPE: full => abbrev
  { CODE: 'STREET', NAME: 'ST' },
  { CODE: 'ROAD', NAME: 'RD' },
  { CODE: 'PARADE', NAME: 'PDE' },
  { CODE: 'S', NAME: 'SOUTH' }, // STREET_SUFFIX: abbrev => full
  { CODE: 'NE', NAME: 'NORTH EAST' }, // multi-word member
];

const ADDRESSES = [
  '55 PYRMONT BRIDGE RD, PYRMONT NSW 2009',
  '55 HARRIS ST, PYRMONT NSW 2009',
  '12 SMITH ST NE, DARWIN NT 0800',
  '9 THE GRAND PDE, BRIGHTON VIC 3186',
];

async function reachable() {
  try {
    const response = await fetch(HOST, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function es(method, path, body) {
  const response = await fetch(`${HOST}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function createAndLoad(index, body) {
  await es('DELETE', `/${index}`);
  await es('PUT', `/${index}`, body);
  for (const sla of ADDRESSES) {
    await es('POST', `/${index}/_doc`, { sla, ssla: sla, confidence: 0 });
  }
  await es('POST', `/${index}/_refresh`);
}

/** The exact query searchForAddress builds (service/address-service.js). */
async function search(index, q) {
  const { body } = await es('POST', `/${index}/_search`, {
    size: 20,
    query: {
      bool: {
        should: [
          {
            multi_match: {
              fields: ['sla', 'ssla'],
              query: q,
              fuzziness: 'AUTO:5,8',
              type: 'bool_prefix',
              lenient: true,
              auto_generate_synonyms_phrase_query: false,
              operator: 'AND',
            },
          },
          {
            multi_match: {
              fields: ['sla', 'ssla', 'sla_range_expanded'],
              query: q,
              type: 'phrase_prefix',
              lenient: true,
              auto_generate_synonyms_phrase_query: false,
              operator: 'AND',
            },
          },
        ],
      },
    },
  });
  return new Set((body.hits?.hits ?? []).map((h) => h._source.sla));
}

/** Every prefix of `text` from `from` tokens up to the whole string. */
function prefixes(text, from = 2) {
  const tokens = text.replace(/,/g, '').split(/\s+/);
  const out = [];
  for (let n = from; n <= tokens.length; n += 1) {
    const whole = tokens.slice(0, n).join(' ');
    out.push(whole);
    // and the same again one character short, i.e. mid-keystroke
    if (whole.length > 1) out.push(whole.slice(0, -1));
  }
  return out;
}

const up = await reachable();

if (!up && process.env.CI) {
  // Fail rather than skip — see the polarity note above.
  throw new Error(
    `ADR-041 integration test requires OpenSearch at ${HOST} and CI is set. ` +
      'Refusing to skip: a skipped test discharges neither half of the confirmation criterion.',
  );
}

describe(
  'ADR-041 / P069 — partial-prefix superset property (real OpenSearch)',
  { skip: up ? false : `no OpenSearch at ${HOST} and CI unset` },
  () => {
    const synonyms = mapAuthCodeTableToSynonymList(AUTH_ROWS);

    before(async () => {
      await createAndLoad(INDEX, buildAddressIndexBody(synonyms));

      // Control: the pre-ADR-041 config — directional synonyms, one analyzer.
      const analysis = buildAnalysis([]);
      analysis.filter.my_synonym_filter.synonyms = AUTH_ROWS.filter(
        (r) => r.CODE !== r.NAME,
      ).map((r) => `${r.CODE} => ${r.NAME}`);
      delete analysis.analyzer.my_search_analyzer;
      const legacyField = { type: 'text', analyzer: 'my_analyzer' };
      await createAndLoad(OLD_INDEX, {
        settings: { index: { analysis } },
        mappings: {
          properties: {
            sla: { ...legacyField, fields: { raw: { type: 'keyword' } } },
            ssla: { ...legacyField, fields: { raw: { type: 'keyword' } } },
            sla_range_expanded: legacyField,
            confidence: { type: 'integer' },
          },
        },
      });
    });

    after(async () => {
      await es('DELETE', `/${INDEX}`);
      await es('DELETE', `/${OLD_INDEX}`);
    });

    it('the two reported cases resolve', async () => {
      assert.ok(
        (await search(INDEX, '55 Pyrmont Bri')).has(
          '55 PYRMONT BRIDGE RD, PYRMONT NSW 2009',
        ),
        'the #365 reporter case',
      );
      assert.ok(
        (await search(INDEX, '55 Harris S')).has(
          '55 HARRIS ST, PYRMONT NSW 2009',
        ),
        'the partial-that-is-itself-a-code case',
      );
    });

    it('FAILS against the old config — proving the test can detect the defect', async () => {
      const hits = await search(OLD_INDEX, '55 Pyrmont Bri');
      assert.equal(
        hits.has('55 PYRMONT BRIDGE RD, PYRMONT NSW 2009'),
        false,
        'if the old config passes, this test is not measuring what it claims to',
      );
    });

    it('every longer prefix returns a superset of the shorter one', async () => {
      for (const address of ADDRESSES) {
        const steps = prefixes(address);
        let previous = await search(INDEX, steps[0]);
        for (const step of steps.slice(1)) {
          const current = await search(INDEX, step);
          // The property: typing more never loses the address you are after.
          assert.ok(
            current.has(address),
            `"${step}" lost "${address}" — a longer prefix dropped a result the shorter one returned`,
          );
          previous = current;
        }
        assert.ok(previous.has(address));
      }
    });

    it('both spellings work in both directions', async () => {
      for (const [q, expected] of [
        ['55 Pyrmont Bridge Rd', '55 PYRMONT BRIDGE RD, PYRMONT NSW 2009'],
        ['55 Pyrmont Bridge Road', '55 PYRMONT BRIDGE RD, PYRMONT NSW 2009'],
        ['55 Harris Street', '55 HARRIS ST, PYRMONT NSW 2009'],
        ['9 The Grand Parade', '9 THE GRAND PDE, BRIGHTON VIC 3186'],
        ['9 The Grand Par', '9 THE GRAND PDE, BRIGHTON VIC 3186'],
      ]) {
        assert.ok(
          (await search(INDEX, q)).has(expected),
          `"${q}" should find "${expected}"`,
        );
      }
    });

    // ADR-041 § Multi-Word Members: recorded as a KNOWN LIMITATION, not a
    // correctness claim. Multi-token synonym members stack at one position, so
    // a phrase query can span the collision. Measured to behave identically
    // under the old directional config, so this is pre-existing rather than
    // introduced — the assertion exists to stop it silently getting worse.
    it('known limitation: multi-word members collide positions, in BOTH configs', async () => {
      const isFalsePositive = async (index) =>
        (await search(index, 'North Darwin')).has(
          '12 SMITH ST NE, DARWIN NT 0800',
        );
      const newConfig = await isFalsePositive(INDEX);
      const oldConfig = await isFalsePositive(OLD_INDEX);
      assert.equal(
        newConfig,
        oldConfig,
        'the multi-word position hazard must be no worse than the directional config; if these diverge, ADR-041 § Multi-Word Members needs revisiting',
      );
    });

    it('recall on the multi-word suffix is unaffected', async () => {
      for (const q of ['12 Smith St NE', '12 Smith St North East']) {
        assert.ok(
          (await search(INDEX, q)).has('12 SMITH ST NE, DARWIN NT 0800'),
          `"${q}" should find the NE address`,
        );
      }
    });
  },
);
