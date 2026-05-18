import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";

/**
 * Self-host Inter (variable axis) via `next/font`. The CSS variable is
 * threaded through `lib/ui/tokens.ts` so every primitive renders with
 * the same stack regardless of where it's imported.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Buendia",
  description: "Host AI-generated single-file HTML apps without absorbing them.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
