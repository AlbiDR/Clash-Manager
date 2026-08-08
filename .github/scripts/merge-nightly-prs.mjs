// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * Thin executable entrypoint for the Jules nightly merge coordinator.
 * Implementation and testable policy live in merge-nightly-core.mjs.
 */

import { run } from "./merge-nightly-core.mjs";

run().catch(error => {
  console.error("CRITICAL:", error.message);
  process.exit(1);
});
