# Context Budget Lab

Every AI coding tool reads part of your repository before answering, and none of
them show you which part. You pay for that context, you can't see it, and when
the answer is wrong you can't tell whether retrieval missed something or the
model did.

This makes it visible and measurable. Point it at a repository, ask what you'd
ask a coding agent, and see what a token budget actually buys — measured against
grep and against dense retrieval, and checked against where the answer really
lives.

**Live:** https://context-budget-lab.vercel.app

## What it measures

**Minimum viable context** — the smallest budget at which retrieval returns the
code that answers the question. Binary search over the budget, which is only
sound because retrieval is monotone in budget (see `scripts/check-monotone.ts`).

**Recall against ground truth** — for each benchmark question, the exact line
where the mechanism lives, located by grepping the repository *before* the
selector ever ran. Returning the right file is not enough; a chunk must span the
line.

**Three strategies on the same footing** — BM25 + import-graph expansion (what
ships), a best-case grep, and a local dense baseline (all-MiniLM-L6-v2).

## How selection works

Indexing runs once per repository with no model involved: files are split at
declaration boundaries into chunks, each is token-counted, defined symbols are
recorded, and imports are parsed into a dependency graph.

Per query, still no model:

1. **Score** every chunk with BM25 — rare terms carry weight, common ones don't.
2. **Expand** along the import graph from the best matches at a decayed score.
   This is the step a text search structurally cannot perform.
3. **Pack** by score-per-token as a single prefix of one fixed priority order.

Deterministic, single-digit milliseconds, no API key anywhere. That is what makes
a live budget slider and a keyless public demo possible at all.

## The corpus

| Repo | Tokens | Markdown | Language | Why |
|---|---:|---:|---|---|
| karpathy/micrograd | 2,089 | 39% | Python | Too small for selection to earn its place |
| karpathy/nanoGPT | 17,282 | 23% | Python | The working zone |
| pallets/flask | 78,382 | 1% | Python | Code-heavy counter-case |
| pmndrs/zustand | 108,567 | 89% | TS | Doc-heavy — makes the markdown effect visible |
| karpathy/llm.c | 316,057 | 13% | C / CUDA | Scale, and a language family outside the chunker's origins |

Chosen by measurement (`scripts/pick-corpus.ts`), not by taste. Any other public
repository can be indexed live, capped at 2.5MB of source — over that the app
refuses with the real size rather than truncating.

## Findings

**The index matters more than the algorithm.** Excluding markdown moves zustand's
questions by 28–92%, and moves the code-heavy repos by 0–8%. Documentation is
written in the vocabulary people ask questions in and the implementing code is
not, so every retriever ranks prose above mechanism — but only where there is
enough prose to matter.

**Chunk quality does not predict retrieval quality.** Making class methods into
chunk boundaries cut flask's blind force-splits from 33% to 2% and raised symbol
coverage across the corpus. Retrieval went four better, four worse, one flat.

**Nine questions cannot rank two retrieval methods.** BM25 versus dense read 8–1
for dense on one chunking and 5–4 on another. Both runs were internally fair; the
only thing that changed touched neither retriever. What survives both is that the
two fail on *different* questions — an argument for hybrid retrieval, not for
either one.

## Method notes

Ground truth is fixed before the selector runs, every case declares its
expectation in advance, and questions expected to fail are kept — a suite that
scores 100% is a suite whose questions were chosen to score 100%.

Repositories report what share of their source was indexed. That check exists
because its absence hid a real bug: the source filter had no `.c`/`.h`/`.cu`, so
llm.c indexed 17% of itself and reported a confident reduction over the fraction
it saw.

## Running it

```bash
npm install
npm run dev
```

No API key is required for indexing, scoring, selection, or any reported number.

| Script | What it produces |
|---|---|
| `scripts/minimum.ts` | Minimum context per question vs grep |
| `scripts/bench.ts` | Recall across a budget sweep |
| `scripts/markdown-effect.ts` | Index-with-docs vs code-only |
| `scripts/build-embeddings.ts` | Dense baseline, run locally |
| `scripts/check-monotone.ts` | Verifies retrieval is monotone in budget |
| `scripts/chunk-quality.ts` | Force-split and symbol coverage by language |
| `scripts/selectivity.ts` | Whether advantage tracks query vocabulary or repo size |
| `scripts/pick-corpus.ts` | How the corpus was chosen |
| `scripts/verify-ui.ts` | Headless smoke test of the deployed app |

## Known limits

- Nine questions is a small suite. Enough to show shape and to surface eleven
  real errors; not enough to claim a general result.
- Ground truth is one person's reading, though every anchor records the grep that
  found it.
- The dense baseline is one small general-purpose model; a code-trained embedding
  model would likely behave differently.
- Token counts come from cl100k, not Claude's tokenizer — exact counting is an
  authenticated API call and this must work for a visitor with no key. Ratios are
  unaffected since both sides drift together.
- Import resolution covers relative paths, the `@/` alias, and Python dotted
  modules. Custom bundler aliases are not resolved.
