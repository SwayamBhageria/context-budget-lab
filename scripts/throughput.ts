import { fetchRepo } from "../src/lib/ingest/github";
/** Sets the live-fetch cap from measured cost, not a round number. */
async function main() {
  for (const slug of ["karpathy/nanoGPT", "pallets/flask", "karpathy/llm.c", "honojs/hono"]) {
    const t0 = Date.now();
    const r = await fetchRepo(slug, "HEAD");
    const ms = Date.now() - t0;
    const bytes = r.files.reduce((a, f) => a + f.text.length, 0);
    console.log(
      `${slug.padEnd(18)} ${String(r.naiveTokens).padStart(7)} tok  ${(bytes / 1024 / 1024).toFixed(2)}MB  ` +
        `${String(ms).padStart(6)}ms  =>  ${Math.round(r.naiveTokens / (ms / 1000)).toLocaleString()} tok/s`,
    );
  }
}
main();
