import { NextResponse } from "next/server";
import { loadRepo, loadLiveRepo, isFixture } from "@/lib/repos";
import { select } from "@/lib/select";
import { grepBaseline } from "@/lib/select/baseline";
import { BENCHMARK, measureCase } from "@/lib/benchmark";
import { findMinimumBudget } from "@/lib/minimum";
import { TOKENIZER_NOTE } from "@/lib/tokens";
import embeddingBaseline from "@/fixtures/embedding-baseline.json";

export const maxDuration = 60;

export async function POST(req: Request) {
  // A malformed body is a client error, not a crash. req.json() throws on
  // anything that is not valid JSON, which was surfacing as a 500.
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }
  const { slug, question, budget, withMinimum, anchors, includeMarkdown } = payload as {
    slug?: unknown;
    question?: unknown;
    budget?: unknown;
    withMinimum?: unknown;
    anchors?: unknown;
    includeMarkdown?: unknown;
  };

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

  const withMd = includeMarkdown !== false;

  // owner/repo, GitHub's own rules: alphanumerics, dot, dash, underscore.
  if (!/^[\w.-]+\/[\w.-]+$/.test(slug)) {
    return NextResponse.json({ error: "expected owner/repo" }, { status: 400 });
  }

  let loaded;
  if (isFixture(slug)) {
    loaded = loadRepo(slug, withMd)!;
  } else {
    try {
      loaded = await loadLiveRepo(slug, withMd);
    } catch (e) {
      const err = e as Error;
      const status = err.name === "RepoTooLarge" ? 413 : /returned 404/.test(err.message) ? 404 : 502;
      return NextResponse.json({ error: err.message, live: true }, { status });
    }
  }

  const report = select(loaded.repo, q, Math.floor(b), loaded.graph);
  const grep = grepBaseline(loaded.repo, q, report.kept.map((k) => k.chunk.path));

  // Recall is only meaningful where ground truth was established by reading the
  // source. A free-typed question has none, and the app says so rather than
  // inventing a score.
  const bench = BENCHMARK.find((c) => c.slug === slug && c.question === q);
  const recall = bench
    ? {
        ...measureCase(bench, report.kept),
        quarantined: bench.quarantined ?? null,
        expectation: bench.expectation,
        whyHard: bench.whyHard ?? null,
      }
    : null;

  // Anchors marked in the UI take precedence: for a question the benchmark does
  // not cover, the person asking can see which chunk answers it and is the only
  // available oracle. Their marks are labelled "user-marked" so the number is
  // never mistaken for a pre-registered benchmark result.
  const marked: { path: string; line: number }[] = Array.isArray(anchors)
    ? anchors
        .filter(
          (a: unknown): a is { path: string; line: number } =>
            !!a &&
            typeof (a as { path?: unknown }).path === "string" &&
            Number.isFinite((a as { line?: unknown }).line),
        )
        .slice(0, 20)
    : [];

  const minimum = !withMinimum
    ? null
    : marked.length > 0
      ? findMinimumBudget(loaded.repo, q, marked, loaded.graph, loaded.repo.naiveTokens, "user-marked")
      : bench
        ? findMinimumBudget(loaded.repo, q, bench.anchors, loaded.graph, loaded.repo.naiveTokens, "benchmark")
        : null;

  return NextResponse.json({
    slug,
    question: q,
    note: loaded.note,
    includeMarkdown: withMd,
    live: !isFixture(slug),
    coverage: loaded.repo.coverage ?? null,
    repoTokens: loaded.repo.naiveTokens,
    codeTokens: loaded.codeTokens,
    files: loaded.repo.files.length,
    chunks: loaded.repo.chunks.length,
    report,
    grep,
    recall,
    minimum,
    // The dense baseline for this exact question, where one was precomputed on
    // the same chunks. Shown because the two methods split the benchmark almost
    // evenly and fail on different questions — and because an earlier run of this
    // same comparison gave a very different tally purely because chunk
    // granularity changed. Displaying only our own number would make the app an
    // advert rather than an instrument.
    embedding:
      (embeddingBaseline as Record<string, { model: string; reached: boolean; minTokens: number | null }>)[
        `${slug}|${q}`
      ] ?? null,
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
