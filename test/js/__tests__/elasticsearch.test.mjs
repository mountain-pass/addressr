// @jtbd JTBD-203 (Acquire and Refresh the G-NAF Dataset on a Self-Hosted Install)
//
// Behavioural assertions against the exported index-body builders (P033).
//
// These replace a source-inspection test that readFile'd client/elasticsearch.js
// and regex-matched the sla_range_expanded declaration block. That shape could
// not assert `search_analyzer` across four fields without becoming brittle, and
// it broke as soon as the mappings moved out of that file. The builders are
// clean ESM, so assert on the object they actually emit.
//
// ADR-041 (P069) requires BOTH analyzers on every field the query clauses
// target. `search_analyzer` is per-field: miss one and that field keeps
// synonym-rewriting the query at search time, so it fails asymmetrically
// against the fields that do not.
//
// The ADR-028 requirement the old test carried — sla_range_expanded declared as
// text with the same analyzer as sla/ssla and no .raw subfield — is preserved
// below, now asserted on the emitted mapping rather than on source text.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MODULE = '../../../src/init-index-config.js';

describe('index body builders — both analyzers on every searched field (ADR-041)', () => {
  it('puts analyzer and search_analyzer on sla, ssla and sla_range_expanded', async () => {
    const { buildAddressIndexBody, INDEX_ANALYZER, SEARCH_ANALYZER } =
      await import(MODULE);
    const { properties } = buildAddressIndexBody([]).mappings;

    for (const field of ['sla', 'ssla', 'sla_range_expanded']) {
      assert.equal(properties[field].type, 'text', `${field} must be text`);
      assert.equal(
        properties[field].analyzer,
        INDEX_ANALYZER,
        `${field} must index with ${INDEX_ANALYZER}`,
      );
      assert.equal(
        properties[field].search_analyzer,
        SEARCH_ANALYZER,
        `${field} must search with ${SEARCH_ANALYZER} — a field missing it keeps rewriting partial query tokens`,
      );
    }
  });

  it('declares sla_range_expanded without a .raw subfield (never sorted on)', async () => {
    const { buildAddressIndexBody } = await import(MODULE);
    const { properties } = buildAddressIndexBody([]).mappings;
    assert.equal(properties.sla_range_expanded.fields, undefined);
    assert.ok(properties.sla.fields.raw, 'sla keeps its .raw for sorting');
    assert.ok(properties.ssla.fields.raw, 'ssla keeps its .raw for sorting');
  });

  it('gives the locality index the same analyzer pipeline (ADR-021)', async () => {
    const { buildLocalityIndexBody, INDEX_ANALYZER, SEARCH_ANALYZER } =
      await import(MODULE);
    const field = buildLocalityIndexBody([]).mappings.properties.locality_name;
    assert.equal(field.analyzer, INDEX_ANALYZER);
    assert.equal(
      field.search_analyzer,
      SEARCH_ANALYZER,
      'a locality index left unmigrated keeps P069 live on locality autocomplete, and every locality Cucumber scenario passes under either synonym form',
    );
  });

  it('defines both analyzers in the shared analysis block, search minus synonyms', async () => {
    const { buildAnalysis, INDEX_ANALYZER, SEARCH_ANALYZER } =
      await import(MODULE);
    const { analyzer } = buildAnalysis([]);
    assert.ok(
      analyzer[INDEX_ANALYZER].filter.includes('my_synonym_filter'),
      'index analyzer expands synonyms so both forms are stored',
    );
    assert.equal(
      analyzer[SEARCH_ANALYZER].filter.includes('my_synonym_filter'),
      false,
      'search analyzer must NOT rewrite the query — that is the P069 defect',
    );
    // Otherwise identical, so the two cannot drift apart.
    assert.deepEqual(
      analyzer[INDEX_ANALYZER].filter.filter((f) => f !== 'my_synonym_filter'),
      analyzer[SEARCH_ANALYZER].filter,
    );
    assert.equal(
      analyzer[SEARCH_ANALYZER].tokenizer,
      analyzer[INDEX_ANALYZER].tokenizer,
    );
  });
});

describe('synonym rules — equivalent form, direction-agnostic (ADR-041)', () => {
  it('emits CODE, NAME pairs rather than directional replacements', async () => {
    const { mapAuthCodeTableToSynonymList } = await import(MODULE);
    const rules = mapAuthCodeTableToSynonymList([
      { CODE: 'BRIDGE', NAME: 'BDGE' },
      { CODE: 'S', NAME: 'SOUTH' },
    ]);
    assert.deepEqual(rules, ['BRIDGE, BDGE', 'S, SOUTH']);
    for (const rule of rules) {
      assert.equal(
        rule.includes('=>'),
        false,
        'a directional rule REPLACES one side, so that token goes missing from the index',
      );
    }
  });

  it('drops rows whose CODE equals NAME', async () => {
    const { mapAuthCodeTableToSynonymList } = await import(MODULE);
    assert.deepEqual(
      mapAuthCodeTableToSynonymList([{ CODE: 'ROAD', NAME: 'ROAD' }]),
      [],
    );
  });

  it('handles both table directions identically', async () => {
    const { mapAuthCodeTableToSynonymList } = await import(MODULE);
    // STREET_TYPE is full=>abbrev; STREET_SUFFIX/FLAT/LEVEL are abbrev=>full.
    // Equivalents make that difference irrelevant, which is the whole point.
    assert.equal(
      mapAuthCodeTableToSynonymList([{ CODE: 'BRIDGE', NAME: 'BDGE' }])[0],
      'BRIDGE, BDGE',
    );
    assert.equal(
      mapAuthCodeTableToSynonymList([{ CODE: 'APT', NAME: 'APARTMENT' }])[0],
      'APT, APARTMENT',
    );
  });

  it('collects all four authority tables', async () => {
    const { buildSynonyms } = await import(MODULE);
    const rules = buildSynonyms({
      Authority_Code_STREET_TYPE_AUT_psv: [{ CODE: 'BRIDGE', NAME: 'BDGE' }],
      Authority_Code_FLAT_TYPE_AUT_psv: [{ CODE: 'APT', NAME: 'APARTMENT' }],
      Authority_Code_LEVEL_TYPE_AUT_psv: [{ CODE: 'LG', NAME: 'LOWER GROUND' }],
      Authority_Code_STREET_SUFFIX_AUT_psv: [{ CODE: 'S', NAME: 'SOUTH' }],
    });
    assert.equal(rules.length, 4);
    assert.ok(rules.includes('LG, LOWER GROUND'), 'multi-word members included');
  });
});

describe('analysis structure stamp (ADR-041 stale-index detection)', () => {
  it('is stable across different synonym CONTENTS', async () => {
    const { analysisStructureStamp, buildAnalysis } = await import(MODULE);
    // A quarterly G-NAF refresh adds street types. If the stamp moved on
    // contents it would hard-abort the ADR-034 automated job.
    assert.equal(
      analysisStructureStamp(buildAnalysis(['BRIDGE, BDGE'])),
      analysisStructureStamp(buildAnalysis(['BRIDGE, BDGE', 'NEWTYPE, NT'])),
    );
  });

  it('changes when the analyzer filter chain changes', async () => {
    const { analysisStructureStamp, buildAnalysis } = await import(MODULE);
    const current = buildAnalysis([]);
    const mutated = buildAnalysis([]);
    mutated.analyzer.my_analyzer.filter = ['uppercase'];
    assert.notEqual(
      analysisStructureStamp(current),
      analysisStructureStamp(mutated),
    );
  });

  it('flags an index carrying no stamp as stale', async () => {
    const { isStaleAnalysisConfig, analysisStructureStamp } =
      await import(MODULE);
    assert.equal(
      isStaleAnalysisConfig(
        { addressr: { mappings: {} } },
        'addressr',
        analysisStructureStamp(),
      ),
      true,
      'a pre-ADR-041 index has no _meta stamp at all',
    );
  });

  it('accepts an index whose stamp matches', async () => {
    const { isStaleAnalysisConfig, buildAddressIndexBody } =
      await import(MODULE);
    const desired = buildAddressIndexBody([]).mappings._meta.analysisStamp;
    assert.equal(
      isStaleAnalysisConfig(
        { addressr: { mappings: { _meta: { analysisStamp: desired } } } },
        'addressr',
        desired,
      ),
      false,
    );
  });

  it('names both migration routes in the remediation message', async () => {
    const { staleIndexMessage } = await import(MODULE);
    const message = staleIndexMessage('addressr');
    assert.match(message, /Blue\/green/i);
    assert.match(message, /_reindex/);
    assert.match(
      message,
      /CANNOT be repaired by updating settings/i,
      'the message must say why the obvious in-place fix does not work',
    );
  });
});
