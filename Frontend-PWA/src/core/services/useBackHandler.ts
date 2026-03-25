// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * COMPOSABLE: useBackHandler (Layer 1 - @core)
 *
 * @remarks
 * Orchestrates hardware back button interception for modal navigation.
 *
 * This service implements a "History Shimming" strategy to prevent the default
 * browser behavior of navigating away from the application when a modal is open.
 * It pushes a temporary state to the history stack, allowing the 'popstate' event
 * to be intercepted and used as a trigger for closing UI components rather than
 * navigating the browser.
 *
 * [ARCHITECTURE] ADR LAYER: @core
 * - Permitted Imports: Layer 0 substrate and Layer 1 kernels.
 * - Forbidden Imports: Any logic or components from Layer 2+ (Shared, Features, App).
 *
 * @param onClose - Callback to execute when the back button is pressed.
 *
 * @returns
 * - `register`: Method to initialize the interception and push history state.
 * - `unregister`: Method to remove the event listener.
 */
export function useBackHandler(onClose: () => void) {
  // [PERF] ID Generation: Generate a unique ID to distinguish this state
  // from other navigation events within the same session.
  const stateId = Date.now().toString();

  /**
   * INTERCEPTOR: Handle browser back/forward navigation.
   *
   * @remarks
   * This function is triggered by the 'popstate' event. When a user presses the
   * hardware back button on Android or navigates back in a desktop browser,
   * the shimmed state is popped, and this handler triggers the `onClose`
   * callback instead of allowing the browser to navigate to a previous page.
   */
  function handlePopState() {
    onClose();
  }

  /**
   * REGISTRATION: Initialize the shim.
   *
   * @remarks
   * Pushes a "synthetic" state onto the history stack. This state acts as a
   * buffer that intercepts the next 'back' navigation event.
   */
  function register() {
    history.pushState({ modalOpen: stateId }, "");
    window.addEventListener("popstate", handlePopState);
  }

  /**
   * DISPOSAL: Remove listeners.
   *
   * @remarks
   * Standard cleanup to prevent memory leaks. Does not automatically pop the
   * history state to avoid triggering the 'popstate' handler unnecessarily
   * if the component is being unmounted through other means (e.g., explicit close).
   */
  function unregister() {
    window.removeEventListener("popstate", handlePopState);
  }

  return {
    register,
    unregister,
  };
}
