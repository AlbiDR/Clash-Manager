// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import test from "node:test";

import {
  findViolations,
  isAllowedAuthor,
  isAllowedCoAuthor,
  loadPolicy,
  parseCoAuthor,
  readMessages,
  stripDisallowedCoAuthors,
} from "./commit-trailers.mjs";

const policy = loadPolicy(new URL("../../commit-trailer-policy.json", import.meta.url).pathname);

test("the shipped policy allows the owner and Jules, and nobody else", () => {
  // These are the two identities whose credit is wanted. Everything else is a
  // tool crediting itself, which is the whole reason this file exists.
  assert.ok(isAllowedCoAuthor({ name: "AlbiDR", email: "aalbi97@gmail.com" }, policy));
  assert.ok(isAllowedCoAuthor({ name: "google-labs-jules[bot]", email: "161369871+google-labs-jules[bot]@users.noreply.github.com" }, policy));

  assert.equal(isAllowedCoAuthor({ name: "Claude Opus 5", email: "noreply@anthropic.com" }, policy), false);
  assert.equal(isAllowedCoAuthor({ name: "Claude", email: "noreply@anthropic.com" }, policy), false);
  assert.equal(isAllowedCoAuthor({ name: "Copilot", email: "copilot@github.com" }, policy), false);
  assert.equal(isAllowedCoAuthor({ name: "Cursor Agent", email: "agent@cursor.sh" }, policy), false);
  assert.equal(isAllowedCoAuthor({ name: "Devin AI", email: "devin@cognition.ai" }, policy), false);
});

test("every mainstream AI assistant is stripped, whatever its trailer looks like", () => {
  // The point of an allowlist: these exact strings do not need to be known in
  // advance. Each is representative of a real tool's trailer format, and each
  // is rejected because it is not on the list, not because it was recognised.
  const assistants = [
    "Co-Authored-By: Claude <noreply@anthropic.com>",
    "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>",
    "Co-authored-by: Copilot <198982749+Copilot@users.noreply.github.com>",
    "Co-authored-by: GitHub Copilot <copilot@github.com>",
    "Co-authored-by: codex <codex@openai.com>",
    "Co-authored-by: ChatGPT <noreply@openai.com>",
    "Co-authored-by: OpenAI Codex <codex@users.noreply.github.com>",
    "Co-authored-by: gemini-code-assist[bot] <176961590+gemini-code-assist[bot]@users.noreply.github.com>",
    "Co-authored-by: Gemini <gemini@google.com>",
    "Co-authored-by: aider (gpt-4o) <noreply@aider.chat>",
    "Co-authored-by: Cursor Agent <agent@cursor.com>",
    "Co-authored-by: Devin AI <devin-ai-integration[bot]@users.noreply.github.com>",
    "Co-authored-by: Windsurf <windsurf@codeium.com>",
    "Co-authored-by: Cline <cline@example.com>",
    "Co-authored-by: Amazon Q <q@amazon.com>",
    "Co-authored-by: Sourcegraph Cody <cody@sourcegraph.com>",
  ];

  for (const line of assistants) {
    const parsed = parseCoAuthor(line);
    assert.ok(parsed, `${line} must parse as a trailer`);
    assert.equal(isAllowedCoAuthor(parsed, policy), false, `${line} must not be credited`);
    const { removed } = stripDisallowedCoAuthors(`feat: x\n\n${line}\n`, policy);
    assert.equal(removed.length, 1, `${line} must be stripped`);
  }
});

test("a Google AI that is not Jules is still stripped", () => {
  // Jules is allowlisted because it is this pipeline's agent. That must not
  // extend to Google's other assistants by association.
  const gemini = parseCoAuthor("Co-authored-by: gemini-code-assist[bot] <x@users.noreply.github.com>");
  assert.equal(isAllowedCoAuthor(gemini, policy), false);
  const jules = parseCoAuthor("Co-authored-by: google-labs-jules[bot] <161369871+google-labs-jules[bot]@users.noreply.github.com>");
  assert.equal(isAllowedCoAuthor(jules, policy), true);
});

test("an unknown future assistant is stripped without anyone updating the list", () => {
  // The failure mode that matters: a tool nobody has heard of yet. A denylist
  // would credit it; the allowlist refuses it by default.
  const unknown = parseCoAuthor("Co-authored-by: SomeNewAgent v2 <bot@newvendor.example>");
  assert.equal(isAllowedCoAuthor(unknown, policy), false);
});

test("matching is case-insensitive on both name and email", () => {
  assert.ok(isAllowedCoAuthor({ name: "albidr", email: "AAlbi97@Gmail.com" }, policy));
  assert.ok(isAllowedCoAuthor({ name: "GOOGLE-LABS-JULES[BOT]", email: "161369871+GOOGLE-LABS-JULES[BOT]@USERS.NOREPLY.GITHUB.COM" }, policy));
});

test("a display name alone can never earn credit", () => {
  // Found by running impostors against the real stripper, not by reading code.
  // The allowlist used to OR its conditions, so `namePattern: ^google-labs-jules`
  // matched on name alone - and a display name is attacker-controlled and free
  // to choose. Both of these were observed KEPT before the fix. Conditions are
  // now ANDed, so an entry naming a bot pins its email domain too.
  const impostors = [
    "Co-authored-by: Jules Verne <jules.verne@attacker.example.com>",
    "Co-authored-by: google-labs-jules-impostor <evil@attacker.example.com>",
    "Co-authored-by: google-labs-jules[bot] <evil@attacker.example.com>",
    "Co-authored-by: jules <someone@example.com>",
  ];
  for (const line of impostors) {
    assert.equal(isAllowedCoAuthor(parseCoAuthor(line), policy), false, `${line} must not be credited`);
  }

  // ...and the reverse: the right email with a wrong name is not enough either.
  assert.equal(
    isAllowedCoAuthor({ name: "Evil", email: "161369871+google-labs-jules[bot]@users.noreply.github.com" }, policy),
    false,
    "a matching email with a non-matching name must not be credited",
  );

  // The genuine article still is.
  assert.ok(isAllowedCoAuthor({ name: "google-labs-jules[bot]", email: "161369871+google-labs-jules[bot]@users.noreply.github.com" }, policy));
});

test("an allowlist entry with no conditions is a config error, not a wildcard", () => {
  assert.equal(isAllowedCoAuthor({ name: "Anyone", email: "anyone@example.com" }, { allowedCoAuthors: [{ label: "oops" }] }), false);
});

test("every identity in this repo's own history is still allowed to author", () => {
  // Guards against the opposite failure: a policy so strict it reattributes the
  // owner's own commits. These addresses all appear in this repository's log.
  for (const email of ["aalbi97@gmail.com", "97815338+AlbiDR@users.noreply.github.com", "50982421-AlbiDR@users.noreply.replit.com"]) {
    assert.ok(isAllowedAuthor({ name: "AlbiDR", email }, policy), `${email} is the owner and must stay credited`);
  }
});

test("a trailer is recognised in any casing git accepts", () => {
  // Git's trailer key is case-insensitive and real tools emit all of these.
  // Missing one would let the trailer through untouched.
  for (const key of ["Co-Authored-By", "Co-authored-by", "co-authored-by", "CO-AUTHORED-BY"]) {
    const parsed = parseCoAuthor(`${key}: Claude <noreply@anthropic.com>`);
    assert.ok(parsed, `${key} must parse`);
    assert.equal(parsed.email, "noreply@anthropic.com");
  }
});

test("a malformed trailer is still treated as one", () => {
  // Angle brackets missing. GitHub is more forgiving than a strict regex, so
  // failing to recognise this would be a silent bypass.
  const parsed = parseCoAuthor("Co-Authored-By: Claude");
  assert.deepEqual(parsed, { name: "Claude", email: "" });
  assert.equal(isAllowedCoAuthor(parsed, policy), false);
});

test("ordinary lines are not mistaken for trailers", () => {
  assert.equal(parseCoAuthor("Fixed the co-authored-by parsing bug"), null);
  assert.equal(parseCoAuthor("Signed-off-by: AlbiDR <aalbi97@gmail.com>"), null);
  assert.equal(parseCoAuthor(""), null);
});

test("stripping removes only the disallowed trailer and its dangling blank line", () => {
  const message = [
    "fix(nightly): stop a coordinator failure overwriting a merged stage",
    "",
    "A promotion tag is a durable history fact.",
    "",
    "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>",
    "",
  ].join("\n");

  const { message: cleaned, removed } = stripDisallowedCoAuthors(message, policy);
  assert.deepEqual(removed, ["Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"]);
  assert.equal(
    cleaned,
    "fix(nightly): stop a coordinator failure overwriting a merged stage\n\nA promotion tag is a durable history fact.\n",
  );
});

test("an allowed co-author survives untouched, alongside a stripped one", () => {
  const message = [
    "chore(nightly): stage 4 optimization",
    "",
    "Co-Authored-By: google-labs-jules[bot] <161369871+google-labs-jules[bot]@users.noreply.github.com>",
    "Co-Authored-By: Claude <noreply@anthropic.com>",
    "",
  ].join("\n");

  const { message: cleaned, removed } = stripDisallowedCoAuthors(message, policy);
  assert.equal(removed.length, 1);
  assert.match(cleaned, /google-labs-jules/);
  assert.doesNotMatch(cleaned, /anthropic/);
});

test("a clean message is returned byte for byte", () => {
  // A hook that reformats messages is a hook people disable. Body blank lines,
  // trailing newline and other trailers must all survive exactly.
  const message = "feat: thing\n\nBody line one.\n\nBody line two.\n\nSigned-off-by: AlbiDR <aalbi97@gmail.com>\n";
  const { message: cleaned, removed } = stripDisallowedCoAuthors(message, policy);
  assert.equal(removed.length, 0);
  assert.equal(cleaned, message);
});

test("findViolations reports every offending commit in a range", () => {
  const commits = [
    { sha: "aaaaaaaa1111", message: "fix: one\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n" },
    { sha: "bbbbbbbb2222", message: "fix: two\n" },
    { sha: "cccccccc3333", message: "fix: three\n\nCo-Authored-By: Copilot <copilot@github.com>\n" },
  ];
  const violations = findViolations(commits, policy);
  assert.equal(violations.length, 2);
  assert.deepEqual(violations.map(v => v.sha), ["aaaaaaaa1111", "cccccccc3333"]);
});

test("readMessages parses the git log record format, including multi-line bodies", () => {
  // Records are NUL-ish delimited (\x1f between sha and body, \x1e between
  // commits) precisely so a body containing blank lines cannot split a record.
  const fakeGit = () => ({
    status: 0,
    stdout: "abc123\x1ffix: one\n\nbody with\n\nblank lines\n\x1edef456\x1ffix: two\n\x1e",
    stderr: "",
  });
  const commits = readMessages("base..head", fakeGit);
  assert.equal(commits.length, 2);
  assert.equal(commits[0].sha, "abc123");
  assert.match(commits[0].message, /blank lines/);
  assert.equal(commits[1].sha, "def456");
});

test("a failing git invocation raises rather than reporting a clean range", () => {
  // Reporting "no violations" because git failed would make the guard a
  // rubber stamp exactly when it cannot see anything.
  const failing = () => ({ status: 128, stdout: "", stderr: "fatal: bad revision" });
  assert.throws(() => readMessages("bogus..range", failing), /bad revision/);
});

test("the author allowlist covers the identities the pipeline actually commits as", () => {
  // GitHub builds the Contributors list from the commit AUTHOR as well as from
  // trailers, so a tool that commits as itself needs no trailer to be listed.
  // This list must include the pipeline's own bots: rewriting github-actions
  // out of its ledger and merge commits would break the nightly run rather
  // than improve attribution.
  assert.ok(isAllowedAuthor({ name: "AlbiDR", email: "aalbi97@gmail.com" }, policy));
  assert.ok(isAllowedAuthor({ name: "google-labs-jules[bot]", email: "161369871+google-labs-jules[bot]@users.noreply.github.com" }, policy));
  assert.ok(isAllowedAuthor({ name: "github-actions[bot]", email: "github-actions[bot]@users.noreply.github.com" }, policy));
  assert.ok(isAllowedAuthor({ name: "GitHub", email: "noreply@github.com" }, policy), "squash and merge commits are authored by web-flow");
});

test("an AI that commits as itself is not allowed to author", () => {
  const authors = [
    { name: "Claude", email: "noreply@anthropic.com" },
    { name: "Copilot", email: "198982749+Copilot@users.noreply.github.com" },
    { name: "codex", email: "codex@openai.com" },
    { name: "gemini-code-assist[bot]", email: "gemini@users.noreply.github.com" },
    { name: "Devin AI", email: "devin-ai-integration[bot]@users.noreply.github.com" },
    { name: "Cursor Agent", email: "agent@cursor.com" },
    { name: "SomeNewAgent v2", email: "bot@newvendor.example" },
  ];
  for (const author of authors) {
    assert.equal(isAllowedAuthor(author, policy), false, `${author.name} must not be creditable as author`);
  }
});

test("the policy names an identity to reattribute disallowed authors to", () => {
  // Without this the CI repair has nothing to rewrite to and would have to
  // fail the pull request, which is the behaviour this design rejects.
  assert.ok(policy.reattributeTo, "policy must define reattributeTo");
  assert.ok(policy.reattributeTo.name && policy.reattributeTo.email);
  assert.ok(
    isAllowedAuthor(policy.reattributeTo, policy),
    "the reattribution target must itself be an allowed author, or the repair would loop",
  );
});

test("CRLF commit messages are stripped, and keep their CRLF endings", () => {
  // The worst bug found in this feature, and only by running it: in JavaScript
  // regex \r is a line terminator, so `.` will not match it and `$` (no `m`
  // flag) cannot reach past it. CO_AUTHOR_LINE therefore failed on EVERY line
  // of a CRLF message and every trailer survived untouched - a complete bypass
  // for anyone committing from a CRLF environment.
  const crlf = "fix: thing\r\n\r\nBody.\r\n\r\nCo-Authored-By: Claude <noreply@anthropic.com>\r\n";
  const { message, removed } = stripDisallowedCoAuthors(crlf, policy);
  assert.equal(removed.length, 1, "a CRLF trailer must be stripped");
  assert.doesNotMatch(message, /anthropic/);
  assert.match(message, /\r\n/, "CRLF endings must be preserved, not normalised to LF");
  assert.doesNotMatch(message, /[^\r]\n/, "no line may be left with a bare LF");

  // A lone CR line ending must not smuggle one through either.
  assert.equal(parseCoAuthor("Co-Authored-By: Claude <noreply@anthropic.com>\r")?.email, "noreply@anthropic.com");

  // And an LF message must stay LF.
  const lf = "fix: thing\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n";
  const lfResult = stripDisallowedCoAuthors(lf, policy);
  assert.equal(lfResult.removed.length, 1);
  assert.doesNotMatch(lfResult.message, /\r/);
});

test("GitHub's web-flow address alone does not earn credit", () => {
  // noreply@github.com is trivially self-assignable, so a bare email condition
  // would let anything calling itself that be credited as an author.
  assert.equal(isAllowedAuthor({ name: "Claude", email: "noreply@github.com" }, policy), false);
  assert.equal(isAllowedAuthor({ name: "Copilot", email: "noreply@github.com" }, policy), false);
  assert.ok(isAllowedAuthor({ name: "GitHub", email: "noreply@github.com" }, policy), "real squash/merge commits must still pass");
});
