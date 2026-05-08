-- Migration to set security_invoker = true on all views flagged as SECURITY DEFINER
-- This ensures views enforce Postgres permissions and RLS of the querying user.

ALTER VIEW features.scoring_view SET (security_invoker = true);
ALTER VIEW features.roster_view SET (security_invoker = true);
ALTER VIEW features.war_activity_view SET (security_invoker = true);
ALTER VIEW features.war_loyalty_view SET (security_invoker = true);
ALTER VIEW features.governance_report SET (security_invoker = true);
ALTER VIEW drivers.recruits_view SET (security_invoker = true);
ALTER VIEW features.war_performance_analytics_view SET (security_invoker = true);
ALTER VIEW substrate.view_pipeline_health SET (security_invoker = true);
