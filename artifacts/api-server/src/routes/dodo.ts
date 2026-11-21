import { Router, type Response } from "express";
import { rateLimit } from "../middlewares/rateLimit";
import { pool } from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../middlewares/auth";
import { PRO_SCAN_LIMIT } from "../lib/plan";
import { dodoBaseUrl, assertDodoEnvironmentSafe, dodoCheckoutReturnOrigin, dodoSubscriptionBelongsToAccount, requireDodoApiKey, requireFutureProExpiry } from "../lib/dodoEnvironment";
import { verifyDodoSignature } from "../lib/dodoWebhookSignature";

const router = Router();

const PRODUCT_ID = process.env.DODO_PRO_PRODUCT_ID || "pdt_0NmsVBNuntowIFXXZKqKS";
const HACKATHON_COUPON = "HACKATHON60";
const HACKATHON_LIMIT = 60;



// Never run ALTER/CREATE against hosted Supabase from a payment request or webhook.
// Database changes are reviewed, versioned migrations; requests fail closed.
let dodoSchemaReady: Promise<void> | null = null;
async function ensureDodoTables() {
  if (!dodoSchemaReady) {
    dodoSchemaReady = (async () => {
      const required = new Map<string, Set<string>>([
        ["usage", new Set(["dodo_customer_id", "dodo_subscription_id",
          "dodo_subscription_status", "pro_source", "pro_started_at"])],
        ["dodo_webhook_events", new Set(["webhook_id", "event_type", "payload",
          "processed", "attempts", "error_message", "created_at", "processed_at"])],
        ["hackathon_redemptions", new Set(["owner", "coupon_code"])],
      ]);
      const result = await pool.query(
        "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('usage','dodo_webhook_events','hackathon_redemptions')",
      );
      for (const row of result.rows) required.get(String(row.table_name))?.delete(String(row.column_name));
      if ([...required.values()].some((columns) => columns.size > 0)) {
        throw new Error("Billing schema is incomplete; apply a reviewed database migration before accepting payments.");
      }
    })().catch((error) => {
      dodoSchemaReady = null;
      throw error;
    });
  }
  await dodoSchemaReady;
}

async function dodoFetch(path: string, init: RequestInit = {}) {
  const apiKey = requireDodoApiKey();

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
    // Provider error bodies are untrusted and may contain secrets or PII.
    // Only expose a fixed message; do not log response bodies or credentials.
    console.error("[dodo] provider request failed", { status: response.status });
    throw new Error("Dodo provider request failed");
  }

  return body as Record<string, unknown>;
}

function verifyDodoWebhook(rawBody: string, req: AuthedRequest): boolean {
  return verifyDodoSignature({
    rawBody,
    webhookId: req.header("webhook-id"),
    timestamp: req.header("webhook-timestamp"),
    signatureHeader: req.header("webhook-signature"),
    secret: process.env.DODO_WEBHOOK_SECRET,
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
  metadataUserId?: string | null;
}, executor: Pick<typeof pool, "query"> = pool) {
  // The signed Dodo payload includes our server-created user_id metadata.
  // Staging must never grant Pro to an account found only by email; the
  // subscriber UUID and customer email must identify the SAME Auth user.
  // Legacy production events can retain email lookup until separately
  // reviewed/backfilled in the production migration.
  const metadataUserId = values.metadataUserId?.trim() ?? "";
  if (!metadataUserId && process.env.VIBESANE_DEPLOYMENT_ENV === "staging") {
    throw new Error("Staging subscription event lacks an authenticated account binding");
  }
  if (metadataUserId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(metadataUserId)) {
    throw new Error("Subscription account binding is malformed");
  }
  const user = metadataUserId
    ? await executor.query(`SELECT id FROM auth.users WHERE id = $1 AND lower(email) = lower($2) LIMIT 1`, [metadataUserId, email])
    : await executor.query(`SELECT id FROM auth.users WHERE lower(email) = lower($1) LIMIT 1`, [email]);
  const userId = user.rows[0]?.id as string | undefined;
  if (!userId) return false;

  await executor.query(`
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

// A cancellation for an older subscription MUST NOT revoke a newer
// subscription belonging to the same email. Never match on email alone.
async function deactivatePro(
  subscriptionId: string | null,
  status: string,
  executor: Pick<typeof pool, "query"> = pool,
) {
  if (!subscriptionId) return;
  await executor.query(`
    UPDATE public.usage
       SET plan = 'free', scans_limit = 1, monthly_scans_limit = 1,
           pro_expires_at = NULL, dodo_subscription_status = $2
     WHERE dodo_subscription_id = $1
       AND pro_source IN ('dodo', 'dodo_return_sync')
  `, [subscriptionId, status]);
}

router.post("/checkout", rateLimit({ name: "checkout", windowMs: 60_000, max: 6 }), requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
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

    const origin = dodoCheckoutReturnOrigin();
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
    // Some runtime errors embed Authorization headers in their messages.
    // NEVER forward or log the raw error object or its message.
    console.error("[dodo] checkout failed (redacted)");
    res.status(503).json({ error: "Checkout is temporarily unavailable. No payment has been confirmed." });
  }
});

// Dodo redirects back immediately after checkout and appends subscription_id/status.
// This endpoint closes the gap where the webhook is still in flight: the authenticated
// user can prove the subscription belongs to them, and we read the authoritative state
// directly from Dodo before granting Pro access.
router.post("/billing/sync", rateLimit({ name: "billing-sync", windowMs: 60_000, max: 10 }), requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
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
    if (!dodoSubscriptionBelongsToAccount({
      metadataUserId, customerEmail, userId, accountEmail,
    })) {
      res.status(403).json({ error: "Subscription does not belong to this account" });
      return;
    }

    if (status === "active") {
      const nextBilling = typeof subscription.next_billing_date === "string"
        ? subscription.next_billing_date
        : (typeof subscription.expires_at === "string" ? subscription.expires_at : null);
      // Never make a paid entitlement indefinite when the provider omitted
      // or returned a stale next-billing date.
      const verifiedExpiry = requireFutureProExpiry(nextBilling);
      await activateProByUserId(userId, {
        customerId,
        subscriptionId,
        status,
        expiresAt: verifiedExpiry,
        source: "dodo_return_sync",
      });
      res.json({ activated: true, plan: "pro", status, subscription_id: subscriptionId });
      return;
    }

    res.status(409).json({ activated: false, plan: "free", status, message: `Subscription is ${status || "not active"}.` });
  } catch (error) {
    // Sync errors may contain provider response details or credentials.
    console.error("[dodo] return sync failed (redacted)");
    res.status(503).json({ error: "Subscription status is temporarily unavailable. Please retry later." });
  }
});

router.post("/webhooks/dodo", async (req: AuthedRequest, res: Response): Promise<void> => {
  const rawBody = (req as AuthedRequest & { rawBody?: Buffer }).rawBody?.toString("utf8") ?? "";
  // Authentication first: unsigned requests must never hit the database.
  if (!verifyDodoWebhook(rawBody, req)) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  let client: Pick<typeof pool, "query"> & { release(): void } | undefined;
  try {
    assertDodoEnvironmentSafe();
    await ensureDodoTables();
    client = await pool.connect();
    await client.query("BEGIN");

    const eventId = req.header("webhook-id")!;
    const payload = req.body as Record<string, unknown>;
    const eventType = typeof payload.type === "string" ? payload.type : "";
    // Lock this event for the entire entitlement transaction. A concurrent
    // delivery waits; on success it sees processed=true and returns duplicate.
    // Incomplete records left by older releases are safely retried.
    const pending = await client.query(`
      INSERT INTO public.dodo_webhook_events (webhook_id, event_type, payload)
      VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (webhook_id) DO UPDATE
        SET attempts = public.dodo_webhook_events.attempts + 1,
            error_message = NULL
      WHERE public.dodo_webhook_events.processed = false
      RETURNING id
    `, [eventId, eventType, rawBody]);

    if (!pending.rowCount) {
      await client.query("COMMIT");
      res.status(200).json({ received: true, duplicate: true });
      return;
    }

    const data = payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : {};
    const customer = customerFrom(data);
    const subscriptionId = typeof data.subscription_id === "string" ? data.subscription_id : null;
    const nextBilling = typeof data.next_billing_date === "string"
      ? data.next_billing_date
      : (typeof data.expires_at === "string" ? data.expires_at : null);
    const productId = typeof data.product_id === "string" ? data.product_id : null;
    const dataMetadata = data.metadata && typeof data.metadata === "object"
      ? data.metadata as Record<string, unknown> : {};
    const metadataUserId = typeof dataMetadata.user_id === "string" ? dataMetadata.user_id : null;

    if (["subscription.active", "subscription.renewed", "subscription.plan_changed"].includes(eventType)) {
      // Dodo subscription events require product_id and subscription_id.
      // An absent product ID must not accidentally authorize another SKU.
      if (!subscriptionId || productId !== PRODUCT_ID) {
        throw new Error("Webhook lacks a valid VibeSane Pro subscription/product");
      }
      // Fail and retry rather than grant a non-expiring plan to an account
      // for an event without a trustworthy, future paid-through date.
      const verifiedExpiry = requireFutureProExpiry(nextBilling);
      if (customer.email) {
        await activateProByEmail(customer.email, {
          customerId: customer.id,
          subscriptionId,
          status: "active",
          expiresAt: verifiedExpiry,
          source: "dodo",
          metadataUserId,
        }, client);
      }
    } else if (eventType === "payment.succeeded") {
      // Dodo payment.succeeded also covers one-time purchases and renewals.
      // Never grant a recurring Pro subscription from a generic payment.
      // The signed subscription.active / renewed events (or authenticated
      // verified billing/sync) are the authoritative entitlement source.
    } else if (["subscription.on_hold", "subscription.cancelled", "subscription.failed", "subscription.expired"].includes(eventType)) {
      await deactivatePro(subscriptionId, eventType.replace("subscription.", ""), client);
    }

    await client.query(`UPDATE public.dodo_webhook_events
      SET processed = true, processed_at = now()
      WHERE webhook_id = $1`, [eventId]);
    await client.query("COMMIT");
    res.status(200).json({ received: true });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    // Do not reveal provider secrets or raw payment data to clients.
    console.error("[dodo] webhook processing failed (redacted)");
    res.status(500).json({ error: "Webhook processing failed" });
  } finally {
    client?.release();
  }
});

export default router;
