-- SYNTHETIC VULNERABLE DEMO — DO NOT DEPLOY.
CREATE TABLE public.beta_demo_notes (id uuid PRIMARY KEY, owner_id uuid);
-- Deliberately missing RLS enablement and policy.
