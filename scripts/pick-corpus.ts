import { fetchRepo } from "../src/lib/ingest/github";
import { execSync } from "node:child_process";

/**
 * How the corpus was chosen: measured, not picked by taste.
 *
 * Candidates are sized and their markdown share computed, then selected to span
 * the range — small enough that selection cannot help, through to large enough
 * that sending everything is unaffordable — across several languages and both
 * ends of the doc-heavy axis, since that turned out to matter more than the
 * retrieval algorithm.
 */
const CANDIDATES = [
  "karpathy/micrograd", "karpathy/nanoGPT", "karpathy/minGPT", "karpathy/llm.c",
  "openai/tiktoken", "pallets/flask", "pmndrs/zustand",
];

function stars(slug: string): string {
  try {
    return Number(execSync(`gh api repos/${slug} --jq .stargazers_count`, { encoding: "utf8" }).trim()).toLocaleString();
  } catch { return "?"; }
}

async function main() {
  console.log("repo".padEnd(24) + "stars".padStart(9) + "tokens".padStart(9) + "code".padStart(9) + "  md%" + "  cov%");
  for (const slug of CANDIDATES) {
    try {
      const r = await fetchRepo(slug, "HEAD");
      const code = r.files.filter((f) => !f.path.endsWith(".md")).reduce((a, f) => a + f.tokens, 0);
      console.log(
        slug.padEnd(24) + stars(slug).padStart(9) + String(r.naiveTokens).padStart(9) + String(code).padStart(9) +
        `  ${(100 - (code / r.naiveTokens) * 100).toFixed(0)}%`.padStart(6) +
        `  ${(r.coverage?.pct ?? 100).toFixed(0)}%`.padStart(6),
      );
    } catch (e) {
      console.log(slug.padEnd(24) + "FAILED: " + (e as Error).message.slice(0, 50));
    }
  }
}
main();
