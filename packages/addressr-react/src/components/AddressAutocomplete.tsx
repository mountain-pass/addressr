import { useId, useEffect, useRef, useCallback } from 'react';
import { useCombobox } from 'downshift';
import { useAddressSearch } from '../hooks/useAddressSearch';
import { parseHighlight } from '@mountainpass/addressr-core';
import type { AddressDetail, AddressSearchResult, HighlightSegment } from '@mountainpass/addressr-core';
import styles from './AddressAutocomplete.module.css';

export interface AddressAutocompleteProps {
  /** RapidAPI key. Omit when connecting directly to an addressr instance. */
  apiKey?: string;
  onSelect: (address: AddressDetail) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  /** Input name attribute for form submission. */
  name?: string;
  /** Whether the field is required. Sets aria-required. */
  required?: boolean;
  debounceMs?: number;
  apiUrl?: string;
  apiHost?: string;
  /**
   * Custom loading state renderer. When provided, you are responsible for
   * accessibility — return `<li>` elements with appropriate roles.
   */
  renderLoading?: () => React.ReactNode;
  /**
   * Custom no-results renderer. When provided, you are responsible for
   * accessibility — return `<li>` elements.
   */
  renderNoResults?: () => React.ReactNode;
  /**
   * Custom error renderer. When provided, you are responsible for
   * accessibility — include `role="alert"` on the container.
   */
  renderError?: (error: Error) => React.ReactNode;
  /**
   * Custom result item renderer. Content is wrapped in the existing `<li>`
   * with ARIA attributes. You are responsible for maintaining highlight
   * contrast (WCAG AA 4.5:1) if you restyle highlights.
   */
  renderItem?: (item: AddressSearchResult, highlighted: boolean, segments: HighlightSegment[]) => React.ReactNode;
  /** @internal */
  fetchImpl?: typeof fetch;
}

export function AddressAutocomplete({
  apiKey,
  onSelect,
  label = 'Search Australian addresses',
  placeholder = 'Start typing an address...',
  className,
  name = 'address',
  required,
  debounceMs,
  apiUrl,
  apiHost,
  renderLoading,
  renderNoResults,
  renderError,
  renderItem,
  fetchImpl,
}: AddressAutocompleteProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const statusId = `${id}-status`;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const {
    query,
    setQuery,
    results,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    error,
    selectedAddress,
    selectAddress,
  } = useAddressSearch({ apiKey, apiUrl, apiHost, debounceMs, fetchImpl });

  // Call onSelect when selectedAddress changes
  useEffect(() => {
    if (selectedAddress) {
      onSelectRef.current(selectedAddress);
    }
  }, [selectedAddress]);

  const {
    isOpen,
    getLabelProps,
    getMenuProps,
    getInputProps,
    highlightedIndex,
    getItemProps,
  } = useCombobox<AddressSearchResult>({
    items: results,
    inputValue: query,
    onInputValueChange: ({ inputValue }) => setQuery(inputValue ?? ''),
    onSelectedItemChange: ({ selectedItem }) => {
      if (selectedItem) {
        selectAddress(selectedItem.pid);
      }
    },
    itemToString: (item) => item?.sla ?? '',
  });

  const handleMenuScroll = useCallback(
    (event: React.UIEvent<HTMLUListElement>) => {
      if (!hasMore || isLoadingMore) return;
      const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
      if (scrollHeight - scrollTop - clientHeight < 50) {
        loadMore();
      }
    },
    [hasMore, isLoadingMore, loadMore],
  );

  const showMenu = isOpen && (results.length > 0 || isLoading || (query.length >= 3 && !isLoading));

  return (
    <div className={`${styles.wrapper} ${className ?? ''}`}>
      <label {...getLabelProps()} className={styles.label}>
        {label}
      </label>
      <input
        {...getInputProps({
          placeholder,
          name,
          'aria-describedby': error ? errorId : undefined,
          'aria-required': required || undefined,
          'aria-invalid': error ? true : undefined,
        })}
        className={styles.input}
      />

      {/* Status announcements for screen readers */}
      <div id={statusId} role="status" aria-live="polite" aria-atomic="true" className={styles.srOnly}>
        {isLoading && 'Searching addresses...'}
        {!isLoading && results.length > 0 && `${results.length} addresses found`}
        {!isLoading && results.length === 0 && query.length >= 3 && 'No addresses found'}
      </div>

      <ul
        {...getMenuProps({ onScroll: handleMenuScroll })}
        className={`${styles.menu} ${!showMenu ? styles.menuHidden : ''}`}
      >
        {showMenu && (
          <>
            {isLoading && (
              renderLoading ? renderLoading() : (
                <>
                  <li className={styles.skeleton} style={{ width: '80%' }} aria-hidden="true" />
                  <li className={styles.skeleton} style={{ width: '60%' }} aria-hidden="true" />
                  <li className={styles.skeleton} style={{ width: '70%' }} aria-hidden="true" />
                </>
              )
            )}
            {!isLoading && results.length === 0 && query.length >= 3 && (
              renderNoResults ? renderNoResults() : (
                <li className={styles.noResults}>No addresses found</li>
              )
            )}
            {results.map((item, index) => {
              const segments = parseHighlight(item.highlight?.sla ?? item.sla);
              return (
                <li
                  key={item.pid}
                  {...getItemProps({ item, index })}
                  className={`${styles.item} ${highlightedIndex === index ? styles.itemHighlighted : ''}`}
                >
                  {renderItem ? renderItem(item, highlightedIndex === index, segments) : (
                    <span>
                      {segments.map((seg, i) =>
                        seg.highlighted ? (
                          <mark key={i}>{seg.text}</mark>
                        ) : (
                          <span key={i}>{seg.text}</span>
                        ),
                      )}
                    </span>
                  )}
                </li>
              );
            })}
            {isLoadingMore && (
              <li role="presentation" className={styles.loading}>Loading more...</li>
            )}
          </>
        )}
      </ul>

      {error && (
        renderError ? renderError(error) : (
          <div id={errorId} className={styles.error} role="alert">
            {error.message}
          </div>
        )
      )}
    </div>
  );
}
