import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// TDD cycle: address detail link headers

describe('postcode accumulation', () => {
  it('should export searchForPostcode function', async () => {
    const service = await import('../../service/address-service.js');
    assert.equal(typeof service.searchForPostcode, 'function');
  });

  it('should export searchForState function', async () => {
    const service = await import('../../service/address-service.js');
    assert.equal(typeof service.searchForState, 'function');
  });
});

describe('locality search service', () => {
  it('should export searchForLocality function', async () => {
    const service = await import('../../service/address-service.js');
    assert.equal(typeof service.searchForLocality, 'function');
  });

  it('should export getLocality function', async () => {
    const service = await import('../../service/address-service.js');
    assert.equal(typeof service.getLocality, 'function');
  });
});

describe('locality index', () => {
  it('should export initLocalityIndex function', async () => {
    const client = await import('../../client/elasticsearch.js');
    assert.equal(typeof client.initLocalityIndex, 'function');
  });

  it('should export dropLocalityIndex function', async () => {
    const client = await import('../../client/elasticsearch.js');
    assert.equal(typeof client.dropLocalityIndex, 'function');
  });
});
