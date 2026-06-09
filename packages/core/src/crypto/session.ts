/**
 * AES-256-GCM encryption for Telegram session strings.
 *
 * Wire format (all base64): [12B IV][16B GCM tag][ciphertext]
 * Key must be 32 bytes, supplied as base64 (ENCRYPTION_KEY env var).
 *
 * Invariant: decrypt only in worker memory, never log the result.
 */
import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const IV_BYTES = 12;
const TAG_BYTES = 16;

export function encryptSession(plaintext: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes (base64-encoded)");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptSession(cipherBase64: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, "base64");
  const data = Buffer.from(cipherBase64, "base64");
  const iv = data.subarray(0, IV_BYTES);
  const tag = data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ct = data.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
