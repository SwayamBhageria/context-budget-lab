import type { Repo, Selected, SelectionReport, DropReason } from "@/lib/types";
import { scoreChunks } from "./score";
import { neighbours } from "@/lib/ingest/graph";

const MAX_HOPS = 2;
/** Below this a BM25 score is noise, not weak signal. */
const NOISE_FLOOR = 0.35;
/** How many top-scoring chunks seed the graph walk. */
const SEED_COUNT = 12;
/**
 * Expansion scores are scaled to sit strictly below every direct match, so a
 * cheap neighbour can never outrank the code that actually answers the question.
 * Ordering within the expanded tier is all these values need to express.
 */
const SIBLING_WEIGHT = 0.6; // same file as a direct match
const HOP_DECAY = 0.45;     // per hop along the import graph

export function select(
  repo: Repo,
  query: string,
  budget: number,
  graph: { out: Map<string, Set<string>>; incoming: Map<string, Set<string>> },
): SelectionReport {
  const t0 = performance.now();
  const scored = scoreChunks(query, repo.chunks);
  const t1 = performance.now();

  const direct = scored
    .filter((s) => s.score > NOISE_FLOOR)
    .sort((a, b) => b.score - a.score);

  const seedFiles = [...new Set(direct.slice(0, SEED_COUNT).map((s) => s.chunk.path))];
  const hopsByFile = neighbours(seedFiles, graph, MAX_HOPS);
  const t2 = performance.now();

  const directIds = new Set(direct.map((d) => d.chunk.id));
  const weakest = direct.length ? direct[direct.length - 1].score : 1;

  // Everything not directly matching, but reachable from something that did.
  const expanded = scored
    .filter((s) => !directIds.has(s.chunk.id) && hopsByFile.has(s.chunk.path))
    .map((s) => {
      const hops = hopsByFile.get(s.chunk.path)!;
      const weight = hops === 0 ? SIBLING_WEIGHT : SIBLING_WEIGHT * HOP_DECAY ** hops;
      return {
        chunk: s.chunk,
        // Strictly below the weakest direct match, by construction.
        score: weakest * weight,
        hops,
        reason:
          hops === 0
            ? "same file as a match"
            : hops === 1
              ? "imported by / imports a match"
              : `${hops} hops from a match`,
      };
    })
    .sort((a, b) => b.score / b.chunk.tokens - a.score / a.chunk.tokens);

  const kept: Selected[] = [];
  const nearMisses: { chunk: Selected["chunk"]; score: number; reason: DropReason }[] = [];
  let used = 0;

  // Pass 1 — direct matches. These are the answer; they get the budget first.
  const directPacked = direct
    .map((d) => ({
      chunk: d.chunk,
      score: d.score,
      hops: 0,
      reason: d.matched.length ? `matched: ${d.matched.slice(0, 3).join(", ")}` : "matched",
    }))
    .sort((a, b) => b.score / b.chunk.tokens - a.score / a.chunk.tokens);

  for (const c of directPacked) {
    if (used + c.chunk.tokens <= budget) {
      kept.push(c);
      used += c.chunk.tokens;
    } else {
      nearMisses.push({ chunk: c.chunk, score: c.score, reason: "over-budget" });
    }
  }

  // Pass 2 — context to understand pass 1, spending only what's left.
  for (const c of expanded) {
    if (used + c.chunk.tokens <= budget) {
      kept.push(c);
      used += c.chunk.tokens;
    }
  }
  const t3 = performance.now();

  kept.sort((a, b) => b.score - a.score);
  const keptPaths = new Set(kept.map((k) => k.chunk.path));

  return {
    query,
    budget,
    naiveTokens: repo.naiveTokens,
    selectedTokens: used,
    reductionPct: repo.naiveTokens
      ? ((repo.naiveTokens - used) / repo.naiveTokens) * 100
      : 0,
    kept,
    droppedFiles: repo.files.length - keptPaths.size,
    droppedChunks: repo.chunks.length - kept.length,
    nearMisses: nearMisses.sort((a, b) => b.score - a.score).slice(0, 25),
    timings: {
      scoreMs: Math.round(t1 - t0),
      expandMs: Math.round(t2 - t1),
      packMs: Math.round(t3 - t2),
    },
  };
}
