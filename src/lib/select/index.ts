import type { Repo, Selected, SelectionReport, DropReason } from "@/lib/types";
import { scoreChunks } from "./score";
import { neighbours } from "@/lib/ingest/graph";

/** Score decay per hop away from a directly-matching chunk. */
const HOP_DECAY = 0.5;
const MAX_HOPS = 2;
/** Chunks scoring below this are treated as noise, not weak signal. */
const NOISE_FLOOR = 0.01;
/** How many top-scoring chunks seed the graph walk. */
const SEED_COUNT = 12;

export function select(
  repo: Repo,
  query: string,
  budget: number,
  graph: { out: Map<string, Set<string>>; incoming: Map<string, Set<string>> },
): SelectionReport {
  const t0 = performance.now();
  const scored = scoreChunks(query, repo.chunks);
  const t1 = performance.now();

  // Seeds are the best direct matches; the graph walk starts from their files.
  const direct = scored
    .filter((s) => s.score > NOISE_FLOOR)
    .sort((a, b) => b.score - a.score);
  const seedFiles = [...new Set(direct.slice(0, SEED_COUNT).map((s) => s.chunk.path))];
  const hopsByFile = neighbours(seedFiles, graph, MAX_HOPS);
  const t2 = performance.now();

  // Every chunk gets its best available score: direct match, or a decayed score
  // inherited from being near one. A chunk can qualify both ways — take the max.
  const candidates = scored.map((s) => {
    const hops = hopsByFile.get(s.chunk.path);
    const reachable = hops !== undefined;
    const inherited = reachable ? bestSeedScore(direct) * HOP_DECAY ** hops : 0;
    const isDirect = s.score > NOISE_FLOOR;
    const finalScore = Math.max(s.score, inherited);
    return {
      ...s,
      finalScore,
      hops: isDirect && s.score >= inherited ? 0 : (hops ?? Infinity),
      reason: buildReason(s.matched, isDirect && s.score >= inherited, hops),
    };
  });

  // Pack by value per token — a cheap chunk that scores well beats an expensive
  // one that scores slightly better. Greedy density is the standard knapsack
  // approximation and the error is irrelevant at this granularity.
  const packable = candidates
    .filter((c) => c.finalScore > NOISE_FLOOR)
    .sort((a, b) => b.finalScore / b.chunk.tokens - a.finalScore / a.chunk.tokens);

  const kept: Selected[] = [];
  const nearMisses: { chunk: Selected["chunk"]; score: number; reason: DropReason }[] = [];
  let used = 0;

  for (const c of packable) {
    if (used + c.chunk.tokens <= budget) {
      kept.push({ chunk: c.chunk, score: c.finalScore, reason: c.reason, hops: c.hops });
      used += c.chunk.tokens;
    } else {
      // Scored well enough to belong, lost purely to the ceiling. This is the
      // list the Dropped screen exists to show.
      nearMisses.push({ chunk: c.chunk, score: c.finalScore, reason: "over-budget" });
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
    nearMisses: nearMisses.slice(0, 25),
    timings: {
      scoreMs: Math.round(t1 - t0),
      expandMs: Math.round(t2 - t1),
      packMs: Math.round(t3 - t2),
    },
  };
}

function bestSeedScore(direct: { score: number }[]): number {
  return direct.length ? direct[0].score : 0;
}

function buildReason(matched: string[], isDirect: boolean, hops?: number): string {
  if (isDirect) {
    const shown = matched.slice(0, 3).join(", ");
    return matched.length ? `matched: ${shown}` : "matched the question";
  }
  if (hops === 1) return "imported by a matching file";
  if (hops !== undefined && hops > 1) return `${hops} hops from a match`;
  return "no direct signal";
}
