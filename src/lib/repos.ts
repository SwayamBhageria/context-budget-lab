import type { Repo } from "./types";
import { buildGraph } from "./ingest/graph";
import clsx from "@/fixtures/lukeed__clsx.json";
import swr from "@/fixtures/vercel__swr.json";
import zustand from "@/fixtures/pmndrs__zustand.json";

/**
 * Repositories are indexed at build time and shipped as fixtures rather than
 * fetched per request. Two reasons: the deployed demo must not depend on
 * GitHub's availability or its unauthenticated rate limit, and the numbers a
 * reviewer sees must be the numbers that were measured, not whatever HEAD
 * happens to be that morning. Each fixture records the ref it was built from.
 */
const RAW = [clsx, swr, zustand] as unknown as {
  slug: string;
  question: string;
  budget: number;
  note: string;
  repo: Repo;
}[];

export interface LoadedRepo {
  slug: string;
  note: string;
  defaultQuestion: string;
  defaultBudget: number;
  repo: Repo;
  graph: ReturnType<typeof buildGraph>;
  /** Tokens excluding markdown — reported because docs dominate some repos. */
  codeTokens: number;
}

const cache = new Map<string, LoadedRepo>();

export function loadRepo(slug: string): LoadedRepo | null {
  if (cache.has(slug)) return cache.get(slug)!;
  const raw = RAW.find((r) => r.slug === slug);
  if (!raw) return null;
  const loaded: LoadedRepo = {
    slug: raw.slug,
    note: raw.note,
    defaultQuestion: raw.question,
    defaultBudget: raw.budget,
    repo: raw.repo,
    graph: buildGraph(raw.repo.files),
    codeTokens: raw.repo.files
      .filter((f) => !f.path.endsWith(".md"))
      .reduce((a, f) => a + f.tokens, 0),
  };
  cache.set(slug, loaded);
  return loaded;
}

export function listRepos() {
  return RAW.map((r) => ({
    slug: r.slug,
    note: r.note,
    defaultQuestion: r.question,
    files: r.repo.files.length,
    chunks: r.repo.chunks.length,
    tokens: r.repo.naiveTokens,
  }));
}
