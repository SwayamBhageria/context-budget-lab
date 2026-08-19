import type { Repo } from "@/lib/types";
import { tokenize } from "./score";

/**
 * The grep baseline — the comparison that actually matters.
 *
 * Beating "send the whole repo" is arithmetic. Beating grep is a claim, because
 * grep-then-read-the-file is roughly what a coding agent does when it has no
 * index. This models that honestly: take the question's distinctive words, find
 * every file containing any of them, and include those files *whole* — because
 * grep gives you a line, and an agent reading that hit pulls the file around it.
 *
 * What grep structurally cannot do is follow a call to its definition. That gap
 * is the entire argument for the graph walk, and this function exists to measure
 * it rather than assert it.
 */
export interface BaselineResult {
  tokens: number;
  files: string[];
  /** Files our selector found that grep could not reach at all. */
  missedByGrep: string[];
}

export function grepBaseline(
  repo: Repo,
  query: string,
  selectedPaths: string[],
): BaselineResult {
  const terms = [...new Set(tokenize(query))].filter((t) => t.length > 3);
  const hits: string[] = [];
  let tokens = 0;

  for (const file of repo.files) {
    const haystack = file.text.toLowerCase();
    if (terms.some((t) => haystack.includes(t))) {
      hits.push(file.path);
      tokens += file.tokens;
    }
  }

  const grepSet = new Set(hits);
  return {
    tokens,
    files: hits,
    missedByGrep: selectedPaths.filter((p) => !grepSet.has(p)),
  };
}
