import { describe, it, expect } from 'vitest';
import * as core from './index';
import type {
  PostcodeSearchResult,
  LocalitySearchResult,
  StateSearchResult,
} from './index';

describe('@mountainpass/addressr-core public exports', () => {
  it('exports createAddressrClient', () => {
    expect(typeof core.createAddressrClient).toBe('function');
  });

  it('exports parseHighlight', () => {
    expect(typeof core.parseHighlight).toBe('function');
  });

  it('re-exports new result types (compile-time)', () => {
    const p: PostcodeSearchResult = { postcode: '2000', localities: [] };
    const l: LocalitySearchResult = {
      name: 'SYDNEY',
      state: { name: 'NEW SOUTH WALES', abbreviation: 'NSW' },
      postcode: '2000',
      score: 1,
      pid: 'x',
    };
    const s: StateSearchResult = { name: 'NEW SOUTH WALES', abbreviation: 'NSW' };
    expect(p.postcode).toBe('2000');
    expect(l.name).toBe('SYDNEY');
    expect(s.abbreviation).toBe('NSW');
  });
});
