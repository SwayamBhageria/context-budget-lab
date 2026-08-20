import { chunkFile } from "./chunk";
import { extractImports } from "./graph";
import { countTokens } from "@/lib/tokens";
import type { Repo, RepoFile, Chunk } from "@/lib/types";

/** Extensions worth indexing. Everything else is noise or binary. */
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|php|md|c|h|cc|cpp|cxx|hpp|cu|cuh|cs|kt|swift|scala|m|mm)$/i;
/**
 * Every language a reader could reasonably expect to be indexed — the denominator
 * for coverage.
 *
 * Deliberately excludes json/yaml/toml/lock files. They are data, not code, and
 * counting them made zustand report 46% coverage when the entire shortfall was
 * package-lock.json and CI config. A coverage figure that penalises not indexing
 * a lockfile does not answer the question it exists to answer, which is "did we
 * miss code that could hold the answer".
 */
const ANY_CODE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|php|md|c|h|cc|cpp|cxx|hpp|cu|cuh|cs|kt|swift|scala|m|mm|sh|bash|zsh|pl|lua|r|jl|dart|ex|exs|erl|hs|ml|clj|vue|svelte|sql|proto)$/i;
/** Paths that inflate the index without ever answering a question. */
const SKIP =
  /(^|\/)(node_modules|\.git|\.github|dist|build|out|vendor|\.next|coverage|__pycache__|test|tests|__tests__|fixtures|examples?)\//i;
/** Project meta that discusses the code without ever explaining it. */
const SKIP_FILE =
  /(^|\/)(CONTRIBUTING|CHANGELOG|CODE_OF_CONDUCT|SECURITY|LICENSE|MIGRATION)\.md$/i;
const MAX_FILE_BYTES = 200_000;

export async function fetchRepo(slug: string, ref = "HEAD"): Promise<Repo> {
  const url = `https://codeload.github.com/${slug}/tar.gz/${ref}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GitHub returned ${res.status} for ${slug}@${ref}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const entries = await untar(buf);
  return buildRepo(slug, ref, entries);
}

/**
 * Refusal rather than truncation. Measured locally, hono indexes 664,820 tokens
 * from 2.48MB in 3.0s; a serverless instance runs slower, so 2.5MB leaves ample
 * headroom inside the 60s function limit. Checked after unpacking and before
 * tokenizing, because tokenizing is the expensive half.
 *
 * Silently indexing part of a large repository and reporting a confident
 * reduction is the exact failure this project exists to expose — llm.c did it
 * here, reporting 85.6% over 17% of the corpus.
 */
export const MAX_SOURCE_BYTES = 2_500_000;

export class RepoTooLarge extends Error {
  constructor(readonly bytes: number) {
    super(
      `Repository holds ${(bytes / 1_000_000).toFixed(1)}MB of indexable source, over the ${(
        MAX_SOURCE_BYTES / 1_000_000
      ).toFixed(1)}MB live limit. Indexing part of it would produce a confident number over an unmeasured fraction of the code.`,
    );
    this.name = "RepoTooLarge";
  }
}

export function buildRepo(
  slug: string,
  ref: string,
  entries: { path: string; text: string }[],
): Repo {
  // Refuse before tokenizing. Tokenizing is the expensive half, so the gate has
  // to sit ahead of it, and refusal beats truncation: indexing part of a large
  // repository and reporting a confident reduction over an unmeasured fraction
  // is the failure this whole project exists to expose.
  const sourceBytes = entries.reduce(
    (a, e) =>
      SOURCE.test(e.path) && !SKIP.test(e.path) && !SKIP_FILE.test(e.path) && e.text.length <= MAX_FILE_BYTES
        ? a + e.text.length
        : a,
    0,
  );
  if (sourceBytes > MAX_SOURCE_BYTES) throw new RepoTooLarge(sourceBytes);

  const files: RepoFile[] = [];
  const chunks: Chunk[] = [];

  for (const e of entries) {
    if (!SOURCE.test(e.path) || SKIP.test(e.path) || SKIP_FILE.test(e.path)) continue;
    if (e.text.length > MAX_FILE_BYTES) continue;
    const tokens = countTokens(e.text);
    files.push({
      path: e.path,
      text: e.text,
      tokens,
      imports: extractImports(e.text),
    });
    for (const c of chunkFile(e.path, e.text)) {
      chunks.push({ ...c, tokens: countTokens(c.text) });
    }
  }

  // Coverage is reported, not assumed. llm.c ships ~950KB of .cu/.cuh/.h/.c that
  // the source filter silently dropped while indexing 157KB of Python, then
  // reported an 85.6% reduction over 17% of the repository. A retrieval number
  // computed on an unmeasured fraction of the corpus is worthless, and nothing
  // in the pipeline raised — it simply succeeded.
  let seenBytes = 0;
  let indexedBytes = 0;
  const skipped: Record<string, number> = {};
  for (const e of entries) {
    if (!ANY_CODE.test(e.path) || SKIP.test(e.path)) continue;
    seenBytes += e.text.length;
    if (SOURCE.test(e.path) && !SKIP_FILE.test(e.path) && e.text.length <= MAX_FILE_BYTES) {
      indexedBytes += e.text.length;
    } else {
      const ext = e.path.split(".").pop()!.toLowerCase();
      skipped[ext] = (skipped[ext] ?? 0) + e.text.length;
    }
  }

  return {
    slug,
    ref,
    files,
    chunks,
    naiveTokens: files.reduce((a, f) => a + f.tokens, 0),
    coverage: {
      indexedBytes,
      seenBytes,
      pct: seenBytes ? (indexedBytes / seenBytes) * 100 : 100,
      skippedByExt: Object.fromEntries(
        Object.entries(skipped).sort((a, b) => b[1] - a[1]).slice(0, 6),
      ),
    },
  };
}

/** Minimal gzip+tar reader — avoids pulling a tar dependency for one call path. */
async function untar(gz: Buffer): Promise<{ path: string; text: string }[]> {
  const { gunzipSync } = await import("node:zlib");
  const tar = gunzipSync(gz);
  const out: { path: string; text: string }[] = [];
  let off = 0;

  while (off + 512 <= tar.length) {
    const header = tar.subarray(off, off + 512);
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    if (!name) break;
    const size = parseInt(
      header.subarray(124, 136).toString("utf8").replace(/\0.*$/, "").trim() || "0",
      8,
    );
    const type = header[156];
    off += 512;
    if (type === 0 || type === 48) {
      const body = tar.subarray(off, off + size);
      // Strip the "repo-sha/" prefix codeload wraps everything in.
      const rel = name.split("/").slice(1).join("/");
      if (rel) out.push({ path: rel, text: body.toString("utf8") });
    }
    off += Math.ceil(size / 512) * 512;
  }
  return out;
}
