/*
 * VouchFX service worker — LIGHT PWA (VCH-PWA-02).
 *
 * Push notifications + installability ONLY. There is deliberately NO `fetch`
 * handler and NO Cache Storage usage: API responses, routes, and trade data are
 * NEVER cached. This worker exists solely to receive push events while the app
 * is closed and to make the app installable.
 */

// Activate immediately on install/update so push works without a reload.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Incoming push → show a notification.
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_e) {
    payload = { title: "VouchFX", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "VouchFX";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    tag: payload.event || "vouchfx",
    data: { url: payload.url || "/dashboard" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Click → focus an existing tab or open the target route.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return undefined;
    })
  );
});
