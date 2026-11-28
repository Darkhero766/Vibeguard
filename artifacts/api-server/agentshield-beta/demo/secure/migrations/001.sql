-- SYNTHETIC POSITIVE COUNTEREXAMPLE — not production SQL.
CREATE TABLE public.beta_demo_notes (id uuid PRIMARY KEY, owner_id uuid);
ALTER TABLE public.beta_demo_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY beta_demo_owner ON public.beta_demo_notes
  FOR SELECT USING (owner_id = auth.uid());
