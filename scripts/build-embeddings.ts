import { readFileSync, writeFileSync } from "node:fs";
import { pipeline } from "@xenova/transformers";
import { BENCHMARK } from "../src/lib/benchmark";

/**
 * Precomputes the embedding baseline: how many tokens a dense retriever needs
 * before it reaches the same ground-truth lines.
 *
 * Results are precomputed rather than vectors shipped, because the comparison is
 * only meaningful where ground truth exists — which is exactly the benchmark
 * questions. A dense ranking for a free-typed question could not be scored
 * against anything, so there would be nothing to report.
 *
 * Model: Xenova/all-MiniLM-L6-v2, run locally. No API, no key, no cost.
 */
const MODEL = "Xenova/all-MiniLM-L6-v2";

function cosine(a: Float32Array, b: Float32Array) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i] * b[i]; // both normalized
  return d;
}

async function main() {
  const embed = await pipeline("feature-extraction", MODEL);
  const vec = async (t: string) => {
    const o = await embed(t.slice(0, 2000), { pooling: "mean", normalize: true });
    return o.data as Float32Array;
  };

  const slugs = [...new Set(BENCHMARK.map((c) => c.slug))];
  const out: Record<string, unknown> = {};

  for (const slug of slugs) {
    const fx = JSON.parse(readFileSync(`src/fixtures/${slug.replace("/", "__")}.json`, "utf8"));
    const chunks = fx.repo.chunks as { path: string; startLine: number; endLine: number; tokens: number; text: string }[];
    process.stdout.write(`${slug}: embedding ${chunks.length} chunks`);
    const vs: Float32Array[] = [];
    for (let i = 0; i < chunks.length; i++) {
      vs.push(await vec(chunks[i].text));
      if (i % 100 === 0) process.stdout.write(".");
    }
    console.log();

    for (const c of BENCHMARK.filter((b) => b.slug === slug)) {
      const q = await vec(c.question);
      const ranked = chunks
        .map((ch, i) => ({ ch, s: cosine(q, vs[i]) }))
        .sort((a, b) => b.s - a.s);

      // Tokens a dense retriever must take, best-first, before every anchor is in.
      let deepest = -1;
      const ranks = c.anchors.map((a) => {
        const idx = ranked.findIndex(
          (x) => x.ch.path === a.path && x.ch.startLine <= a.line - 1 && a.line - 1 < x.ch.endLine,
        );
        if (idx > deepest) deepest = idx;
        return { path: a.path, line: a.line, rank: idx < 0 ? null : idx + 1 };
      });
      const reached = ranks.every((r) => r.rank !== null);
      const minTokens = reached
        ? ranked.slice(0, deepest + 1).reduce((t, x) => t + x.ch.tokens, 0)
        : null;

      out[`${c.slug}|${c.question}`] = {
        model: MODEL,
        reached,
        minTokens,
        ranks,
        topPaths: [...new Set(ranked.slice(0, 5).map((x) => x.ch.path))],
      };
      console.log(
        `  ${reached ? String(minTokens).padStart(7) : " NEVER "}  ${c.question.slice(0, 52)}`,
      );
    }
  }

  writeFileSync("src/fixtures/embedding-baseline.json", JSON.stringify(out, null, 1));
  console.log(`\nwrote ${Object.keys(out).length} cases`);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
