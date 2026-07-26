// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { defineConfig } from "vitest/config";

/**
 * L1 Core: Backend Vitest Configuration
 *
 * @remarks
 * Edge Function source under `supabase/functions/` targets the Deno runtime
 * and therefore uses Deno's `npm:<package>@<version>` URL-scheme specifiers
 * (e.g. `npm:valibot@1.4.2`, `npm:@supabase/supabase-js@2.110.8`) exclusively
 * -- this is a pre-existing, repo-wide convention, not something introduced
 * by any single feature. Node's/Vitest's default resolver has no notion of
 * the `npm:` scheme, so any bare `vitest run` against this source previously
 * failed to even collect affected spec files ("Cannot find package
 * 'npm:valibot@1.4.2'"), rather than failing an assertion.
 *
 * [DECISION LOG] This plugin rewrites `npm:<package>@<version>` (including
 * scoped packages, e.g. `npm:@supabase/supabase-js@2.110.8`) to the bare,
 * Node-resolvable specifier (e.g. `valibot`, `@supabase/supabase-js`) purely
 * at test-resolution time, then hands off to the default resolver via
 * `this.resolve(..., { skipSelf: true })`. Production source is never
 * touched: Deno still resolves the original `npm:` specifier itself at
 * deploy time. Rewriting the source files instead (dropping the `npm:`
 * prefix there) was rejected -- that would break Deno's own resolution in
 * the deployed Edge Functions, which is the actual runtime target.
 */
const NPM_SPECIFIER_PATTERN = /^npm:((?:@[^/@]+\/)?[^@/]+)(?:@[^/]+)?(\/.*)?$/;

export default defineConfig({
  plugins: [
    {
      name: "deno-npm-specifier-resolver",
      resolveId(source, importer) {
        if (!source.startsWith("npm:")) return null;
        const match = source.match(NPM_SPECIFIER_PATTERN);
        if (!match) return null;
        const [, packageName, subpath = ""] = match;
        return this.resolve(`${packageName}${subpath}`, importer, { skipSelf: true });
      },
    },
  ],
  test: {
    environment: "node",
    include: ["supabase/functions/**/*.spec.ts"],
  },
});
