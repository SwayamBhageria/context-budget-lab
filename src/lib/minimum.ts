import type { Repo, Selected } from "./types";
import { select } from "./select";

/** A location that must be retrieved. Either from the benchmark, or marked by
 *  the person asking — who can see which chunk answers their own question. */
export interface TargetAnchor {
  path: string;
  /** 1-indexed, as grep reports it. */
  line: number;
}

export interface MinimumResult {
  found: boolean;
  minBudget: number | null;
  tokensUsed: number | null;
  probes: number;
  /** Where the anchors came from, so a number is never read as more than it is. */
  source: "benchmark" | "user-marked";
}

export function covers(kept: Selected[], a: TargetAnchor): boolean {
  const zero = a.line - 1;
  return kept.some(
    (k) => k.chunk.path === a.path && k.chunk.startLine <= zero && zero < k.chunk.endLine,
  );
}

/**
 * Smallest budget at which every anchor is retrieved.
 *
 * Binary search is sound only because packing is a prefix of a budget-independent
 * priority order, which makes retrieval monotone in budget. It was not always:
 * best-fit packing let a larger budget displace chunks a smaller one had found,
 * and a search over that returns an arbitrary answer.
 */
export function findMinimumBudget(
  repo: Repo,
  question: string,
  anchors: TargetAnchor[],
  graph: { out: Map<string, Set<string>>; incoming: Map<string, Set<string>> },
  ceiling: number,
  source: MinimumResult["source"],
): MinimumResult {
  let probes = 0;
  const ok = (budget: number) => {
    probes++;
    const r = select(repo, question, budget, graph);
    return { hit: anchors.every((a) => covers(r.kept, a)), used: r.selectedTokens };
  };

  const top = ok(ceiling);
  if (!top.hit) return { found: false, minBudget: null, tokensUsed: null, probes, source };

  let lo = 0;
  let hi = ceiling;
  while (hi - lo > 64) {
    const mid = Math.floor((lo + hi) / 2);
    if (ok(mid).hit) hi = mid;
    else lo = mid;
  }

  // Re-probe at the converged budget rather than reporting whichever probe
  // happened to succeed last. Carrying the last success made the figure depend
  // on the probe sequence: clsx reported 896 tokens under a 64,000 ceiling and
  // 1,668 under a 3,258 one, for the same converged threshold.
  const settled = ok(hi);
  return { found: true, minBudget: hi, tokensUsed: settled.used, probes, source };
}
