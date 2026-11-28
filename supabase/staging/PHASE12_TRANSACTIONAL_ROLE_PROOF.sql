-- STAGING ONLY. Execute against VibeSane-staging (aojmjxxmsgnipbbrtvlz).
-- Entire fixture (users/entitlements/token rows) is rolled back.
-- Tests PostgreSQL grants + RLS with simulated JWT claims, NOT a hosted
-- HTTP signup, real OAuth session, token encryption or billing flow.
-- An uncaught error aborts the transaction; recover by ROLLBACK.
BEGIN;

INSERT INTO auth.users (id,aud,role,email,created_at,updated_at,is_sso_user,is_anonymous)
VALUES
 ('b1770000-6c8a-4d22-9ee3-000000000001','authenticated','authenticated','vibesane-role-test-a@example.invalid',now(),now(),false,false),
 ('b1770000-6c8a-4d22-9ee3-000000000002','authenticated','authenticated','vibesane-role-test-b@example.invalid',now(),now(),false,false);

SET LOCAL ROLE service_role;
INSERT INTO public.github_tokens (owner,encrypted_token)
VALUES ('b1770000-6c8a-4d22-9ee3-000000000001'::uuid,'synthetic-nonsecret-placeholder');
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.github_tokens
   WHERE owner='b1770000-6c8a-4d22-9ee3-000000000001'::uuid AND encrypted_token='synthetic-nonsecret-placeholder')
 THEN RAISE EXCEPTION 'service role token write/read failed'; END IF;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b1770000-6c8a-4d22-9ee3-000000000001',true);
DO $$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.usage;
 IF n<>1 THEN RAISE EXCEPTION 'owner SELECT leakage or unavailable, expected one, got %', n; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.usage WHERE owner='b1770000-6c8a-4d22-9ee3-000000000001'::uuid AND plan='free' AND scans_limit=1)
 THEN RAISE EXCEPTION 'signup trigger failed to initialize a free entitlement'; END IF;
 IF EXISTS(SELECT 1 FROM public.usage WHERE owner='b1770000-6c8a-4d22-9ee3-000000000002'::uuid)
 THEN RAISE EXCEPTION 'cross-tenant usage leaked'; END IF;

 BEGIN
   UPDATE public.usage SET plan='pro' WHERE owner='b1770000-6c8a-4d22-9ee3-000000000001'::uuid;
   RAISE EXCEPTION 'client changed billing entitlement';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   INSERT INTO public.usage(owner,plan) VALUES ('b1770000-6c8a-4d22-9ee3-000000000001'::uuid,'pro');
   RAISE EXCEPTION 'client inserted billing entitlement';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   PERFORM encrypted_token FROM public.github_tokens;
   RAISE EXCEPTION 'client read GitHub ciphertext';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   UPDATE public.github_tokens SET encrypted_token='fake'
    WHERE owner='b1770000-6c8a-4d22-9ee3-000000000001'::uuid;
   RAISE EXCEPTION 'client altered GitHub ciphertext';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   INSERT INTO public.audit_runs(owner,url,score)
   VALUES ('b1770000-6c8a-4d22-9ee3-000000000001'::uuid,'https://example.invalid',100);
   RAISE EXCEPTION 'client wrote audit history';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 INSERT INTO public.hackathon_redemptions(owner,coupon_code)
 VALUES ('b1770000-6c8a-4d22-9ee3-000000000001'::uuid,'SYNTHETIC-NONSECRET');
 SELECT count(*) INTO n FROM public.hackathon_redemptions WHERE owner='b1770000-6c8a-4d22-9ee3-000000000001'::uuid;
 IF n<>1 THEN RAISE EXCEPTION 'owner-scoped hackathon insert/select failed'; END IF;
 BEGIN
   INSERT INTO public.hackathon_redemptions(owner,coupon_code)
   VALUES ('b1770000-6c8a-4d22-9ee3-000000000002'::uuid,'CROSS-TENANT-DENY');
   RAISE EXCEPTION 'cross-tenant hackathon row inserted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $$
BEGIN
 BEGIN
   PERFORM owner FROM public.usage;
   RAISE EXCEPTION 'anon client could read usage';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   PERFORM encrypted_token FROM public.github_tokens;
   RAISE EXCEPTION 'anon client could read GitHub token';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;

SELECT 'staging_role_proof_passed_rolled_back' AS status,
       (SELECT count(*) FROM public.usage) AS transient_usage_rows;
ROLLBACK;
