import { readFileSync } from "node:fs";
import { buildGraph } from "../src/lib/ingest/graph";
import { select } from "../src/lib/select";

const fx = JSON.parse(readFileSync("src/fixtures/pmndrs__zustand.json", "utf8"));
const graph = buildGraph(fx.repo.files);
const q = "how does shallow compare Maps and Sets?";
const TARGET = "src/vanilla/shallow.ts";

let prev = new Set<string>();
for (const b of [200, 400, 800]) {
  const r = select(fx.repo, q, b, graph);
  const ids = new Set(r.kept.map((k) => k.chunk.id));
  const lost = [...prev].filter((i) => !ids.has(i));
  console.log(
    `budget=${b} used=${r.selectedTokens} kept=${r.kept.length} ` +
      `hasTarget=${r.kept.some((k) => k.chunk.path === TARGET)} LOST=${lost.length}`,
  );
  for (const l of lost.slice(0, 4)) console.log(`    lost: ${l}`);
  for (const k of r.kept.slice(0, 5))
    console.log(`    keep: ${k.chunk.id} ${k.chunk.tokens}t h${k.hops} score=${k.score.toFixed(3)}`);
  prev = ids;
}
