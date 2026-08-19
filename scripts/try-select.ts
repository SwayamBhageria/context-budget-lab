import { fetchRepo } from "../src/lib/ingest/github";
import { buildGraph } from "../src/lib/ingest/graph";
import { select } from "../src/lib/select";
import { grepBaseline } from "../src/lib/select/baseline";

async function main() {
  const repo = await fetchRepo("vercel/swr", "HEAD");
  const graph = buildGraph(repo.files);
  const query = "how does revalidation on focus work?";
  const r = select(repo, query, 8000, graph);
  const base = grepBaseline(repo, query, r.kept.map((k) => k.chunk.path));

  console.log(`Q: ${query}\n`);
  console.log(`send everything  ${String(r.naiveTokens).padStart(7)}`);
  console.log(`grep naive       ${String(base.naiveTokens).padStart(7)}  (${base.naiveFiles} files)`);
  console.log(`grep best        ${String(base.bestTokens).padStart(7)}  (${base.bestFiles.length} files, term "${base.bestTerm}")`);
  console.log(`selected         ${String(r.selectedTokens).padStart(7)}  (-${r.reductionPct.toFixed(1)}%)`);
  console.log(`timings          score ${r.timings.scoreMs}ms  expand ${r.timings.expandMs}ms  pack ${r.timings.packMs}ms\n`);
  console.log("KEPT:");
  for (const k of r.kept.slice(0, 12)) {
    console.log(
      `  ${k.chunk.path}:${k.chunk.startLine}-${k.chunk.endLine}`.padEnd(52) +
        `${String(k.chunk.tokens).padStart(5)}t  h${k.hops}  ${k.reason}`,
    );
  }
  console.log(`\n  ...${r.kept.length} chunks kept, ${r.droppedChunks} dropped`);
  console.log(`\nFound but grep could NOT reach (${base.missedByGrep.length}):`);
  for (const p of [...new Set(base.missedByGrep)].slice(0, 8)) console.log(`  ${p}`);
}
main();
