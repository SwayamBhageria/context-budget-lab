import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Context Budget Lab",
  description:
    "See what an AI coding agent actually reads. Measures context selection against grep and send-everything baselines, and finds the smallest budget that still retrieves the answer.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-neutral-950 antialiased">{children}</body>
    </html>
  );
}
