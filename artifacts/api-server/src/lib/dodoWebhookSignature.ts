import { createHmac, timingSafeEqual } from "node:crypto";

type Input = {
  rawBody: string;
  webhookId?: string;
  timestamp?: string;
  signatureHeader?: string;
  secret?: string;
  nowMs?: number;
};

/**
 * Standard Webhooks HMAC verification for Dodo.
 * Compare digest bytes and reject malformed/short base64 secrets.
 * This helper never logs request bodies or credentials.
 */
export function verifyDodoSignature(input: Input): boolean {
  const { rawBody, webhookId, timestamp, signatureHeader, secret } = input;
  if (!secret || !webhookId || !timestamp || !signatureHeader) return false;
  if (!/^[0-9]{10,13}$/.test(timestamp)) return false;
  const unixSeconds = Number(timestamp);
  if (!Number.isSafeInteger(unixSeconds) ||
      Math.abs((input.nowMs ?? Date.now()) / 1000 - unixSeconds) > 300) return false;

  const encoded = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return false;
  const key = Buffer.from(encoded, "base64");
  if (key.length < 16 ||
      key.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) return false;

  const signed = webhookId + "." + timestamp + "." + rawBody;
  const expected = createHmac("sha256", key).update(signed).digest();
  return signatureHeader.trim().split(/\s+/).some((candidate) => {
    const match = /^v1,([A-Za-z0-9+/]+={0,2})$/.exec(candidate);
    if (!match) return false;
    const signature = Buffer.from(match[1], "base64");
    return signature.length === expected.length && timingSafeEqual(signature, expected);
  });
}
