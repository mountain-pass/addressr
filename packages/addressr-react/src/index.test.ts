import { describe, it, expect } from 'vitest';
import * as reactPkg from './index';

describe('@mountainpass/addressr-react public exports', () => {
  it('exports useAddressSearch', () => {
    expect(typeof reactPkg.useAddressSearch).toBe('function');
  });

  it('exports the three new hooks', () => {
    expect(typeof reactPkg.usePostcodeSearch).toBe('function');
    expect(typeof reactPkg.useLocalitySearch).toBe('function');
    expect(typeof reactPkg.useStateSearch).toBe('function');
  });

  it('exports the three new autocomplete components', () => {
    expect(typeof reactPkg.PostcodeAutocomplete).toBe('function');
    expect(typeof reactPkg.LocalityAutocomplete).toBe('function');
    expect(typeof reactPkg.StateAutocomplete).toBe('function');
  });

  it('exports AddressAutocomplete', () => {
    expect(typeof reactPkg.AddressAutocomplete).toBe('function');
  });

  it('re-exports core types (compile-time)', () => {
    const names: readonly string[] = [
      'useAddressSearch', 'usePostcodeSearch', 'useLocalitySearch', 'useStateSearch',
      'AddressAutocomplete', 'PostcodeAutocomplete', 'LocalityAutocomplete', 'StateAutocomplete',
    ];
    for (const n of names) expect(reactPkg).toHaveProperty(n);
  });
});
