import { readFileSync } from "node:fs";
import { buildGraph } from "../src/lib/ingest/graph";
import { grepBaseline } from "../src/lib/select/baseline";
import { select } from "../src/lib/select";
import { BENCHMARK } from "../src/lib/benchmark";
import { findMinimumBudget } from "../src/lib/minimum";

const cache = new Map<string, any>();
function repoFor(slug: string) {
  if (!cache.has(slug)) {
    const fx = JSON.parse(readFileSync(`src/fixtures/${slug.replace("/", "__")}.json`, "utf8"));
    cache.set(slug, { repo: fx.repo, graph: buildGraph(fx.repo.files) });
  }
  return cache.get(slug);
}

console.log(
  "question".padEnd(52) + "repo".padStart(8) + "minCtx".padStart(8) +
    "grep".padStart(8) + "vs grep".padStart(9) + "probes".padStart(8),
);
console.log("-".repeat(95));

for (const c of BENCHMARK) {
  const { repo, graph } = repoFor(c.slug);
  const m = findMinimumBudget(repo, c, graph, 64000);
  const at = m.found ? m.minBudget! : 64000;
  const r = select(repo, c.question, at, graph);
  const g = grepBaseline(repo, c.question, r.kept.map((k) => k.chunk.path));
  const ratio = m.found && g.bestTokens > 0 ? (g.bestTokens / m.tokensUsed!).toFixed(1) + "x" : "—";
  const tag = c.quarantined ? " [Q]" : c.expectation === "expected-hard" ? " [hard]" : "";
  console.log(
    (c.question.slice(0, 48) + tag).padEnd(52) +
      String(repo.naiveTokens).padStart(8) +
      (m.found ? String(m.tokensUsed) : "NEVER").padStart(8) +
      String(g.bestTokens).padStart(8) +
      ratio.padStart(9) +
      String(m.probes).padStart(8),
  );
}
