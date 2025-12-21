
export function useCardMechanics(
    props: { selectionMode: boolean },
    emit: { (e: 'toggle-expand'): void; (e: 'toggle-select'): void }
) {
    
    function handleTap() {
        if (props.selectionMode) {
            emit('toggle-select')
        } else {
            emit('toggle-expand')
        }
    }

    function handleLongPress() {
        emit('toggle-select')
    }

    function handleScoreClick(e: Event) {
        e.stopPropagation()
        if (navigator.vibrate) navigator.vibrate(20)
        emit('toggle-select')
    }

    function handleExpandClick(e: Event) {
        e.stopPropagation()
        if (navigator.vibrate) navigator.vibrate(10)
        emit('toggle-expand')
    }

    return {
        handleTap,
        handleLongPress,
        handleScoreClick,
        handleExpandClick
    }
}
