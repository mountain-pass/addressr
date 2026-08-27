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

  const { query, setQuery, results, isLoading, isLoadingMore, hasMore, loadMore, error } = useLocalitySearch({
    apiKey,
    apiUrl,
    apiHost,
    debounceMs,
    fetchImpl,
  });

  const { isOpen, getLabelProps, getMenuProps, getInputProps, highlightedIndex, getItemProps } =
    useCombobox<LocalitySearchResult>({
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

  const showMenu = isOpen && results.length > 0;
  const showLoading = isOpen && isLoading && results.length === 0;
  const showNoResults = isOpen && !error && !isLoading && results.length === 0 && query.length >= 3;
  const statusMessage = isLoading
    ? 'Searching suburbs and towns...'
    : isLoadingMore
      ? 'Loading more suburbs and towns...'
      : results.length > 0
        ? results.length === 1
          ? '1 suburb or town found'
          : `${results.length} suburbs and towns found`
        : !error && query.length >= 3
          ? 'No suburbs or towns found'
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
            {results.map((item, index) => (
              <li
                key={item.pid}
                {...getItemProps({ item, index })}
                className={`${styles.item} ${highlightedIndex === index ? styles.itemHighlighted : ''}`}
              >
                {renderItem ? (
                  renderItem(item, highlightedIndex === index)
                ) : (
                  <span>
                    <strong>{item.name}</strong> {item.state.abbreviation} {item.postcode}
                  </span>
                )}
              </li>
            ))}
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
                <li className={styles.skeleton} style={{ width: '60%' }} />
                <li className={styles.skeleton} style={{ width: '70%' }} />
                <li className={styles.skeleton} style={{ width: '55%' }} />
              </>
            ))}
          {showNoResults &&
            (renderNoResults ? renderNoResults() : <li className={styles.noResults}>No suburbs or towns found</li>)}
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
