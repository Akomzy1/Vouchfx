import { describe, it, expect } from "vitest";
import http from "node:http";
import {
  createECDH,
  createHmac,
  createDecipheriv,
  randomBytes,
  createPublicKey,
  verify as cryptoVerify,
} from "node:crypto";
import { sendWebPush, generateVapidKeys } from "../web-push";

function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
  const prk = createHmac("sha256", salt).update(ikm).digest();
  let out = Buffer.alloc(0);
  let block = Buffer.alloc(0);
  let c = 1;
  while (out.length < length) {
    block = createHmac("sha256", prk).update(Buffer.concat([block, info, Buffer.from([c])])).digest();
    out = Buffer.concat([out, block]);
    c += 1;
  }
  return out.subarray(0, length);
}

/** Capture one POST body + headers from sendWebPush against a throwaway server. */
async function capturePush(status: number) {
  const vapid = { ...generateVapidKeys(), subject: "mailto:test@vouchfx.com" };
  const ua = createECDH("prime256v1");
  const uaPublic = ua.generateKeys();
  const authSecret = randomBytes(16);
  const sub = { endpoint: "", p256dh: uaPublic.toString("base64url"), auth: authSecret.toString("base64url") };
  const payload = { title: "Trade opened", body: "XAUUSD buy", event: "trade_opened" as const, url: "/dashboard" };

  let body: Buffer | null = null;
  let auth = "";
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (d) => chunks.push(d as Buffer));
    req.on("end", () => {
      body = Buffer.concat(chunks);
      auth = req.headers["authorization"] as string;
      res.statusCode = status;
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const port = (server.address() as any).port;
  sub.endpoint = `http://127.0.0.1:${port}/push`;

  const result = await sendWebPush(sub, payload, vapid);
  server.close();
  return { vapid, ua, uaPublic, authSecret, payload, body: body!, auth, result };
}

describe("web-push", () => {
  it("encrypts a payload that the recipient can decrypt (RFC 8291 round-trip)", async () => {
    const { ua, uaPublic, authSecret, payload, body } = await capturePush(201);

    const salt = body.subarray(0, 16);
    const idlen = body[20]!;
    const asPublic = body.subarray(21, 21 + idlen);
    const ciphertext = body.subarray(21 + idlen);

    const shared = ua.computeSecret(asPublic);
    const ikm = hkdf(
      authSecret,
      shared,
      Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]),
      32
    );
    const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
    const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);

    const tag = ciphertext.subarray(ciphertext.length - 16);
    const ct = ciphertext.subarray(0, ciphertext.length - 16);
    const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
    decipher.setAuthTag(tag);
    let plain = Buffer.concat([decipher.update(ct), decipher.final()]);
    if (plain[plain.length - 1] === 0x02) plain = plain.subarray(0, plain.length - 1);

    expect(JSON.parse(plain.toString())).toEqual(payload);
  });

  it("signs a VAPID JWT (ES256) that verifies against the public key", async () => {
    const { vapid, body: _b, auth } = await capturePush(201);
    const m = /vapid t=([^,]+), k=(.+)/.exec(auth)!;
    const [h, p, s] = m[1]!.split(".");

    const pub = Buffer.from(vapid.publicKey, "base64url");
    const keyObj = createPublicKey({
      key: {
        kty: "EC",
        crv: "P-256",
        x: pub.subarray(1, 33).toString("base64url"),
        y: pub.subarray(33, 65).toString("base64url"),
      },
      format: "jwk",
    });
    const valid = cryptoVerify(
      "sha256",
      Buffer.from(`${h}.${p}`),
      { key: keyObj, dsaEncoding: "ieee-p1363" },
      Buffer.from(s!, "base64url")
    );
    expect(valid).toBe(true);
    expect(m[2]).toBe(vapid.publicKey);

    const claims = JSON.parse(Buffer.from(p!, "base64url").toString());
    expect(claims.sub).toBe("mailto:test@vouchfx.com");
    expect(typeof claims.aud).toBe("string");
    expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("reports gone=true for 404/410 so the caller prunes dead endpoints", async () => {
    const a = await capturePush(410);
    expect(a.result).toMatchObject({ ok: false, statusCode: 410, gone: true });
    const b = await capturePush(404);
    expect(b.result.gone).toBe(true);
  });

  it("reports ok=true on a 201 success", async () => {
    const { result } = await capturePush(201);
    expect(result).toMatchObject({ ok: true, statusCode: 201, gone: false });
  });
});
