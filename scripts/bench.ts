import { readFileSync } from "node:fs";
import { buildGraph } from "../src/lib/ingest/graph";
import type { Repo } from "../src/lib/types";
import { select } from "../src/lib/select";
import { grepBaseline } from "../src/lib/select/baseline";
import { BENCHMARK, measureCase } from "../src/lib/benchmark";

const BUDGETS = [1000, 4000, 8000, 16000, 32000];
const cache = new Map<string, { repo: Repo; graph: ReturnType<typeof buildGraph> }>();
function repoFor(slug: string) {
  if (!cache.has(slug)) {
    const fx = JSON.parse(readFileSync(`src/fixtures/${slug.replace("/", "__")}.json`, "utf8"));
    cache.set(slug, { repo: fx.repo, graph: buildGraph(fx.repo.files) });
  }
  return cache.get(slug)!;
}

console.log("case".padEnd(58) + BUDGETS.map((b) => `${b / 1000}k`.padStart(7)).join(""));
console.log("-".repeat(58 + 7 * BUDGETS.length));

const headline: number[][] = BUDGETS.map(() => []);

for (const c of BENCHMARK) {
  const { repo, graph } = repoFor(c.slug);
  const row: string[] = [];
  BUDGETS.forEach((b, i) => {
    const r = select(repo, c.question, b, graph);
    const m = measureCase(c, r.kept);
    row.push(`${m.recallPct.toFixed(0)}%`.padStart(7));
    if (!c.quarantined) headline[i].push(m.recallPct);
  });
  const tag = c.quarantined ? " [QUARANTINED]" : c.expectation === "expected-hard" ? " [hard]" : "";
  console.log((`${c.slug.split("/")[1]}: ${c.question}`.slice(0, 56) + tag).padEnd(58) + row.join(""));
}

console.log("-".repeat(58 + 7 * BUDGETS.length));
console.log(
  "MEAN RECALL (quarantined excluded)".padEnd(58) +
    headline.map((v) => `${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(0)}%`.padStart(7)).join(""),
);

console.log("\n--- token cost at 8k budget ---");
for (const c of BENCHMARK) {
  const { repo, graph } = repoFor(c.slug);
  const r = select(repo, c.question, 8000, graph);
  const g = grepBaseline(repo, c.question, r.kept.map((k) => k.chunk.path));
  console.log(
    `${c.slug.split("/")[1].padEnd(9)} all=${String(repo.naiveTokens).padStart(7)} ` +
      `grepBest=${String(g.bestTokens).padStart(7)} (\"${g.bestTerm}\") sel=${String(r.selectedTokens).padStart(6)}`,
  );
}
