// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import test from 'node:test';

import { BASELINE_DDL_RULE_IDS, baselineDdlViolations, executableLines } from './baseline-rules.mjs';

test('accepts a fully re-runnable baseline', () => {
  const source = [
    'CREATE TABLE IF NOT EXISTS app.items (id bigint PRIMARY KEY);',
    "CREATE OR REPLACE TRIGGER t_items BEFORE UPDATE ON app.items FOR EACH ROW EXECUTE FUNCTION public.moddatetime('updated_at');",
  ].join('\n');
  assert.deepEqual(baselineDdlViolations(source), []);
});

test('rejects a trigger that cannot be replayed (the 2026-09-08 fold defect)', () => {
  const source = 'CREATE TRIGGER t_items AFTER INSERT ON app.items FOR EACH ROW EXECUTE FUNCTION app.ping();';
  assert.deepEqual(baselineDdlViolations(source), ['Trigger at line 1 missing OR REPLACE']);
});

test('rejects a table that cannot be replayed', () => {
  const source = 'CREATE TABLE app.items (id bigint PRIMARY KEY);';
  assert.deepEqual(baselineDdlViolations(source), ['Table app.items at line 1 missing IF NOT EXISTS']);
});

test('rejects out-of-line UNIQUE constraints and unqualified moddatetime', () => {
  const source = [
    'ALTER TABLE app.items ADD CONSTRAINT items_tag_key UNIQUE (tag);',
    "CREATE OR REPLACE TRIGGER t_items BEFORE UPDATE ON app.items FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');",
  ].join('\n');
  assert.deepEqual(baselineDdlViolations(source), [
    'Found out-of-line UNIQUE constraints',
    'Unqualified moddatetime call found',
  ]);
});

test('reports the original line number of a violation', () => {
  const source = ['-- header', '', 'CREATE TRIGGER t AFTER INSERT ON app.items', 'FOR EACH ROW EXECUTE FUNCTION app.ping();'].join('\n');
  assert.deepEqual(baselineDdlViolations(source), ['Trigger at line 3 missing OR REPLACE']);
});

test('does not read DDL out of comments', () => {
  const source = [
    '-- CREATE TRIGGER t AFTER INSERT ON app.items ...',
    '/* CREATE TABLE app.legacy (id bigint); */',
    '/*',
    'CREATE TRIGGER spanning_block AFTER INSERT ON app.items ...',
    '*/',
    'CREATE TABLE IF NOT EXISTS app.items (id bigint PRIMARY KEY);',
  ].join('\n');
  assert.deepEqual(baselineDdlViolations(source), []);
});

test('still checks a statement that carries a trailing comment', () => {
  const source = 'CREATE TRIGGER t AFTER INSERT ON app.items FOR EACH ROW EXECUTE FUNCTION app.ping(); -- added by a fold';
  assert.deepEqual(baselineDdlViolations(source), ['Trigger at line 1 missing OR REPLACE']);
});

test('ignores table DDL quoted inside a string literal', () => {
  const source = "COMMENT ON TABLE app.items IS 'CREATE TABLE app.items is declared above';";
  assert.deepEqual(baselineDdlViolations(source), []);
});

test('executableLines drops blank and comment-only lines but keeps numbering', () => {
  const lines = executableLines(['-- note', '', 'SELECT 1;'].join('\n'));
  assert.deepEqual(lines, [{ lineNumber: 3, text: 'SELECT 1;' }]);
});

test('every declared rule is exercised by this file', () => {
  assert.deepEqual(BASELINE_DDL_RULE_IDS, [
    'table-not-idempotent',
    'trigger-not-idempotent',
    'out-of-line-unique',
    'unqualified-moddatetime',
  ]);
});
