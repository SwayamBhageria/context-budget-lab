import { readFileSync } from "node:fs";
import { pipeline } from "@xenova/transformers";

/**
 * Does an embedding retriever actually answer the question BM25 cannot?
 *
 * Claimed in the app that it would. Untested claims are how the four inflated
 * numbers got in, so this measures it: same chunks, same question, cosine
 * similarity instead of lexical scoring, and the same line anchors deciding
 * whether the answer was reached.
 */
const ANCHORS = [
  { path: "src/react.ts", line: 30 },
  { path: "src/vanilla.ts", line: 79 },
];
const QUESTION = "why might a component not re-render after a state change?";

function cosine(a: Float32Array, b: Float32Array) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / (Math.sqrt(na) * Math.sqrt(nb));
}

async function main() {
  const fx = JSON.parse(readFileSync("src/fixtures/pmndrs__zustand.json", "utf8"));
  const chunks = fx.repo.chunks as { id: string; path: string; startLine: number; endLine: number; tokens: number; text: string }[];
  console.log(`embedding ${chunks.length} chunks…`);

  const embed = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  const vec = async (t: string) => {
    const o = await embed(t.slice(0, 2000), { pooling: "mean", normalize: true });
    return o.data as Float32Array;
  };

  const q = await vec(QUESTION);
  const scored: { c: (typeof chunks)[0]; s: number }[] = [];
  for (let i = 0; i < chunks.length; i++) {
    scored.push({ c: chunks[i], s: cosine(q, await vec(chunks[i].text)) });
    if (i % 150 === 0) process.stdout.write(".");
  }
  console.log();

  scored.sort((a, b) => b.s - a.s);
  console.log("\ntop 10 by cosine similarity:");
  for (const { c, s } of scored.slice(0, 10)) {
    const hit = ANCHORS.some((a) => c.path === a.path && c.startLine <= a.line - 1 && a.line - 1 < c.endLine);
    console.log(`  ${s.toFixed(3)} ${hit ? "<<< ANSWER " : "           "}${c.path}:${c.startLine}-${c.endLine} ${c.tokens}t`);
  }

  // Where does each anchor actually rank, and what would it cost to reach it?
  console.log("\nanchor ranks:");
  for (const a of ANCHORS) {
    const idx = scored.findIndex((x) => x.c.path === a.path && x.c.startLine <= a.line - 1 && a.line - 1 < x.c.endLine);
    const cost = idx < 0 ? null : scored.slice(0, idx + 1).reduce((t, x) => t + x.c.tokens, 0);
    console.log(`  ${a.path}:${a.line} -> rank ${idx < 0 ? "NOT FOUND" : idx + 1}${cost ? `, ${cost} tokens to reach it` : ""}`);
  }
}
main().catch((e) => console.error("FAILED:", e.message));
