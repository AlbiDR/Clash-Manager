<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->

# Exclusion-cache update repair

Migration `20261017151347_skip_unchanged_exclusion_cache_updates.sql` skips
cache writes when an existing member or blacklist row retains its player tag.
Scheduling the next battle poll no longer waits for an unrelated cache write.
Inserts still add exclusions; deletions remove them only when neither source
retains the tag. A genuine tag change adds the new exclusion and conditionally
removes the old one in the same transaction.

Trigger wiring, owner, ACL and fixed search path remain intact. The function
retains actual production `SECURITY INVOKER`. The historical baseline declares
`SECURITY DEFINER`; this migration matches independently verified production
privileges instead of restoring that historical privilege escalation.

## Verification and deployment

The coordinator's read-only preflight found 1,004 distinct source tags and
1,004 cache tags with zero missing or extra tags, on 17 October at 15:13:35 UTC.
No cache rewrite is included. Same-tag updates no longer incidentally repair
cache drift. Compare the cache with `members UNION recruit_blacklist` when
investigating corruption and repair deliberately through maintenance.

`supabase/tests/database/14_exclusion_cache_updates.test.sql` passed all 16
assertions on a minimal PostgreSQL 17 fixture. It covers both sources,
overlapping ownership, updates without cache statements, tag changes, rollback,
union equality and the function security mode/search path. The fixture does
not emulate Supabase RLS, PostgREST or unrelated production triggers.

A separate local concurrency reproduction held an uncommitted deletion of the
same cache row while updating the member's `next_poll_at`, with a 300 ms
statement timeout. The old function timed out at its cache INSERT in three of
three attempts. The repaired function completed all three without waiting for
that row, approximately 15 ms including local client startup. This demonstrates
removal of the reproduced lock dependency, not production latency improvement.
The coordinator retains the reproduction and JSON results in the checkpoint's
external evidence. The temporary local cluster was stopped and removed.

Apply through the normal tracked deployment. Verify the function body, owner,
ACL, security mode, trigger attachments and source union equality, then check
fresh app reads. Roll back through a later tracked migration restoring the
previous function body while retaining verified live invoker privileges. That
restores its unnecessary cache writes and timeout exposure. No tables, grants
or existing rows are changed here.

This repair does not serialize concurrent changes across both source tables.
Pre-existing cross-table union-cache snapshot races and contention from actual
membership changes remain separate concerns. It does not establish that daily
outages are solved.
