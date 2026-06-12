"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/push";

/**
 * Registers the service worker once on load so push can be received and the app
 * is installable. Does NOT request notification permission — that happens
 * in-context when the user enables push in Settings (VCH-PWA-03).
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    void registerServiceWorker();
  }, []);
  return null;
}
