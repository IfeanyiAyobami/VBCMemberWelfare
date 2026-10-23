-- Additive, rerunnable. No existing member, leader or visitor rows are changed.
BEGIN;
CREATE TABLE IF NOT EXISTS public.hco_rate_limits (
  bucket text PRIMARY KEY CHECK (bucket ~ '^[a-f0-9]{64}$'),
  window_start timestamptz NOT NULL,
  hits integer NOT NULL CHECK (hits > 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS hco_rate_limits_expiry ON public.hco_rate_limits(expires_at);
ALTER TABLE public.hco_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hco_rate_limits FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.hco_rate_limit(p_bucket text, p_limit integer, p_window integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE t timestamptz := clock_timestamp(); w timestamptz; n integer;
BEGIN
  IF p_bucket !~ '^[a-f0-9]{64}$' OR p_bucket IS NULL OR p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 OR p_window IS NULL OR p_window < 1 OR p_window > 3600 THEN
    RAISE EXCEPTION 'INVALID_RATE_POLICY';
  END IF;
  w := to_timestamp(floor(extract(epoch FROM t) / p_window) * p_window);
  INSERT INTO public.hco_rate_limits AS r(bucket,window_start,hits,expires_at)
    VALUES(p_bucket,w,1,w+make_interval(secs=>p_window))
  ON CONFLICT(bucket) DO UPDATE SET
    hits=CASE WHEN r.window_start=w THEN least(r.hits+1,p_limit+1) ELSE 1 END,
    window_start=w, expires_at=w+make_interval(secs=>p_window)
  RETURNING hits INTO n;
  -- Bounded indexed cleanup; no external scheduler or unbounded delete needed.
  DELETE FROM public.hco_rate_limits WHERE bucket IN (
    SELECT bucket FROM public.hco_rate_limits WHERE expires_at < t - interval '1 hour' ORDER BY expires_at LIMIT 50
  );
  RETURN jsonb_build_object('allowed',n<=p_limit,'retry_after',greatest(1,ceil(extract(epoch FROM w+make_interval(secs=>p_window)-t))::integer));
END $$;
REVOKE ALL ON FUNCTION public.hco_rate_limit(text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hco_rate_limit(text,integer,integer) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
