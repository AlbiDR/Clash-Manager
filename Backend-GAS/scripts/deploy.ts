#!/usr/bin/env tsx
import { execSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  readdirSync,
  statSync,
  copyFileSync,
  renameSync
} from 'node:fs';
import { join, basename, extname } from 'node:path';

/**
 * Lead Full-Stack Architect & UI/UX Engineer Refactor
 * Logic: TypeScript-based deployment for Google Apps Script
 * Standards: technical purity, coherent architecture, zero emojis.
 */

const ROOT_DIR = process.cwd();
const DIST_DIR = join(ROOT_DIR, 'dist');

function log(message: string) {
  process.stdout.write(`[DEPLOY] ${message}\n`);
}

function error(message: string): never {
  process.stderr.write(`[CRITICAL] ${message}\n`);
  process.exit(1);
}

function runCommand(command: string) {
  log(`Executing: ${command}`);
  try {
    execSync(command, { stdio: 'inherit', cwd: ROOT_DIR });
  } catch (err) {
    error(`Execution failed for command: ${command}`);
  }
}

function getAllFiles(dir: string, extension: string): string[] {
  let results: string[] = [];
  if (!existsSync(dir)) return results;

  const list = readdirSync(dir);
  for (const file of list) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(filePath, extension));
    } else if (extname(filePath) === extension) {
      results.push(filePath);
    }
  }
  return results;
}

async function main() {
  log('Starting deployment process...');

  // 1. Clean old build directory
  log('Cleaning old build directory...');
  if (existsSync(DIST_DIR)) {
    rmSync(DIST_DIR, { recursive: true, force: true });
  }
  mkdirSync(DIST_DIR, { recursive: true });

  // 2. Compiling TypeScript
  log('Compiling TypeScript...');
  runCommand('npx tsc');

  // 3. Verify dist contains files
  if (!existsSync(DIST_DIR) || readdirSync(DIST_DIR).length === 0) {
    error("'dist' folder is empty after compilation. Check tsconfig.json 'include' or 'rootDir'.");
  }

  log('Compilation Manifest (dist/):');
  readdirSync(DIST_DIR).forEach(f => {
    const fullPath = join(DIST_DIR, f);
    if (statSync(fullPath).isFile()) {
       log(`  - ${f}`);
    }
  });

  // 3.5 Bundle Valibot for Google Apps Script
  log('Bundling Valibot for GAS compatibility...');
  const valibotEntryPath = join(ROOT_DIR, 'valibot-entry.js');
  writeFileSync(valibotEntryPath, "export * from 'valibot';");
  try {
    const esbuild = require('esbuild');
    esbuild.buildSync({
      entryPoints: [valibotEntryPath],
      bundle: true,
      outfile: join(DIST_DIR, 'Valibot.gs'),
      format: 'iife',
      globalName: 'v',
      target: 'es2019',
    });
    log('Valibot successfully bundled.');
  } catch (err) {
    error(`Failed to bundle Valibot: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (existsSync(valibotEntryPath)) rmSync(valibotEntryPath);
  }

  // 4. Copy appsscript.json configuration
  log('Transferring appsscript.json...');
  const appsScriptJsonPath = join(ROOT_DIR, 'appsscript.json');
  if (!existsSync(appsScriptJsonPath)) {
    error('appsscript.json not found in root directory.');
  }
  copyFileSync(appsScriptJsonPath, join(DIST_DIR, 'appsscript.json'));

  // 5. Ensure .clasp.json credentials exist
  const hiddenClaspPath = join(ROOT_DIR, '.clasp.json');
  const visibleClaspPath = join(ROOT_DIR, 'clasp.json');
  
  if (!existsSync(hiddenClaspPath)) {
    if (existsSync(visibleClaspPath)) {
      log('Renaming clasp.json to .clasp.json for consistency...');
      renameSync(visibleClaspPath, hiddenClaspPath);
    } else {
      error('.clasp.json not found. Run "clasp clone <scriptId>" to initialize.');
    }
  }

  // 6. Validation of Clasp configuration
  const claspConfig = readFileSync(hiddenClaspPath, 'utf-8');
  if (!/"scriptId":\s*"[a-zA-Z0-9_-]{20,}"/.test(claspConfig)) {
    error('.clasp.json does not contain a valid scriptId.');
  }

  // 7. Transform JS files for GAS compatibility
  log('Applying Google Apps Script compatibility transformations...');
  const jsFiles = getAllFiles(DIST_DIR, '.js');
  
  for (const filePath of jsFiles) {
    log(`  Processing ${basename(filePath)}`);
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    const processedLines = lines.filter(line => {
      // Eliminate ES Module imports
      if (/^\s*import\s+/.test(line)) return false;
      // Eliminate ES Module default exports
      if (/^\s*export\s+default/.test(line)) return false;
      // Eliminate CommonJS interop noise
      if (line.includes('Object.defineProperty(exports')) return false;
      // Eliminate redundant strict mode declarations
      if (/^"use strict";/.test(line.trim())) return false;
      
      return true;
    }).map(line => {
      // Strip "export" keyword while preserving indentation
      return line.replace(/^(\s*)export\s+/, '$1');
    });

    const newPath = filePath.replace(/\.js$/, '.gs');
    writeFileSync(newPath, processedLines.join('\n'));
    rmSync(filePath);
  }

  // 8. Verification of output
  const gsFiles = getAllFiles(DIST_DIR, '.gs');
  if (gsFiles.length === 0) {
    error('Transformation failed: No .gs files found in distribution.');
  }

  // 9. Deploy via Clasp
  log('Pushing artifacts to Google Apps Script...');
  // Use clasp directly; it should be in the path after pnpm install or provided by devDeps
  runCommand('clasp push --force');

  log('Deployment completed successfully.');
}

main().catch(err => {
  error(`Unhandled deployment error: ${err instanceof Error ? err.message : String(err)}`);
});
