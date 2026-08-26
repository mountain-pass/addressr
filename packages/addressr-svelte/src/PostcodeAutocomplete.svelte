<!--
  @jtbd JTBD-002 (developer-integration) + JTBD-101 (end-user)
  Slots: item, loading, no-results, error
  When using custom slots, you are responsible for accessibility:
  - loading / no-results: return <li> elements
  - item: rendered inside the existing <li>
  - error: include role="alert" on the container
  - Maintain WCAG AA contrast (4.5:1) for any custom text
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { PostcodeSearchResult } from '@mountainpass/addressr-core';
  import { createPostcodeSearch } from './createPostcodeSearch';

  export let apiKey: string | undefined = undefined;
  export let apiUrl: string | undefined = undefined;
  export let apiHost: string | undefined = undefined;
  export let label: string = 'Search Australian postcodes';
  export let placeholder: string = 'Start typing a postcode...';
  export let debounceMs: number | undefined = undefined;
  export let name: string = 'postcode';
  export let required: boolean = false;
  export let onSelect: ((result: PostcodeSearchResult) => void) | undefined = undefined;
  export let fetchImpl: typeof fetch | undefined = undefined;

  const uid = `addressr-${Math.random().toString(36).slice(2, 9)}`;
  const inputId = `${uid}-input`;
  const listboxId = `${uid}-listbox`;
  const statusId = `${uid}-status`;
  const errorId = `${uid}-error`;

  const store = createPostcodeSearch({ apiKey, apiUrl, apiHost, debounceMs, fetchImpl });

  let isOpen = false;
  let highlightedIndex = -1;

  let query = '';
  let results: PostcodeSearchResult[] = [];
  let isLoading = false;
  let isLoadingMore = false;
  let hasMore = false;
  let error: Error | null = null;

  store.subscribe((s) => {
    query = s.query;
    results = s.results;
    isLoading = s.isLoading;
    isLoadingMore = s.isLoadingMore;
    hasMore = s.hasMore;
    error = s.error;
  });

  function handleInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    store.setQuery(value);
    isOpen = true;
    highlightedIndex = -1;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!isOpen && event.key === 'ArrowDown') {
      isOpen = true;
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      highlightedIndex = Math.min(highlightedIndex + 1, results.length - 1);
      if (highlightedIndex === results.length - 1 && hasMore) store.loadMore();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, -1);
    } else if (event.key === 'Enter' && highlightedIndex >= 0) {
      event.preventDefault();
      selectItem(highlightedIndex);
    } else if (event.key === 'Escape') {
      isOpen = false;
      highlightedIndex = -1;
    }
  }

  function selectItem(index: number) {
    const item = results[index];
    if (item) {
      if (onSelect) onSelect(item);
      store.setQuery(item.postcode);
      isOpen = false;
      highlightedIndex = -1;
    }
  }

  function handleScroll(event: Event) {
    if (!hasMore || isLoadingMore) return;
    const el = event.target as HTMLElement;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 50) {
      store.loadMore();
    }
  }

  function handleBlur() {
    setTimeout(() => { isOpen = false; highlightedIndex = -1; }, 200);
  }

  $: showMenu = isOpen && (results.length > 0 || isLoading || (query.length >= 3 && !isLoading));
  $: activeDescendant = highlightedIndex >= 0 ? `${uid}-option-${highlightedIndex}` : '';

  onDestroy(() => store.destroy());
</script>

<div class="addressr-wrapper">
  <label for={inputId} class="addressr-label">{label}</label>
  <input
    id={inputId}
    type="text"
    role="combobox"
    autocomplete="off"
    aria-autocomplete="list"
    aria-haspopup="listbox"
    aria-expanded={showMenu}
    aria-controls={listboxId}
    aria-activedescendant={activeDescendant}
    aria-describedby={error ? errorId : undefined}
    aria-required={required || undefined}
    aria-invalid={error ? true : undefined}
    {name}
    {placeholder}
    value={query}
    on:input={handleInput}
    on:keydown={handleKeydown}
    on:blur={handleBlur}
    on:focus={() => { if (results.length > 0) isOpen = true; }}
    class="addressr-input"
  />

  <div id={statusId} role="status" aria-live="polite" aria-atomic="true" class="addressr-sr-only">
    {#if isLoading}
      Searching postcodes...
    {:else if results.length > 0}
      {results.length} postcodes found
    {:else if query.length >= 3}
      No postcodes found
    {/if}
  </div>

  <ul
    id={listboxId}
    role="listbox"
    class="addressr-menu"
    class:addressr-menu-hidden={!showMenu}
    on:scroll={handleScroll}
  >
    {#if showMenu}
      {#if isLoading}
        <slot name="loading">
          <li class="addressr-skeleton" style="width: 40%" aria-hidden="true"></li>
          <li class="addressr-skeleton" style="width: 60%" aria-hidden="true"></li>
          <li class="addressr-skeleton" style="width: 50%" aria-hidden="true"></li>
        </slot>
      {/if}
      {#if !isLoading && results.length === 0 && query.length >= 3}
        <slot name="no-results">
          <li class="addressr-no-results">No postcodes found</li>
        </slot>
      {/if}
      {#each results as item, index (item.postcode)}
        <li
          id="{uid}-option-{index}"
          role="option"
          tabindex="-1"
          aria-selected={highlightedIndex === index}
          class="addressr-item"
          class:addressr-item-highlighted={highlightedIndex === index}
          on:click={() => selectItem(index)}
          on:mouseenter={() => { highlightedIndex = index; }}
        >
          <slot name="item" {item} highlighted={highlightedIndex === index}>
            <span>
              <strong>{item.postcode}</strong>
              {#if item.localities.length > 0}
                {' — '}{item.localities.map((l) => l.name).join(', ')}
              {/if}
            </span>
          </slot>
        </li>
      {/each}
      {#if isLoadingMore}
        <li role="presentation" class="addressr-loading">Loading more...</li>
      {/if}
    {/if}
  </ul>

  {#if error}
    <slot name="error" {error}>
      <div id={errorId} class="addressr-error" role="alert" aria-live="assertive" aria-atomic="true">
        {error.message}
      </div>
    </slot>
  {/if}
</div>

<style>
  .addressr-wrapper {
    position: relative;
    font-family: var(--addressr-font-family, system-ui, -apple-system, sans-serif);
  }
  .addressr-label {
    display: block;
    margin-bottom: 0.25rem;
    font-weight: 500;
    font-size: 0.875rem;
  }
  .addressr-input {
    width: 100%;
    padding: var(--addressr-padding-y, 0.625rem) var(--addressr-padding-x, 0.75rem);
    font-size: 1rem;
    line-height: 1.5;
    color: var(--addressr-text-color, inherit);
    border: 1px solid var(--addressr-border-color, #767676);
    border-radius: var(--addressr-border-radius, 0.25rem);
    box-sizing: border-box;
  }
  .addressr-input:focus-visible {
    outline: 2px solid var(--addressr-focus-color, #005fcc);
    outline-offset: 1px;
    border-color: var(--addressr-focus-color, #005fcc);
  }
  .addressr-menu {
    position: absolute;
    z-index: var(--addressr-z-index, 1000);
    width: 100%;
    max-height: 20rem;
    overflow-y: auto;
    margin: 0;
    padding: 0;
    list-style: none;
    background: var(--addressr-bg, #fff);
    border: 1px solid var(--addressr-border-color, #767676);
    border-top: none;
    border-radius: 0 0 var(--addressr-border-radius, 0.25rem) var(--addressr-border-radius, 0.25rem);
    box-shadow: var(--addressr-shadow, 0 4px 6px rgba(0, 0, 0, 0.1));
    box-sizing: border-box;
  }
  .addressr-menu-hidden {
    display: none;
  }
  .addressr-item {
    min-height: 2.75rem;
    padding: var(--addressr-padding-y, 0.625rem) var(--addressr-padding-x, 0.75rem);
    cursor: pointer;
    display: flex;
    align-items: center;
    font-size: 0.9375rem;
    line-height: 1.4;
  }
  .addressr-item-highlighted {
    background-color: var(--addressr-highlight-bg, #e8f0fe);
  }
  .addressr-no-results {
    padding: var(--addressr-padding-y, 0.625rem) var(--addressr-padding-x, 0.75rem);
    color: var(--addressr-muted-color, #555);
    font-style: italic;
    font-size: 0.875rem;
  }
  .addressr-loading {
    padding: var(--addressr-padding-y, 0.625rem) var(--addressr-padding-x, 0.75rem);
    color: var(--addressr-muted-color, #555);
    font-size: 0.875rem;
  }
  .addressr-error {
    padding: var(--addressr-padding-y, 0.625rem) var(--addressr-padding-x, 0.75rem);
    color: var(--addressr-error-color, #d32f2f);
    font-size: 0.875rem;
  }
  .addressr-skeleton {
    height: 1rem;
    margin: var(--addressr-padding-y, 0.625rem) var(--addressr-padding-x, 0.75rem);
    border-radius: var(--addressr-border-radius, 0.25rem);
    background: linear-gradient(
      90deg,
      var(--addressr-skeleton-from, #e0e0e0) 25%,
      var(--addressr-skeleton-to, #f0f0f0) 50%,
      var(--addressr-skeleton-from, #e0e0e0) 75%
    );
    background-size: 200% 100%;
    animation: addressr-shimmer 1.5s infinite linear;
  }
  @keyframes addressr-shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .addressr-skeleton {
      animation: none;
    }
  }
  .addressr-sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
