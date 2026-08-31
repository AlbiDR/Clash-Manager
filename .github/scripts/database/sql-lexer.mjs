// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

const DOLLAR_TAG = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/;

function isLicenseComment(text) {
  return /SPDX-License-Identifier:|Copyright \(C\)/i.test(text);
}

export function lexSql(source) {
  const comments = [];
  const statements = [];
  let executable = '';
  let statementStart = 0;
  let index = 0;
  let state = 'normal';
  let dollarTag = '';
  let blockDepth = 0;

  const finishStatement = (end) => {
    const raw = source.slice(statementStart, end);
    const code = executable.trim();
    if (code) statements.push({ raw, executable: code, start: statementStart, end });
    executable = '';
    statementStart = end;
  };

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1] ?? '';

    if (state === 'line-comment') {
      const comment = comments[comments.length - 1];
      if (char === '\n') {
        comment.end = index;
        state = 'normal';
        executable += '\n';
      }
      index += 1;
      continue;
    }

    if (state === 'block-comment') {
      const comment = comments[comments.length - 1];
      if (char === '/' && next === '*') {
        blockDepth += 1;
        index += 2;
        continue;
      }
      if (char === '*' && next === '/') {
        blockDepth -= 1;
        index += 2;
        if (blockDepth === 0) {
          comment.end = index;
          state = 'normal';
          executable += ' ';
        }
        continue;
      }
      if (char === '\n') executable += '\n';
      index += 1;
      continue;
    }

    if (state === 'single-quote') {
      executable += char;
      if (char === "'" && next === "'") {
        executable += next;
        index += 2;
        continue;
      }
      if (char === "'") state = 'normal';
      index += 1;
      continue;
    }

    if (state === 'double-quote') {
      executable += char;
      if (char === '"' && next === '"') {
        executable += next;
        index += 2;
        continue;
      }
      if (char === '"') state = 'normal';
      index += 1;
      continue;
    }

    if (state === 'dollar-quote') {
      if (source.startsWith(dollarTag, index)) {
        executable += dollarTag;
        index += dollarTag.length;
        state = 'normal';
      } else {
        executable += char;
        index += 1;
      }
      continue;
    }

    if (char === '-' && next === '-') {
      comments.push({ start: index, end: source.length, kind: 'line' });
      state = 'line-comment';
      index += 2;
      continue;
    }
    if (char === '/' && next === '*') {
      comments.push({ start: index, end: source.length, kind: 'block' });
      state = 'block-comment';
      blockDepth = 1;
      index += 2;
      continue;
    }
    if (char === "'") {
      state = 'single-quote';
      executable += char;
      index += 1;
      continue;
    }
    if (char === '"') {
      state = 'double-quote';
      executable += char;
      index += 1;
      continue;
    }
    if (char === '$') {
      const match = source.slice(index).match(DOLLAR_TAG);
      if (match) {
        dollarTag = match[0];
        state = 'dollar-quote';
        executable += dollarTag;
        index += dollarTag.length;
        continue;
      }
    }

    executable += char;
    index += 1;
    if (char === ';') finishStatement(index);
  }

  if (state === 'line-comment') comments[comments.length - 1].end = source.length;
  if (state === 'single-quote' || state === 'double-quote' || state === 'dollar-quote' || state === 'block-comment') {
    return { comments, statements, executable: statements.map(item => item.executable).join('\n'), error: `unterminated ${state}` };
  }
  finishStatement(source.length);
  return { comments, statements, executable: statements.map(item => item.executable).join('\n'), error: null };
}

export function normalizeExecutableSql(source) {
  const result = lexSql(source);
  if (result.error) throw new Error(result.error);
  return result.statements
    .map(({ executable }) => executable.replace(/\s+/g, ' ').trim())
    .join('\n');
}

export function topLevelCommentLines(source, comments = lexSql(source).comments) {
  const lines = source.split('\n');
  const starts = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }

  const counted = new Set();
  for (const comment of comments) {
    const firstLine = starts.findLastIndex(start => start <= comment.start);
    const lastLine = starts.findLastIndex(start => start < comment.end);
    for (let lineIndex = firstLine; lineIndex <= lastLine; lineIndex += 1) {
      const lineStart = starts[lineIndex];
      const commentStart = Math.max(comment.start, lineStart);
      const prefix = source.slice(lineStart, commentStart);
      const text = lines[lineIndex] ?? '';
      if (!prefix.trim() && text.trim() && !isLicenseComment(text)) counted.add(lineIndex + 1);
    }
  }
  return [...counted].sort((a, b) => a - b);
}

export function removeTopLevelComments(source) {
  const { comments, error } = lexSql(source);
  if (error) throw new Error(error);
  let output = '';
  let cursor = 0;
  for (const comment of comments) {
    output += source.slice(cursor, comment.start);
    const body = source.slice(comment.start, comment.end);
    if (isLicenseComment(body)) output += body;
    else output += body.replace(/[^\n]/g, '');
    cursor = comment.end;
  }
  return output + source.slice(cursor);
}
