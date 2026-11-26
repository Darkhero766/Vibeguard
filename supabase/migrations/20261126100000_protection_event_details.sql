-- Add bounded, redacted event summaries for the protected-repository activity view.
-- Existing event rows remain valid and render with the empty JSON default.
ALTER TABLE public.protection_events
  ADD COLUMN IF NOT EXISTS base_sha text,
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{
    "version": 1,
    "scanMode": "unknown",
    "scanIncomplete": false,
    "coveragePartial": false,
    "changedFiles": 0,
    "filesScanned": 0,
    "checksRun": 0,
    "resolvedFindingsCount": 0,
    "existingFindingsCount": 0,
    "unscannedChangedFileCount": 0,
    "coverageReasons": [],
    "unscannedChangedFiles": [],
    "findings": []
  }'::jsonb;

COMMENT ON COLUMN public.protection_events.details IS
  'Bounded, redacted security event metadata only. Never store source excerpts, matched secrets, or raw scanner output.';
