import { readFileSync } from "node:fs";
import { buildGraph } from "../src/lib/ingest/graph";
import { grepBaseline } from "../src/lib/select/baseline";
import { BENCHMARK } from "../src/lib/benchmark";
import { findMinimumBudget } from "../src/lib/minimum";
import type { Repo } from "../src/lib/types";

/** Same repo with every .md file removed, to see what the docs were doing. */
function codeOnly(repo: Repo): Repo {
  const files = repo.files.filter((f) => !f.path.endsWith(".md"));
  const keep = new Set(files.map((f) => f.path));
  return {
    ...repo,
    files,
    chunks: repo.chunks.filter((c) => keep.has(c.path)),
    naiveTokens: files.reduce((a, f) => a + f.tokens, 0),
  };
}

const cache = new Map<string, Repo>();
function load(slug: string) {
  if (!cache.has(slug))
    cache.set(slug, JSON.parse(readFileSync(`src/fixtures/${slug.replace("/", "__")}.json`, "utf8")).repo);
  return cache.get(slug)!;
}

console.log("question".padEnd(50) + "with md".padStart(9) + "code only".padStart(11) + "  change");
console.log("-".repeat(80));

for (const c of BENCHMARK) {
  const full = load(c.slug);
  const bare = codeOnly(full);
  const a = findMinimumBudget(full, c.question, c.anchors, buildGraph(full.files), 64000, "benchmark");
  const b = findMinimumBudget(bare, c.question, c.anchors, buildGraph(bare.files), 64000, "benchmark");
  const fmt = (m: typeof a) => (m.found ? String(m.tokensUsed) : "NEVER");
  const delta =
    a.found && b.found
      ? `${(((b.tokensUsed! - a.tokensUsed!) / a.tokensUsed!) * 100).toFixed(0)}%`
      : a.found !== b.found
        ? (b.found ? "NOW FOUND" : "NOW LOST")
        : "—";
  console.log(
    (c.question.slice(0, 48) + (c.quarantined ? " [Q]" : "")).padEnd(50) +
      fmt(a).padStart(9) + fmt(b).padStart(11) + "  " + delta,
  );
}

console.log("\nrepo sizes:");
for (const slug of [...new Set(BENCHMARK.map((c) => c.slug))]) {
  const full = load(slug);
  const bare = codeOnly(full);
  console.log(
    `  ${slug.padEnd(16)} ${String(full.naiveTokens).padStart(7)} -> ${String(bare.naiveTokens).padStart(6)} code-only ` +
      `(${((1 - bare.naiveTokens / full.naiveTokens) * 100).toFixed(0)}% is markdown)`,
  );
}
