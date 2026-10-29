import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import AppShell from "../components/AppShell";

export const metadata: Metadata = {
  title: "EvalAI — Assessments & Inspections",
  description: "Solar and CCTV site assessments, inspections, evidence, and reports.",
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
