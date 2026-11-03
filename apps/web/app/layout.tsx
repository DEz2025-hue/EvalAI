import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import AppShell from "../components/AppShell";

export const metadata: Metadata = {
  title: "EvalAI — Assessments & Inspections",
  description: "Solar and CCTV site assessments, inspections, evidence, and reports.",
};

// The browser bar follows the page colour: Soft White in light mode, Charcoal in dark mode.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F6F6" },
    { media: "(prefers-color-scheme: dark)", color: "#151515" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
