import { fetchRepo } from "../src/lib/ingest/github";

const CANDIDATES = [
  "karpathy/micrograd",
  "karpathy/nanoGPT",
  "karpathy/minGPT",
  "karpathy/llm.c",
  "openai/tiktoken",
  "openai/whisper",
  "vllm-project/vllm",
  "run-llama/llama_index",
  "langchain-ai/langchain",
  "ollama/ollama",
];

async function main() {
  console.log("repo".padEnd(24) + "tokens".padStart(9) + "code".padStart(9) + "  md%" + " files" + " chunks" + "  langs");
  for (const slug of CANDIDATES) {
    try {
      const r = await fetchRepo(slug, "HEAD");
      const code = r.files.filter((f) => !f.path.endsWith(".md")).reduce((a, f) => a + f.tokens, 0);
      const md = r.naiveTokens ? ((1 - code / r.naiveTokens) * 100).toFixed(0) : "0";
      const exts = [...new Set(r.files.map((f) => f.path.split(".").pop()))].slice(0, 5).join(",");
      console.log(
        slug.padEnd(24) + String(r.naiveTokens).padStart(9) + String(code).padStart(9) +
        `  ${md}%`.padStart(6) + String(r.files.length).padStart(6) + String(r.chunks.length).padStart(7) + "  " + exts,
      );
    } catch (e) {
      console.log(slug.padEnd(24) + "FAILED: " + (e as Error).message.slice(0, 50));
    }
  }
}
main();
