import { describe, it, expect } from 'vitest';
import type {
  PostcodeSearchResult,
  LocalitySearchResult,
  StateSearchResult,
  AddressSearchResult,
} from './types';

describe('types', () => {
  it('PostcodeSearchResult shape matches live API', () => {
    const sample: PostcodeSearchResult = {
      postcode: '2000',
      localities: [{ name: 'SYDNEY' }],
    };
    expect(sample.postcode).toBe('2000');
    expect(sample.localities[0].name).toBe('SYDNEY');
  });

  it('LocalitySearchResult shape matches live API', () => {
    const sample: LocalitySearchResult = {
      name: 'SYDNEY',
      state: { name: 'NEW SOUTH WALES', abbreviation: 'NSW' },
      class: { code: 'G', name: 'GAZETTED LOCALITY' },
      postcode: '2000',
      score: 9.78,
      pid: 'loc46e6625bb24d',
    };
    expect(sample.state.abbreviation).toBe('NSW');
    expect(sample.pid).toBe('loc46e6625bb24d');
  });

  it('StateSearchResult shape matches live API', () => {
    const sample: StateSearchResult = {
      name: 'NEW SOUTH WALES',
      abbreviation: 'NSW',
    };
    expect(sample.abbreviation).toBe('NSW');
  });

  it('AddressSearchResult retains its existing shape (regression gate)', () => {
    const sample: AddressSearchResult = {
      sla: '1 GEORGE ST',
      score: 19,
      pid: 'GANSW123',
      highlight: { sla: '<em>1</em>' },
    };
    expect(sample.sla).toBe('1 GEORGE ST');
  });
});
