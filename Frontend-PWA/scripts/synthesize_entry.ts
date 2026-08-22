// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { generateHtmlEntry } from '../src/core/theme/HtmlEntry';
import { writeFileSync } from 'fs';
import { join } from 'path';
import packageJson from '../package.json';
import { ensureBonesFresh } from './capture_skeletons';

/**
 * CLASH MANAGER - Entry Point Optimizer
 * This script synthesizes the index.html from TypeScript source.
 * It allows the repository to remain 100% TS/Vue while satisfying
 * the build tool's requirement for a physical entry point.
 */

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Build-time skeleton capture must land before the shell is synthesized so
// AppShell.ts (baked into the generated <head> critical CSS) picks up
// freshly captured bones instead of stale ones from a prior run.
await ensureBonesFresh();

const output = generateHtmlEntry(packageJson.version);
const target = join(__dirname, '../index.html');

writeFileSync(target, output);
console.log('⚡ [Purity] Generated physical index.html from TypeScript substrate.');
