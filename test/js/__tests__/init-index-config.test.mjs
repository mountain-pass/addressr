// P037: initIndex unnecessarily closes the addressr index on every state load
// AND has no retry on snapshot_in_progress_exception.
//
// Unit tests for the pure helpers in src/init-index-config.js (clean ESM per
// P033 — no source inspection, DI for timing).

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  indexConfigMatches,
  isSnapshotInProgress,
  retryOnSnapshotInProgress,
} from '../../../src/init-index-config.js';

const INDEX = 'addressr';

// Desired body in the exact shape client/elasticsearch.js initIndex builds.
function desiredBody() {
  return {
    settings: {
      index: {
        analysis: {
          filter: {
            my_synonym_filter: {
              type: 'synonym',
              lenient: true,
              synonyms: ['st, street', 'rd, road'],
            },
          },
          analyzer: {
            my_analyzer: {
              tokenizer: 'whitecomma',
              filter: ['uppercase', 'my_synonym_filter'],
            },
          },
          tokenizer: {
            whitecomma: {
              type: 'pattern',
              pattern: String.raw`[\W,]+`,
              lowercase: false,
            },
          },
        },
      },
    },
    aliases: {},
    mappings: {
      properties: {
        structured: { type: 'object', enabled: false },
        sla: { type: 'text', analyzer: 'my_analyzer' },
        confidence: { type: 'integer' },
      },
    },
  };
}

// What OpenSearch returns from getSettings: scalars come back as STRINGS
// (true → "true", numbers → "42"), plus extra non-analysis keys we ignore.
function storedSettingsResponse() {
  return {
    [INDEX]: {
      settings: {
        index: {
          creation_date: '1750000000000',
          number_of_shards: '1',
          uuid: 'abc123',
          version: { created: '136217927' },
          analysis: {
            filter: {
              my_synonym_filter: {
                type: 'synonym',
                lenient: 'true',
                synonyms: ['st, street', 'rd, road'],
              },
            },
            analyzer: {
              my_analyzer: {
                tokenizer: 'whitecomma',
                filter: ['uppercase', 'my_synonym_filter'],
              },
            },
            tokenizer: {
              whitecomma: {
                type: 'pattern',
                pattern: String.raw`[\W,]+`,
                lowercase: 'false',
              },
            },
          },
        },
      },
    },
  };
}

function storedMappingResponse() {
  return {
    [INDEX]: {
      mappings: {
        properties: {
          structured: { type: 'object', enabled: false },
          sla: { type: 'text', analyzer: 'my_analyzer' },
          confidence: { type: 'integer' },
        },
      },
    },
  };
}

describe('indexConfigMatches (P037 fast-path)', () => {
  it('returns true when stored analysis + mappings match desired (string-normalised scalars)', () => {
    assert.equal(
      indexConfigMatches(
        desiredBody(),
        storedSettingsResponse(),
        storedMappingResponse(),
        INDEX,
      ),
      true,
    );
  });

  it('returns false when synonyms differ', () => {
    const stored = storedSettingsResponse();
    stored[INDEX].settings.index.analysis.filter.my_synonym_filter.synonyms = [
      'st, street',
    ];
    assert.equal(
      indexConfigMatches(desiredBody(), stored, storedMappingResponse(), INDEX),
      false,
    );
  });

  it('returns false when a desired mapping property is missing from stored (new field added)', () => {
    const desired = desiredBody();
    desired.mappings.properties.sla_range_expanded = {
      type: 'text',
      analyzer: 'my_analyzer',
    };
    assert.equal(
      indexConfigMatches(
        desired,
        storedSettingsResponse(),
        storedMappingResponse(),
        INDEX,
      ),
      false,
    );
  });

  it('returns false when the stored response is malformed (conservative: never skip on doubt)', () => {
    assert.equal(
      indexConfigMatches(desiredBody(), {}, storedMappingResponse(), INDEX),
      false,
    );
    assert.equal(
      indexConfigMatches(desiredBody(), storedSettingsResponse(), {}, INDEX),
      false,
    );
    assert.equal(
      indexConfigMatches(desiredBody(), undefined, undefined, INDEX),
      false,
    );
  });

  it('ignores stored-only housekeeping settings keys (creation_date, uuid, shards)', () => {
    const stored = storedSettingsResponse();
    stored[INDEX].settings.index.provided_name = INDEX;
    assert.equal(
      indexConfigMatches(desiredBody(), stored, storedMappingResponse(), INDEX),
      true,
    );
  });
});

function snapshotError() {
  const error_ = new Error('index close failed');
  error_.body = {
    error: {
      type: 'snapshot_in_progress_exception',
      reason: 'Cannot close indices that are being snapshotted',
      root_cause: [{ type: 'snapshot_in_progress_exception' }],
    },
    status: 400,
  };
  return error_;
}

describe('isSnapshotInProgress (P037 retry)', () => {
  it('matches the OpenSearch snapshot_in_progress_exception body shape', () => {
    assert.equal(isSnapshotInProgress(snapshotError()), true);
  });

  it('matches when only root_cause carries the type', () => {
    const error_ = snapshotError();
    error_.body.error.type = 'illegal_state_exception';
    assert.equal(isSnapshotInProgress(error_), true);
  });

  it('does not match other errors', () => {
    assert.equal(isSnapshotInProgress(new Error('boom')), false);
    const auth = new Error('401');
    auth.body = { error: { type: 'security_exception' } };
    assert.equal(isSnapshotInProgress(auth), false);
    assert.equal(isSnapshotInProgress(), false);
  });
});

describe('retryOnSnapshotInProgress (P037 retry)', () => {
  it('returns the fn result immediately on success (no sleeps)', async () => {
    const sleeps = [];
    const result = await retryOnSnapshotInProgress(async () => 'ok', {
      sleep: async (ms) => sleeps.push(ms),
    });
    assert.equal(result, 'ok');
    assert.deepEqual(sleeps, []);
  });

  it('retries after snapshot_in_progress and succeeds', async () => {
    const sleeps = [];
    let calls = 0;
    const result = await retryOnSnapshotInProgress(
      async () => {
        calls += 1;
        if (calls < 3) throw snapshotError();
        return 'closed';
      },
      { delayMs: 5, sleep: async (ms) => sleeps.push(ms) },
    );
    assert.equal(result, 'closed');
    assert.equal(calls, 3);
    assert.deepEqual(sleeps, [5, 5]);
  });

  it('gives up after the configured attempts and rethrows the snapshot error', async () => {
    let calls = 0;
    await assert.rejects(
      retryOnSnapshotInProgress(
        async () => {
          calls += 1;
          throw snapshotError();
        },
        { attempts: 4, delayMs: 1, sleep: async () => {} },
      ),
      (error_) =>
        error_.body?.error?.root_cause?.[0]?.type ===
        'snapshot_in_progress_exception',
    );
    assert.equal(calls, 4);
  });

  it('rethrows non-snapshot errors immediately without retrying', async () => {
    let calls = 0;
    await assert.rejects(
      retryOnSnapshotInProgress(
        async () => {
          calls += 1;
          throw new Error('connection refused');
        },
        { sleep: async () => {} },
      ),
      /connection refused/,
    );
    assert.equal(calls, 1);
  });
});
