import { chunkFile } from "./chunk";
import { extractImports } from "./graph";
import { countTokens } from "@/lib/tokens";
import type { Repo, RepoFile, Chunk } from "@/lib/types";

/** Extensions worth indexing. Everything else is noise or binary. */
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|php|md)$/i;
/** Paths that inflate the index without ever answering a question. */
const SKIP =
  /(^|\/)(node_modules|\.git|dist|build|out|vendor|\.next|coverage|__pycache__|test|tests|__tests__|fixtures|examples?)\//i;
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

export function buildRepo(
  slug: string,
  ref: string,
  entries: { path: string; text: string }[],
): Repo {
  const files: RepoFile[] = [];
  const chunks: Chunk[] = [];

  for (const e of entries) {
    if (!SOURCE.test(e.path) || SKIP.test(e.path)) continue;
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

  return {
    slug,
    ref,
    files,
    chunks,
    naiveTokens: files.reduce((a, f) => a + f.tokens, 0),
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
