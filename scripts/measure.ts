import { fetchRepo } from "../src/lib/ingest/github";

const CANDIDATES = [
  "sindresorhus/ky",
  "lukeed/clsx",
  "vercel/swr",
  "pmndrs/zustand",
  "TanStack/query",
  "honojs/hono",
];

async function main() {
  for (const slug of CANDIDATES) {
    try {
      const t = Date.now();
      const repo = await fetchRepo(slug, "HEAD");
      console.log(
        `${slug.padEnd(20)} ${String(repo.naiveTokens).padStart(8)} tok  ` +
          `${String(repo.files.length).padStart(4)} files  ` +
          `${String(repo.chunks.length).padStart(5)} chunks  ${Date.now() - t}ms`,
      );
    } catch (e) {
      console.log(`${slug.padEnd(20)} FAILED: ${(e as Error).message}`);
    }
  }
}
main();
