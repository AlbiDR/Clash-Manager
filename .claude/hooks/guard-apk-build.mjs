#!/usr/bin/env node
/**
 * PreToolUse(Bash) guard — blocks build commands that would ship a STRIPPED APK.
 *
 * The release APK carries a custom native layer (Blitz overlay service,
 * accessibility tap-gesture service, WebView JS bridge) that exists only as
 * compiled code inside the APK. `bubblewrap build/update` and any Gradle
 * release build (the ~/bubblewrap-project decoy) produce a generic TWA that
 * silently drops all of it. The correct release build is `pnpm apk:build`,
 * which rebuilds from the committed android/ project and runs the integrity
 * gate. This hook stops the dangerous commands before they run.
 *
 * Exit 2 = block (stderr is shown to the agent). Exit 0 = allow.
 */
import { readFileSync } from "node:fs";

let cmd = "";
try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  cmd = input?.tool_input?.command || "";
} catch {
  process.exit(0); // can't parse → don't interfere
}

// Match only real command-position invocations, not mere mentions (so
// `echo`/`grep`/comments referencing these terms are NOT blocked). Split on
// shell separators, then strip leading env-assignments and `cd … &&`.
const isDanger = cmd
  .split(/&&|\|\||[;\n|]/)
  .map((seg) => seg.trim().replace(/^(?:\w+=\S+\s+)+/, ""))
  .some(
    (s) =>
      /^bubblewrap\s+(build|update)\b/.test(s) ||
      /\bgradlew?\b[^\n]*\b(assemble|bundle)Release\b/.test(s) ||
      /^(assemble|bundle)Release\b/.test(s),
  );

if (isDanger) {
  process.stderr.write(
    [
      "⛔ BLOCKED: this builds a GENERIC / STRIPPED Clash Manager APK.",
      "",
      "The release app has a CUSTOM native layer that lives ONLY in the APK:",
      "  • BlitzService (SYSTEM_ALERT_WINDOW overlay)",
      "  • ClashManagerAccessibilityService (automated tap gestures)",
      "  • AndroidBridge (WebView JS↔native bridge)",
      "`bubblewrap build` / Gradle release builds the generic TWA at",
      "~/bubblewrap-project and SILENTLY drops all of it.",
      "",
      "Correct release build (rebuilds from committed APK/android/, then verifies):",
      "    pnpm apk:build",
      "Verify any APK:  node APK/verify-apk-integrity.mjs <apk>",
      "See APK/README.md. (If you truly need the raw generic build, run it",
      "outside this project or temporarily disable this hook in .claude/settings.json.)",
    ].join("\n") + "\n",
  );
  process.exit(2);
}

process.exit(0);
