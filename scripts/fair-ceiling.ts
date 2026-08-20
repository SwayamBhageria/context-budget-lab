import { readFileSync } from "node:fs";
import { buildGraph } from "../src/lib/ingest/graph";
import { BENCHMARK } from "../src/lib/benchmark";
import { findMinimumBudget } from "../src/lib/minimum";

/** The 64k ceiling was arbitrary and unfair to BM25: embeddings were allowed to
 *  rank the entire repo. Re-run every case with the ceiling set to the repo. */
for (const c of BENCHMARK) {
  const repo = JSON.parse(readFileSync(`src/fixtures/${c.slug.replace("/", "__")}.json`, "utf8")).repo;
  const graph = buildGraph(repo.files);
  const at64 = findMinimumBudget(repo, c.question, c.anchors, graph, 64000, "benchmark");
  const full = findMinimumBudget(repo, c.question, c.anchors, graph, repo.naiveTokens, "benchmark");
  if (at64.found && full.found) continue;
  console.log(
    `${c.question.slice(0, 48).padEnd(50)} repo=${String(repo.naiveTokens).padStart(7)}  ` +
      `@64k=${at64.found ? at64.tokensUsed : "NEVER"}  @full=${full.found ? full.tokensUsed : "NEVER"}`,
  );
}
console.log("(only cases that failed at one ceiling are listed)");
