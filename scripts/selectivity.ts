import { readFileSync } from "node:fs";
import { buildGraph } from "../src/lib/ingest/graph";
import type { Repo } from "../src/lib/types";
import { grepBaseline } from "../src/lib/select/baseline";
import { BENCHMARK } from "../src/lib/benchmark";
import { findMinimumBudget } from "../src/lib/minimum";

/**
 * Does the selector's advantage track repo size, or query vocabulary?
 *
 * grepShare — the fraction of the repo the single most selective query term
 * pulls in — is a direct measure of whether a distinctive term exists at all.
 * If advantage tracks that rather than repo size, then both methods live or die
 * on the same signal and the honest claim is much narrower than "3.4x better".
 */
const cache = new Map<string, { repo: Repo; graph: ReturnType<typeof buildGraph> }>();
function load(slug: string) {
  if (!cache.has(slug)) {
    const repo = JSON.parse(readFileSync(`src/fixtures/${slug.replace("/", "__")}.json`, "utf8")).repo;
    cache.set(slug, { repo, graph: buildGraph(repo.files) });
  }
  return cache.get(slug)!;
}

const rows = BENCHMARK.filter((c) => !c.quarantined).map((c) => {
  const { repo, graph } = load(c.slug);
  const m = findMinimumBudget(repo, c.question, c.anchors, graph, repo.naiveTokens, "benchmark");
  const g = grepBaseline(repo, c.question, []);
  return {
    q: c.question,
    repoTokens: repo.naiveTokens,
    grepShare: g.bestTokens / repo.naiveTokens,
    term: g.bestTerm,
    min: m.found ? m.tokensUsed! : null,
    adv: m.found ? g.bestTokens / m.tokensUsed! : null,
  };
});

rows.sort((a, b) => a.grepShare - b.grepShare);

console.log(
  "grepShare".padStart(10) + "term".padStart(22) + "repo".padStart(9) + "minCtx".padStart(9) + "adv".padStart(7) + "  question",
);
console.log("-".repeat(100));
for (const r of rows) {
  console.log(
    `${(r.grepShare * 100).toFixed(1)}%`.padStart(10) +
      String(r.term).padStart(22) +
      String(r.repoTokens).padStart(9) +
      (r.min === null ? "NEVER" : String(r.min)).padStart(9) +
      (r.adv === null ? "—" : r.adv.toFixed(1) + "x").padStart(7) +
      "  " + r.q.slice(0, 44),
  );
}

const solved = rows.filter((r) => r.min !== null);
const failed = rows.filter((r) => r.min === null);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
console.log(
  `\nsolved (${solved.length}): mean grepShare ${(mean(solved.map((r) => r.grepShare)) * 100).toFixed(1)}%` +
    `, mean repo ${Math.round(mean(solved.map((r) => r.repoTokens))).toLocaleString()} tokens`,
);
console.log(
  `failed (${failed.length}): mean grepShare ${(mean(failed.map((r) => r.grepShare)) * 100).toFixed(1)}%` +
    `, mean repo ${Math.round(mean(failed.map((r) => r.repoTokens))).toLocaleString()} tokens`,
);
