/**
 * MetaApi provisioning helpers — REST API calls for account creation/deletion.
 *
 * These are used only in Next.js API routes (server-side). The METAAPI_TOKEN
 * is never logged or returned to the client.
 *
 * MetaApi stores the user's MT5 credentials. We only store the account ID.
 */

const PROVISION_BASE = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";

export type MetaApiRegion = "new-york" | "london" | "singapore" | "sydney" | "frankfurt";
export type MtPlatform = "mt5" | "mt4";

export interface CreateAccountParams {
  token: string;
  login: string;
  password: string;
  server: string;
  name: string;
  platform: MtPlatform;
  region: MetaApiRegion;
}

export interface MetaApiAccountState {
  state: string;           // DEPLOYING | DEPLOYED | UNDEPLOYED | DEPLOY_FAILED | ERROR
  connectionStatus: string; // CONNECTED | DISCONNECTED | DISCONNECTED_FROM_BROKER
}

/** Map MetaApi state to our simple status string. */
export function mapMetaApiStatus(
  state: string,
  connectionStatus: string
): "deploying" | "connected" | "disconnected" | "error" {
  if (state === "DEPLOY_FAILED" || state === "ERROR") return "error";
  if (state !== "DEPLOYED") return "deploying";
  if (connectionStatus === "CONNECTED") return "connected";
  return "disconnected";
}

/**
 * Create a new MetaApi cloud account for an MT5/MT4 broker login.
 * Returns the MetaApi account ID (store this in broker_connections).
 * The login/password are passed to MetaApi but never stored by VouchFX.
 */
export async function createMetaApiAccount(params: CreateAccountParams): Promise<string> {
  const res = await fetch(`${PROVISION_BASE}/users/current/accounts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "auth-token": params.token,
    },
    body: JSON.stringify({
      login: params.login,
      password: params.password,
      server: params.server,
      name: params.name,
      platform: params.platform,
      type: "cloud-g2",
      magic: 0,
      application: "MetaApi",
      region: params.region,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`MetaApi account creation failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { id: string };
  return data.id;
}

/**
 * Remove a MetaApi account. 404 is treated as already deleted (idempotent).
 */
export async function deleteMetaApiAccount(token: string, accountId: string): Promise<void> {
  const res = await fetch(`${PROVISION_BASE}/users/current/accounts/${accountId}`, {
    method: "DELETE",
    headers: { "auth-token": token },
  });
  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`MetaApi account deletion failed (${res.status}): ${body}`);
  }
}

/**
 * Fetch the current deployment and connection state from MetaApi.
 */
export async function getMetaApiAccountState(
  token: string,
  accountId: string
): Promise<MetaApiAccountState> {
  const res = await fetch(`${PROVISION_BASE}/users/current/accounts/${accountId}`, {
    headers: { "auth-token": token },
    // Short cache — status polling should reflect current state
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`MetaApi status fetch failed (${res.status})`);
  }
  const data = (await res.json()) as MetaApiAccountState;
  return { state: data.state ?? "UNKNOWN", connectionStatus: data.connectionStatus ?? "DISCONNECTED" };
}
