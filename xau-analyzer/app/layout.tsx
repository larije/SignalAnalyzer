import type { Metadata, Viewport } from "next";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { NotificationProvider } from "./Notifications";
import "./globals.css";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export const metadata: Metadata = {
  title: "Signal Analyzer — BTC & Gold (PAXG)",
  description: "Live, non-repainting BUY / SELL / WAIT signals for Bitcoin and tokenised gold (PAXG) from Binance. Educational tool — not financial advice.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <NotificationProvider>{children}</NotificationProvider>
      </body>
    </html>
  );
}
