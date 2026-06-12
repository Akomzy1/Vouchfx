import type { MetadataRoute } from "next";

/**
 * Web App Manifest (VCH-PWA-01) — makes VouchFX installable on
 * Android / iOS / desktop. Light PWA: installability + push only, no offline.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VouchFX",
    short_name: "VouchFX",
    description: "Your Telegram signals, traded automatically on MT5.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#0B0F14",
    theme_color: "#0B0F14",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
