import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-05-27.dahlia",
  typescript: true,
});

// Price IDs are set per-environment via env vars.
// In development, create prices in the Stripe test dashboard and copy the IDs here.
export const STRIPE_PRICES: Record<"starter" | "pro" | "funded" | "lifetime", string | undefined> = {
  starter:  process.env.STRIPE_PRICE_STARTER_ID,
  pro:      process.env.STRIPE_PRICE_PRO_ID,
  funded:   process.env.STRIPE_PRICE_FUNDED_ID,
  lifetime: process.env.STRIPE_PRICE_LIFETIME_ID,
};

export const PLAN_FROM_PRICE: Record<string, "starter" | "pro" | "funded"> = {};
if (process.env.STRIPE_PRICE_STARTER_ID) PLAN_FROM_PRICE[process.env.STRIPE_PRICE_STARTER_ID] = "starter";
if (process.env.STRIPE_PRICE_PRO_ID)     PLAN_FROM_PRICE[process.env.STRIPE_PRICE_PRO_ID]     = "pro";
if (process.env.STRIPE_PRICE_FUNDED_ID)  PLAN_FROM_PRICE[process.env.STRIPE_PRICE_FUNDED_ID]  = "funded";
