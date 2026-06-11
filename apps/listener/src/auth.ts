/**
 * One-time helper: authenticate with Telegram and print the session string.
 *
 * Run ONCE to generate TELEGRAM_SESSION_STRING:
 *   pnpm --filter @vouchfx/listener auth
 *
 * Copy the printed string into your .env file (or Supabase Vault for production).
 * The session string is sensitive — treat it like a password.
 *
 * Note: this script performs the one-time MTProto auth handshake (a write to
 * Telegram's auth servers). The session it creates is then used READ-ONLY by
 * the listener. The read-only rule applies to the running listener, not to
 * this setup script.
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { createInterface } from "readline/promises";
import { stdin, stdout } from "process";
import { parseEnv } from "@vouchfx/config";

// Load .env for local dev — tsx does not auto-load it.
// Only set vars not already in process.env so real env always wins.
{
  const __dir = dirname(fileURLToPath(import.meta.url));
  const envFile = join(__dir, "..", ".env");
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  }
}

(async () => {
  const env = parseEnv();

  if (!env.TELEGRAM_API_ID || !env.TELEGRAM_API_HASH) {
    console.error(
      "Error: TELEGRAM_API_ID and TELEGRAM_API_HASH must be set in your environment.\n" +
        "Get them at https://my.telegram.org/apps"
    );
    process.exit(1);
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const ask = (q: string) => rl.question(q);

  const client = new TelegramClient(
    new StringSession(""),
    env.TELEGRAM_API_ID,
    env.TELEGRAM_API_HASH,
    { connectionRetries: 3 }
  );

  await client.start({
    phoneNumber: () => ask("Phone number (e.g. +2348012345678): "),
    password: () => ask("2FA password (leave empty if none): "),
    phoneCode: () => ask("Code sent to your Telegram app: "),
    onError: (err: Error) => {
      console.error("[auth] error:", err.message);
    },
  });

  const sessionString = client.session.save() as unknown as string;

  console.log("\n✓ Authenticated. Copy this value into your .env:\n");
  console.log(`TELEGRAM_SESSION_STRING=${sessionString}`);
  console.log(
    "\nKeep this secret — it gives read access to your Telegram account."
  );

  await client.disconnect();
  rl.close();
})().catch((err: unknown) => {
  console.error("[auth] fatal:", err);
  process.exit(1);
});
