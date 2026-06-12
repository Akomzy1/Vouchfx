/**
 * Web Push — self-contained implementation (RFC 8291 message encryption +
 * RFC 8292 VAPID), using ONLY node:crypto. No external dependency.
 *
 * NODE-ONLY. This module is intentionally NOT re-exported from the @vouchfx/core
 * barrel — it must never enter the web client bundle. Import it via the
 * sub-path "@vouchfx/core/push" from server contexts (workers, route handlers).
 */
import {
  createECDH,
  createHmac,
  createCipheriv,
  randomBytes,
  createPrivateKey,
  sign as cryptoSign,
} from "node:crypto";

export interface PushSubscriptionKeys {
  endpoint: string;
  /** Client public key (base64url, 65-byte uncompressed P-256 point). */
  p256dh: string;
  /** Client auth secret (base64url, 16 bytes). */
  auth: string;
}

export interface VapidConfig {
  publicKey: string;   // base64url, 65-byte uncompressed P-256 point
  privateKey: string;  // base64url, 32-byte scalar
  subject: string;     // "mailto:..." or an https URL
}

export interface PushResult {
  ok: boolean;
  statusCode: number;
  /** True when the endpoint is permanently gone (404/410) — caller should delete the row. */
  gone: boolean;
}

const b64url = (b: Buffer): string => b.toString("base64url");
const fromB64url = (s: string): Buffer => Buffer.from(s, "base64url");

/** HKDF (RFC 5869) with SHA-256. */
function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
  const prk = createHmac("sha256", salt).update(ikm).digest();
  let output = Buffer.alloc(0);
  let block = Buffer.alloc(0);
  let counter = 1;
  while (output.length < length) {
    block = createHmac("sha256", prk)
      .update(Buffer.concat([block, info, Buffer.from([counter])]))
      .digest();
    output = Buffer.concat([output, block]);
    counter += 1;
  }
  return output.subarray(0, length);
}

/** Build a Node KeyObject for the VAPID private key from its raw base64url parts. */
function vapidPrivateKey(vapid: VapidConfig) {
  const pub = fromB64url(vapid.publicKey); // 0x04 || X(32) || Y(32)
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error("VAPID public key must be a 65-byte uncompressed P-256 point");
  }
  return createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      d: vapid.privateKey,
      x: b64url(pub.subarray(1, 33)),
      y: b64url(pub.subarray(33, 65)),
    },
    format: "jwk",
  });
}

/** Sign the VAPID JWT (ES256) for a given push endpoint origin. */
function vapidAuthHeader(endpoint: string, vapid: VapidConfig): string {
  const audience = new URL(endpoint).origin;
  const header = b64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64url(
    Buffer.from(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, // 12h
        sub: vapid.subject,
      })
    )
  );
  const signingInput = `${header}.${payload}`;
  // ieee-p1363 → raw 64-byte r||s signature, as JWT ES256 requires.
  const signature = cryptoSign("sha256", Buffer.from(signingInput), {
    key: vapidPrivateKey(vapid),
    dsaEncoding: "ieee-p1363",
  });
  return `vapid t=${signingInput}.${b64url(signature)}, k=${vapid.publicKey}`;
}

/** Encrypt the payload for one subscription using aes128gcm (RFC 8291/8188). */
function encryptPayload(sub: PushSubscriptionKeys, payload: Buffer): Buffer {
  const uaPublic = fromB64url(sub.p256dh); // 65 bytes
  const authSecret = fromB64url(sub.auth); // 16 bytes
  if (uaPublic.length !== 65) throw new Error("p256dh must be a 65-byte point");

  const local = createECDH("prime256v1");
  const asPublic = local.generateKeys(); // 65-byte uncompressed
  const sharedSecret = local.computeSecret(uaPublic);

  // IKM = HKDF(auth_secret, ecdh, "WebPush: info\0" || ua_public || as_public)
  const ikmInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = hkdf(authSecret, sharedSecret, ikmInfo, 32);

  const salt = randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);

  // Single record: plaintext || 0x02 (last-record delimiter), then AES-128-GCM.
  const plaintext = Buffer.concat([payload, Buffer.from([0x02])]);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

  // aes128gcm header: salt(16) | rs(4 BE) | idlen(1) | keyid(as_public 65) | ciphertext
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096, 0);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, ciphertext]);
}

/**
 * Send one Web Push message. Returns the delivery result; never throws on an
 * HTTP error (only on malformed inputs). A `gone: true` result means the
 * subscription is dead and the caller should delete it.
 */
export async function sendWebPush(
  sub: PushSubscriptionKeys,
  payload: Record<string, unknown>,
  vapid: VapidConfig,
  ttlSeconds = 86_400
): Promise<PushResult> {
  const body = encryptPayload(sub, Buffer.from(JSON.stringify(payload)));
  // Copy into a fresh ArrayBuffer-backed Uint8Array — satisfies DOM fetch
  // BodyInit; a raw node Buffer (ArrayBufferLike, maybe SharedArrayBuffer) does
  // not when this module is typechecked under the web app's DOM lib.
  const bodyView = Uint8Array.from(body);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttlSeconds),
      Urgency: "normal",
      Authorization: vapidAuthHeader(sub.endpoint, vapid),
    },
    body: bodyView,
  });
  return {
    ok: res.status >= 200 && res.status < 300,
    statusCode: res.status,
    gone: res.status === 404 || res.status === 410,
  };
}

/** Generate a fresh VAPID keypair (run once at setup; store in env). */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    publicKey: b64url(ecdh.getPublicKey()),       // 65-byte uncompressed
    privateKey: b64url(ecdh.getPrivateKey()),     // 32-byte scalar
  };
}
