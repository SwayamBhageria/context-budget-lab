import { readFileSync } from "node:fs";
import { buildGraph } from "../src/lib/ingest/graph";
import { select } from "../src/lib/select";
import { BENCHMARK, measureCase } from "../src/lib/benchmark";

/** Retrieval must never lose ground as the budget grows, or binary search lies. */
let bad = 0;
for (const c of BENCHMARK) {
  const repo = JSON.parse(readFileSync(`src/fixtures/${c.slug.replace("/", "__")}.json`, "utf8")).repo;
  const graph = buildGraph(repo.files);
  let prev = -1;
  for (let b = 200; b <= Math.min(repo.naiveTokens, 120000); b = Math.ceil(b * 1.35)) {
    const got = measureCase(c, select(repo, c.question, b, graph).kept).found;
    if (got < prev) { console.log(`NON-MONOTONE ${c.question.slice(0,40)} at ${b}: ${prev} -> ${got}`); bad++; }
    prev = got;
  }
}
console.log(bad === 0 ? "monotone across all cases and budgets" : `${bad} violations`);
