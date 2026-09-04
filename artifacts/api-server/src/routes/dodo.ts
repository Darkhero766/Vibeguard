import { Router, type Response } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { pool } from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../middlewares/auth";
import { PRO_SCAN_LIMIT } from "../lib/plan";

const router = Router();

const PRODUCT_ID = process.env.DODO_PRO_PRODUCT_ID || "pdt_0NmsVBNuntowIFXXZKqKS";
const HACKATHON_COUPON = "HACKATHON60";
const HACKATHON_LIMIT = 60;

function dodoBaseUrl() {
  return (process.env.DODO_PAYMENTS_ENVIRONMENT || "live_mode") === "test_mode"
    ? "https://test.dodopayments.com"
    : "https://live.dodopayments.com";
}

async function ensureDodoTables() {
  await pool.query(`ALTER TABLE usage ADD COLUMN IF NOT EXISTS dodo_customer_id text`);
  await pool.query(`ALTER TABLE usage ADD COLUMN IF NOT EXISTS dodo_subscription_id text`);
  await pool.query(`ALTER TABLE usage ADD COLUMN IF NOT EXISTS dodo_subscription_status text`);
  await pool.query(`ALTER TABLE usage ADD COLUMN IF NOT EXISTS pro_source text`);
  await pool.query(`ALTER TABLE usage ADD COLUMN IF NOT EXISTS pro_started_at timestamptz`);
  await pool.query(`CREATE INDEX IF NOT EXISTS usage_dodo_subscription_idx ON usage(dodo_subscription_id)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS dodo_webhook_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), webhook_id text UNIQUE NOT NULL, event_type text NOT NULL, payload jsonb NOT NULL, processed boolean NOT NULL DEFAULT false, attempts integer NOT NULL DEFAULT 0, error_message text, created_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS dodo_webhook_events_created_idx ON dodo_webhook_events(created_at DESC)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS hackathon_redemptions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner uuid NOT NULL UNIQUE, coupon_code text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
  await pool.query(`CREATE INDEX IF NOT EXISTS hackathon_redemptions_coupon_idx ON hackathon_redemptions(coupon_code)`);
}

async function dodoFetch(path: string, init: RequestInit = {}) {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  if (!apiKey) throw new Error("DODO_PAYMENTS_API_KEY is not configured");

  const response = await fetch(`${dodoBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    const message = typeof body === "object" && body && "message" in body
      ? String((body as { message?: unknown }).message)
      : `Dodo API returned ${response.status}`;
    throw new Error(message);
  }

  return body as Record<string, unknown>;
}

function verifyDodoWebhook(rawBody: string, req: AuthedRequest): boolean {
  const secret = process.env.DODO_WEBHOOK_SECRET;
  const id = req.header("webhook-id");
  const timestamp = req.header("webhook-timestamp");
  const signatureHeader = req.header("webhook-signature");
  if (!secret || !id || !timestamp || !signatureHeader) return false;

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || Math.abs(Date.now() / 1000 - timestampNumber) > 300) return false;

  const encodedSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const key = Buffer.from(encodedSecret, "base64");
  const signed = `${id}.${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", key).update(signed).digest("base64");
  const expectedBytes = Buffer.from(expected);

  return signatureHeader.split(" ").some((candidate) => {
    const [version, value] = candidate.split(",", 2);
    if (version !== "v1" || !value) return false;
    const candidateBytes = Buffer.from(value);
    return candidateBytes.length === expectedBytes.length && timingSafeEqual(candidateBytes, expectedBytes);
  });
}

function customerFrom(data: Record<string, unknown>) {
  const customer = (data.customer && typeof data.customer === "object")
    ? data.customer as Record<string, unknown>
    : {};
  return {
    id: typeof customer.customer_id === "string" ? customer.customer_id : null,
    email: typeof customer.email === "string" ? customer.email.trim().toLowerCase() : null,
  };
}

async function activateProByEmail(email: string, values: {
  customerId?: string | null;
  subscriptionId?: string | null;
  status?: string;
  expiresAt?: string | null;
  source?: string;
}) {
  const user = await pool.query(`SELECT id FROM auth.users WHERE lower(email) = lower($1) LIMIT 1`, [email]);
  const userId = user.rows[0]?.id as string | undefined;
  if (!userId) return false;

  await pool.query(`
    INSERT INTO public.usage (
      owner, scans_used, scans_limit, plan, pro_expires_at,
      monthly_scans_used, monthly_scans_limit, monthly_reset_at,
      dodo_customer_id, dodo_subscription_id, dodo_subscription_status, pro_source, pro_started_at
    )
    VALUES ($1, 0, $2, 'pro', $3, 0, $2, now() + interval '30 days', $4, $5, $6, $7, now())
    ON CONFLICT (owner) DO UPDATE SET
      plan = 'pro',
      scans_limit = $2,
      monthly_scans_limit = $2,
      pro_expires_at = $3,
      dodo_customer_id = COALESCE($4, usage.dodo_customer_id),
      dodo_subscription_id = COALESCE($5, usage.dodo_subscription_id),
      dodo_subscription_status = COALESCE($6, usage.dodo_subscription_status),
      pro_source = COALESCE($7, usage.pro_source),
      pro_started_at = COALESCE(usage.pro_started_at, now())
  `, [userId, PRO_SCAN_LIMIT, values.expiresAt ?? null, values.customerId ?? null, values.subscriptionId ?? null, values.status ?? "active", values.source ?? "dodo"]);
  return true;
}

async function activateProByUserId(userId: string, values: {
  customerId?: string | null;
  subscriptionId?: string | null;
  status?: string;
  expiresAt?: string | null;
  source?: string;
}) {
  await pool.query(`
    INSERT INTO public.usage (
      owner, scans_used, scans_limit, plan, pro_expires_at,
      monthly_scans_used, monthly_scans_limit, monthly_reset_at,
      dodo_customer_id, dodo_subscription_id, dodo_subscription_status, pro_source, pro_started_at
    )
    VALUES ($1, 0, $2, 'pro', $3, 0, $2, now() + interval '30 days', $4, $5, $6, $7, now())
    ON CONFLICT (owner) DO UPDATE SET
      plan = 'pro',
      scans_limit = $2,
      monthly_scans_limit = $2,
      pro_expires_at = $3,
      dodo_customer_id = COALESCE($4, usage.dodo_customer_id),
      dodo_subscription_id = COALESCE($5, usage.dodo_subscription_id),
      dodo_subscription_status = COALESCE($6, usage.dodo_subscription_status),
      pro_source = COALESCE($7, usage.pro_source),
      pro_started_at = COALESCE(usage.pro_started_at, now())
  `, [userId, PRO_SCAN_LIMIT, values.expiresAt ?? null, values.customerId ?? null, values.subscriptionId ?? null, values.status ?? "active", values.source ?? "dodo"]);
}

async function deactivatePro(subscriptionId: string | null, email: string | null, status: string) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (subscriptionId) {
    params.push(subscriptionId);
    clauses.push(`dodo_subscription_id = $${params.length}`);
  }
  if (email) {
    params.push(email);
    clauses.push(`owner IN (SELECT id FROM auth.users WHERE lower(email) = lower($${params.length}))`);
  }
  if (!clauses.length) return;

  await pool.query(`
    UPDATE public.usage
       SET plan = 'free', scans_limit = 1, monthly_scans_limit = 1,
           pro_expires_at = NULL, dodo_subscription_status = $${params.length + 1}
     WHERE ${clauses.join(" OR ")}
  `, [...params, status]);
}

router.post("/checkout", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    await ensureDodoTables();
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const coupon = typeof req.body?.coupon === "string" ? req.body.coupon.trim().toUpperCase() : "";

    if (coupon === HACKATHON_COUPON) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [HACKATHON_COUPON]);
        const existing = await client.query("SELECT 1 FROM public.hackathon_redemptions WHERE owner = $1 LIMIT 1", [userId]);
        if (existing.rowCount) {
          await client.query("COMMIT");
          res.json({ free: true, alreadyRedeemed: true, message: "Hackathon Pro is already active on this account." });
          return;
        }
        const countResult = await client.query("SELECT count(*)::int AS count FROM public.hackathon_redemptions WHERE coupon_code = $1", [HACKATHON_COUPON]);
        if (Number(countResult.rows[0]?.count ?? 0) >= HACKATHON_LIMIT) {
          await client.query("ROLLBACK");
          res.status(409).json({ error: "This hackathon Pro coupon has reached its 60-user limit." });
          return;
        }

        await client.query("INSERT INTO public.hackathon_redemptions (owner, coupon_code) VALUES ($1, $2)", [userId, HACKATHON_COUPON]);
        await client.query(`
          INSERT INTO public.usage (owner, scans_used, scans_limit, plan, pro_expires_at, monthly_scans_used, monthly_scans_limit, monthly_reset_at, pro_source, pro_started_at)
          VALUES ($1, 0, $2, 'pro', now() + interval '30 days', 0, $2, now() + interval '30 days', 'hackathon', now())
          ON CONFLICT (owner) DO UPDATE SET
            plan = 'pro', scans_limit = $2, monthly_scans_limit = $2,
            pro_expires_at = now() + interval '30 days', pro_source = 'hackathon', pro_started_at = now()
        `, [userId, PRO_SCAN_LIMIT]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      res.json({ free: true, redeemed: true, message: "Hackathon Pro activated for 30 days." });
      return;
    }

    const userResult = await pool.query(`SELECT email, COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', '') AS name FROM auth.users WHERE id = $1 LIMIT 1`, [userId]);
    const user = userResult.rows[0];
    if (!user?.email) {
      res.status(400).json({ error: "Account email not available" });
      return;
    }

    const origin = process.env.VITE_APP_URL || "https://vibesane.app";
    const session = await dodoFetch("/checkouts", {
      method: "POST",
      body: JSON.stringify({
        product_cart: [{ product_id: PRODUCT_ID, quantity: 1 }],
        customer: { email: user.email, name: user.name || undefined },
        return_url: `${origin}/dashboard?upgraded=true`,
        cancel_url: `${origin}/pricing`,
        redirect_immediately: true,
        metadata: { user_id: userId, product: "vibesane_pro" },
      }),
    });

    const checkoutUrl = typeof session.checkout_url === "string" ? session.checkout_url : null;
    if (!checkoutUrl) throw new Error("Dodo did not return a checkout URL");
    res.json({
      checkout_url: checkoutUrl,
      session_id: typeof session.session_id === "string" ? session.session_id : null,
    });
  } catch (error) {
    console.error("[dodo] checkout failed", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unable to start checkout" });
  }
});

// Dodo redirects back immediately after checkout and appends subscription_id/status.
// This endpoint closes the gap where the webhook is still in flight: the authenticated
// user can prove the subscription belongs to them, and we read the authoritative state
// directly from Dodo before granting Pro access.
router.post("/billing/sync", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    await ensureDodoTables();
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const subscriptionId = typeof req.body?.subscription_id === "string"
      ? req.body.subscription_id.trim()
      : "";
    if (!subscriptionId) {
      res.status(400).json({ error: "subscription_id is required" });
      return;
    }

    const userResult = await pool.query(`SELECT email FROM auth.users WHERE id = $1 LIMIT 1`, [userId]);
    const accountEmail = String(userResult.rows[0]?.email ?? "").trim().toLowerCase();
    if (!accountEmail) {
      res.status(400).json({ error: "Account email not available" });
      return;
    }

    const subscription = await dodoFetch(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
    const productId = typeof subscription.product_id === "string" ? subscription.product_id : null;
    const status = typeof subscription.status === "string" ? subscription.status : "";
    const customer = subscription.customer && typeof subscription.customer === "object"
      ? subscription.customer as Record<string, unknown>
      : {};
    const customerEmail = typeof customer.email === "string" ? customer.email.trim().toLowerCase() : "";
    const customerId = typeof customer.customer_id === "string" ? customer.customer_id : null;
    const metadata = subscription.metadata && typeof subscription.metadata === "object"
      ? subscription.metadata as Record<string, unknown>
      : {};
    const metadataUserId = typeof metadata.user_id === "string" ? metadata.user_id : null;

    if (productId !== PRODUCT_ID) {
      res.status(409).json({ error: "Subscription product does not match VibeSane Pro" });
      return;
    }
    if (metadataUserId !== userId && customerEmail !== accountEmail) {
      res.status(403).json({ error: "Subscription does not belong to this account" });
      return;
    }

    if (status === "active") {
      const nextBilling = typeof subscription.next_billing_date === "string"
        ? subscription.next_billing_date
        : (typeof subscription.expires_at === "string" ? subscription.expires_at : null);
      await activateProByUserId(userId, {
        customerId,
        subscriptionId,
        status,
        expiresAt: nextBilling,
        source: "dodo_return_sync",
      });
      res.json({ activated: true, plan: "pro", status, subscription_id: subscriptionId });
      return;
    }

    res.status(409).json({ activated: false, plan: "free", status, message: `Subscription is ${status || "not active"}.` });
  } catch (error) {
    console.error("[dodo] return sync failed", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unable to sync subscription" });
  }
});

router.post("/webhooks/dodo", async (req: AuthedRequest, res: Response): Promise<void> => {
  const rawBody = (req as AuthedRequest & { rawBody?: Buffer }).rawBody?.toString("utf8") ?? "";
  try {
    await ensureDodoTables();
    if (!verifyDodoWebhook(rawBody, req)) {
      res.status(401).json({ error: "Invalid webhook signature" });
      return;
    }

    const eventId = req.header("webhook-id")!;
    const payload = req.body as Record<string, unknown>;
    const eventType = typeof payload.type === "string" ? payload.type : "";

    const inserted = await pool.query(`
      INSERT INTO public.dodo_webhook_events (webhook_id, event_type, payload)
      VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (webhook_id) DO NOTHING
      RETURNING id
    `, [eventId, eventType, rawBody]);

    if (!inserted.rowCount) {
      res.status(200).json({ received: true, duplicate: true });
      return;
    }

    const data = payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : {};
    const customer = customerFrom(data);
    const subscriptionId = typeof data.subscription_id === "string" ? data.subscription_id : null;
    const nextBilling = typeof data.next_billing_date === "string" ? data.next_billing_date : null;
    const productId = typeof data.product_id === "string" ? data.product_id : null;

    if (["subscription.active", "subscription.renewed", "subscription.plan_changed"].includes(eventType)) {
      if (productId && productId !== PRODUCT_ID) {
        throw new Error("Webhook product does not match VibeSane Pro");
      }
      if (customer.email) {
        await activateProByEmail(customer.email, {
          customerId: customer.id,
          subscriptionId,
          status: "active",
          expiresAt: nextBilling,
          source: "dodo",
        });
      }
    } else if (eventType === "payment.succeeded") {
      if (customer.email) {
        await activateProByEmail(customer.email, {
          customerId: customer.id,
          subscriptionId,
          status: "active",
          expiresAt: nextBilling || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          source: "dodo",
        });
      }
    } else if (["subscription.on_hold", "subscription.cancelled", "subscription.failed", "subscription.expired"].includes(eventType)) {
      await deactivatePro(subscriptionId, customer.email, eventType.replace("subscription.", ""));
    }

    await pool.query(`UPDATE public.dodo_webhook_events SET processed = true, processed_at = now() WHERE webhook_id = $1`, [eventId]);
    res.status(200).json({ received: true });
  } catch (error) {
    console.error("[dodo] webhook processing failed", error);
    try {
      const eventId = req.header("webhook-id");
      if (eventId) await pool.query(`UPDATE public.dodo_webhook_events SET attempts = attempts + 1, error_message = $2 WHERE webhook_id = $1`, [eventId, error instanceof Error ? error.message : "Unknown error"]);
    } catch {
      // Preserve the original webhook error response.
    }
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
