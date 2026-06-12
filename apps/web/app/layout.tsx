import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegister from "@/components/pwa/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: { default: "VouchFX", template: "%s — VouchFX" },
  description: "Your Telegram signals, traded automatically on MT5.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "VouchFX",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0F14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg text-text-primary antialiased font-sans">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
