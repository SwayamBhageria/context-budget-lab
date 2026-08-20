import { fetchRepo } from "../src/lib/ingest/github";
import { execSync } from "node:child_process";

const CANDIDATES = [
  "karpathy/micrograd", "karpathy/nanoGPT", "karpathy/minGPT", "karpathy/llm.c",
  "karpathy/nn-zero-to-hero", "openai/tiktoken", "openai/whisper",
  "ollama/ollama", "vllm-project/vllm",
];

function stars(slug: string): string {
  try {
    return Number(execSync(`gh api repos/${slug} --jq .stargazers_count`, { encoding: "utf8" }).trim()).toLocaleString();
  } catch { return "?"; }
}

async function main() {
  console.log("repo".padEnd(26) + "stars".padStart(9) + "tokens".padStart(9) + "code".padStart(9) + "  md%" + " files" + " chunks");
  for (const slug of CANDIDATES) {
    try {
      const r = await fetchRepo(slug, "HEAD");
      const code = r.files.filter((f) => !f.path.endsWith(".md")).reduce((a, f) => a + f.tokens, 0);
      const md = r.naiveTokens ? ((1 - code / r.naiveTokens) * 100).toFixed(0) : "0";
      console.log(
        slug.padEnd(26) + stars(slug).padStart(9) + String(r.naiveTokens).padStart(9) +
        String(code).padStart(9) + `  ${md}%`.padStart(6) + String(r.files.length).padStart(6) + String(r.chunks.length).padStart(7),
      );
    } catch (e) {
      console.log(slug.padEnd(26) + "FAILED: " + (e as Error).message.slice(0, 44));
    }
  }
}
main();
