<!--
  @jtbd JTBD-002 (developer-integration) + JTBD-101 (end-user)
  Slots: item, loading, no-results, error
  When using custom slots, you are responsible for accessibility:
  - loading / no-results: return <li> elements
  - error: include role="alert" on the container
  - Maintain WCAG AA contrast (4.5:1) for any custom text
-->
<script setup lang="ts">
import { ref, computed } from 'vue';
import type { PostcodeSearchResult } from '@mountainpass/addressr-core';
import { usePostcodeSearch } from './usePostcodeSearch';

const props = withDefaults(defineProps<{
  apiKey?: string;
  apiUrl?: string;
  apiHost?: string;
  label?: string;
  placeholder?: string;
  name?: string;
  required?: boolean;
  debounceMs?: number;
  fetchImpl?: typeof fetch;
}>(), {
  label: 'Search Australian postcodes',
  placeholder: 'Start typing a postcode...',
  name: 'postcode',
  required: false,
});

const emit = defineEmits<{
  select: [result: PostcodeSearchResult];
}>();

const uid = `addressr-${Math.random().toString(36).slice(2, 9)}`;
const inputId = `${uid}-input`;
const listboxId = `${uid}-listbox`;
const statusId = `${uid}-status`;
const errorId = `${uid}-error`;

const search = usePostcodeSearch({
  apiKey: props.apiKey,
  apiUrl: props.apiUrl,
  apiHost: props.apiHost,
  debounceMs: props.debounceMs,
  fetchImpl: props.fetchImpl,
});

const isOpen = ref(false);
const highlightedIndex = ref(-1);

function handleInput(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  search.setQuery(value);
  isOpen.value = true;
  highlightedIndex.value = -1;
}

function handleKeydown(event: KeyboardEvent) {
  if (!isOpen.value && event.key === 'ArrowDown') {
    isOpen.value = true;
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    highlightedIndex.value = Math.min(highlightedIndex.value + 1, search.results.value.length - 1);
    if (highlightedIndex.value === search.results.value.length - 1 && search.hasMore.value) {
      search.loadMore();
    }
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    highlightedIndex.value = Math.max(highlightedIndex.value - 1, -1);
  } else if (event.key === 'Enter' && highlightedIndex.value >= 0) {
    event.preventDefault();
    selectItem(highlightedIndex.value);
  } else if (event.key === 'Escape') {
    isOpen.value = false;
    highlightedIndex.value = -1;
  }
}

function selectItem(index: number) {
  const item = search.results.value[index];
  if (item) {
    emit('select', item);
    search.setQuery(item.postcode);
    isOpen.value = false;
    highlightedIndex.value = -1;
  }
}

function handleScroll(event: Event) {
  if (!search.hasMore.value || search.isLoadingMore.value) return;
  const el = event.target as HTMLElement;
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 50) {
    search.loadMore();
  }
}

function handleBlur() {
  setTimeout(() => { isOpen.value = false; highlightedIndex.value = -1; }, 200);
}

const showMenu = computed(() =>
  isOpen.value && (
    search.results.value.length > 0 ||
    search.isLoading.value ||
    (search.query.value.length >= 3 && !search.isLoading.value)
  )
);

const activeDescendant = computed(() =>
  highlightedIndex.value >= 0 ? `${uid}-option-${highlightedIndex.value}` : undefined
);
</script>

<template>
  <div class="addressr-wrapper">
    <label :for="inputId" class="addressr-label">{{ props.label }}</label>
    <input
      :id="inputId"
      type="text"
      role="combobox"
      autocomplete="off"
      aria-autocomplete="list"
      aria-haspopup="listbox"
      :aria-expanded="showMenu"
      :aria-controls="listboxId"
      :aria-activedescendant="activeDescendant"
      :aria-describedby="search.error.value ? errorId : undefined"
      :aria-required="props.required || undefined"
      :aria-invalid="search.error.value ? true : undefined"
      :name="props.name"
      :placeholder="props.placeholder"
      :value="search.query.value"
      class="addressr-input"
      @input="handleInput"
      @keydown="handleKeydown"
      @blur="handleBlur"
      @focus="search.results.value.length > 0 && (isOpen = true)"
    />

    <div :id="statusId" role="status" aria-live="polite" aria-atomic="true" class="addressr-sr-only">
      <template v-if="search.isLoading.value">Searching postcodes...</template>
      <template v-else-if="search.results.value.length > 0">{{ search.results.value.length }} postcodes found</template>
      <template v-else-if="search.query.value.length >= 3">No postcodes found</template>
    </div>

    <ul
      :id="listboxId"
      role="listbox"
      class="addressr-menu"
      :class="{ 'addressr-menu-hidden': !showMenu }"
      @scroll="handleScroll"
    >
      <template v-if="showMenu">
        <template v-if="search.isLoading.value">
          <slot name="loading">
            <li class="addressr-skeleton" style="width: 40%" aria-hidden="true"></li>
            <li class="addressr-skeleton" style="width: 60%" aria-hidden="true"></li>
            <li class="addressr-skeleton" style="width: 50%" aria-hidden="true"></li>
          </slot>
        </template>
        <template v-if="!search.isLoading.value && search.results.value.length === 0 && search.query.value.length >= 3">
          <slot name="no-results">
            <li class="addressr-no-results">No postcodes found</li>
          </slot>
        </template>
        <li
          v-for="(item, index) in search.results.value"
          :key="item.postcode"
          :id="`${uid}-option-${index}`"
          role="option"
          tabindex="-1"
          :aria-selected="highlightedIndex === index"
          class="addressr-item"
          :class="{ 'addressr-item-highlighted': highlightedIndex === index }"
          @click="selectItem(index)"
          @mouseenter="highlightedIndex = index"
        >
          <slot name="item" :item="item" :highlighted="highlightedIndex === index">
            <span>
              <strong>{{ item.postcode }}</strong>
              <template v-if="item.localities.length > 0">
                {{ ' — ' }}{{ item.localities.map((l) => l.name).join(', ') }}
              </template>
            </span>
          </slot>
        </li>
        <li v-if="search.isLoadingMore.value" role="presentation" class="addressr-loading">Loading more...</li>
      </template>
    </ul>

    <template v-if="search.error.value">
      <slot name="error" :error="search.error.value">
        <div :id="errorId" class="addressr-error" role="alert" aria-live="assertive" aria-atomic="true">
          {{ search.error.value.message }}
        </div>
      </slot>
    </template>
  </div>
</template>

<style scoped>
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
.addressr-menu-hidden { display: none; }
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
  .addressr-skeleton { animation: none; }
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
