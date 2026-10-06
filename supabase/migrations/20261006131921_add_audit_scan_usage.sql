-- VibeSane SUE audit quota
-- Keeps the deployed product audit inside the existing monthly scan accounting.
ALTER TABLE public.usage
  ADD COLUMN IF NOT EXISTS audit_scans_used integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.usage.audit_scans_used
  IS 'Number of VibeSane Audit scans consumed in the current monthly quota period';