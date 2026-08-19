# Founding AI Engineer — Assignment Submission

**Swayam Bhageria**

- Live app: https://context-budget-lab.vercel.app
- Repository: https://github.com/SwayamBhageria/context-budget-lab

---

## What I built

A measuring instrument for context selection.

Every AI coding tool reads part of your repository before answering. None of them
show you which part. You pay for the context, you can't see it, and when the
answer is wrong you can't tell whether retrieval missed something or the model
did. The measurement exists inside these companies — they all have eval suites —
but it is never shown to the person paying at the moment they are paying.

The app takes a repository and a question, selects what should be sent to a
model under a token budget, and reports three things: what it kept and why, what
it dropped, and — the part that matters — **whether the code that actually
answers the question was retrieved at all**.

## Why this, and not something else

Superbrain's pitch is a context engine that cuts token use 60–80% while keeping
repository awareness. I did not want to build a worse version of that; a founder
who works on retrieval daily would take it apart in ninety seconds.

What is missing from the category is not the technique — everyone does retrieval.
What is missing is the scoreboard. So I built the thing that scores it, including
scoring my own approach badly where it deserves it.

## Architecture

Indexing, once per repository, no model involved:

- files split at declaration boundaries into chunks, each token-counted
- symbols each chunk defines recorded
- imports parsed into a dependency graph, resolved to repo-relative paths

Per query, still no model involved:

1. **Score** every chunk with BM25. Rare terms carry weight, common ones do not.
2. **Expand** along the import graph from the best-matching files, at a decayed
   score. This is the step a text search structurally cannot perform.
3. **Pack** by score-per-token as a prefix of a budget-independent priority order.

Everything is deterministic and runs server-side in single-digit milliseconds.
Next.js on Vercel; three repositories indexed at build time and shipped as
fixtures so the demo does not depend on GitHub's availability or rate limit.

## How correctness is measured

This is the part I would want questioned, so I will state the method plainly.

For each benchmark question I located, **by grepping the repository for the
defining expression**, the exact line where the mechanism lives. A question is
answered only if retrieval returns a chunk spanning that line.

Two rules make the number mean something:

- **Ground truth is fixed before the selector runs.** One question in the suite
  had its anchors written after I looked at selector output. It is marked
  `[quarantined]` in the code and excluded from every headline figure, because
  ground truth defined after seeing output is a target drawn around an arrow
  that already landed.
- **Each case declares its expectation before running.** One question is
  declared `expected-hard`, and it fails, at every budget.

## Results

Minimum context needed for full retrieval, against the best-case grep — the
single most selective non-stopword term, with matching files included whole,
which is what a competent engineer actually does:

| Question | Repo | Min context | Best grep | Ratio |
|---|---:|---:|---:|---:|
| clsx: nested arrays and objects | 3,258 | 896 | 1,214 | 1.4× |
| zustand: shallow compares Maps/Sets | 108,567 | 1,924 | 7,638 | 4.0× |
| zustand: devtools connects to what | 108,567 | 15,042 | 33,997 | 2.3× |
| zustand: persist finished hydrating | 108,567 | 3,854 | 15,959 | 4.1× |
| zustand: subscribeWithSelector fires | 108,567 | 616 | 1,811 | 2.9× |
| swr: deduping interval | 36,968 | 2,931 | 17,335 | 5.9× |
| zustand: why no re-render `[hard]` | 108,567 | **never** | 35,979 | — |

**Six of seven questions are answerable from 616–15,042 tokens, 1.4×–5.9× less
than a well-chosen grep (median ~3.4×). The seventh is not answerable at any
budget up to 64,000.**

Recall across the suite, quarantined case excluded:

| Budget | 1k | 4k | 8k | 16k | 32k |
|---|---:|---:|---:|---:|---:|
| Recall | 43% | 71% | 71% | 86% | 86% |

It plateaus at 86% because the hard question never passes. That ceiling is the
honest result and I left it visible rather than dropping the question.

## Decisions, and what changed my mind

**BM25 rather than embeddings.** Embeddings win on questions sharing no
vocabulary with the code, which is exactly the failing question above. They also
need a model call per chunk at ingest, a vector store, and a warm index — none of
which a visitor holding no API key can have. BM25 runs free in milliseconds,
which is what makes a live budget slider possible at all. The cost of that choice
is a question the tool cannot answer, and the tool reports it rather than hiding it.

**Four measurement bugs I found and fixed.** Each one had inflated the result:

1. *Expansion outranked direct matches.* Chunks in a seed file inherited the top
   score in the repository undecayed, so 27-token fragments of a types file won
   the density sort. The selector kept 91 chunks of type definitions and missed
   the code answering the question.
2. *Recall was measured per file.* Retrieving a 22-token fragment of a file's
   first three lines counted as "found the answer". Moving to line anchors
   dropped measured recall at 3.2k from 86% to **57%**.
3. *Retrieval was non-monotone in budget.* Best-fit packing let a larger budget
   displace chunks a smaller one had found — recall read 100% at 200 tokens, 0%
   at 400, 100% at 800. Binary search for a minimum budget over that returns
   noise. Packing is now a prefix of a budget-independent order.
4. *The grep baseline was a strawman.* It unioned every query term, so a common
   word like "state" dragged in 98% of zustand. Switching to the most selective
   term cut the claimed advantage from ~13× to ~3.4×. The smaller number is the
   true one.

**A ratio is withheld when recall is incomplete.** At a 1,000-token budget the UI
was reporting "26.0× vs best grep" while having retrieved one of two anchors. Any
selector can beat grep by a wide margin if it is allowed to return the wrong
code, so the ratio only appears once the answer was actually found.

## Known limits

- Questions with no distinctive vocabulary score flat. This is the documented
  weakness of any lexical method and the reason production systems use embeddings.
- Token counts come from cl100k, not Claude's tokenizer, because exact counting
  is an authenticated API call and this must work for a visitor with no key.
  Absolute counts drift a few percent; the ratios do not, since both sides drift
  together.
- zustand is ~90% markdown by token count. Reduction measured against its total
  flatters the result, so the app reports code-only tokens alongside the total.
- Import resolution covers relative paths, the `@/` alias, and Python dotted
  modules. Custom bundler aliases are not resolved.
- Seven questions is a small suite. It is enough to show the shape and to catch
  four real bugs; it is not enough to claim a general result.

## Product strategy

### What I would change or add next

> **[Swayam — your answers go here after using Superbrain. Do not let me write
> these; they asked for your judgement, and a founder will be able to tell.]**

### UI issues and how they affect users

> **[Swayam — yours as well.]**
>
> One verified observation you may use, if you want it: the in-product
> documentation links are find-and-replaced VS Code URLs —
> `onesuperbrain.com/api/references/activation-events`,
> `onesuperbrain.com/docs/copilot/chat/mcp-servers`. The `copilot` path segment
> survived the rename. A user who clicks help lands on a 404 or on someone
> else's product vocabulary. That is verified from the shipped bundle.
