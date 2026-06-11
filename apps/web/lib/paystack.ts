/**
 * Paystack API helper — uses native fetch, no npm SDK needed.
 * All monetary values are in kobo (1 NGN = 100 kobo).
 */
import { createHmac } from "crypto";

const BASE = "https://api.paystack.co";

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");
  return key;
}

async function paystackPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json() as { status: boolean; message: string; data: T };
  if (!json.status) throw new Error(`Paystack error: ${json.message}`);
  return json.data;
}

export interface InitializeResult {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export async function initializeTransaction(params: {
  email: string;
  planCode?: string;     // recurring plan
  amountKobo?: number;   // one-off (omit for plan-based)
  metadata: Record<string, unknown>;
  callbackUrl: string;
}): Promise<InitializeResult> {
  const body: Record<string, unknown> = {
    email: params.email,
    callback_url: params.callbackUrl,
    metadata: params.metadata,
  };
  if (params.planCode) {
    body.plan  = params.planCode;
    body.amount = 0; // amount is overridden by the plan
  } else if (params.amountKobo !== undefined) {
    body.amount = params.amountKobo;
  }
  return paystackPost<InitializeResult>("/transaction/initialize", body);
}

export interface VerifyResult {
  status: string; // "success" | "failed" | "abandoned"
  reference: string;
  amount: number; // kobo
  customer: { email: string; customer_code: string };
  plan?: { plan_code: string; name: string };
  subscription_code?: string;
  metadata?: Record<string, unknown>;
}

export async function verifyTransaction(reference: string): Promise<VerifyResult> {
  const res = await fetch(`${BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey()}` },
  });
  const json = await res.json() as { status: boolean; message: string; data: VerifyResult };
  if (!json.status) throw new Error(`Paystack verify error: ${json.message}`);
  return json.data;
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) return false;
  const expected = createHmac("sha512", key).update(rawBody).digest("hex");
  return expected === signature;
}

// Paystack plan code → VouchFX plan name
export function planFromCode(code: string): "starter" | "pro" | "funded" | null {
  const map: Record<string, "starter" | "pro" | "funded"> = {};
  if (process.env.PAYSTACK_PLAN_STARTER_CODE) map[process.env.PAYSTACK_PLAN_STARTER_CODE] = "starter";
  if (process.env.PAYSTACK_PLAN_PRO_CODE)     map[process.env.PAYSTACK_PLAN_PRO_CODE]     = "pro";
  if (process.env.PAYSTACK_PLAN_FUNDED_CODE)  map[process.env.PAYSTACK_PLAN_FUNDED_CODE]  = "funded";
  return map[code] ?? null;
}

export const PAYSTACK_PLAN_CODES: Record<"starter" | "pro" | "funded", string | undefined> = {
  starter: process.env.PAYSTACK_PLAN_STARTER_CODE,
  pro:     process.env.PAYSTACK_PLAN_PRO_CODE,
  funded:  process.env.PAYSTACK_PLAN_FUNDED_CODE,
};

export interface PaystackTransaction {
  id: number;
  status: string; // "success" | "failed" | "abandoned"
  reference: string;
  amount: number; // kobo
  currency: string;
  paid_at: string | null;
  created_at: string;
  plan: { name: string; plan_code: string } | null;
  authorization: {
    channel: string;
    card_type: string | null;
    last4: string | null;
    brand: string | null;
    bank: string | null;
  } | null;
  metadata: Record<string, unknown> | null;
}

/** List transactions for a Paystack customer code. Returns [] on any error. */
export async function listTransactions(
  customerCode: string,
  limit = 50
): Promise<PaystackTransaction[]> {
  try {
    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key) return [];
    const res = await fetch(
      `${BASE}/transaction?customer=${encodeURIComponent(customerCode)}&perPage=${limit}`,
      { headers: { Authorization: `Bearer ${key}` }, next: { revalidate: 0 } }
    );
    const json = await res.json() as { status: boolean; data: PaystackTransaction[] };
    return json.status ? (json.data ?? []) : [];
  } catch {
    return [];
  }
}
