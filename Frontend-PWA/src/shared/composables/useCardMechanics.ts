import { useHaptics } from "./useHaptics";
interface CardCallbacks {
  onSelect: () => void;
  onExpand: () => void;
}

interface CardProps {
  selectionMode: boolean;
}

/**
 * 🃏 USE CARD MECHANICS
 * Standardized interaction handlers for List Items (Members/Recruits).
 */
export function useCardMechanics(props: CardProps, callbacks: CardCallbacks) {
  const haptics = useHaptics();

  function handleTap() {
    if (props.selectionMode) {
      callbacks.onSelect();
    } else {
      callbacks.onExpand();
    }
  }

  function handleLongPress() {
    callbacks.onSelect();
  }

  function handleScoreClick(e: MouseEvent | TouchEvent) {
    e.stopPropagation();
    haptics.tap();
    callbacks.onSelect();
  }

  function handleExpandClick(e: MouseEvent | TouchEvent) {
    e.stopPropagation();
    haptics.tap();
    callbacks.onExpand();
  }

  return {
    handleTap,
    handleLongPress,
    handleScoreClick,
    handleExpandClick,
  };
}

