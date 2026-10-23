-- VBC Home Cell Office | 009 | Run AFTER existing care migrations.
-- Safe additive schema; no automatic member migration or messaging opt-ins.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS public.hco_areas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE,
 is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.hco_cells (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), area_id uuid NOT NULL REFERENCES public.hco_areas(id),
 name text NOT NULL, meeting_day smallint NOT NULL DEFAULT 0 CHECK(meeting_day BETWEEN 0 AND 6),
 meeting_start time NOT NULL DEFAULT '18:00', meeting_end time NOT NULL DEFAULT '19:00',
 address text, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(area_id,name)
);
CREATE TABLE IF NOT EXISTS public.hco_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
 role text NOT NULL CHECK(role IN ('church_admin','coordinator','area_leader','cell_leader')),
 area_id uuid REFERENCES public.hco_areas(id), cell_id uuid REFERENCES public.hco_cells(id),
 active boolean NOT NULL DEFAULT true, assigned_by uuid REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz,
 CHECK ((role='church_admin' AND area_id IS NULL AND cell_id IS NULL) OR
        (role IN ('coordinator','area_leader') AND area_id IS NOT NULL AND cell_id IS NULL) OR
        (role='cell_leader' AND cell_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS hco_unique_active_assignments ON public.hco_assignments(user_id,role,coalesce(area_id,'00000000-0000-0000-0000-000000000000'::uuid),coalesce(cell_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE active;
CREATE TABLE IF NOT EXISTS public.hco_access (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id), suspended_at timestamptz,
 suspended_by uuid REFERENCES auth.users(id), suspension_reason text,
 session_revoked_after timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.hco_member_cells (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), member_id uuid NOT NULL REFERENCES public.care_members(id),
 cell_id uuid NOT NULL REFERENCES public.hco_cells(id), active boolean NOT NULL DEFAULT true,
 joined_at timestamptz NOT NULL DEFAULT now(), left_at timestamptz,
 UNIQUE(member_id,cell_id)
);
CREATE TABLE IF NOT EXISTS public.hco_meetings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cell_id uuid NOT NULL REFERENCES public.hco_cells(id),
 meeting_date date NOT NULL, starts_at time NOT NULL DEFAULT '18:00', ends_at time NOT NULL DEFAULT '19:00',
 notes text, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','correction_requested','approved')),
 submitted_by uuid REFERENCES auth.users(id), submitted_at timestamptz, reviewed_by uuid REFERENCES auth.users(id),
 reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(cell_id,meeting_date)
);
CREATE TABLE IF NOT EXISTS public.hco_attendance (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), meeting_id uuid NOT NULL REFERENCES public.hco_meetings(id) ON DELETE CASCADE,
 member_id uuid REFERENCES public.care_members(id), visitor_name text,
 status text NOT NULL CHECK(status IN ('present','absent','late')),
 notes text, CHECK((member_id IS NOT NULL) <> (visitor_name IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS hco_attendance_member_unique ON public.hco_attendance(meeting_id,member_id) WHERE member_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.hco_finances (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), meeting_id uuid NOT NULL REFERENCES public.hco_meetings(id),
 kind text NOT NULL CHECK(kind IN ('offering','dues','expense')),
 amount numeric(14,2) NOT NULL CHECK(amount > 0), description text,
 recorded_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.hco_visits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cell_id uuid NOT NULL REFERENCES public.hco_cells(id),
 meeting_id uuid REFERENCES public.hco_meetings(id), member_id uuid REFERENCES public.care_members(id),
 guest_submission_id uuid REFERENCES public.care_guest_submissions(id),
 visited_at timestamptz NOT NULL DEFAULT now(), registered_by uuid NOT NULL REFERENCES auth.users(id),
 CHECK(member_id IS NOT NULL OR guest_submission_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS public.hco_corrections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), meeting_id uuid NOT NULL REFERENCES public.hco_meetings(id),
 requested_by uuid NOT NULL REFERENCES auth.users(id), reason text NOT NULL CHECK(length(trim(reason)) >= 5),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
 requested_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.hco_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid REFERENCES auth.users(id),
 target_user_id uuid REFERENCES auth.users(id), action text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hco_assignments_user_idx ON public.hco_assignments(user_id,active);
CREATE INDEX IF NOT EXISTS hco_assignments_area_idx ON public.hco_assignments(area_id,active);
CREATE INDEX IF NOT EXISTS hco_meetings_cell_date_idx ON public.hco_meetings(cell_id,meeting_date DESC);
CREATE INDEX IF NOT EXISTS hco_visits_cell_idx ON public.hco_visits(cell_id,visited_at DESC);
-- Explicit server-only access: all HCO reads and writes go through scoped Next.js endpoints.
-- No browser/service-role keys. Do not grant client table access until audited RLS policies exist.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['hco_areas','hco_cells','hco_assignments','hco_access','hco_member_cells','hco_meetings','hco_attendance','hco_finances','hco_visits','hco_corrections','hco_audit'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',t);
 END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
