import type { Repo } from "./types";
import { buildGraph } from "./ingest/graph";
import clsx from "@/fixtures/lukeed__clsx.json";
import swr from "@/fixtures/vercel__swr.json";
import zustand from "@/fixtures/pmndrs__zustand.json";
import flask from "@/fixtures/pallets__flask.json";
import gin from "@/fixtures/gin-gonic__gin.json";

/**
 * Repositories are indexed at build time and shipped as fixtures rather than
 * fetched per request. Two reasons: the deployed demo must not depend on
 * GitHub's availability or its unauthenticated rate limit, and the numbers a
 * reviewer sees must be the numbers that were measured, not whatever HEAD
 * happens to be that morning. Each fixture records the ref it was built from.
 */
const RAW = [clsx, swr, flask, gin, zustand] as unknown as {
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
  codeTokens: number;
}

/**
 * Both index variants are built and cached, because which one you choose turns
 * out to matter more than the retrieval algorithm.
 *
 * Documentation is written in the same vocabulary as the questions people ask;
 * the code implementing the behaviour is not. On zustand, which is 89% markdown,
 * indexing the docs pushes the minimum context for "what does devtools connect
 * to" from 3,176 tokens to 15,042, and makes "why might a component not
 * re-render" unreachable at any budget — it resolves at 7,036 without them.
 *
 * It is not a simple win either way: clsx is 29% WORSE code-only, because on a
 * 1,300-token library the README genuinely is the best explanation. So this is a
 * control the reader flips, not a default I picked for them.
 */
const cache = new Map<string, LoadedRepo>();

function codeOnly(repo: Repo): Repo {
  const files = repo.files.filter((f) => !f.path.endsWith(".md"));
  const keep = new Set(files.map((f) => f.path));
  return {
    ...repo,
    files,
    chunks: repo.chunks.filter((c) => keep.has(c.path)),
    naiveTokens: files.reduce((a, f) => a + f.tokens, 0),
  };
}

export function loadRepo(slug: string, includeMarkdown = true): LoadedRepo | null {
  const key = `${slug}|${includeMarkdown ? "all" : "code"}`;
  if (cache.has(key)) return cache.get(key)!;
  const raw = RAW.find((r) => r.slug === slug);
  if (!raw) return null;
  const repo = includeMarkdown ? raw.repo : codeOnly(raw.repo);
  const loaded: LoadedRepo = {
    slug: raw.slug,
    note: raw.note,
    defaultQuestion: raw.question,
    defaultBudget: raw.budget,
    repo,
    graph: buildGraph(repo.files),
    codeTokens: raw.repo.files
      .filter((f) => !f.path.endsWith(".md"))
      .reduce((a, f) => a + f.tokens, 0),
  };
  cache.set(key, loaded);
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
