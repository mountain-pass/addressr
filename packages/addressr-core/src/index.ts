export { createAddressrClient } from './api';
export type { AddressrClientOptions, AddressrClient, SearchPage } from './api';
export type { RetryOptions } from './utils/retry';
export { parseHighlight } from './utils/parseHighlight';
export type {
  AddressSearchResult,
  AddressDetail,
  StructuredAddress,
  AddressGeocoding,
  HighlightSegment,
  PostcodeSearchResult,
  LocalitySearchResult,
  StateSearchResult,
} from './types';
