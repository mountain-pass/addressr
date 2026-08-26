import { describe, it, expect } from 'vitest';
import * as sveltePkg from './index';

describe('@mountainpass/addressr-svelte public exports', () => {
  it('exports createAddressSearch', () => {
    expect(typeof sveltePkg.createAddressSearch).toBe('function');
  });

  it('exports the three new search stores', () => {
    expect(typeof sveltePkg.createPostcodeSearch).toBe('function');
    expect(typeof sveltePkg.createLocalitySearch).toBe('function');
    expect(typeof sveltePkg.createStateSearch).toBe('function');
  });

  it('exports the three new autocomplete components', () => {
    expect(sveltePkg.PostcodeAutocomplete).toBeDefined();
    expect(sveltePkg.LocalityAutocomplete).toBeDefined();
    expect(sveltePkg.StateAutocomplete).toBeDefined();
  });

  it('exports AddressAutocomplete', () => {
    expect(sveltePkg.AddressAutocomplete).toBeDefined();
  });
});
