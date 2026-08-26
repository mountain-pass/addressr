// Re-export everything from core
export * from '@mountainpass/addressr-core';

// Svelte-specific exports
export { createAddressSearch } from './createAddressSearch';
export type { AddressSearchOptions, AddressSearchState, AddressSearchStore } from './createAddressSearch';
export { default as AddressAutocomplete } from './AddressAutocomplete.svelte';

export { createPostcodeSearch } from './createPostcodeSearch';
export type { CreatePostcodeSearchOptions, PostcodeSearchStore } from './createPostcodeSearch';
export { default as PostcodeAutocomplete } from './PostcodeAutocomplete.svelte';

export { createLocalitySearch } from './createLocalitySearch';
export type { CreateLocalitySearchOptions, LocalitySearchStore } from './createLocalitySearch';
export { default as LocalityAutocomplete } from './LocalityAutocomplete.svelte';

export { createStateSearch } from './createStateSearch';
export type { CreateStateSearchOptions, StateSearchStore } from './createStateSearch';
export { default as StateAutocomplete } from './StateAutocomplete.svelte';
