import { ImageResponse } from "next/og";

export const alt = "Context Budget Lab — a retrieval benchmark for AI coding agents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Rendered at build time rather than shipped as a binary, so the numbers on the
 * card cannot drift out of sync with the repository the way a hand-exported PNG
 * does. Every element is flex because Satori supports no other layout mode.
 */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0a0a0a",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 68, color: "#ffffff", letterSpacing: "-0.02em" }}>Context Budget Lab</div>
          <div style={{ fontSize: 32, color: "#a3a3a3", marginTop: 24, lineHeight: 1.35, maxWidth: 940 }}>
            See what an AI coding agent actually reads — and whether what it read
            contained the answer.
          </div>
        </div>

        <div style={{ display: "flex", gap: 64 }}>
          {[
            ["6 of 9", "questions beat best-case grep"],
            ["5 repos", "4 languages, 2k–316k tokens"],
            ["0", "API keys required"],
          ].map(([big, small]) => (
            <div key={big} style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 44, color: "#34d399" }}>{big}</div>
              <div style={{ fontSize: 22, color: "#737373", marginTop: 8 }}>{small}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
