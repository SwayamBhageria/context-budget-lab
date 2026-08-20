# Founding AI Engineer — Assignment Submission

**Swayam Bhageria**

- Live app: https://context-budget-lab.vercel.app
- Repository: https://github.com/SwayamBhageria/context-budget-lab

---

## What I built

A measuring instrument for context retrieval.

Every AI coding tool reads part of your repository before answering. None of them
show you which part. You pay for that context, you can't see it, and when the
answer is wrong you can't tell whether retrieval missed something or the model
did. The measurement exists inside these companies — they all have eval suites —
but it is never shown to the person paying, at the moment they are paying.

The app takes a repository and a question, selects what to send under a token
budget, and reports what it kept, what it dropped, and whether the code that
actually answers the question was retrieved at all. It measures three retrieval
strategies against the same fixed ground truth.

## Why this, and not a better context engine

Superbrain's pitch is a context engine that cuts token use 60–80% while keeping
repository awareness. Building a worse version of that is a losing move — a
founder who works on retrieval daily would take it apart in ninety seconds.

What the category lacks isn't the technique. Everyone does retrieval. What it
lacks is the scoreboard. So I built the scoreboard, and it scores my own approach
badly in several places.

## Architecture

Indexing, once per repository, no model involved: files split at declaration
boundaries into chunks, each token-counted, imports parsed into a dependency
graph. Per query, still no model: BM25 scoring, expansion along the import graph
at a decayed score, then packing by score-per-token as a prefix of a
budget-independent priority order.

Deterministic, single-digit milliseconds, no API key anywhere. Next.js on Vercel;
five repositories indexed at build time and shipped as fixtures so the demo
doesn't depend on GitHub's rate limit and the numbers a reviewer sees are the
numbers that were measured.

## How correctness is measured

For each benchmark question I located, **by grepping the repository for the
defining expression**, the exact line where the mechanism lives. A question is
answered only if retrieval returns a chunk spanning that line. Reaching the right
file is not enough — an early version credited a 22-token fragment of a file's
first three lines as a hit.

Three rules make the number mean something:

- **Ground truth is fixed before the selector runs.** One question had its
  anchors written after I looked at output. It is marked `quarantined` in the
  code and excluded from every headline figure.
- **Each case declares its expectation before running**, so a pass can't be
  claimed retroactively.
- **Questions expected to fail are kept.** A suite that scores 100% is a suite
  chosen to score 100%.

## The corpus

Five repositories, four languages, 2k to 316k tokens, markdown share 1% to 89%.
An earlier version used small JavaScript frontend libraries, which is neither
what a coding agent works on nor anything an AI engineer would recognise.

| Repo | Tokens | Markdown | Language | Why it is here |
|---|---:|---:|---|---|
| karpathy/micrograd | 2,089 | 39% | Python | Too small for selection to earn its place |
| karpathy/nanoGPT | 17,282 | 23% | Python | The working zone |
| pallets/flask | 78,382 | 1% | Python | Code-heavy counter-case |
| pmndrs/zustand | 108,567 | 89% | TS | Doc-heavy — makes the markdown effect visible |
| karpathy/llm.c | 316,057 | 13% | C / CUDA | Scale, and a language the chunker was not built for |

Any other public repository can be indexed live, capped at 2.5MB of source. The
cap is derived from measurement — 664,820 tokens index in 3.0s locally — and over
it the app refuses with the real size rather than truncating.

## Results

Minimum context each strategy needs before it retrieves the ground-truth lines.
Grep is best-case: the single most selective non-stopword term, matching files
included whole — what a competent engineer actually does. Embeddings are
all-MiniLM-L6-v2, run locally.

| Question | Repo | BM25+graph | Best grep | Ratio |
|---|---:|---:|---:|---:|
| micrograd: how backward propagates gradients | 2,089 | 567 | 806 | 1.4× |
| nanoGPT: how causal self-attention is masked | 17,282 | 1,077 | 4,139 | 3.8× |
| llm.c: the CPU reference attention pass | 316,057 | 66,385 | 160,776 | 2.4× |
| flask: URL to view function | 78,382 | 46,047 | 52,344 | 1.1× |
| zustand: shallow compares Maps/Sets | 108,567 | 2,245 | 7,638 | 3.4× |
| zustand: devtools connects to what | 108,567 | 15,603 | 33,997 | 2.2× |
| zustand: persist finished hydrating | 108,567 | 4,038 | 15,959 | 4.0× |
| zustand: subscribeWithSelector fires | 108,567 | 616 | 1,811 | 2.9× |
| zustand: why no re-render *(declared hard)* | 108,567 | 87,073 | 35,979 | **0.4×** |

Every figure is the smallest context in which the strategy retrieves the
ground-truth lines, searched up to the repository's own size — no arbitrary
ceiling, because you cannot send more than everything.

**Eight of nine beat grep; one loses badly.** The win holds on llm.c, 316k tokens
of C and CUDA at 2.4×, which matters because the chunker was not written for that
language family. The loss is the pre-registered hard case, where grep is 2.4×
better than this selector.

The wins share one property: a rare identifier in the question —
`subscribeWithSelector`, `hydrating`, `devtools`, `masked`, `backward`. The two
weakest results, flask at 1.1× and the hard zustand question at 0.4×, are the two
questions phrased entirely in their domain's own vocabulary, where no term is
selective and every method degrades together.

### The method comparison is not stable, and that is the result

A dense baseline (all-MiniLM-L6-v2, run locally, no API) measured on the same
questions, the same ground truth, and the same chunks.

| Question | BM25+graph | Embeddings |
|---|---:|---:|
| micrograd: backward | 1,475 | **571** |
| nanoGPT: causal mask | 1,199 | **885** |
| llm.c: CPU attention | 65,521 | **6,594** |
| flask: URL to view | **21,989** | 28,820 |
| zustand: shallow | **1,257** | 2,016 |
| zustand: devtools | **7,277** | 13,992 |
| zustand: persist | 13,890 | **936** |
| zustand: subscribeWithSelector | 2,253 | **294** |
| zustand: why no re-render | **63,043** | 66,372 |

Five to four for embeddings — close to a coin flip.

The reason this section is framed as a caution rather than a result: **an earlier
run of exactly this comparison gave eight to one for embeddings.** Both runs were
internally fair, each measuring both methods on identical chunks. The only thing
that changed between them was chunk granularity — an implementation detail that
touches neither retriever.

Nine questions is not enough to rank two retrieval methods. A conclusion that
flips from 8–1 to 5–4 because chunk boundaries moved is not a conclusion about
the methods, and I am not going to present one. What can be said is narrower and
survives both runs: the two fail on different questions, so their errors are not
correlated, which is an argument for hybrid retrieval rather than for either one.

BM25 is what ships, and that choice stands on deployability: it runs free in
single-digit milliseconds with no key, no vector store and no warm index, which
is what makes a keyless public demo and a live budget slider possible. Both
numbers are shown side by side in the app so a reader can see the tradeoff rather
than take my word for it.

### The index matters more than the algorithm

Excluding markdown from the index:

| Question | With markdown | Code only | Change |
|---|---:|---:|---|
| zustand: why no re-render | 87,073 | **7,036** | −92% |
| zustand: devtools | 15,603 | 3,147 | −80% |
| zustand: persist | 4,038 | 845 | −79% |
| zustand: shallow | 2,245 | 709 | −68% |
| zustand: subscribeWithSelector | 616 | 442 | −28% |
| llm.c: CPU attention | 66,385 | 60,759 | −8% |
| micrograd, nanoGPT, flask | ~unchanged | ~unchanged | 0–2% |

The worst question in the suite improves by 92%. Documentation is written in the
vocabulary people ask questions in and the code implementing the behaviour is
not, so both retrievers rank prose above mechanism. The effect scales precisely
with how doc-heavy the repository is: 89%-markdown zustand is transformed, while
the code-heavy AI repos move 0–8%.

Across the suite, excluding markdown helps or does nothing and **never costs**.
An earlier version of this document reported that clsx got 29% *worse* code-only
and built an argument on it. That was an artifact of the non-monotone packing bug
described below, and it reversed once the bug was fixed. It ships as a control
rather than a silent default because how doc-heavy a repository is, is something
its owner knows and this tool does not.

### The corpus changes the answer

An intermediate corpus included `gin-gonic/gin`, where the advantage collapsed to
1.0× and the selector needed half the repository. Swapping corpora moved the
headline more than any algorithm change did.

That is the caution I would want stated loudest, and it applies to this project's
own numbers as much as anyone else's: **a retrieval result is a property of the
corpus it was measured on.** flask still sits at 1.1× here. Nine questions across
five repositories is enough to show that the spread is wide; it is not enough to
claim a general figure, and I have not quoted one.

## Chunk quality does not predict retrieval quality

The chunker only treated a declaration at column zero as a boundary, so methods
inside a class were invisible and long classes were sliced blindly every 80
lines. flask force-split 33% of its chunks that way — the worst in the corpus,
against 9% for the C repository that supposedly wasn't supported.

Fixing it improved every structural metric: flask's force-splits fell to 2%, and
chunks carrying a recognised symbol rose from 63% to 90% on llm.c and 39% to 58%
on nanoGPT.

Retrieval did not follow.

| Question | Before | After |
|---|---:|---:|
| flask: URL to view | 1.1× | **2.4×** |
| zustand: shallow | 3.4× | **6.1×** |
| zustand: devtools | 2.2× | **4.7×** |
| zustand: why no re-render | 0.4× | 0.6× |
| llm.c: CPU attention | 2.4× | 2.5× |
| nanoGPT: causal mask | 3.8× | 3.5× |
| micrograd: backward | 1.4× | **0.5×** |
| zustand: persist | 4.0× | **1.1×** |
| zustand: subscribeWithSelector | 2.9× | **0.8×** |

Four better, four worse, one flat; mean advantage 2.4× to 2.5×. Finer chunks are
cheaper to include but weaker signals individually, because each carries fewer
surrounding terms. **A chunker that scores better on boundary quality is not
therefore a better retriever**, and I would have shipped this as an improvement
on the strength of "33% to 2%" alone had I not re-run the benchmark.

Kept anyway, on grounds that are not the mean: a method is a declaration, so the
old behaviour was structurally wrong; blind cuts can land mid-function, which is
a correctness risk regardless of average performance; and flask, the repository
most like real work, improved 2.2×. `MIN_LINES` is deliberately not tuned to
recover the losses — tuning a parameter against this benchmark would make the
benchmark meaningless.

## Decisions, and five things measurement reversed

**BM25 rather than embeddings, as the shipped selector.** Embeddings need a
model call per chunk at ingest, a vector store, and a warm index; running one in
a serverless function adds tens of megabytes and seconds of cold start, which
kills the live budget slider. BM25 runs free in milliseconds. Embeddings are
included as a measured baseline instead — which turned out to be more useful than
shipping them would have been.

Five things I asserted and measurement contradicted:

1. *Expansion could outrank direct matches.* Seed-file chunks inherited the
   repo's top score undecayed, so 27-token type fragments won the density sort.
2. *Recall was measured per file*, so a fragment of a file's first three lines
   counted as finding the answer. Line anchors dropped measured recall at 3.2k
   from 86% to **57%**.
3. *Retrieval was non-monotone in budget* — best-fit packing let a larger budget
   displace chunks a smaller one had found. Binary search over that is noise.
4. *The grep baseline was a strawman*, unioning every query term so a common word
   dragged in 98% of zustand. Fixing it cut the claimed advantage from ~13× to
   ~3.4×, and the smaller number is the true one.
5. **I claimed embeddings were the fix for the failing question. They are not.**
   Measured on the same chunks, the ten nearest neighbours are all markdown and
   the answer sites rank 134th and 170th. That claim shipped in the app before I
   tested it, which is exactly the error the rest of this document exists to
   prevent.
6. *Two questions were reported as unretrievable at any budget.* They were not —
   that was an arbitrary 64,000-token search ceiling while embeddings were
   allowed to rank the whole repository. With the ceiling set to the repo's own
   size, both resolve, and both are then beaten by grep.
7. **The indexer silently read 17% of a repository.** The source-file filter had
   no `.c`, `.h`, `.cu` or `.cpp`, so `llm.c` indexed 157KB of Python and
   markdown, ignored 950KB of C and CUDA, and reported a confident 85.6%
   reduction over the fraction it saw. Nothing raised — it simply succeeded.
   Indexing the real thing takes the repo from 52,762 to 316,057 tokens. Every
   repository now reports what share of its source was indexed, because the only
   reason that bug was invisible is that nothing was measuring it.
8. **The tokenizer refused the corpus the tool is aimed at.** `js-tiktoken`
   throws on special tokens, and `<|endoftext|>` appears as ordinary source
   throughout ML code — seven of ten candidate AI repositories failed to ingest.
   One argument fixed it. It would never have surfaced on frontend libraries.
9. *Packing was still non-monotone after the first fix.* Pass one grows with the
   budget, so the room left over for graph expansion could shrink while the total
   grew, and clsx lost its answer between budgets 1,215 and 1,641. Selection is
   now a single prefix of one fixed order. A monotonicity check over every case
   and budget runs in `scripts/check-monotone.ts` and passes.

**A ratio is withheld when recall is incomplete.** At a 1,000-token budget the UI
reported "26.0× vs best grep" while having retrieved one of two anchors. Any
selector can beat grep if allowed to return the wrong code.

## Live repositories

Any public repo can be indexed on demand, which is how an interviewer's own
codebase gets in. It is capped at 2.5MB of indexable source — derived from
measuring 664,820 tokens indexed in 3.0s locally, then leaving headroom for a
slower serverless instance inside a 60-second limit. Over the cap the app refuses
and names the real size: `vllm-project/vllm` returns 413 with "42.5MB of
indexable source". Truncating to fit and reporting a number would reproduce
exactly the llm.c failure above.

Live repos carry no pre-registered ground truth, so no recall is shown.

## Questions outside the benchmark

Typed questions have no ground truth, so there is no verified minimum — and the
first version silently did nothing when asked, then reported a saturation figure
larger than a budget that visibly worked. The fix uses the only oracle available:
the reader marks the chunk that answers their question and the search runs
against that. Results are labelled `user-marked` and never mixed with the
pre-registered benchmark.

## Known limits

- **Nine questions is a small suite.** Enough to show shape and to catch five
  real errors; not enough to claim a general result.
- Ground truth is my reading of each repository. It is auditable — every anchor
  records the grep that found it — but it is one person's.
- Token counts come from cl100k, not Claude's tokenizer, because exact counting
  is an authenticated API call and this must work for a visitor with no key.
  Ratios are unaffected; both sides drift together.
- The embedding baseline is one small model. A code-trained embedding model would
  likely behave differently, and I have not tested one.
- Import resolution covers relative paths, the `@/` alias, and Python dotted
  modules. Custom bundler aliases are not resolved.

## Product strategy

### What I would change or add next

> **[Swayam — yours, after using Superbrain.]**

### UI issues and how they affect users

> **[Swayam — yours as well.]**
>
> One verified observation if you want it: the in-product documentation links are
> find-and-replaced VS Code URLs — `onesuperbrain.com/docs/copilot/chat/mcp-servers`
> — the `copilot` segment survived the rename, so clicking help lands users on a
> 404 or another product's vocabulary.
