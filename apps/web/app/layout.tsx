import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "VouchFX", template: "%s — VouchFX" },
  description: "Your Telegram signals, traded automatically on MT5.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg text-text-primary antialiased font-sans">{children}</body>
    </html>
  );
}
