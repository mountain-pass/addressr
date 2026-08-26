// @jtbd JTBD-002 (developer-integration) + JTBD-101 (end-user)
import { useId, useRef, useCallback } from 'react';
import { useCombobox } from 'downshift';
import { usePostcodeSearch } from '../hooks/usePostcodeSearch';
import type { PostcodeSearchResult } from '@mountainpass/addressr-core';
import styles from './AddressAutocomplete.module.css';

export interface PostcodeAutocompleteProps {
  /** RapidAPI key. Omit when connecting directly to an addressr instance. */
  apiKey?: string;
  onSelect: (result: PostcodeSearchResult) => void;
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
  renderItem?: (item: PostcodeSearchResult, highlighted: boolean) => React.ReactNode;
  /** @internal */
  fetchImpl?: typeof fetch;
}

export function PostcodeAutocomplete({
  apiKey,
  onSelect,
  label = 'Search Australian postcodes',
  placeholder = 'Start typing a postcode...',
  className,
  name = 'postcode',
  required,
  debounceMs,
  apiUrl,
  apiHost,
  renderLoading,
  renderNoResults,
  renderError,
  renderItem,
  fetchImpl,
}: PostcodeAutocompleteProps) {
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
  } = usePostcodeSearch({ apiKey, apiUrl, apiHost, debounceMs, fetchImpl });

  const {
    isOpen,
    getLabelProps,
    getMenuProps,
    getInputProps,
    highlightedIndex,
    getItemProps,
  } = useCombobox<PostcodeSearchResult>({
    items: results,
    inputValue: query,
    onInputValueChange: ({ inputValue }) => setQuery(inputValue ?? ''),
    onSelectedItemChange: ({ selectedItem }) => {
      if (selectedItem) {
        onSelectRef.current(selectedItem);
      }
    },
    itemToString: (item) => item?.postcode ?? '',
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
        {isLoading && 'Searching postcodes...'}
        {!isLoading && results.length > 0 && `${results.length} ${results.length === 1 ? 'postcode' : 'postcodes'} found`}
        {!isLoading && results.length === 0 && query.length >= 3 && 'No postcodes found'}
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
                  <li className={styles.skeleton} style={{ width: '40%' }} aria-hidden="true" />
                  <li className={styles.skeleton} style={{ width: '60%' }} aria-hidden="true" />
                  <li className={styles.skeleton} style={{ width: '50%' }} aria-hidden="true" />
                </>
              )
            )}
            {!isLoading && results.length === 0 && query.length >= 3 && (
              renderNoResults ? renderNoResults() : (
                <li className={styles.noResults}>No postcodes found</li>
              )
            )}
            {results.map((item, index) => (
              <li
                key={`${item.postcode}-${item.localities[0]?.name ?? 'unknown'}`}
                {...getItemProps({ item, index })}
                className={`${styles.item} ${highlightedIndex === index ? styles.itemHighlighted : ''}`}
              >
                {renderItem ? renderItem(item, highlightedIndex === index) : (
                  <span>
                    <strong>{item.postcode}</strong>
                    {item.localities.length > 0 && (
                      <> {' — '}{item.localities.map((l) => l.name).join(', ')}</>
                    )}
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
