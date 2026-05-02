// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { useHaptics } from "@core/services/useHaptics";

/**
 * Interface defining the required callbacks for card interactions.
 */
interface CardCallbacks {
  /** Triggered when an item is selected for batch actions. */
  onSelect: () => void;
  /** Triggered when an item should expand its detailed view. */
  onExpand: () => void;
}

/**
 * Properties required to determine the active interaction mode.
 */
interface CardProps {
  /** If true, single taps trigger selection instead of expansion. */
  selectionMode: boolean;
}

/**
 * COMPOSABLE: useCardMechanics
 *
 * @remarks
 * A Layer 2 driver (@shared) that standardizes interaction patterns for complex list items.
 * It abstracts hardware-brokered haptic feedback and coordinates gesture-based
 * navigation (tap vs. long-press) to ensure consistent UX across the application.
 *
 * @param props - Reactive properties defining the current selection state.
 * @param callbacks - Implementation handlers for selection and expansion events.
 *
 * @returns
 * - `handleTap`: Orchestrates tap behavior based on `selectionMode`.
 * - `handleLongPress`: Standardized entry point for batch selection.
 * - `handleScoreClick`: Isolated selection handler for the score component.
 * - `handleExpandClick`: Isolated expansion handler for the chevron component.
 *
 * @sideeffects
 * - Accesses the `useHaptics` service to trigger device vibration.
 */
export function useCardMechanics(
  interactionProps: CardProps,
  interactionCallbacks: CardCallbacks,
) {
  const haptics = useHaptics();

  /**
   * Primary touch/click handler.
   * If in selection mode, toggles selection. Otherwise, expands the card.
   */
  function handleTap() {
    if (interactionProps.selectionMode) {
      interactionCallbacks.onSelect();
    } else {
      interactionCallbacks.onExpand();
    }
  }

  /**
   * Long-press handler.
   * Always triggers selection, acting as the primary entry point for batch mode.
   */
  function handleLongPress() {
    interactionCallbacks.onSelect();
  }

  /**
   * Specialized handler for clicks on the ScoreBadge.
   *
   * @remarks
   * Utilizes `interactionEvent.stopPropagation()` to isolate the event from the card's main
   * tap handler, ensuring that clicking the score ONLY selects the card
   * without triggering an unintentional expansion or collapse.
   */
  function handleScoreClick(interactionEvent: MouseEvent | TouchEvent) {
    interactionEvent.stopPropagation(); // Event Isolation: Prevent card-level handleTap
    haptics.tap();
    interactionCallbacks.onSelect();
  }

  /**
   * Specialized handler for clicks on the Expansion Toggle (Chevron).
   *
   * @remarks
   * Utilizes `interactionEvent.stopPropagation()` to isolate the event from the card's main
   * tap handler. This is critical when the card is in selection mode,
   * allowing the user to expand details without unintentionally selecting the item.
   */
  function handleExpandClick(interactionEvent: MouseEvent | TouchEvent) {
    interactionEvent.stopPropagation(); // Event Isolation: Prevent card-level handleTap
    haptics.tap();
    interactionCallbacks.onExpand();
  }

  return {
    handleTap,
    handleLongPress,
    handleScoreClick,
    handleExpandClick,
  };
}
