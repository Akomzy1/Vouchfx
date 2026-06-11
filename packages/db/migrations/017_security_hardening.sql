-- =============================================================================
-- VouchFX — Migration 017 · Security hardening
--
-- 1. audit_events — DB-level append-only enforcement (no UPDATE/DELETE).
-- 2. worker_heartbeats — enable RLS; deny all authenticated-user access
--    (service role bypasses RLS; admin page uses service role).
-- 3. Remove spike user if still present (prevents accidental auth bypass).
-- Run in the Supabase SQL editor.
-- =============================================================================

-- ── 1. audit_events append-only trigger ───────────────────────────────────────
-- Raises an exception if any code attempts to UPDATE or DELETE an audit row,
-- even via the service role. Append-only is an invariant of the audit log.

CREATE OR REPLACE FUNCTION public.fn_audit_events_readonly()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: % not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_events_no_update ON public.audit_events;
CREATE TRIGGER trg_audit_events_no_update
  BEFORE UPDATE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_events_readonly();

DROP TRIGGER IF EXISTS trg_audit_events_no_delete ON public.audit_events;
CREATE TRIGGER trg_audit_events_no_delete
  BEFORE DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_events_readonly();


-- ── 2. worker_heartbeats — RLS (deny authenticated users; service role only) ──

ALTER TABLE public.worker_heartbeats ENABLE ROW LEVEL SECURITY;
-- No user-facing SELECT/INSERT/UPDATE policies → authenticated users have no access.
-- Workers use the service-role key which bypasses RLS.
-- Admin page also uses service-role via createServiceClient().


-- ── 3. Remove Phase-0 spike user if still present ─────────────────────────────
-- The spike row (id = '00000000-0000-0000-0000-000000000000') has no matching
-- auth.users entry and bypasses the FK. Safe to delete if it exists.

DELETE FROM public.users
  WHERE id = '00000000-0000-0000-0000-000000000000';
