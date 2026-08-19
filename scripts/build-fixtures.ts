import { writeFileSync, mkdirSync } from "node:fs";
import { fetchRepo } from "../src/lib/ingest/github";
import { buildGraph } from "../src/lib/ingest/graph";
import { select } from "../src/lib/select";
import { grepBaseline } from "../src/lib/select/baseline";

export const FIXTURES = [
  {
    slug: "lukeed/clsx",
    question: "how does clsx handle nested arrays and objects?",
    budget: 2000,
    note: "Small enough that selection barely earns its place.",
  },
  {
    slug: "vercel/swr",
    question: "how does revalidation on focus work?",
    budget: 8000,
    note: "The working zone: too big to send casually, small enough to verify.",
  },
  {
    slug: "pmndrs/zustand",
    question: "how does the persist middleware rehydrate state?",
    budget: 8000,
    note: "Large enough that sending everything has a real price.",
  },
];

async function main() {
  mkdirSync("src/fixtures", { recursive: true });
  mkdirSync("scratch", { recursive: true });

  for (const f of FIXTURES) {
    const repo = await fetchRepo(f.slug, "HEAD");
    const graph = buildGraph(repo.files);
    const report = select(repo, f.question, f.budget, graph);
    const base = grepBaseline(repo, f.question, report.kept.map((k) => k.chunk.path));

    const name = f.slug.replace("/", "__");
    writeFileSync(
      `src/fixtures/${name}.json`,
      JSON.stringify({ ...f, repo, grep: base }),
    );

    // The exact context the model will be given for the "selected" answer.
    const ctx = report.kept
      .map((k) => `--- ${k.chunk.path}:${k.chunk.startLine}-${k.chunk.endLine} ---\n${k.chunk.text}`)
      .join("\n\n");
    writeFileSync(`scratch/${name}.selected.txt`, `QUESTION: ${f.question}\n\n${ctx}`);

    console.log(
      `${f.slug.padEnd(16)} all=${String(repo.naiveTokens).padStart(7)} ` +
        `grepBest=${String(base.bestTokens).padStart(7)} sel=${String(report.selectedTokens).padStart(6)} ` +
        `(-${report.reductionPct.toFixed(1)}%) kept=${report.kept.length}`,
    );
  }
}
main();
