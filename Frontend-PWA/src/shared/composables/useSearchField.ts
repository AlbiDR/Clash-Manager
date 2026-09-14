// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * CLASH MANAGER - Search Field Behaviour (Layer 2 - Shared)
 * ----------------------------------------------------------------------------
 * The open/closed rule, focus handling and debounce for a collapsible search
 * control.
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 2 Shared (@shared/composables)
 * - **Role:** Domain-blind interaction logic for a search input.
 * - **Permitted Imports:** Vue reactivity primitives only.
 *
 * [DECISION LOG] A FILTER MAY NEVER HIDE.
 * The control collapses to an icon to buy back space, and the single rule that
 * makes that safe is that `isOpen` is the OR of "the reader opened it" and
 * "there is a query". A collapsed control with a live query would leave a list
 * silently short with nothing on screen explaining why, and this app persists
 * its query across a view switch, so that state is reachable in normal use
 * rather than hypothetical. Prominence tracks whether the control is doing
 * anything: idle it is an icon, working it is a field.
 *
 * [DECISION LOG] The query is NOT owned here. It lives with whoever filters the
 * list, and is passed in through `readQuery`. A second copy inside this
 * composable would be a second source of truth for a value the list is already
 * derived from, and the two would disagree the moment either side cleared
 * without telling the other - which is exactly how the input in ConsoleHeader
 * used to behave, emitting changes upward while never reflecting anything back.
 *
 * [THREAT:] The debounce timer outlives a fast unmount. A reader who types and
 * immediately navigates leaves a pending timer that fires into a dead
 * component. `stopDebounce` is registered on both unmount and deactivate,
 * because under `<KeepAlive>` a view switch fires only the latter.
 * ============================================================================
 */
import { computed, nextTick, onDeactivated, onUnmounted, ref, type ComputedRef } from "vue";

/** How long typing settles before the list is asked to re-filter. */
const DEFAULT_DEBOUNCE_MS = 300;

export interface SearchFieldOptions {
  /** Reads the query from wherever it actually lives. */
  readQuery: () => string;
  /** Reports a settled query to the owner of the list. */
  onQueryChange: (query: string) => void;
  /** Overrides the settle delay; the default suits a list of tens of rows. */
  debounceMs?: number;
  /**
   * Places the caret in the field once it exists.
   *
   * [DECISION LOG] A callback rather than a template ref held in here. This
   * layer is meant to be domain-blind AND element-blind: taking a ref to an
   * `HTMLInputElement` would tie a behaviour rule to one element type and make
   * the composable untestable without a DOM. The host owns its element; this
   * owns when focus should move.
   */
  focusInput?: () => void;
  /** Releases focus from the field. */
  blurInput?: () => void;
}

export interface SearchFieldController {
  /** Whether the field is showing rather than the icon. */
  isOpen: ComputedRef<boolean>;
  /** Whether a query is currently narrowing the list. */
  hasQuery: ComputedRef<boolean>;
  /** Reveals the field and puts the caret in it. */
  openSearchField: () => void;
  /** Hides the field, but only when nothing is being filtered. */
  closeSearchField: () => void;
  /** Empties the query and hides the field. */
  clearSearchField: () => void;
  /** Input handler; debounces before reporting. */
  handleSearchInput: (inputEvent: Event) => void;
  /** Key handler; Escape clears, Enter settles immediately. */
  handleSearchKeydown: (keyboardEvent: KeyboardEvent) => void;
}

/**
 * Builds the behaviour for a collapsible search field.
 *
 * @param options - Where the query lives and how to report changes to it.
 * @returns The reactive state and handlers a search control needs.
 */
export function useSearchField(options: SearchFieldOptions): SearchFieldController {
  const { readQuery, onQueryChange, focusInput, blurInput, debounceMs = DEFAULT_DEBOUNCE_MS } = options;

  const isRevealed = ref(false);
  let debounceTimer: number | null = null;

  const hasQuery = computed(() => readQuery().trim().length > 0);
  const isOpen = computed(() => isRevealed.value || hasQuery.value);

  function stopDebounce(): void {
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  /** Reports immediately, cancelling anything still settling. */
  function commitQuery(query: string): void {
    stopDebounce();
    onQueryChange(query);
  }

  function openSearchField(): void {
    isRevealed.value = true;
    // The tap that opens the field is also the tap that should start typing.
    // Without this the reader pays twice to reach the same caret.
    void nextTick(() => focusInput?.());
  }

  function closeSearchField(): void {
    // `isOpen` keeps the field up while a query stands, so this only ever
    // closes an idle control. Blur handlers can call it unconditionally.
    isRevealed.value = false;
  }

  function clearSearchField(): void {
    commitQuery("");
    isRevealed.value = false;
  }

  function handleSearchInput(inputEvent: Event): void {
    const candidate = (inputEvent.target as HTMLInputElement).value;
    stopDebounce();
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      onQueryChange(candidate);
    }, debounceMs);
  }

  function handleSearchKeydown(keyboardEvent: KeyboardEvent): void {
    if (keyboardEvent.key === "Escape") {
      // Escape on a field that is already empty should reach whatever else
      // wants it, so this only claims the event when it has work to do.
      if (!hasQuery.value && !isRevealed.value) return;
      keyboardEvent.preventDefault();
      clearSearchField();
      blurInput?.();
      return;
    }
    if (keyboardEvent.key === "Enter") {
      keyboardEvent.preventDefault();
      commitQuery((keyboardEvent.target as HTMLInputElement).value);
    }
  }

  onUnmounted(stopDebounce);

  /**
   * A view put away comes back at rest.
   *
   * [DECISION LOG] Collapsing here as well as stopping the timer, because
   * `isRevealed` is component state and <KeepAlive> preserves it. Measured:
   * with only the query cleared on deactivate, returning to a console showed an
   * open, empty field - the control announcing work it was no longer doing.
   * The two halves of "at rest" have to be reset by the same event or they
   * disagree, and the visible half is the one the reader judges.
   */
  onDeactivated(() => {
    stopDebounce();
    isRevealed.value = false;
  });

  return {
    isOpen,
    hasQuery,
    openSearchField,
    closeSearchField,
    clearSearchField,
    handleSearchInput,
    handleSearchKeydown,
  };
}
