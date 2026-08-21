import type { Repo } from "./types";
import { buildGraph } from "./ingest/graph";
import micrograd from "@/fixtures/karpathy__micrograd.json";
import nanogpt from "@/fixtures/karpathy__nanoGPT.json";
import llmc from "@/fixtures/karpathy__llm.c.json";
import flask from "@/fixtures/pallets__flask.json";
import zustand from "@/fixtures/pmndrs__zustand.json";

/**
 * Repositories are indexed at build time and shipped as fixtures rather than
 * fetched per request. Two reasons: the deployed demo must not depend on
 * GitHub's availability or its unauthenticated rate limit, and the numbers a
 * reviewer sees must be the numbers that were measured, not whatever HEAD
 * happens to be that morning. Each fixture records the ref it was built from.
 */
const RAW = [micrograd, nanogpt, llmc, flask, zustand] as unknown as {
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
 * the code implementing the behaviour is not, so both a lexical and a dense
 * retriever rank prose above mechanism. On zustand, which is 89% markdown,
 * indexing the docs moves "what does devtools connect to" from 2,454 tokens to
 * 7,277, and "why might a component not re-render" from 4,246 to 63,043.
 *
 * Measured across the suite it helps or does nothing and never costs, which is
 * a stronger result than the earlier reading that clsx got worse — that was an
 * artifact of non-monotone packing, since fixed. It stays a control the reader
 * flips rather than a silent default, because the effect is entirely a function
 * of how doc-heavy the repository is and that is theirs to know.
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
  // Smallest first: the ordering is itself part of the argument, since the
  // technique is worthless at the top of the list and decisive at the bottom.
  return [...RAW]
    .sort((a, b) => a.repo.naiveTokens - b.repo.naiveTokens)
    .map((r) => ({
    slug: r.slug,
    note: r.note,
    defaultQuestion: r.question,
    files: r.repo.files.length,
    chunks: r.repo.chunks.length,
    tokens: r.repo.naiveTokens,
  }));
}


/**
 * Live repositories, indexed on demand.
 *
 * Cached per warm instance only — serverless instances are stateless across cold
 * starts, so a repeat question may re-index. That is a latency cost, never a
 * correctness one, and re-indexing is deterministic.
 */
const live = new Map<string, LoadedRepo>();
const LIVE_MAX = 3;

export async function loadLiveRepo(slug: string, includeMarkdown = true): Promise<LoadedRepo> {
  const key = `${slug}|${includeMarkdown ? "all" : "code"}`;
  const hit = live.get(key);
  if (hit) return hit;

  const { fetchRepo } = await import("./ingest/github");
  const full = await fetchRepo(slug, "HEAD");
  const repo = includeMarkdown ? full : codeOnly(full);
  const loaded: LoadedRepo = {
    slug,
    note: "Indexed live from GitHub. No pre-registered ground truth — mark the chunk that answers your question to measure a minimum.",
    defaultQuestion: "",
    defaultBudget: 8000,
    repo,
    graph: buildGraph(repo.files),
    codeTokens: full.files.filter((f) => !f.path.endsWith(".md")).reduce((a, f) => a + f.tokens, 0),
  };

  // Bounded so a session of live lookups cannot exhaust the instance.
  if (live.size >= LIVE_MAX) live.delete(live.keys().next().value!);
  live.set(key, loaded);
  return loaded;
}

export function isFixture(slug: string): boolean {
  return RAW.some((r) => r.slug === slug);
}
