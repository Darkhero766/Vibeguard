import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_ENV = "GITHUB_TOKEN_ENCRYPTION_KEY";

function getKey(): Buffer {
  const raw = process.env[KEY_ENV];
  if (!raw) {
    throw new Error(
      `${KEY_ENV} is not set. Generate a 64-character hex string and add it as a Replit Secret.`,
    );
  }
  const buf = Buffer.from(raw, "hex");
  if (buf.length !== 32) {
    throw new Error(
      `${KEY_ENV} must be exactly 64 hex characters (32 bytes). Got ${buf.length} bytes.`,
    );
  }
  return buf;
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns a "iv:authTag:ciphertext" string (all hex-encoded).
 */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12); // 96-bit IV is standard for GCM
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":");
}

/**
 * Decrypt a string produced by encryptToken.
 */
export function decryptToken(stored: string): string {
  const key = getKey();
  const parts = stored.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted token format");
  const [ivHex, tagHex, ctHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const ct = Buffer.from(ctHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ct).toString("utf8") + decipher.final("utf8");
}
