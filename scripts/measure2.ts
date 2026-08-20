import { fetchRepo } from "../src/lib/ingest/github";

const CANDIDATES = [
  "psf/requests",        // python, application-shaped library
  "pallets/flask",       // python, web framework
  "expressjs/express",   // js, code-heavy server framework
  "gin-gonic/gin",       // go, code-heavy
  "encode/httpx",        // python
  "fastify/fastify",     // js, larger server framework
];

async function main() {
  console.log("repo".padEnd(20) + "tokens".padStart(8) + "code".padStart(8) + "  md%" + "  files  chunks  langs");
  for (const slug of CANDIDATES) {
    try {
      const r = await fetchRepo(slug, "HEAD");
      const code = r.files.filter((f) => !f.path.endsWith(".md")).reduce((a, f) => a + f.tokens, 0);
      const md = ((1 - code / r.naiveTokens) * 100).toFixed(0);
      const exts = [...new Set(r.files.map((f) => f.path.split(".").pop()))].join(",");
      console.log(
        slug.padEnd(20) + String(r.naiveTokens).padStart(8) + String(code).padStart(8) +
        `  ${md}%`.padStart(6) + String(r.files.length).padStart(7) + String(r.chunks.length).padStart(8) + "  " + exts,
      );
    } catch (e) {
      console.log(slug.padEnd(20) + "FAILED: " + (e as Error).message);
    }
  }
}
main();
