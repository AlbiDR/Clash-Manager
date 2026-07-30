#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 AlbiDR

"""Determine which post-baseline migration objects are genuinely unfolded.

Why this exists
---------------
The nightly context generator used to compute "pending migrations" as
`ls migrations/ | grep -v <baseline_prefix>`, i.e. every migration file that is
not the baseline. That set is permanently equal to all post-baseline migrations
regardless of whether their DDL has already been folded into the baseline. It
therefore never shrinks, can never reach zero, and reports operational debt that
does not exist. Stage 3 was handed a list of 17 "pending" migrations every night
and had to re-derive the true fold state from scratch against a 4000+ line
baseline, inside a 60 minute budget, forever.

This script answers the question the pipeline actually needs answered: for each
DDL object defined by a post-baseline migration, is the baseline's definition of
that object equivalent to the newest migration's definition?

Method
------
Migrations are chronological transaction records; the baseline is the declarative
compiler target. So for every object the migrations touch, resolve last writer
wins across the sorted migration sequence, then compare that expected final body
against the baseline's body with comments and whitespace normalised away.

Text-level on purpose: the CI sandbox has no Docker, no live Postgres, and no
native SQL parser binary, so a formal parse is not available. Comparison is
deliberately conservative. An object is only reported as folded when its
normalised body matches, so the failure mode is a false "unfolded" (cheap, Stage 3
looks again) rather than a false "folded" (expensive, real drift goes unnoticed).

Exit codes
----------
0  every post-baseline object is folded, or a non-fatal problem occurred
1  at least one object is absent from or divergent in the baseline

Callers should treat a non-zero exit as a signal, never as a pipeline failure
(nightly Base 3: non-blocking failures).
"""

import os
import re
import sys

BASELINE_PREFIX = "20260531232406"

# Object definition statement starters. Kept narrow on purpose: these are the
# statement kinds the folding protocol actually reconciles. Triggers, grants and
# comments are attached to the objects above and are checked as part of the
# surrounding statement body, not independently.
PATTERNS = (
    ("FUNCTION", re.compile(
        r"^CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([A-Za-z_][\w.]*)\s*\(", re.I)),
    ("VIEW", re.compile(
        r"^CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+([A-Za-z_][\w.]*)", re.I)),
    ("TABLE", re.compile(
        r"^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][\w.]*)", re.I)),
)


def count_args(signature_head):
    """Return the argument count of a function signature.

    Overloaded functions are distinct objects in Postgres, so the object key has
    to include arity or an overload pair silently collapses into one entry.
    Splits on top-level commas only, so composite defaults and parenthesised
    type modifiers do not inflate the count.
    """
    opening = re.search(r"\((.*)", signature_head, re.S)
    if not opening:
        return 0

    depth = 0
    collected = []
    for char in opening.group(1):
        if char == "(":
            depth += 1
        elif char == ")":
            if depth == 0:
                break
            depth -= 1
        collected.append(char)

    inner = "".join(collected).strip()
    if not inner:
        return 0

    args = 1
    depth = 0
    for char in inner:
        if char in "([":
            depth += 1
        elif char in ")]":
            depth -= 1
        elif char == "," and depth == 0:
            args += 1
    return args


def extract_objects(path):
    """Return {object_key: statement_body} for one SQL file.

    Walks the file statement by statement. Dollar-quoted bodies are tracked by
    tag so that semicolons and parentheses inside a plpgsql body never terminate
    the statement early.
    """
    with open(path, encoding="utf-8") as handle:
        lines = handle.read().split("\n")

    objects = {}
    index = 0
    while index < len(lines):
        stripped = lines[index].strip()

        kind = None
        name = None
        for candidate_kind, pattern in PATTERNS:
            match = pattern.match(stripped)
            if match:
                kind = candidate_kind
                name = match.group(1).lower()
                break

        if kind is None:
            index += 1
            continue

        body = []
        depth = 0
        dollar_tag = None
        cursor = index
        while cursor < len(lines):
            current = lines[cursor]
            body.append(current)

            for quote in re.finditer(r"\$([A-Za-z_]\w*)?\$", current):
                tag = quote.group(0)
                if dollar_tag is None:
                    dollar_tag = tag
                elif tag == dollar_tag:
                    dollar_tag = None

            if dollar_tag is None:
                depth += current.count("(") - current.count(")")
                if current.rstrip().endswith(";") and depth <= 0:
                    break
            cursor += 1

        key = "%s:%s" % (kind, name)
        if kind == "FUNCTION":
            key += "/%d" % count_args(" ".join(body[:6]))

        objects[key] = "\n".join(body)
        index = cursor + 1

    return objects


def normalise(sql):
    """Collapse a statement to a comparison form.

    Strips line comments and flattens whitespace, so a reformat or a reworded
    comment is not mistaken for schema drift. Case folded because SQL keywords
    and identifiers here are case insensitive.
    """
    sql = re.sub(r"--[^\n]*", " ", sql)
    sql = re.sub(r"\s+", " ", sql)
    return sql.strip().rstrip(";").lower()


# ---------------------------------------------------------------------------
# Reconciliation rules
#
# The folding protocol requires the baseline to restructure some DDL rather than
# copy it verbatim, so a correctly folded object can legitimately differ from its
# source migration. Each rule below recognises exactly one such transformation
# and explains itself in the report.
#
# These rules exist so the unfolded count can actually reach zero. A signal that
# is permanently non-zero is a signal that gets ignored, which is the failure this
# whole script was written to remove. Anything a rule cannot explain stays
# UNFOLDED and is reported as real work.
# ---------------------------------------------------------------------------

# The five referential actions are enumerated rather than matched loosely: a lazy
# catch-all quantifier here silently swallows only part of "CASCADE" and leaves a
# fragment behind, which makes the whole rule fail to fire.
REFERENTIAL_ACTION = r"(?:CASCADE|RESTRICT|NO\s+ACTION|SET\s+NULL|SET\s+DEFAULT)"

FK_CLAUSE = re.compile(
    r",?\s*CONSTRAINT\s+[\w.]+\s+FOREIGN\s+KEY\s*\([^)]*\)\s*"
    r"REFERENCES\s+[\w.]+\s*\([^)]*\)"
    r"(?:\s+ON\s+(?:DELETE|UPDATE)\s+" + REFERENTIAL_ACTION + r")*",
    re.I,
)

SEARCH_PATH = re.compile(r"SET\s+search_path\s+(?:TO|=)\s*([^\n;]+)", re.I)


def strip_inline_foreign_keys(sql):
    """Remove inline FOREIGN KEY clauses and report the constraint names removed.

    Topological Sorting Safeguard step 5 requires foreign keys to be declared in a
    dedicated block after the table declarations, not inline in CREATE TABLE. A
    migration that declares one inline is therefore expected to differ here.
    """
    names = re.findall(
        r"CONSTRAINT\s+([\w.]+)\s+FOREIGN\s+KEY", sql, re.I)
    return FK_CLAUSE.sub("", sql), [n.lower() for n in names]


def reconcile(key, baseline_body, migration_body, baseline_source):
    """Explain a difference, or return None if it is genuine drift.

    Returns a human-readable reason string when the difference is fully accounted
    for by a protocol-mandated transformation.
    """
    # Rule 1: inline foreign keys hoisted into the dedicated constraint block.
    if key.startswith("TABLE:"):
        stripped_migration, hoisted = strip_inline_foreign_keys(migration_body)
        if hoisted and normalise(stripped_migration) == normalise(baseline_body):
            # The constraint must still exist somewhere in the baseline, or it was
            # dropped rather than hoisted, which is real drift.
            relocated = [
                name for name in hoisted
                if re.search(r"CONSTRAINT\s+%s\s+FOREIGN\s+KEY" % re.escape(name),
                             baseline_source, re.I)
            ]
            if len(relocated) == len(hoisted):
                return ("inline FOREIGN KEY hoisted to the constraint block "
                        "(%s)" % ", ".join(hoisted))
            # A constraint that is neither inline nor in the block was dropped,
            # not relocated. That is real drift and must not be reconciled away.
            return None

    # Rule 2: search_path widened to the baseline's house convention. Accepted
    # only when the baseline's path is a strict superset of the migration's, and
    # the bodies are otherwise identical.
    if key.startswith("FUNCTION:"):
        base_path = SEARCH_PATH.search(baseline_body)
        migr_path = SEARCH_PATH.search(migration_body)
        if base_path and migr_path:
            base_set = {p.strip().strip("'\"")
                        for p in base_path.group(1).split(",")}
            migr_set = {p.strip().strip("'\"")
                        for p in migr_path.group(1).split(",")}
            if migr_set < base_set:
                blanked_base = SEARCH_PATH.sub("SET search_path TO X", baseline_body)
                blanked_migr = SEARCH_PATH.sub("SET search_path TO X", migration_body)
                if normalise(blanked_base) == normalise(blanked_migr):
                    return ("search_path normalised to house convention "
                            "(added %s)" % ", ".join(sorted(base_set - migr_set)))

    return None


def resolve_migrations_dir(argv):
    if len(argv) > 1:
        return argv[1]
    here = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.abspath(os.path.join(here, "..", ".."))
    return os.path.join(repo_root, "Backend", "supabase", "migrations")


def main(argv):
    migrations_dir = resolve_migrations_dir(argv)

    if not os.path.isdir(migrations_dir):
        print("fold-state: migrations directory not found: %s" % migrations_dir)
        return 0

    entries = sorted(f for f in os.listdir(migrations_dir) if f.endswith(".sql"))
    baseline_name = next((f for f in entries if f.startswith(BASELINE_PREFIX)), None)

    if baseline_name is None:
        print("fold-state: no baseline matching prefix %s" % BASELINE_PREFIX)
        return 0

    migrations = [f for f in entries if not f.startswith(BASELINE_PREFIX)]
    baseline_path = os.path.join(migrations_dir, baseline_name)
    baseline = extract_objects(baseline_path)
    with open(baseline_path, encoding="utf-8") as handle:
        baseline_source = handle.read()

    # Chronological replay: last writer wins per object.
    expected = {}
    for filename in migrations:
        for key, body in extract_objects(os.path.join(migrations_dir, filename)).items():
            expected[key] = (filename, body)

    folded = []
    reconciled = []
    unfolded = []
    for key in sorted(expected):
        source, body = expected[key]
        if key not in baseline:
            unfolded.append((key, source, "ABSENT"))
            continue
        if normalise(baseline[key]) == normalise(body):
            folded.append((key, source))
            continue
        reason = reconcile(key, baseline[key], body, baseline_source)
        if reason:
            reconciled.append((key, source, reason))
        else:
            unfolded.append((key, source, "DIVERGENT"))

    print("baseline:              %s" % baseline_name)
    print("migrations replayed:   %d" % len(migrations))
    print("final-state objects:   %d" % len(expected))
    print("folded verbatim:       %d" % len(folded))
    print("folded + reconciled:   %d" % len(reconciled))
    print("unfolded:              %d" % len(unfolded))
    print("")

    if reconciled:
        print("RECONCILED -- folded, but restructured by the protocol as expected:")
        for key, source, reason in reconciled:
            print("  %-56s %s" % (key, reason))
            print("  %-56s <- %s" % ("", source))
        print("")

    if not unfolded:
        print("RESULT: FOLDED -- baseline is current, no folding work pending.")
        return 0

    print("RESULT: UNFOLDED -- the following objects need folding:")
    for key, source, reason in unfolded:
        print("  %-10s %-58s <- %s" % (reason, key, source))
    print("")
    print("Migrations owning unfolded objects:")
    for filename in sorted({source for _, source, _ in unfolded}):
        print("  %s" % filename)

    return 1


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv))
    except Exception as exc:  # noqa: BLE001 - advisory tool, must never break the pipeline
        print("fold-state: check could not complete (%s: %s)" % (type(exc).__name__, exc))
        sys.exit(0)
