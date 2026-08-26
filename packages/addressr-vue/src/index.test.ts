import { describe, it, expect } from 'vitest';
import * as vuePkg from './index';

describe('@mountainpass/addressr-vue public exports', () => {
  it('exports useAddressSearch', () => {
    expect(typeof vuePkg.useAddressSearch).toBe('function');
  });

  it('exports the three new composables', () => {
    expect(typeof vuePkg.usePostcodeSearch).toBe('function');
    expect(typeof vuePkg.useLocalitySearch).toBe('function');
    expect(typeof vuePkg.useStateSearch).toBe('function');
  });

  it('exports the three new autocomplete components', () => {
    expect(vuePkg.PostcodeAutocomplete).toBeDefined();
    expect(vuePkg.LocalityAutocomplete).toBeDefined();
    expect(vuePkg.StateAutocomplete).toBeDefined();
  });

  it('exports AddressAutocomplete', () => {
    expect(vuePkg.AddressAutocomplete).toBeDefined();
  });
});
