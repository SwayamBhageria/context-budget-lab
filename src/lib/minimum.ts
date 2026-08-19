import type { Repo } from "./types";
import { select } from "./select";
import { measureCase, type BenchmarkCase } from "./benchmark";

/**
 * The smallest budget at which every anchor for a question is retrieved.
 *
 * Binary search is only sound because packing is a prefix of a budget-independent
 * priority order, which makes retrieval monotone in budget. It was not always:
 * best-fit packing let a larger budget displace chunks a smaller one had found,
 * and searching over that would return an arbitrary answer.
 */
export interface MinimumResult {
  found: boolean;
  minBudget: number | null;
  tokensUsed: number | null;
  probes: number;
}

export function findMinimumBudget(
  repo: Repo,
  c: BenchmarkCase,
  graph: { out: Map<string, Set<string>>; incoming: Map<string, Set<string>> },
  ceiling: number,
): MinimumResult {
  let probes = 0;
  const fullRecallAt = (budget: number) => {
    probes++;
    const r = select(repo, c.question, budget, graph);
    return { ok: measureCase(c, r.kept).recallPct === 100, used: r.selectedTokens };
  };

  const top = fullRecallAt(ceiling);
  if (!top.ok) return { found: false, minBudget: null, tokensUsed: null, probes };

  let lo = 0;
  let hi = ceiling;
  let bestUsed = top.used;
  while (hi - lo > 64) {
    const mid = Math.floor((lo + hi) / 2);
    const r = fullRecallAt(mid);
    if (r.ok) {
      hi = mid;
      bestUsed = r.used;
    } else {
      lo = mid;
    }
  }
  return { found: true, minBudget: hi, tokensUsed: bestUsed, probes };
}
