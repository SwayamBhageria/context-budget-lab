/** A contiguous slice of one file, the unit we select over. */
export interface Chunk {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  text: string;
  /** Exact token count from Anthropic count_tokens, baked at ingest time. */
  tokens: number;
  /** Symbols this chunk appears to define (function/class/const names). */
  defines: string[];
}

export interface RepoFile {
  path: string;
  text: string;
  tokens: number;
  /** Paths this file imports, resolved to repo-relative where possible. */
  imports: string[];
}

export interface Repo {
  slug: string;
  ref: string;
  files: RepoFile[];
  chunks: Chunk[];
  /** Total tokens of every file concatenated — the "send everything" baseline. */
  naiveTokens: number;
  /** What fraction of the repository's source actually made it into the index. */
  coverage?: {
    indexedBytes: number;
    seenBytes: number;
    pct: number;
    skippedByExt: Record<string, number>;
  };
}

export type DropReason =
  | "over-budget"
  | "no-lexical-signal"
  | "no-path-to-query";

export interface Selected {
  chunk: Chunk;
  score: number;
  /** Why this chunk earned its place, in plain words for the UI. */
  reason: string;
  /** 0 = matched the query directly, 1+ = pulled in via the import graph. */
  hops: number;
}

export interface SelectionReport {
  query: string;
  budget: number;
  naiveTokens: number;
  selectedTokens: number;
  reductionPct: number;
  kept: Selected[];
  droppedFiles: number;
  droppedChunks: number;
  /**
   * Total tokens of every chunk scoring above the noise floor — the budget at
   * which the selector stops having to drop anything it rated a direct match.
   * Below it you are cutting matches; above it you are only buying neighbouring
   * context. Computable for ANY question because it describes the selector's own
   * confidence, not correctness — it is not evidence the answer was retrieved.
   */
  saturationTokens: number;
  /** Populated when the budget forced out a chunk that scored well. */
  nearMisses: { chunk: Chunk; score: number; reason: DropReason }[];
  timings: { scoreMs: number; expandMs: number; packMs: number };
}
