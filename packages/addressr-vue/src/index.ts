// Re-export everything from core
export * from '@mountainpass/addressr-core';

// Vue-specific exports
export { useAddressSearch } from './useAddressSearch';
export type { UseAddressSearchOptions, UseAddressSearchReturn } from './useAddressSearch';
export { default as AddressAutocomplete } from './AddressAutocomplete.vue';

export { usePostcodeSearch } from './usePostcodeSearch';
export type { UsePostcodeSearchOptions, UsePostcodeSearchReturn } from './usePostcodeSearch';
export { default as PostcodeAutocomplete } from './PostcodeAutocomplete.vue';

export { useLocalitySearch } from './useLocalitySearch';
export type { UseLocalitySearchOptions, UseLocalitySearchReturn } from './useLocalitySearch';
export { default as LocalityAutocomplete } from './LocalityAutocomplete.vue';

export { useStateSearch } from './useStateSearch';
export type { UseStateSearchOptions, UseStateSearchReturn } from './useStateSearch';
export { default as StateAutocomplete } from './StateAutocomplete.vue';
