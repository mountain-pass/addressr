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
  /** Whether the field is required. Uses native required semantics. */
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

  const { isOpen, getLabelProps, getMenuProps, getInputProps, highlightedIndex, getItemProps } =
    useCombobox<AddressSearchResult>({
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

  const showMenu = isOpen && results.length > 0;
  const showLoading = isOpen && isLoading && results.length === 0;
  const showNoResults = isOpen && !error && !isLoading && results.length === 0 && query.length >= 3;
  const statusMessage = isLoading
    ? 'Searching addresses...'
    : isLoadingMore
      ? 'Loading more addresses...'
      : results.length > 0
        ? `${results.length} addresses found`
        : !error && query.length >= 3
          ? 'No addresses found'
          : '';

  return (
    <div className={`${styles.wrapper} ${className ?? ''}`}>
      <label {...getLabelProps()} className={styles.label}>
        {label}
        {required && <span aria-hidden="true"> (required)</span>}
      </label>
      <input
        {...getInputProps({
          autoComplete: 'off',
          placeholder,
          name,
          required: required || undefined,
          'aria-expanded': showMenu,
          'aria-describedby': error ? errorId : undefined,
          'aria-required': required || undefined,
          'aria-invalid': error ? true : undefined,
        })}
        className={styles.input}
      />

      {/* Status announcements for screen readers */}
      <div id={statusId} role="status" aria-live="polite" aria-atomic="true" className={styles.srOnly}>
        {statusMessage}
      </div>

      <ul
        {...getMenuProps({ onScroll: handleMenuScroll })}
        hidden={!showMenu}
        className={`${styles.menu} ${!showMenu ? styles.menuHidden : ''}`}
      >
        {showMenu && (
          <>
            {results.map((item, index) => {
              const segments = parseHighlight(item.highlight?.sla ?? item.sla);
              return (
                <li
                  key={item.pid}
                  {...getItemProps({ item, index })}
                  className={`${styles.item} ${highlightedIndex === index ? styles.itemHighlighted : ''}`}
                >
                  {renderItem ? (
                    renderItem(item, highlightedIndex === index, segments)
                  ) : (
                    <span>
                      {segments.map((seg, i) =>
                        seg.highlighted ? <mark key={i}>{seg.text}</mark> : <span key={i}>{seg.text}</span>,
                      )}
                    </span>
                  )}
                </li>
              );
            })}
            {isLoadingMore && (
              <li role="presentation" aria-hidden="true" className={styles.loading}>
                Loading more...
              </li>
            )}
          </>
        )}
      </ul>

      {(showLoading || showNoResults) && (
        <ul className={styles.menu} aria-hidden="true">
          {showLoading &&
            (renderLoading ? (
              renderLoading()
            ) : (
              <>
                <li className={styles.skeleton} style={{ width: '80%' }} />
                <li className={styles.skeleton} style={{ width: '60%' }} />
                <li className={styles.skeleton} style={{ width: '70%' }} />
              </>
            ))}
          {showNoResults &&
            (renderNoResults ? renderNoResults() : <li className={styles.noResults}>No addresses found</li>)}
        </ul>
      )}

      {error &&
        (renderError ? (
          <div id={errorId}>{renderError(error)}</div>
        ) : (
          <div id={errorId} className={styles.error} role="alert">
            {error.message}
          </div>
        ))}
    </div>
  );
}
