// Re-export everything from core for convenience
export * from '@mountainpass/addressr-core';

// React-specific exports
export { useAddressSearch } from './hooks/useAddressSearch';
export type { UseAddressSearchOptions, UseAddressSearchReturn } from './hooks/useAddressSearch';
export { usePostcodeSearch } from './hooks/usePostcodeSearch';
export type { UsePostcodeSearchOptions, UsePostcodeSearchReturn } from './hooks/usePostcodeSearch';
export { useLocalitySearch } from './hooks/useLocalitySearch';
export type { UseLocalitySearchOptions, UseLocalitySearchReturn } from './hooks/useLocalitySearch';
export { useStateSearch } from './hooks/useStateSearch';
export type { UseStateSearchOptions, UseStateSearchReturn } from './hooks/useStateSearch';
export { AddressAutocomplete } from './components/AddressAutocomplete';
export type { AddressAutocompleteProps } from './components/AddressAutocomplete';
export { PostcodeAutocomplete } from './components/PostcodeAutocomplete';
export type { PostcodeAutocompleteProps } from './components/PostcodeAutocomplete';
export { LocalityAutocomplete } from './components/LocalityAutocomplete';
export type { LocalityAutocompleteProps } from './components/LocalityAutocomplete';
export { StateAutocomplete } from './components/StateAutocomplete';
export type { StateAutocompleteProps } from './components/StateAutocomplete';
