// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../../workflows/db-observe.yml', import.meta.url), 'utf8');

function jobBlock(source, jobName) {
  const lines = source.split('\n');
  const start = lines.findIndex(line => line === `  ${jobName}:`);
  assert.notEqual(start, -1, `workflow must define job ${jobName}`);
  let end = start + 1;
  while (end < lines.length && !/^  [^ ]/.test(lines[end])) end += 1;
  return lines.slice(start, end).join('\n');
}

function stepBlock(source, stepName) {
  const start = source.indexOf(`      - name: ${stepName}\n`);
  assert.notEqual(start, -1, `job must define step ${stepName}`);
  const next = source.indexOf('\n      - name: ', start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

test('schedule is hourly off the boundary and manual runs are restricted to Stable', () => {
  assert.match(workflow, /schedule:\n(?:\s*#.*\n)*\s+- cron: "17 \* \* \* \*"/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(jobBlock(workflow, 'observe'), /if: github\.ref == 'refs\/heads\/Stable'/);
  assert.match(stepBlock(workflow, 'Checkout Stable'), /ref: \$\{\{ github\.sha \}\}/);
});

test('runs never overlap, have a ten-minute ceiling, and receive read-only GitHub permission', () => {
  assert.match(workflow, /group: db-observe-stable/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(jobBlock(workflow, 'observe'), /timeout-minutes: 10/);
  assert.match(workflow, /permissions:\n\s+contents: read/);
  assert.doesNotMatch(workflow, /contents: write|actions: write|deploy-pages|supabase functions deploy|supabase db push/i);
});

test('collector uses the bounded two-sample CLI and existing credentials without setup or mutation commands', () => {
  const collection = stepBlock(workflow, 'Collect two samples 120 seconds apart');
  assert.match(collection, /node \.github\/scripts\/database\/db-observe\.mjs --output "\$RUNNER_TEMP\/db-observation\.json" --interval-seconds 120/);
  assert.match(collection, /SUPABASE_ACCESS_TOKEN: \$\{\{ secrets\.SUPABASE_ACCESS_TOKEN \}\}/);
  assert.match(collection, /SUPABASE_PROJECT_REF: \$\{\{ vars\.SUPABASE_PROJECT_ID \}\}/);
  assert.match(collection, /VITE_SUPABASE_URL: \$\{\{ vars\.VITE_SUPABASE_URL \}\}/);
  assert.match(collection, /VITE_SUPABASE_PUBLISHABLE_KEY: \$\{\{ secrets\.VITE_SUPABASE_PUBLISHABLE_KEY \}\}/);
  assert.doesNotMatch(collection, /retry|restart|supabase (?:db push|functions deploy|migration up)|curl .* -X (?:POST|PUT|PATCH|DELETE)/i);
});

test('evidence uploads after failed collection and remains available for 30 days', () => {
  const upload = stepBlock(workflow, 'Upload database observation evidence');
  assert.match(upload, /if: always\(\)/);
  assert.match(upload, /uses: actions\/upload-artifact@v4/);
  assert.match(upload, /path: \$\{\{ runner\.temp \}\}\/db-observation\.json/);
  assert.match(upload, /if-no-files-found: warn/);
  assert.match(upload, /retention-days: 30/);
});
