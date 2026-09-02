import crypto from "node:crypto";
import { db, githubAppInstallations } from "@workspace/db";
import { eq } from "drizzle-orm";

function base64Url(value: string): string {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function normalizePem(raw: string): string {
  return raw.trim().replace(/^['"]|['"]$/g, "").replace(/\\n/g, "\n").replace(/\\r/g, "").replace(/\r\n/g, "\n").replace(/^\uFEFF/, "").trim();
}

function decodeBase64ToPem(value: string): string | null {
  const compact = value.replace(/\s+/g, "");
  if (!compact || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact) || compact.length % 4 === 1) return null;
  try {
    const pem = normalizePem(Buffer.from(compact, "base64").toString("utf8"));
    return pem.includes("-----BEGIN") && pem.includes("PRIVATE KEY-----") ? pem : null;
  } catch {
    return null;
  }
}

function getPrivateKey(): string {
  const encoded = process.env.GITHUB_APP_PRIVATE_KEY_BASE64?.trim();
  if (encoded) {
    const decoded = decodeBase64ToPem(encoded);
    if (!decoded) throw new Error("GITHUB_APP_PRIVATE_KEY_BASE64 is not valid base64 PEM");
    return decoded;
  }
  const raw = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!raw) throw new Error("GITHUB_APP_PRIVATE_KEY is required");
  const normalized = normalizePem(raw);
  if (normalized.includes("-----BEGIN") && normalized.includes("PRIVATE KEY-----")) return normalized;
  const decoded = decodeBase64ToPem(normalized);
  if (decoded) return decoded;
  throw new Error("GitHub App private key is invalid");
}

export function createAppJwt(): string {
  const appId = process.env.GITHUB_APP_ID?.trim();
  if (!appId) throw new Error("GITHUB_APP_ID is required");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }))}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(crypto.createPrivateKey({ key: getPrivateKey(), format: "pem" }), "base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${unsigned}.${signature}`;
}

function githubHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" };
}

export async function getAppSlug(): Promise<string> {
  const response = await fetch("https://api.github.com/app", { headers: githubHeaders(createAppJwt()) });
  if (!response.ok) throw new Error(`GitHub App lookup failed: ${response.status}`);
  const data = (await response.json()) as { slug?: string };
  if (!data.slug) throw new Error("GitHub App slug was not returned");
  return data.slug;
}

export async function getInstallation(installationId: number) {
  const response = await fetch(`https://api.github.com/app/installations/${installationId}`, { headers: githubHeaders(createAppJwt()) });
  if (!response.ok) throw new Error(`GitHub installation lookup failed: ${response.status}`);
  return (await response.json()) as { id: number; account?: { login?: string; id?: number; type?: string }; repository_selection?: string };
}

// Reuse installation tokens instead of minting a fresh GitHub token on every tab
// switch or repository list request. GitHub tokens are normally valid for about
// an hour; we keep them for at most 10 minutes in this process.
type TokenCacheEntry = { token: string; expiresAt: number };
const tokenCache = new Map<number, TokenCacheEntry>();
const tokenInflight = new Map<number, Promise<string>>();
const TOKEN_CACHE_TTL_MS = 10 * 60 * 1000;

export async function getInstallationToken(installationId: number, forceRefresh = false): Promise<string> {
  const cached = tokenCache.get(installationId);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.token;
  const pending = tokenInflight.get(installationId);
  if (!forceRefresh && pending) return pending;

  const request = (async () => {
    const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, { method: "POST", headers: githubHeaders(createAppJwt()) });
    if (!response.ok) throw new Error(`GitHub installation token failed: ${response.status} ${await response.text()}`);
    const data = (await response.json()) as { token?: string; expires_at?: string };
    if (!data.token) throw new Error("GitHub did not return an installation token");
    const githubExpiry = data.expires_at ? new Date(data.expires_at).getTime() : Date.now() + TOKEN_CACHE_TTL_MS;
    tokenCache.set(installationId, { token: data.token, expiresAt: Math.min(githubExpiry - 30_000, Date.now() + TOKEN_CACHE_TTL_MS) });
    return data.token;
  })();

  tokenInflight.set(installationId, request);
  try { return await request; }
  finally { tokenInflight.delete(installationId); }
}

type GithubRepo = { id: number; name: string; fullName: string; private: boolean; htmlUrl: string; updatedAt: string; description: string | null };
type RepoCacheEntry = { repositories: GithubRepo[]; expiresAt: number };
const repoCache = new Map<number, RepoCacheEntry>();
const repoInflight = new Map<number, Promise<GithubRepo[]>>();
const REPO_CACHE_TTL_MS = 2 * 60 * 1000;

export async function listInstallationRepos(installationId: number, forceRefresh = false): Promise<GithubRepo[]> {
  const cached = repoCache.get(installationId);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.repositories;
  const pending = repoInflight.get(installationId);
  if (!forceRefresh && pending) return pending;

  const request = (async () => {
    const token = await getInstallationToken(installationId, forceRefresh);
    const response = await fetch("https://api.github.com/installation/repositories?per_page=100", { headers: githubHeaders(token) });
    if (!response.ok) throw new Error(`GitHub installation repositories failed: ${response.status} ${await response.text()}`);
    const data = (await response.json()) as { repositories?: Array<{ id: number; name: string; full_name: string; private: boolean; html_url: string; updated_at: string; description: string | null }> };
    const repositories = (data.repositories ?? []).map((repo) => ({ id: repo.id, name: repo.name, fullName: repo.full_name, private: repo.private, htmlUrl: repo.html_url, updatedAt: repo.updated_at, description: repo.description }));
    repoCache.set(installationId, { repositories, expiresAt: Date.now() + REPO_CACHE_TTL_MS });
    return repositories;
  })();

  repoInflight.set(installationId, request);
  try { return await request; }
  finally { repoInflight.delete(installationId); }
}

function stateSecret(): string {
  return process.env.GITHUB_APP_STATE_SECRET ?? process.env.GITHUB_APP_WEBHOOK_SECRET ?? "";
}

export function createInstallState(userId: string): string {
  const secret = stateSecret();
  if (!secret) throw new Error("GITHUB_APP_STATE_SECRET or GITHUB_APP_WEBHOOK_SECRET is required");
  const payload = `${userId}.${Date.now()}`;
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${base64Url(payload)}.${signature}`;
}

export function verifyInstallState(state: string, maxAgeMs = 15 * 60 * 1000): string | null {
  const secret = stateSecret();
  const [encoded, signature] = state.split(".");
  if (!secret || !encoded || !signature) return null;
  const payload = Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  const [userId, issuedAtRaw] = payload.split(".");
  const issuedAt = Number(issuedAtRaw);
  if (!userId || !Number.isFinite(issuedAt) || Date.now() - issuedAt > maxAgeMs || Date.now() - issuedAt < -60_000) return null;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  if (expected.length !== signature.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  return userId;
}

export async function saveInstallation(owner: string, installationId: number, accountLogin: string, accountId: number, accountType: string): Promise<void> {
  await db.insert(githubAppInstallations).values({ owner, installationId, accountLogin, accountId, accountType }).onConflictDoUpdate({ target: githubAppInstallations.owner, set: { installationId, accountLogin, accountId, accountType, updatedAt: new Date() } });
  tokenCache.delete(installationId);
  repoCache.delete(installationId);
}

export async function getInstallationIdForUser(owner: string): Promise<number | null> {
  const rows = await db.select({ installationId: githubAppInstallations.installationId }).from(githubAppInstallations).where(eq(githubAppInstallations.owner, owner));
  return rows[0]?.installationId ?? null;
}
