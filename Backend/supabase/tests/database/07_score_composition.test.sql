-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(10);

SELECT ok(
  (SELECT sum((term->>'points')::numeric)
   FROM jsonb_array_elements(substrate.performance_contributions(1000, 2000, 100, 8000, 75, 0.5)) term) = 81550,
  'performance contributions retain the established scoring coefficients and attendance credit'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM features.scoring_view score
    WHERE (SELECT sum((term->>'points')::numeric)
           FROM jsonb_array_elements((score.score_composition->'contributions') || (score.score_composition->'adjustments')) term)
          IS DISTINCT FROM score.raw_performance_score
  ),
  'contributions and ordered adjustments reconcile to the authoritative raw performance score'
);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM features.roster_view
    WHERE (score_composition->>'rawScore')::numeric IS DISTINCT FROM raw_performance_score
       OR (score_composition->>'normalizedScore')::double precision IS DISTINCT FROM performance_score),
  'roster explanation and both displayed scores come from the same calculation'
);
SELECT ok(
  has_function_privilege('anon', 'substrate.performance_contributions(numeric,numeric,numeric,numeric,numeric,numeric)', 'EXECUTE'),
  'the public roster can evaluate the pure contribution helper'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.sync_recruits(jsonb)', 'EXECUTE'),
  'capturing composition does not expose the recruit mutation to anon'
);

SELECT ok(
  NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid IN (
    'substrate.weighted_avg(numeric[],numeric,numeric)'::regprocedure,
    'substrate.format_last_seen(numeric)'::regprocedure,
    'substrate.format_tenure(numeric)'::regprocedure,
    'substrate.format_longevity(integer)'::regprocedure
  ) AND prosecdef),
  'public score helpers cannot inherit elevated database privileges'
);
SELECT lives_ok(
  $$ SET LOCAL ROLE anon; SELECT score_composition FROM features.roster_view; RESET ROLE; $$,
  'anon can read the contribution projection without access to internal tables'
);
SELECT lives_ok(
  $$ SET LOCAL ROLE anon; SELECT score_composition FROM features.headhunter_view; RESET ROLE; $$,
  'anon can read potential composition through the existing public headhunter surface'
);

-- Isolate fixtures from the asynchronous promotion pipeline; restored by ROLLBACK.
ALTER TABLE drivers.recruits DISABLE TRIGGER USER;
SELECT public.sync_recruits('[{
  "player_tag":"#QQQ028","player_name":"Composition fixture","trophies":10000,
  "donations":0,"cards":0,"war_wins":0,"win_rate":0,"source":"MANUAL","status":"ACTIVE",
  "raw_potential_score":10000,
  "score_composition":{"rawScore":10000,"contributions":[{"key":"trophies","points":10000}]}
}]'::jsonb);
SELECT ok(
  (SELECT (score_composition->>'rawScore')::numeric = raw_potential_score
     AND score_composition->'contributions' = '[{"key":"trophies","points":10000}]'::jsonb
   FROM features.headhunter_view WHERE player_tag = '#QQQ028'),
  'the scanner snapshot survives synchronization and the headhunter projection'
);

-- A legacy writer must invalidate an old explanation, even if metrics did not change.
SELECT public.sync_recruits('[{
  "player_tag":"#QQQ028","player_name":"Composition fixture","trophies":10000,
  "donations":0,"cards":0,"war_wins":0,"win_rate":0,"status":"ACTIVE","raw_potential_score":10000
}]'::jsonb);
SELECT ok(
  (SELECT score_composition IS NULL FROM features.headhunter_view WHERE player_tag = '#QQQ028'),
  'a score refresh without a snapshot cannot retain a stale explanation'
);
SELECT * FROM finish();
ROLLBACK;
