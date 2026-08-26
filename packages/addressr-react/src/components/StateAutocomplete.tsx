// @jtbd JTBD-004 (developer-integration) + JTBD-103 (end-user)
import { useId, useRef } from 'react';
import { useCombobox } from 'downshift';
import { useStateSearch } from '../hooks/useStateSearch';
import type { StateSearchResult } from '@mountainpass/addressr-core';
import styles from './AddressAutocomplete.module.css';

export interface StateAutocompleteProps {
  /** RapidAPI key. Omit when connecting directly to an addressr instance. */
  apiKey?: string;
  onSelect: (result: StateSearchResult) => void;
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
  renderItem?: (item: StateSearchResult, highlighted: boolean) => React.ReactNode;
  /** @internal */
  fetchImpl?: typeof fetch;
}

export function StateAutocomplete({
  apiKey,
  onSelect,
  label = 'Search Australian states and territories',
  placeholder = 'Start typing a state...',
  className,
  name = 'state',
  required,
  debounceMs,
  apiUrl,
  apiHost,
  renderLoading,
  renderNoResults,
  renderError,
  renderItem,
  fetchImpl,
}: StateAutocompleteProps) {
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
    error,
  } = useStateSearch({ apiKey, apiUrl, apiHost, debounceMs, minQueryLength: 2, fetchImpl });

  const {
    isOpen,
    getLabelProps,
    getMenuProps,
    getInputProps,
    highlightedIndex,
    getItemProps,
  } = useCombobox<StateSearchResult>({
    items: results,
    inputValue: query,
    onInputValueChange: ({ inputValue }) => setQuery(inputValue ?? ''),
    onSelectedItemChange: ({ selectedItem }) => {
      if (selectedItem) {
        onSelectRef.current(selectedItem);
      }
    },
    itemToString: (item) => item?.name ?? '',
  });

  const showMenu = isOpen && (results.length > 0 || isLoading || (query.length >= 2 && !isLoading));

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
        {isLoading && 'Searching states and territories...'}
        {!isLoading && results.length > 0 && (results.length === 1
          ? '1 state or territory found'
          : `${results.length} states or territories found`)}
        {!isLoading && results.length === 0 && query.length >= 2 && 'No states or territories found'}
      </div>

      <ul {...getMenuProps()} className={`${styles.menu} ${!showMenu ? styles.menuHidden : ''}`}>
        {showMenu && (
          <>
            {isLoading && (
              renderLoading ? renderLoading() : (
                <>
                  <li className={styles.skeleton} style={{ width: '50%' }} aria-hidden="true" />
                  <li className={styles.skeleton} style={{ width: '65%' }} aria-hidden="true" />
                </>
              )
            )}
            {!isLoading && results.length === 0 && query.length >= 2 && (
              renderNoResults ? renderNoResults() : (
                <li className={styles.noResults}>No states or territories found</li>
              )
            )}
            {results.map((item, index) => (
              <li
                key={item.abbreviation}
                {...getItemProps({ item, index })}
                className={`${styles.item} ${highlightedIndex === index ? styles.itemHighlighted : ''}`}
              >
                {renderItem ? renderItem(item, highlightedIndex === index) : (
                  <span>
                    <strong>{item.name}</strong> ({item.abbreviation})
                  </span>
                )}
              </li>
            ))}
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
