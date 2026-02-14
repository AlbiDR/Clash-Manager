import { generateHtmlEntry } from '../src/core/theme/HtmlEntry';
import { writeFileSync } from 'fs';
import { join } from 'path';
import packageJson from '../package.json';

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

const output = generateHtmlEntry(packageJson.version);
const target = join(__dirname, '../index.html');

writeFileSync(target, output);
console.log('⚡ [Purity] Generated physical index.html from TypeScript substrate.');
