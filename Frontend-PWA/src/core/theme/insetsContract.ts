// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * Runs before the module graph so the first frame already clears the system
 * bars. The Android shell draws the page edge to edge, under its status and
 * navigation bars, but Android WebView does not report them through
 * env(safe-area-inset-*). The shell reports them instead through
 * AndroidBridge.getSafeAreaInsets(), in CSS pixels; this script copies them to
 * --shell-inset-*, which the --sys-safe-* tokens in base.ts combine with env().
 *
 * It reads again on "resize" (rotation, the keyboard) and on
 * "shellinsetschange", which the shell dispatches when the bars change without
 * a resize. In a browser, or in a shell older than 14.50.132, the bridge or the
 * method is absent and nothing is set: env() alone then decides.
 */
export const BOOT_INSETS_SCRIPT = `
    (function() {
      var bridge = window.AndroidBridge;
      if (!bridge || typeof bridge.getSafeAreaInsets !== "function") return;
      var sides = ["top", "right", "bottom", "left"];
      function apply() {
        try {
          var insets = JSON.parse(bridge.getSafeAreaInsets());
          var style = document.documentElement.style;
          for (var i = 0; i < sides.length; i++) {
            var value = insets[sides[i]];
            if (typeof value === "number" && isFinite(value) && value >= 0) {
              style.setProperty("--shell-inset-" + sides[i], value + "px");
            }
          }
        } catch (error) {}
      }
      apply();
      window.addEventListener("resize", apply);
      window.addEventListener("shellinsetschange", apply);
    })();
  `;
