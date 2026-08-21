import type { Metadata } from "next";
import "./globals.css";

const TITLE = "Context Budget Lab";
const DESCRIPTION =
  "See what an AI coding agent actually reads. Measures context selection against grep and send-everything baselines, and finds the smallest budget that still retrieves the answer.";
const SITE = "https://context-budget-lab.vercel.app";

/**
 * The page shipped with a title and a description and no Open Graph tags at
 * all, so every crawler that builds a preview card had nothing to build one
 * from. That is not cosmetic: LinkedIn refuses such a URL outright with
 * "please enter a valid link", and anywhere else it renders as a bare string.
 *
 * metadataBase is what resolves the opengraph-image route to an absolute URL.
 * Without it Next emits a relative og:image and crawlers ignore it.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE,
    siteName: TITLE,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-neutral-950 antialiased">{children}</body>
    </html>
  );
}
