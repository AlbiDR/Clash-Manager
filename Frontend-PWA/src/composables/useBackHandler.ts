/**
 * useBackHandler
 *
 * Allows a component (like a Modal) to intercept the hardware back button.
 * When the component mounts/opens, it pushes a state to history.
 * When the users presses back, we intercept it, close the component, and prevent navigation.
 *
 * @param onClose Callback to run when back button is pressed (to close the modal)
 * @param isActive Function or Ref returning true if the interceptor should be active
 */
export function useBackHandler(onClose: () => void) {
  // Unique ID for this history state to identify our own push
  const stateId = Date.now().toString();

  function handlePopState() {
    // If we receive a popstate, it means the user pressed back (or forward)
    // Check if we are "open".
    // Actually, the simpler pattern is:
    // 1. On open -> pushState
    // 2. On back -> popstate event fires -> we call onClose()

    onClose();
  }

  function register() {
    history.pushState({ modalOpen: stateId }, "");
    window.addEventListener("popstate", handlePopState);
  }

  function unregister() {
    window.removeEventListener("popstate", handlePopState);
    // If we are unregistering manually (e.g. close button clicked),
    // we might need to go back to remove our pushed state?
    // It's tricky. If we just go back(), we trigger popstate again?
    // No, history.back() triggers popstate.

    // Better approach for Vue Modals:
    // The modal should likely be controlled by a boolean.
    // If the boolean becomes true -> pushState.
    // If popstate happens -> set boolean to false.
  }

  // We'll expose a 'open' and 'close' method to manual control,
  // or just assume the consumer calls this when they open.

  return {
    register,
    unregister,
  };
}
