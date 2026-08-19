import { NextResponse } from "next/server";
import { loadRepo } from "@/lib/repos";
import { select } from "@/lib/select";
import { grepBaseline } from "@/lib/select/baseline";
import { BENCHMARK, measureCase } from "@/lib/benchmark";
import { findMinimumBudget } from "@/lib/minimum";
import { TOKENIZER_NOTE } from "@/lib/tokens";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { slug, question, budget, withMinimum } = await req.json();

  if (typeof slug !== "string" || typeof question !== "string") {
    return NextResponse.json({ error: "slug and question are required" }, { status: 400 });
  }
  const q = question.trim();
  if (!q) return NextResponse.json({ error: "question is empty" }, { status: 400 });
  // Bounded so a pasted essay can't turn scoring into a long-running function.
  if (q.length > 500) {
    return NextResponse.json({ error: "question too long (max 500 chars)" }, { status: 400 });
  }
  const b = Number(budget);
  if (!Number.isFinite(b) || b < 100 || b > 200_000) {
    return NextResponse.json({ error: "budget must be 100..200000" }, { status: 400 });
  }

  const loaded = loadRepo(slug);
  if (!loaded) return NextResponse.json({ error: `unknown repo: ${slug}` }, { status: 404 });

  const report = select(loaded.repo, q, Math.floor(b), loaded.graph);
  const grep = grepBaseline(loaded.repo, q, report.kept.map((k) => k.chunk.path));

  // Recall is only meaningful where ground truth was established by reading the
  // source. A free-typed question has none, and the app says so rather than
  // inventing a score.
  const bench = BENCHMARK.find((c) => c.slug === slug && c.question === q);
  const recall = bench ? { ...measureCase(bench, report.kept), quarantined: bench.quarantined ?? null, expectation: bench.expectation } : null;

  const minimum =
    withMinimum && bench
      ? findMinimumBudget(loaded.repo, bench, loaded.graph, 64000)
      : null;

  return NextResponse.json({
    slug,
    question: q,
    note: loaded.note,
    repoTokens: loaded.repo.naiveTokens,
    codeTokens: loaded.codeTokens,
    files: loaded.repo.files.length,
    chunks: loaded.repo.chunks.length,
    report,
    grep,
    recall,
    minimum,
    tokenizerNote: TOKENIZER_NOTE,
  });
}

export async function GET() {
  const { listRepos } = await import("@/lib/repos");
  return NextResponse.json({
    repos: listRepos(),
    benchmark: BENCHMARK.map((c) => ({
      slug: c.slug,
      question: c.question,
      expectation: c.expectation,
      quarantined: c.quarantined ?? null,
      anchors: c.anchors,
    })),
  });
}
