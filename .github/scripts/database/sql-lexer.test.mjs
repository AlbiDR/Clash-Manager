// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  lexSql,
  normalizeExecutableSql,
  removeTopLevelComments,
  topLevelCommentLines,
} from './sql-lexer.mjs';

test('splits only on top-level semicolons', () => {
  const source = `
-- migration context
CREATE FUNCTION public.example(p_text text DEFAULT ';') RETURNS void
LANGUAGE plpgsql
SET search_path TO public
AS $body$
BEGIN
  -- routine comment remains executable content
  PERFORM ';';
END;
$body$;
CREATE TABLE public.example_table (value text);
`;
  const parsed = lexSql(source);
  assert.equal(parsed.error, null);
  assert.equal(parsed.statements.length, 2);
  assert.deepEqual(topLevelCommentLines(source, parsed.comments), [2]);
  assert.match(parsed.statements[0].executable, /routine comment remains executable content/);
});

test('handles quoted identifiers, nested block comments, and escaped strings', () => {
  const source = `/* outer /* nested */ done */
CREATE TABLE "public"."Odd;Name" (value text DEFAULT 'it''s;fine');`;
  const parsed = lexSql(source);
  assert.equal(parsed.error, null);
  assert.equal(parsed.statements.length, 1);
  assert.deepEqual(topLevelCommentLines(source, parsed.comments), [1]);
});

test('removes top-level prose but preserves license and routine comments', () => {
  const source = `-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- long incident narrative
DO $$ BEGIN -- inside routine
  PERFORM 1;
END $$;`;
  const cleaned = removeTopLevelComments(source);
  assert.match(cleaned, /SPDX-License-Identifier/);
  assert.match(cleaned, /Copyright/);
  assert.doesNotMatch(cleaned, /incident narrative/);
  assert.match(cleaned, /inside routine/);
  assert.equal(normalizeExecutableSql(cleaned), normalizeExecutableSql(source));
});

test('reports unterminated lexical constructs', () => {
  assert.equal(lexSql("SELECT 'missing").error, 'unterminated single-quote');
  assert.equal(lexSql('DO $$ BEGIN').error, 'unterminated dollar-quote');
  assert.equal(lexSql('/* missing').error, 'unterminated block-comment');
});
