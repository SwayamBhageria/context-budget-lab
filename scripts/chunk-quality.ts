import { readFileSync } from "node:fs";
import glob from "node:fs";

/** Is C chunking actually worse, or does it only sound worse? */
const files = glob.readdirSync("src/fixtures").filter((f) => f.endsWith(".json") && !f.includes("embedding"));

console.log("repo".padEnd(20) + "chunks".padStart(8) + "median".padStart(8) + "force%".padStart(8) + "withDefs%".padStart(11) + "  by ext");
for (const f of files) {
  const repo = JSON.parse(readFileSync(`src/fixtures/${f}`, "utf8")).repo;
  const cs = repo.chunks as { path: string; startLine: number; endLine: number; defines: string[] }[];
  const sizes = cs.map((c) => c.endLine - c.startLine).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)];
  const forced = cs.filter((c) => c.endLine - c.startLine === 80).length;
  const withDefs = cs.filter((c) => c.defines.length > 0).length;

  // Same three numbers split by extension, so a bad language cannot hide.
  const byExt: Record<string, { n: number; defs: number }> = {};
  for (const c of cs) {
    const e = c.path.split(".").pop()!;
    byExt[e] ??= { n: 0, defs: 0 };
    byExt[e].n++;
    if (c.defines.length > 0) byExt[e].defs++;
  }
  const ext = Object.entries(byExt)
    .sort((a, b) => b[1].n - a[1].n).slice(0, 4)
    .map(([e, v]) => `${e}:${Math.round((v.defs / v.n) * 100)}%`).join(" ");

  console.log(
    repo.slug.padEnd(20) + String(cs.length).padStart(8) + String(median).padStart(8) +
    `${Math.round((forced / cs.length) * 100)}%`.padStart(8) +
    `${Math.round((withDefs / cs.length) * 100)}%`.padStart(11) + "  " + ext,
  );
}
