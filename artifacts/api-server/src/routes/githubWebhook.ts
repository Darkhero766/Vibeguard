import { Router } from "express";
import crypto from "node:crypto";
import { scanPublicRepository } from "../lib/scanner";
import { runExtendedSecurityChecksV2 } from "../lib/extendedScannerV2";
import { TOTAL_SECURITY_CHECKS } from "../lib/securityCheckCatalog";
import { cacheScanResult } from "../lib/scanCache";
import { logger } from "../lib/logger";

const router = Router();

type RawRequest = { rawBody?: Buffer };

type GitHubRepo = {
  full_name: string;
  html_url: string;
};

type WebhookPayload = {
  action?: string;
  installation?: { id?: number };
  repository?: GitHubRepo;
  ref?: string;
  after?: string;
  pull_request?: {
    number?: number;
    html_url?: string;
    head?: { sha?: string };
  };
};

function verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(signature, "utf8");
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function base64Url(value: string): string {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function getPrivateKey(): string {
  const encoded = process.env.GITHUB_APP_PRIVATE_KEY_BASE64?.trim();
  if (encoded) {
    try {
      return Buffer.from(encoded, "base64").toString("utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
    } catch {
      throw new Error("GITHUB_APP_PRIVATE_KEY_BASE64 could not be decoded");
    }
  }

  const raw = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!raw) throw new Error("GITHUB_APP_PRIVATE_KEY is required");

  // Render may store the PEM with literal \\n escapes, JSON quotes, CRLFs, or surrounding whitespace.
  const normalized = raw
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/^\uFEFF/, "")
    .trim();

  if (!normalized.includes("BEGIN") || !normalized.includes("PRIVATE KEY")) {
    throw new Error("GITHUB_APP_PRIVATE_KEY is not a valid PEM private key");
  }
  return normalized;
}

function createAppJwt(): string {
  const appId = process.env.GITHUB_APP_ID?.trim();
  if (!appId) throw new Error("GITHUB_APP_ID is required");

  const privateKey = getPrivateKey();
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }));
  const unsigned = `${header}.${payload}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();

  let signature: string;
  try {
    signature = signer.sign({ key: privateKey, format: "pem" }, "base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  } catch (error) {
    throw new Error(`GitHub App private key could not be parsed by Node/OpenSSL: ${error instanceof Error ? error.message : String(error)}`);
  }

  return `${unsigned}.${signature}`;
}

async function getInstallationToken(installationId: number): Promise<string> {
  const jwt = createAppJwt();
  const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) throw new Error(`GitHub installation token failed: ${response.status} ${await response.text()}`);
  const data = (await response.json()) as { token?: string };
  if (!data.token) throw new Error("GitHub did not return an installation token");
  return data.token;
}

async function createCheckRun(token: string, repo: string, sha: string, status: "queued" | "in_progress") {
  const [owner, name] = repo.split("/");
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/check-runs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "VibeSane Security", head_sha: sha, status }),
  });
  if (!response.ok) throw new Error(`GitHub check creation failed: ${response.status} ${await response.text()}`);
  return (await response.json()) as { id: number; html_url?: string };
}

async function completeCheckRun(token: string, repo: string, checkId: number, conclusion: "success" | "failure" | "neutral", report: any) {
  const [owner, name] = repo.split("/");
  const findings = Array.isArray(report?.findings) ? report.findings : [];
  const critical = findings.filter((f: any) => f.severity === "Critical").length;
  const high = findings.filter((f: any) => f.severity === "High").length;
  const medium = findings.filter((f: any) => f.severity === "Medium").length;
  const score = Math.max(0, Math.min(100, 100 - critical * 18 - high * 10 - medium * 4));
  const summary = findings.length === 0
    ? `## VibeSane Security\n\n**100/100 — No findings detected.**\n\n${report.filesScanned ?? 0} files scanned across ${report.checksRun ?? TOTAL_SECURITY_CHECKS} security checks.`
    : `## VibeSane Security\n\n**Security score: ${score}/100**\n\n${findings.length} findings — ${critical} critical, ${high} high, ${medium} medium.\n\n${report.filesScanned ?? 0} files scanned across ${report.checksRun ?? TOTAL_SECURITY_CHECKS} security checks.`;

  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/check-runs/${checkId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status: "completed",
      conclusion,
      output: { title: `VibeSane Security — ${score}/100`, summary },
    }),
  });
  if (!response.ok) throw new Error(`GitHub check completion failed: ${response.status} ${await response.text()}`);
}

async function scanEvent(payload: WebhookPayload, event: string): Promise<void> {
  const repo = payload.repository?.full_name;
  const installationId = payload.installation?.id;
  const sha = event === "pull_request" ? payload.pull_request?.head?.sha : payload.after;
  if (!repo || !installationId || !sha) return;

  const token = await getInstallationToken(installationId);
  const check = await createCheckRun(token, repo, sha, "in_progress");
  try {
    const repoUrl = `https://github.com/${repo}`;
    const baseReport = await scanPublicRepository(repoUrl, token);
    let extendedFindings: any[] = [];
    try {
      extendedFindings = await runExtendedSecurityChecksV2(repoUrl, token);
    } catch (error) {
      logger.warn({ err: error, repo }, "Active protection extended checks failed; keeping core findings");
    }

    const seen = new Set(baseReport.findings.map((f) => `${f.filePath}:${f.line}:${f.check}:${f.title}`));
    const findings = [...baseReport.findings];
    for (const item of extendedFindings) {
      const normalized = { ...item, severity: item.severity === "Low" ? "Medium" : item.severity };
      const key = `${normalized.filePath}:${normalized.line}:${normalized.check}:${normalized.title}`;
      if (!seen.has(key)) {
        seen.add(key);
        findings.push(normalized);
      }
    }
    const report = { ...baseReport, findings, checksRun: extendedFindings.length ? TOTAL_SECURITY_CHECKS : baseReport.checksRun };
    cacheScanResult(report.repo, report);
    const hasBlocking = findings.some((f) => f.severity === "Critical" || f.severity === "High");
    await completeCheckRun(token, repo, check.id, hasBlocking ? "failure" : findings.length ? "neutral" : "success", report);
    logger.info({ repo, event, sha, findings: findings.length }, "Active protection scan completed");
  } catch (error) {
    logger.error({ err: error, repo, event, sha }, "Active protection scan failed");
    await completeCheckRun(token, repo, check.id, "failure", { findings: [{ severity: "Critical" }], filesScanned: 0, checksRun: 0 });
  }
}

router.post("/github/webhook", async (req, res): Promise<void> => {
  const rawBody = (req as typeof req & RawRequest).rawBody;
  const signature = req.header("x-hub-signature-256");
  if (!rawBody || !verifySignature(rawBody, signature)) {
    res.status(401).json({ error: "Invalid GitHub webhook signature" });
    return;
  }

  const event = req.header("x-github-event") ?? "unknown";
  const delivery = req.header("x-github-delivery") ?? "unknown";
  const payload = req.body as WebhookPayload;

  res.status(202).json({ accepted: true, event, delivery });

  if (event === "push" || (event === "pull_request" && ["opened", "reopened", "synchronize"].includes(payload.action ?? ""))) {
    void scanEvent(payload, event).catch((error) => logger.error({ err: error, event, delivery }, "Unhandled active protection job failure"));
  }
});

export default router;
