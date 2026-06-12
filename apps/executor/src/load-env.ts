/**
 * Load apps/listener/.env into process.env for local dev — tsx does not do
 * this automatically. MUST be the first import in the entrypoint so values
 * are present before @vouchfx/config's parseEnv() singleton runs.
 *
 * Real environment variables always win (Fly.io secrets in production).
 * Surrounding single/double quotes on values are stripped.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const envFile = join(__dirname, "..", ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (k && !(k in process.env)) process.env[k] = v;
  }
}
