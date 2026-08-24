// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { globalIgnores } from "eslint/config";
import pluginVue from "eslint-plugin-vue";
import { withVueTs, vueTsConfigs } from "@vue/eslint-config-typescript";
import globals from "globals";

export default withVueTs(
  globalIgnores(["dist/**", "dev-dist/**", "coverage/**"]),
  pluginVue.configs["flat/recommended"],
  vueTsConfigs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Tracked as a separate cleanup (429 existing casts); not a lint-rollout blocker.
      "@typescript-eslint/no-explicit-any": "off",
      // Icon/Toast are established shared-component names used across ~30 files;
      // renaming is a deliberate future refactor, not a lint-rollout side effect.
      "vue/multi-word-component-names": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          // Matches the existing convention of naming swallowed catch errors
          // descriptively (e.g. `catch (parseError)`) instead of discarding them.
          caughtErrors: "none",
        },
      ],
    },
  },
  {
    files: ["**/*.spec.ts", "**/*-tests/**/*.ts"],
    rules: {
      // vi.hoisted()/vi.mock() factories run before ESM imports are initialized,
      // so they must require() modules lazily instead of using the top-level import.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
