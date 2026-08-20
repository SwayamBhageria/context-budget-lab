"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Anchor = { path: string; line: number; holds: string; covered?: boolean };
type Kept = {
  chunk: { id: string; path: string; startLine: number; endLine: number; tokens: number; text: string };
  score: number;
  reason: string;
  hops: number;
};
type Analysis = {
  note: string;
  repoTokens: number;
  codeTokens: number;
  files: number;
  chunks: number;
  includeMarkdown: boolean;
  live: boolean;
  coverage: { pct: number; skippedByExt: Record<string, number> } | null;
  report: {
    selectedTokens: number;
    reductionPct: number;
    kept: Kept[];
    droppedFiles: number;
    droppedChunks: number;
    saturationTokens: number;
    nearMisses: { chunk: Kept["chunk"]; score: number }[];
    timings: { scoreMs: number; expandMs: number; packMs: number };
  };
  grep: { bestTokens: number; bestTerm: string | null; bestFiles: string[]; naiveTokens: number; missedByGrep: string[] };
  recall: { hits: Anchor[]; found: number; total: number; recallPct: number; quarantined: string | null; expectation: string; whyHard: string | null } | null;
  minimum: { found: boolean; minBudget: number | null; tokensUsed: number | null; probes: number; source: "benchmark" | "user-marked" } | null;
  tokenizerNote: string;
};
type Meta = {
  repos: { slug: string; note: string; defaultQuestion: string; files: number; chunks: number; tokens: number }[];
  benchmark: { slug: string; question: string; expectation: string; quarantined: string | null }[];
};

const n = (v: number) => v.toLocaleString("en-US");

export default function Page() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [slug, setSlug] = useState("vercel/swr");
  const [question, setQuestion] = useState("how does revalidation on focus work?");
  const [budget, setBudget] = useState(8000);
  const [includeMarkdown, setIncludeMarkdown] = useState(true);
  const [custom, setCustom] = useState("");
  const [data, setData] = useState<Analysis | null>(null);
  const [tab, setTab] = useState<"kept" | "dropped">("kept");
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState(false);
  // Chunks the reader has marked as containing the answer. For a question the
  // benchmark does not cover, they are the only oracle available.
  const [marked, setMarked] = useState<Record<string, { path: string; line: number }>>({});
  const [err, setErr] = useState<string | null>(null);
  const seq = useRef(0);
  const listRef = useRef<HTMLElement | null>(null);
  // Set when the reader clicks the minimum figure: re-run at that budget, then
  // scroll them to the code it is a claim about. A number they cannot see the
  // basis of is a number they have to take on trust.
  const [jump, setJump] = useState(false);

  useEffect(() => {
    fetch("/api/analyze").then((r) => r.json()).then(setMeta).catch(() => {});
  }, []);

  const run = useCallback(
    async (withMinimum = false, anchors: { path: string; line: number }[] = []) => {
      const mine = ++seq.current;
      setBusy(true);
      setErr(null);
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slug, question, budget, withMinimum, anchors, includeMarkdown }),
        });
        const json = await res.json();
        // Drop responses from superseded requests so a slow one can't overwrite
        // a newer result while the slider is being dragged.
        if (mine !== seq.current) return;
        if (!res.ok) { setErr(json.error ?? "request failed"); return; }
        setData(json);
      } catch {
        if (mine === seq.current) setErr("network error");
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    },
    [slug, question, budget, includeMarkdown],
  );

  useEffect(() => { setAsked(false); run(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [slug, question, budget, includeMarkdown]);
  // Marks belong to one question on one repo; carrying them across would
  // silently measure the wrong thing.
  useEffect(() => { setMarked({}); }, [slug, question]);

  // Runs after the re-render at the new budget, so the row exists to scroll to.
  useEffect(() => {
    if (!jump || busy || !data) return;
    setJump(false);
    setTab("kept");
    const el = listRef.current?.querySelector<HTMLElement>('[data-target="1"]');
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.animate(
        [{ backgroundColor: "rgba(16,185,129,0.35)" }, { backgroundColor: "transparent" }],
        { duration: 1600, easing: "ease-out" },
      );
    }
  }, [jump, busy, data]);

  const presets = meta?.benchmark.filter((b) => b.slug === slug) ?? [];
  const r = data?.report;

  const targets: { path: string; line: number }[] =
    Object.keys(marked).length > 0
      ? Object.values(marked)
      : (data?.recall?.hits ?? []).map((h) => ({ path: h.path, line: h.line }));

  const isTarget = (c: Kept["chunk"]) =>
    targets.some((t) => t.path === c.path && c.startLine <= t.line - 1 && t.line - 1 < c.endLine);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-10 text-neutral-200">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Context Budget Lab</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-400">
          Every AI coding tool reads part of your repository before answering and none of them show you
          which part. This does. Pick a repo, ask what you&apos;d ask an agent, and see what a token
          budget actually buys — measured against grep, and checked against where the answer really lives.
        </p>
      </header>

      <section className="mb-6 grid gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid gap-3">
          <label className="grid gap-1">
            <span className="text-xs uppercase tracking-wider text-neutral-500">Repository</span>
            <select
              value={slug}
              onChange={(e) => {
                const s = e.target.value;
                setSlug(s);
                const first = meta?.benchmark.find((b) => b.slug === s);
                if (first) setQuestion(first.question);
              }}
              className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
            >
              {meta?.repos.map((rp) => (
                <option key={rp.slug} value={rp.slug}>
                  {rp.slug} — {n(rp.tokens)} tokens, {rp.files} files
                </option>
              ))}
            </select>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const v = custom.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
                if (/^[\w.-]+\/[\w.-]+$/.test(v)) setSlug(v);
              }}
              className="mt-1 flex gap-1.5"
            >
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="or any public repo — owner/name"
                className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-950 px-2 py-1 font-mono text-xs placeholder:text-neutral-600"
              />
              <button
                type="submit"
                className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
              >
                Index
              </button>
            </form>
            {data?.live && (
              <p className="text-[11px] leading-snug text-amber-600/90">
                Indexed live from GitHub{data.coverage ? `, ${Math.round(data.coverage.pct)}% of its source` : ""}.
                No pre-registered ground truth, so no recall is shown — mark the chunk that answers your
                question to measure a minimum. Repos over 2.5MB of source are refused rather than
                partially indexed.
              </p>
            )}
          </label>

          <label className="grid gap-1">
            <span className="text-xs uppercase tracking-wider text-neutral-500">Question</span>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-sm"
            />
            <div className="mt-1 flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.question}
                  onClick={() => setQuestion(p.question)}
                  className={`rounded border px-2 py-0.5 text-[11px] transition-colors ${
                    question === p.question
                      ? "border-sky-700 bg-sky-950/60 text-sky-300"
                      : "border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-600"
                  }`}
                >
                  {p.question.length > 42 ? p.question.slice(0, 42) + "…" : p.question}
                  {p.expectation === "expected-hard" && <span className="ml-1 text-amber-500">hard</span>}
                  {p.quarantined && <span className="ml-1 text-neutral-600">Q</span>}
                </button>
              ))}
            </div>
          </label>

          <label className="flex items-start gap-2 rounded border border-neutral-800 bg-neutral-950/60 px-3 py-2">
            <input
              type="checkbox"
              checked={includeMarkdown}
              onChange={(e) => setIncludeMarkdown(e.target.checked)}
              className="mt-1 accent-sky-500"
            />
            <span className="grid gap-0.5">
              <span className="text-xs text-neutral-300">Index markdown as well as code</span>
              <span className="text-[11px] leading-snug text-neutral-500">
                Docs share vocabulary with questions; code does not, so they crowd out the
                implementation. Turning this off drops zustand&apos;s devtools question from 15,042
                tokens to 3,147, and &quot;why no re-render&quot; from 88,244 to 7,036. Across the
                suite it helps or does nothing — it never costs.
              </span>
            </span>
          </label>

          <label className="grid gap-1">
            <span className="text-xs uppercase tracking-wider text-neutral-500">
              Token budget — <span className="font-mono text-neutral-300">{n(budget)}</span>
            </span>
            <input
              type="range" min={200} max={40000} step={200}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="accent-sky-500"
            />
          </label>
        </div>

        <div className="flex flex-col justify-end gap-2">
          <button
            onClick={() => { setAsked(true); run(true, Object.values(marked)); }}
            disabled={busy}
            className="rounded border border-sky-800 bg-sky-950/60 px-3 py-2 text-sm text-sky-300 disabled:opacity-50"
          >
            Find minimum context
          </button>

          {/*
            Always answers. A question typed by the user has no ground truth, so
            there is no verified minimum to search for — but returning null and
            rendering nothing made the button look broken. The saturation point
            is reported instead, labelled as what it is: a statement about the
            selector's own confidence, not about whether the answer is present.
          */}
          {asked && !busy && data && (
            <div className="max-w-[15rem] text-xs leading-snug">
              {data.minimum ? (
                data.minimum.found ? (
                  <div className="grid gap-0.5 text-neutral-400">
                    <p>
                      {data.minimum.source === "user-marked" ? "Your marked chunks" : "The answer"} retrieved at{" "}
                      <button
                        onClick={() => { setBudget(data.minimum!.minBudget!); setJump(true); }}
                        title="Set the budget here and jump to the code"
                        className="font-mono text-emerald-400 underline decoration-dotted underline-offset-2 hover:text-emerald-300"
                      >
                        {n(data.minimum.tokensUsed!)}
                      </button>{" "}
                      tokens
                      <span className="text-neutral-600"> ({data.minimum.probes} probes)</span>
                    </p>
                    <p className="text-neutral-600">Click it to set the budget there and jump to the code.</p>
                    {data.minimum.source === "user-marked" && (
                      <p className="text-neutral-600">Measured against what you marked, not a pre-registered benchmark.</p>
                    )}
                  </div>
                ) : (
                  <p className="text-amber-400">
                    Not retrieved at any budget, even sending {data.minimum.source === "user-marked" ? "everything you marked" : "the whole repository"}.
                  </p>
                )
              ) : (
                <div className="grid gap-1 text-neutral-500">
                  <p>
                    Selection saturates at{" "}
                    <span className="font-mono text-neutral-300">{n(r?.saturationTokens ?? 0)}</span> tokens.
                  </p>
                  <p>
                    Below that the selector drops chunks it rated a match; above it, only
                    neighbouring context is added.
                  </p>
                  <p className="text-neutral-600">
                    That is an upper bound, not a minimum — it is usually far more than the
                    answer needs.
                  </p>
                  <p className="text-sky-500">
                    Mark the chunk that answers your question in the Kept list below, then press
                    this again for a real minimum.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {err && <p className="mb-4 rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{err}</p>}

      {r && data && (
        <>
          <section className="mb-6 grid gap-px overflow-hidden rounded-lg border border-neutral-800 bg-neutral-800 sm:grid-cols-4">
            <Stat
              label="send everything"
              value={n(data.repoTokens)}
              sub={data.includeMarkdown ? `${n(data.codeTokens)} without markdown` : "markdown excluded"}
            />
            <Stat label={`grep "${data.grep.bestTerm ?? "—"}"`} value={n(data.grep.bestTokens)} sub={`${data.grep.bestFiles.length} files, whole`} />
            <Stat label="selected" value={n(r.selectedTokens)} sub={`${r.kept.length} chunks`} accent />
            <Stat
              label="vs best grep"
              // Withheld unless every anchor was retrieved. A ratio next to a
              // failed retrieval reads as a win and is the exact number that
              // makes these tools look better than they are: any selector can
              // be 26x smaller than grep by returning the wrong code.
              value={
                data.recall && data.recall.recallPct < 100
                  ? "n/a"
                  : data.grep.bestTokens > 0
                    ? `${(data.grep.bestTokens / Math.max(r.selectedTokens, 1)).toFixed(1)}×`
                    : "—"
              }
              sub={
                data.recall && data.recall.recallPct < 100
                  ? "answer not retrieved — ratio would be meaningless"
                  : `scored in ${r.timings.scoreMs + r.timings.expandMs + r.timings.packMs}ms`
              }
              muted={!!data.recall && data.recall.recallPct < 100}
            />
          </section>

          {data.recall ? (
            <section className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
              <div className="mb-3 flex flex-wrap items-baseline gap-3">
                <h2 className="text-sm font-medium text-white">Did it retrieve the answer?</h2>
                <span className={`font-mono text-sm ${data.recall.recallPct === 100 ? "text-emerald-400" : "text-amber-400"}`}>
                  {data.recall.found}/{data.recall.total} anchors
                </span>
                {data.recall.expectation === "expected-hard" && (
                  <span className="rounded border border-amber-900 px-1.5 py-0.5 text-[11px] text-amber-500">
                    declared hard before running
                  </span>
                )}
              </div>
              <p className="mb-3 max-w-2xl text-xs leading-relaxed text-neutral-500">
                These are the exact lines where this question is actually answered, found by
                grepping the repository before the selector ever ran. Retrieval counts only if it
                returns a chunk spanning the line — reaching the right file is not enough.
              </p>
              <ul className="grid gap-1.5">
                {data.recall.hits.map((h) => (
                  <li key={h.path + h.line} className="flex items-start gap-2 font-mono text-xs">
                    <span className={h.covered ? "text-emerald-400" : "text-red-400"}>{h.covered ? "✓" : "✗"}</span>
                    <span className="text-neutral-300">{h.path}:{h.line}</span>
                    <span className="text-neutral-500">{h.holds}</span>
                  </li>
                ))}
              </ul>
              {data.recall.whyHard && data.recall.recallPct < 100 && (
                <p className="mt-3 rounded border border-amber-900/60 bg-amber-950/20 p-3 text-xs leading-relaxed text-amber-200/80">
                  <strong className="font-medium text-amber-300">Why this one fails.</strong>{" "}
                  {data.recall.whyHard}
                </p>
              )}
              {data.recall.quarantined && (
                <p className="mt-3 border-l-2 border-neutral-700 pl-3 text-xs text-neutral-500">{data.recall.quarantined}</p>
              )}
            </section>
          ) : (
            <p className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 text-xs text-neutral-500">
              No ground truth exists for this question, so no recall is shown. Scores are only meaningful
              where the answer&apos;s location was established by reading the source — inventing one here
              would be guessing.
            </p>
          )}

          <div className="mb-3 flex flex-wrap items-center gap-2">
            {(["kept", "dropped"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded border px-3 py-1 text-xs ${
                  tab === t ? "border-neutral-600 bg-neutral-800 text-white" : "border-neutral-800 text-neutral-500"
                }`}
              >
                {t === "kept" ? `Kept (${r.kept.length})` : `Dropped at this budget (${r.nearMisses.length})`}
              </button>
            ))}
            {tab === "kept" && (
              <span className="text-xs text-neutral-600">
                {Object.keys(marked).length > 0
                  ? `${Object.keys(marked).length} marked as containing the answer`
                  : "Press + on a chunk that answers your question to measure its minimum"}
              </span>
            )}
          </div>

          <section ref={listRef} className="overflow-hidden rounded-lg border border-neutral-800">
            {(tab === "kept" ? r.kept : r.nearMisses.map((m) => ({ chunk: m.chunk, score: m.score, reason: "lost to the budget", hops: -1 }))).map((k) => {
              const isMarked = !!marked[k.chunk.id];
              const markable = tab === "kept";
              const target = tab === "kept" && isTarget(k.chunk);
              return (
                <div
                  key={k.chunk.id}
                  data-target={target ? "1" : undefined}
                  className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-neutral-800/70 px-3 py-2 font-mono text-xs last:border-0 ${
                    isMarked ? "bg-emerald-950/30" : target ? "bg-emerald-950/15" : ""
                  }`}
                >
                  {target && !isMarked && (
                    <span title="contains the answer" className="text-emerald-500">◆</span>
                  )}
                  {markable && (
                    <button
                      onClick={() =>
                        setMarked((prev) => {
                          const next = { ...prev };
                          if (next[k.chunk.id]) delete next[k.chunk.id];
                          else next[k.chunk.id] = { path: k.chunk.path, line: k.chunk.startLine + 1 };
                          return next;
                        })
                      }
                      title="Mark this chunk as containing the answer"
                      aria-pressed={isMarked}
                      className={`rounded border px-1.5 leading-5 ${
                        isMarked
                          ? "border-emerald-700 bg-emerald-900/50 text-emerald-300"
                          : "border-neutral-700 text-neutral-600 hover:border-neutral-500 hover:text-neutral-300"
                      }`}
                    >
                      {isMarked ? "✓" : "+"}
                    </button>
                  )}
                  <span className="text-neutral-300">{k.chunk.path}</span>
                  <span className="text-neutral-600">:{k.chunk.startLine}-{k.chunk.endLine}</span>
                  <span className="text-neutral-500">{n(k.chunk.tokens)}t</span>
                  <span className={k.hops === 0 ? "text-sky-400" : k.hops > 0 ? "text-violet-400" : "text-red-400"}>{k.reason}</span>
                </div>
              );
            })}
            {(tab === "kept" ? r.kept.length : r.nearMisses.length) === 0 && (
              <p className="px-3 py-4 text-xs text-neutral-500">Nothing here at this budget.</p>
            )}
          </section>

          <footer className="mt-6 grid gap-1 text-[11px] leading-relaxed text-neutral-600">
            <p>{data.tokenizerNote}</p>
            <p>
              {n(data.files)} files, {n(data.chunks)} chunks indexed. {n(r.droppedFiles)} files and{" "}
              {n(r.droppedChunks)} chunks not selected. Grep baseline uses the single most selective
              non-stopword term and includes matching files whole, which is what someone competent
              would actually do; the all-terms union would be {n(data.grep.naiveTokens)} tokens.
            </p>
          </footer>
        </>
      )}
    </main>
  );
}

function Stat({ label, value, sub, accent, muted }: { label: string; value: string; sub?: string; accent?: boolean; muted?: boolean }) {
  return (
    <div className="bg-neutral-900 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-neutral-500">{label}</div>
      <div className={`font-mono text-xl ${muted ? "text-neutral-600" : accent ? "text-emerald-400" : "text-neutral-100"}`}>{value}</div>
      {sub && <div className={`text-[11px] ${muted ? "text-amber-600" : "text-neutral-600"}`}>{sub}</div>}
    </div>
  );
}
