import type { Repo } from "@/lib/types";
import { tokenize, STOPWORDS } from "./score";

/**
 * The grep baseline.
 *
 * Beating "send the whole repo" is arithmetic. Beating grep is a claim worth
 * making, because grep-then-open-the-file is what an engineer — or an agent with
 * no index — actually does.
 *
 * Two variants are reported, because only one of them is a fair fight:
 *
 *   naive  — every file containing ANY query term. This is what a careless
 *            search does, and on a large repo a common word like "state" drags
 *            in nearly everything. Reported for contrast, not as the benchmark.
 *
 *   best   — files containing only the single most SELECTIVE query term. This is
 *            what someone competent does: pick the most distinctive word and
 *            search for that. It is the honest baseline, and the one the
 *            headline comparison uses.
 *
 * Measuring against `best` is the point. A win over `naive` would prove nothing
 * except that we chose a weak opponent.
 */
export interface BaselineResult {
  naiveTokens: number;
  naiveFiles: number;
  bestTokens: number;
  bestFiles: string[];
  /** The term a competent grep would have used. */
  bestTerm: string | null;
  /** Files our selector reached that the best-case grep could not. */
  missedByGrep: string[];
}

export function grepBaseline(
  repo: Repo,
  query: string,
  selectedPaths: string[],
): BaselineResult {
  // Stopwords must go before selectivity is measured. "does" appears in only two
  // files of swr, which would make it look like the most selective term in the
  // question — but nobody greps "does" to find focus revalidation. Rarity is
  // only a proxy for distinctiveness once the filler words are gone.
  const terms = [...new Set(tokenize(query))].filter(
    (t) => t.length > 3 && !STOPWORDS.has(t),
  );

  // Files per term, so selectivity is measured rather than assumed.
  const hitsByTerm = new Map<string, string[]>();
  for (const term of terms) {
    const hits = repo.files
      .filter((f) => f.text.toLowerCase().includes(term))
      .map((f) => f.path);
    if (hits.length > 0) hitsByTerm.set(term, hits);
  }

  const union = new Set<string>();
  for (const hits of hitsByTerm.values()) for (const h of hits) union.add(h);

  // Most selective = fewest files, which is what a person would land on after
  // one over-broad search.
  let bestTerm: string | null = null;
  let bestHits: string[] = [];
  for (const [term, hits] of hitsByTerm) {
    if (bestTerm === null || hits.length < bestHits.length) {
      bestTerm = term;
      bestHits = hits;
    }
  }

  const tokensFor = (paths: string[]) => {
    const set = new Set(paths);
    return repo.files.reduce((a, f) => (set.has(f.path) ? a + f.tokens : a), 0);
  };

  const bestSet = new Set(bestHits);
  return {
    naiveTokens: tokensFor([...union]),
    naiveFiles: union.size,
    bestTokens: tokensFor(bestHits),
    bestFiles: bestHits,
    bestTerm,
    missedByGrep: [...new Set(selectedPaths)].filter((p) => !bestSet.has(p)),
  };
}
