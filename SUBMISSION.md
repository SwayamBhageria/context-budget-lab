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

Five repositories, three languages, markdown share from 1% to 89%. The first
three were small JavaScript frontend libraries, which is not what a coding agent
works on; flask and gin were added specifically because that distribution
flattered the result.

| Repo | Tokens | Markdown | Language |
|---|---:|---:|---|
| lukeed/clsx | 3,258 | 59% | JS |
| vercel/swr | 36,968 | 3% | TS |
| pallets/flask | 78,382 | 1% | Python |
| pmndrs/zustand | 108,567 | 89% | TS |
| gin-gonic/gin | 219,137 | 12% | Go |

## Results

Minimum context each strategy needs before it retrieves the ground-truth lines.
Grep is best-case: the single most selective non-stopword term, matching files
included whole — what a competent engineer actually does. Embeddings are
all-MiniLM-L6-v2, run locally.

| Question | Repo | BM25+graph | Best grep | Embeddings |
|---|---:|---:|---:|---:|
| zustand: subscribeWithSelector fires | 108,567 | 616 | 1,811 | **387** |
| zustand: shallow compares Maps/Sets | 108,567 | **1,878** | 7,638 | 2,055 |
| swr: deduping interval | 36,968 | **2,921** | 17,335 | 13,074 |
| zustand: persist finished hydrating | 108,567 | 3,854 | 15,959 | **319** |
| clsx: nested arrays and objects | 3,258 | 3,085 | **1,214** | 3,059 |
| zustand: devtools connects to what | 108,567 | 15,042 | 33,997 | **10,813** |
| flask: URL to view function | 78,382 | **46,047** | 52,344 | 71,736 |
| zustand: why no re-render *(declared hard)* | 108,567 | 88,244 | **35,979** | 38,628 |
| gin: request path to handler | 219,137 | 114,092 | **109,617** | 175,649 |

Every figure is the smallest context in which that strategy retrieves the
ground-truth lines, searched up to the repository's own size — there is no
arbitrary ceiling, because you cannot send more than everything.

**Nothing dominates, and this selector loses four of nine.** It wins clearly on
four questions (2.3×–5.9×), ties flask and gin, and is beaten by grep on clsx
(0.4×) and on the hard zustand question (0.4×). Embeddings win three outright,
including persist by 12× (319 vs 3,854), and are worst of three on flask and gin.

The wins share one property: a rare, distinctive identifier in the question —
`subscribeWithSelector`, `deduping`, `hydrating`, `devtools`. The losses are
questions phrased in their domain's own vocabulary, where no term is selective
and all three methods degrade together.

### The index matters more than the algorithm

Excluding markdown from the index:

| Question | With markdown | Code only | Change |
|---|---:|---:|---|
| zustand: why no re-render | 88,244 | **7,036** | −92% |
| zustand: devtools | 15,042 | 3,147 | −79% |
| zustand: persist | 3,854 | 845 | −78% |
| clsx: nested | 3,085 | 1,156 | −63% |
| zustand: shallow | 1,878 | 709 | −62% |
| zustand: subscribeWithSelector | 616 | 442 | −28% |
| gin: path to handler | 114,092 | 99,634 | −13% |
| flask, swr | unchanged | unchanged | ~0% |

The worst question in the suite improves by 92%. Documentation is written in the
vocabulary people ask questions in and the code implementing the behaviour is
not, so both retrievers rank prose above mechanism. The effect scales with how
doc-heavy the repository is: 89%-markdown zustand is transformed, 3%-markdown swr
is untouched.

Across the suite, excluding markdown helps or does nothing and **never costs**.
An earlier version of this document reported that clsx got 29% *worse* code-only
and built an argument on it. That was an artifact of the non-monotone packing bug
described below, and it reversed once the bug was fixed. It ships as a control
rather than a silent default because how doc-heavy a repository is, is something
its owner knows and this tool does not.

### The advantage largely disappears on representative repos

On the two code-heavy repos — the ones that actually resemble a working codebase
— flask gives a 1.1× advantage over grep and gin gives 1.0×. Both need over half
their repository. All three strategies are close to useless there.

That matters more than the wins. The first three fixtures were small JavaScript
frontend libraries, and on that corpus the selector looked 2.3×–5.9× better than
grep. Adding two ordinary code-heavy repositories collapsed the advantage to
nothing. **A retrieval result measured only on small documented libraries does
not transfer**, and that is a caution that applies to this project's own early
numbers as much as to anyone else's.

Whether the cause is generic query vocabulary or repository size cannot be
separated with nine questions — the hard cases are the two largest repos *and*
the two most generic questions. I am not going to pick one and call it a finding.

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
7. *Packing was still non-monotone after the first fix.* Pass one grows with the
   budget, so the room left over for graph expansion could shrink while the total
   grew, and clsx lost its answer between budgets 1,215 and 1,641. Selection is
   now a single prefix of one fixed order. A monotonicity check over every case
   and budget runs in `scripts/check-monotone.ts` and passes.

**A ratio is withheld when recall is incomplete.** At a 1,000-token budget the UI
reported "26.0× vs best grep" while having retrieved one of two anchors. Any
selector can beat grep if allowed to return the wrong code.

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
