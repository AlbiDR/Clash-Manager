
export interface CardMechanicsCallbacks {
    onExpand: () => void
    onSelect: () => void
}

export function useCardMechanics(
    props: { selectionMode: boolean },
    callbacks: CardMechanicsCallbacks
) {
    
    function handleTap() {
        if (props.selectionMode) {
            callbacks.onSelect()
        } else {
            callbacks.onExpand()
        }
    }

    function handleLongPress() {
        callbacks.onSelect()
    }

    function handleScoreClick(e: Event) {
        e.stopPropagation()
        if (navigator.vibrate) navigator.vibrate(20)
        callbacks.onSelect()
    }

    function handleExpandClick(e: Event) {
        e.stopPropagation()
        if (navigator.vibrate) navigator.vibrate(10)
        callbacks.onExpand()
    }

    return {
        handleTap,
        handleLongPress,
        handleScoreClick,
        handleExpandClick
    }
}
