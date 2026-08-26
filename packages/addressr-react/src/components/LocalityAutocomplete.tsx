// @jtbd JTBD-003 (developer-integration) + JTBD-102 (end-user)
import { useId, useRef, useCallback } from 'react';
import { useCombobox } from 'downshift';
import { useLocalitySearch } from '../hooks/useLocalitySearch';
import type { LocalitySearchResult } from '@mountainpass/addressr-core';
import styles from './AddressAutocomplete.module.css';

export interface LocalityAutocompleteProps {
  /** RapidAPI key. Omit when connecting directly to an addressr instance. */
  apiKey?: string;
  onSelect: (result: LocalitySearchResult) => void;
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
   * with ARIA attributes.
   */
  renderItem?: (item: LocalitySearchResult, highlighted: boolean) => React.ReactNode;
  /** @internal */
  fetchImpl?: typeof fetch;
}

export function LocalityAutocomplete({
  apiKey,
  onSelect,
  label = 'Search Australian suburbs and towns',
  placeholder = 'Start typing a suburb or town...',
  className,
  name = 'locality',
  required,
  debounceMs,
  apiUrl,
  apiHost,
  renderLoading,
  renderNoResults,
  renderError,
  renderItem,
  fetchImpl,
}: LocalityAutocompleteProps) {
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
  } = useLocalitySearch({ apiKey, apiUrl, apiHost, debounceMs, fetchImpl });

  const {
    isOpen,
    getLabelProps,
    getMenuProps,
    getInputProps,
    highlightedIndex,
    getItemProps,
  } = useCombobox<LocalitySearchResult>({
    items: results,
    inputValue: query,
    onInputValueChange: ({ inputValue }) => setQuery(inputValue ?? ''),
    onSelectedItemChange: ({ selectedItem }) => {
      if (selectedItem) {
        onSelectRef.current(selectedItem);
      }
    },
    itemToString: (item) => (item ? `${item.name} ${item.state.abbreviation} ${item.postcode}` : ''),
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

      <div id={statusId} role="status" aria-live="polite" aria-atomic="true" className={styles.srOnly}>
        {isLoading && 'Searching suburbs and towns...'}
        {!isLoading && results.length > 0 && (results.length === 1
          ? '1 suburb or town found'
          : `${results.length} suburbs and towns found`)}
        {!isLoading && results.length === 0 && query.length >= 3 && 'No suburbs or towns found'}
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
                  <li className={styles.skeleton} style={{ width: '60%' }} aria-hidden="true" />
                  <li className={styles.skeleton} style={{ width: '70%' }} aria-hidden="true" />
                  <li className={styles.skeleton} style={{ width: '55%' }} aria-hidden="true" />
                </>
              )
            )}
            {!isLoading && results.length === 0 && query.length >= 3 && (
              renderNoResults ? renderNoResults() : (
                <li className={styles.noResults}>No suburbs or towns found</li>
              )
            )}
            {results.map((item, index) => (
              <li
                key={item.pid}
                {...getItemProps({ item, index })}
                className={`${styles.item} ${highlightedIndex === index ? styles.itemHighlighted : ''}`}
              >
                {renderItem ? renderItem(item, highlightedIndex === index) : (
                  <span>
                    <strong>{item.name}</strong> {item.state.abbreviation} {item.postcode}
                  </span>
                )}
              </li>
            ))}
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
