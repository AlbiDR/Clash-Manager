// @ts-nocheck
export function useCardMechanics(
    props,
    callbacks
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

    function handleScoreClick(e) {
        e.stopPropagation()
        if (navigator.vibrate) navigator.vibrate(20)
        callbacks.onSelect()
    }

    function handleExpandClick(e) {
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
