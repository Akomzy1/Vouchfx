/**
 * Client-side Web Push helpers (VCH-PWA-03/04). Browser-only.
 *
 * Permission is requested IN-CONTEXT (when the user enables push in Settings),
 * never on first load. iOS only delivers push to an installed PWA, so callers
 * must check `isIOS && !isStandalone` and guide "Add to Home Screen" first.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export interface PushState {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  /** True when push genuinely can't work yet (iOS Safari tab, before install). */
  needsInstall: boolean;
}

function base64UrlToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && "ontouchend" in document);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari exposes this non-standard flag for home-screen apps
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    !!VAPID_PUBLIC_KEY
  );
}

/** Register the service worker (idempotent). Safe to call on every load. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

export async function getPushState(): Promise<PushState> {
  const ios = isIOS();
  const standalone = isStandalone();
  const supported = pushSupported();

  if (!supported) {
    return {
      supported: false,
      permission: "unsupported",
      subscribed: false,
      isIOS: ios,
      isStandalone: standalone,
      needsInstall: ios && !standalone,
    };
  }

  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;

  return {
    supported: true,
    permission: Notification.permission,
    subscribed: !!sub,
    isIOS: ios,
    isStandalone: standalone,
    needsInstall: ios && !standalone,
  };
}

/**
 * Request permission, subscribe this device, and persist it server-side.
 * Returns true on success. Throws with a readable message on hard failures.
 */
export async function subscribeToPush(): Promise<boolean> {
  if (!pushSupported()) throw new Error("Push notifications aren't supported in this browser.");
  if (isIOS() && !isStandalone()) {
    throw new Error('On iPhone/iPad, add VouchFX to your Home Screen first, then enable push from there.');
  }

  const reg = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
  if (!reg) throw new Error("Could not register the service worker.");
  await navigator.serviceWorker.ready;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted.");

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(VAPID_PUBLIC_KEY),
  });

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });
  if (!res.ok) {
    await sub.unsubscribe().catch(() => undefined);
    const b = await res.json().catch(() => null);
    throw new Error(b?.error ?? "Could not save the subscription.");
  }
  return true;
}

/** Unsubscribe this device locally and remove it server-side. */
export async function unsubscribeFromPush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => undefined);
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    }).catch(() => undefined);
  }
}

/** Send a test push to confirm delivery (called right after enabling). */
export async function sendTestPush(): Promise<void> {
  await fetch("/api/push/test", { method: "POST" }).catch(() => undefined);
}
