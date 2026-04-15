import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { mapAddressDetails } from './address-service.js';

// Regression test for P007 / issue #375 — see ADR 025.
// Sub-unit documents populate both `sla` and `ssla`; street-level documents
// historically populated only `sla`, which caused BM25 per-field score
// summation to favour sub-unit docs over exact street-level matches.
// The fix: always populate `ssla` (= `sla` when no flat) so scoring is
// symmetric across all documents.

const baseAuthorityContext = {
  Authority_Code_LOCALITY_CLASS_AUT_psv: [
    { CODE: 'G', NAME: 'GAZETTED LOCALITY' },
  ],
  Authority_Code_STREET_CLASS_AUT_psv: [{ CODE: 'C', NAME: 'CONFIRMED' }],
  Authority_Code_STREET_TYPE_AUT_psv: [
    { CODE: 'ROAD', NAME: 'RD', DESCRIPTION: 'RD' },
  ],
  Authority_Code_STREET_SUFFIX_AUT_psv: [],
  Authority_Code_FLAT_TYPE_AUT_psv: [{ CODE: 'UNIT', NAME: 'UNIT' }],
  Authority_Code_LEVEL_TYPE_AUT_psv: [],
  Authority_Code_GEOCODED_LEVEL_TYPE_AUT_psv: [],
  Authority_Code_GEOCODE_TYPE_AUT_psv: [],
  Authority_Code_GEOCODE_RELIABILITY_AUT_psv: [],
  state: 'QLD',
  stateName: 'QUEENSLAND',
};

function buildContext(
  streetLocalityPid,
  streetLocality,
  localityPid,
  locality,
) {
  const context = {
    ...baseAuthorityContext,
    streetLocalityIndexed: [],
    localityIndexed: [],
  };
  context.streetLocalityIndexed[streetLocalityPid] = streetLocality;
  context.localityIndexed[localityPid] = locality;
  return context;
}

const streetLocality = {
  STREET_LOCALITY_PID: 'QLD180101',
  DATE_CREATED: '2017-08-10',
  DATE_RETIRED: '',
  STREET_CLASS_CODE: 'C',
  STREET_NAME: 'AERODROME',
  STREET_TYPE_CODE: 'ROAD',
  STREET_SUFFIX_CODE: '',
  LOCALITY_PID: 'QLD69',
  GNAF_STREET_PID: '3169537',
  GNAF_STREET_CONFIDENCE: '2',
  GNAF_RELIABILITY_CODE: '4',
};

const locality = {
  LOCALITY_PID: 'QLD69',
  DATE_CREATED: '2016-08-10',
  DATE_RETIRED: '',
  LOCALITY_NAME: 'APPLETHORPE',
  PRIMARY_POSTCODE: '',
  LOCALITY_CLASS_CODE: 'G',
  STATE_PID: '3',
  GNAF_LOCALITY_PID: '198011',
  GNAF_RELIABILITY_CODE: '5',
};

function addressDetail(overrides = {}) {
  return {
    ADDRESS_DETAIL_PID: 'GAQLD163157353',
    DATE_CREATED: '2010-04-21',
    DATE_LAST_MODIFIED: '2018-08-03',
    DATE_RETIRED: '',
    BUILDING_NAME: '',
    LOT_NUMBER_PREFIX: '',
    LOT_NUMBER: '',
    LOT_NUMBER_SUFFIX: '',
    FLAT_TYPE_CODE: '',
    FLAT_NUMBER_PREFIX: '',
    FLAT_NUMBER: '',
    FLAT_NUMBER_SUFFIX: '',
    LEVEL_TYPE_CODE: '',
    LEVEL_NUMBER_PREFIX: '',
    LEVEL_NUMBER: '',
    LEVEL_NUMBER_SUFFIX: '',
    NUMBER_FIRST_PREFIX: '',
    NUMBER_FIRST: '42',
    NUMBER_FIRST_SUFFIX: '',
    NUMBER_LAST_PREFIX: '',
    NUMBER_LAST: '',
    NUMBER_LAST_SUFFIX: '',
    STREET_LOCALITY_PID: 'QLD180101',
    LOCATION_DESCRIPTION: '',
    LOCALITY_PID: 'QLD69',
    ALIAS_PRINCIPAL: 'P',
    POSTCODE: '4378',
    PRIVATE_STREET: '',
    LEGAL_PARCEL_ID: '',
    CONFIDENCE: '0',
    ADDRESS_SITE_PID: '',
    LEVEL_GEOCODED_CODE: '',
    PROPERTY_PID: '',
    GNAF_PROPERTY_PID: '',
    PRIMARY_SECONDARY: '',
    ...overrides,
  };
}

describe('P007 — ssla population (ADR 025)', () => {
  it('populates ssla equal to sla for a street-level address with no sub-unit', () => {
    const context = buildContext(
      'QLD180101',
      streetLocality,
      'QLD69',
      locality,
    );
    const mapped = mapAddressDetails(addressDetail(), context, 1, 1);

    assert.equal(
      typeof mapped.sla,
      'string',
      'sla must be present on every indexed address',
    );
    assert.equal(
      mapped.ssla,
      mapped.sla,
      'ssla must equal sla when the address has no sub-unit, so BM25 per-field ' +
        'score summation across [sla, ssla] is symmetric across documents',
    );
  });

  it('populates ssla from the short-form address for a sub-unit', () => {
    const context = buildContext(
      'QLD180101',
      streetLocality,
      'QLD69',
      locality,
    );
    const mapped = mapAddressDetails(
      addressDetail({ FLAT_TYPE_CODE: 'UNIT', FLAT_NUMBER: '1' }),
      context,
      1,
      1,
    );

    assert.ok(
      mapped.ssla && mapped.ssla !== mapped.sla,
      'for a sub-unit, ssla should be the short-form address (distinct from sla)',
    );
    assert.match(mapped.sla, /UNIT 1/, 'sub-unit sla includes the unit prefix');
    assert.doesNotMatch(
      mapped.ssla,
      /UNIT 1/,
      'sub-unit ssla strips the unit prefix (preserving slash-form matching)',
    );
  });
});
