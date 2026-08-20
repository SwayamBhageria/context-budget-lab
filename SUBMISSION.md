# Founding AI Engineer Assignment

Swayam Bhageria

Live app: https://context-budget-lab.vercel.app
Repo: https://github.com/SwayamBhageria/context-budget-lab

---

## What I built

A measuring instrument for context retrieval.

Every AI coding tool reads part of your repo before it answers, and none of them
show you which part. You pay for that context, you cannot see it, and when the
answer is wrong you cannot tell if retrieval missed something or the model did.
These companies all measure this internally. Nobody shows it to the person
paying, at the moment they are paying.

The app takes a repo and a question, picks what to send under a token budget,
and reports three things. What it kept and why. What it dropped. And whether the
code that actually answers the question was retrieved at all.

## Why this and not a better context engine

I did not want to build a worse version of TokenFold. Anyone who works on
retrieval every day would take that apart in two minutes.

What the category is missing is not the technique. Everyone does retrieval. What
is missing is the scoreboard. So I built the scoreboard, and it scores my own
approach badly in four places.

## How it works

Indexing runs once per repo with no model involved. Files get split at
declaration boundaries into chunks, each chunk is token counted, defined symbols
are recorded, imports are parsed into a dependency graph.

Per query, still no model:

1. Score every chunk with BM25. Rare terms carry weight, common ones do not.
2. Expand along the import graph from the best matches at a decayed score. This
   is the step a text search cannot do.
3. Pack by score per token, as a single prefix of one fixed priority order.

All deterministic, single digit milliseconds, no API key anywhere. That last
part is why the budget slider can be live and why the demo works for anyone who
opens the link.

## How I check correctness

For every benchmark question I found the exact line where the mechanism lives,
by grepping the repo, before the selector ever ran. A question counts as
answered only if retrieval returns a chunk covering that line. Getting the right
file is not enough. An early version credited a 22 token fragment of a file's
first three lines as a hit.

Three rules make the number mean something.

Ground truth is fixed before the selector runs. Every case declares whether it
should pass before running. Questions I expect to fail stay in the suite,
because a suite where everything passes is a suite I picked to pass.

## The corpus

Five repos, four languages, 2k to 316k tokens, markdown share from 1% to 89%.

| Repo | Tokens | Markdown | Language | Why it is in |
|---|---:|---:|---|---|
| karpathy/micrograd | 2,089 | 39% | Python | Too small for selection to be worth anything |
| karpathy/nanoGPT | 17,282 | 23% | Python | The working zone |
| pallets/flask | 78,382 | 1% | Python | Code heavy counter case |
| pmndrs/zustand | 108,567 | 89% | TS | Doc heavy, this is what made the markdown effect show up |
| karpathy/llm.c | 316,057 | 13% | C / CUDA | Scale, and a language the chunker was not written for |

I picked these by measuring candidates, not by taste. `scripts/pick-corpus.ts`
has the run. Any other public repo can be indexed live, capped at 2.5MB of
source. Over that it refuses and tells you the real size instead of indexing
part of it.

## Results

Smallest context where each strategy retrieves the ground truth lines, searched
up to the repo's own size. No arbitrary ceiling, because you cannot send more
than everything. Grep is best case: the single most selective non stopword term,
matching files included whole, which is what a competent person actually does.

| Question | Repo | Mine | Best grep | Ratio |
|---|---:|---:|---:|---:|
| micrograd: how backward propagates | 2,089 | 1,475 | 806 | 0.5x |
| nanoGPT: how causal attention is masked | 17,282 | 1,199 | 4,139 | 3.5x |
| llm.c: the CPU reference attention pass | 316,057 | 65,521 | 160,776 | 2.5x |
| flask: URL to view function | 78,382 | 21,989 | 52,344 | 2.4x |
| zustand: shallow compares Maps and Sets | 108,567 | 1,257 | 7,638 | 6.1x |
| zustand: what devtools connects to | 108,567 | 7,277 | 33,997 | 4.7x |
| zustand: how persist knows it hydrated | 108,567 | 13,890 | 15,959 | 1.1x |
| zustand: when subscribeWithSelector fires | 108,567 | 2,253 | 1,811 | 0.8x |
| zustand: why a component does not re-render | 108,567 | 63,043 | 35,979 | 0.6x |

Six of nine beat grep. Three lose. llm.c holding at 2.5x matters to me because
that is 316k tokens of C and CUDA, a language family the chunker was not built
for.

The wins all have one thing in common. A rare identifier in the question, like
subscribeWithSelector or devtools or masked. The losses are questions written in
the domain's own vocabulary, where nothing is selective and every method degrades
together.

## Three things I found that I did not expect

### The index matters more than the algorithm

Taking markdown out of the index:

| Question | With markdown | Code only | Change |
|---|---:|---:|---|
| zustand: why no re-render | 63,043 | 7,036 | 89% less |
| zustand: devtools | 7,277 | 3,147 | 57% less |
| zustand: persist | 13,890 | 845 | 94% less |
| llm.c: CPU attention | 65,521 | 60,759 | 8% less |
| flask, nanoGPT, micrograd | roughly flat | roughly flat | 0 to 2% |

Docs are written in the vocabulary people ask questions in. The code that
implements the behaviour is not. So every retriever ranks prose above mechanism.
It scales with how doc heavy the repo is, so 89% markdown zustand is transformed
and the code heavy repos barely move.

I made this a toggle instead of a default, because how doc heavy a repo is, is
something its owner knows and the tool does not.

### Better chunks did not mean better retrieval

The chunker only counted a declaration at column zero as a boundary, so methods
inside a class were invisible and long classes got sliced blindly every 80 lines.
flask was force splitting 33% of its chunks that way, worse than llm.c at 9%.

Fixing it improved every structural metric. flask force splits went to 2%.
Chunks carrying a recognised symbol went from 63% to 90% on llm.c.

Retrieval did not follow. Four questions got better, four got worse, one flat,
mean advantage moved 2.4x to 2.5x. Finer chunks are cheaper to include but each
one is a weaker signal because it carries fewer surrounding terms.

I would have shipped that as an improvement on the strength of "33% to 2%" if I
had not re-run the benchmark. I kept it, but for correctness reasons and not for
the average. A method is a declaration, and a blind cut can land in the middle of
a function. I deliberately did not tune the minimum chunk size to win back the
four regressions, because tuning a knob against this benchmark empties the
benchmark of meaning.

### Nine questions cannot rank two retrieval methods

I ran a dense baseline as well, all-MiniLM-L6-v2, locally, no API.

| Question | Mine | Embeddings |
|---|---:|---:|
| llm.c: CPU attention | 65,521 | 6,594 |
| zustand: persist | 13,890 | 936 |
| zustand: subscribeWithSelector | 2,253 | 294 |
| micrograd: backward | 1,475 | 571 |
| nanoGPT: causal mask | 1,199 | 885 |
| flask: URL to view | 21,989 | 28,820 |
| zustand: devtools | 7,277 | 13,992 |
| zustand: shallow | 1,257 | 2,016 |
| zustand: why no re-render | 63,043 | 66,372 |

Five to four for embeddings, basically a coin flip.

The reason I am writing this as a caution and not a result is that an earlier run
of exactly this comparison came out eight to one for embeddings. Both runs were
fair, each measured both methods on identical chunks. The only thing that changed
between them was chunk granularity, which touches neither retriever.

So I am not going to tell you which retriever is better. What survives both runs
is narrower and more useful. The two fail on different questions, so their errors
are not correlated, which is an argument for hybrid retrieval rather than for
either one.

BM25 is what ships and that choice stands on deployability. It runs free in
milliseconds with no key, no vector store, no warm index, which is the only
reason a keyless public demo and a live slider exist. Both numbers sit next to
each other in the app so anyone can see what that cost.

## What measurement reversed

Every one of these made the result look better than it was, and every one was
caught by running something rather than thinking about it.

1. Expansion could outrank direct matches. Chunks in a seed file inherited the
   repo's top score undecayed, so 27 token fragments of a types file won the
   density sort and the selector missed the answer.
2. Recall was measured per file, so a 22 token fragment of a file's first three
   lines counted as finding the answer. Line anchors dropped measured recall at
   3.2k from 86% to 57%.
3. Retrieval was non monotone in budget. Best fit packing let a bigger budget
   displace chunks a smaller one had found, so binary search over it was noise.
   Selection is one prefix of one fixed order now, and there is a check that
   verifies it across every case and budget.
4. The grep baseline was a strawman. It unioned every query term so a common word
   pulled in 98% of zustand. Using the most selective term cut my claimed
   advantage from about 13x to about 3x. The smaller number is the real one.
5. I said embeddings were the fix for the failing question, in the app, before I
   tested it. They are not. The ten nearest neighbours are all markdown and the
   answer sites rank 134th and 170th.
6. Two questions were reported as unretrievable at any budget. They were not.
   That was an arbitrary 64,000 token search ceiling while embeddings got to rank
   the whole repo. Both resolve, and both are then beaten by grep.
7. The indexer silently read 17% of llm.c. The source filter had no .c, .h or
   .cu, so it indexed 157KB of Python and markdown, ignored 950KB of C and CUDA,
   and reported a confident 85.6% reduction over the sliver it saw. Nothing
   raised. Every repo reports its coverage now, because the only reason that was
   invisible is that nothing was measuring it.
8. The tokenizer refused the corpus the tool is for. js-tiktoken throws on
   special tokens and `<|endoftext|>` is ordinary source text in ML code, so
   seven of ten candidate AI repos failed to ingest. One argument fixed it.

## Known limits

Nine questions is a small suite. Enough to show the shape and to catch eight real
errors. Not enough to claim a general result, and I have not quoted one.

Ground truth is my reading of each repo. It is auditable, every anchor records
the grep that found it, but it is one person's.

The dense baseline is one small general purpose model. A code trained embedding
model would probably behave differently and I have not tested one.

Token counts come from cl100k and not Claude's tokenizer, because exact counting
is an authenticated API call and this has to work for someone with no key. The
ratios are unaffected since both sides move together.

Import resolution handles relative paths, the `@/` alias and Python dotted
modules. Custom bundler aliases are not resolved.

All five repos are open source libraries. None is a private application codebase,
which is the actual target, though any public repo can be indexed live.

## Product strategy

I built and used Superbrain to do this. Everything below is from actually using
it, and where I make a factual claim I checked it rather than assuming.

### What I would change or add next

**Show which model answered.** The picker says Auto. I could not tell what was
answering me. The app already knows, the session transcript records
`modelId: deepseek-v4-flash` alongside `superbrain:auto`, plus input tokens,
output tokens and cache reads. So this is not a technical problem, the data is
sitting in the file, it just is not rendered. I would put the resolved model name
in the message header, not only in the context panel.

This is bigger than a display nit. I opened a private repo and asked what it was.
The answer came back quoting my own config, and I had no way to know it went to
DeepSeek and not Anthropic. For anyone with a client contract or an NDA that is
the difference between using the product and not using it. Auto routing is a good
default. Auto routing you cannot inspect after the fact is a trust problem.

**A manual compact button.** There is a context meter showing usage against the
limit, which is good, and then nothing you can do about it. I looked for a
compact or summarise action and there is none in the build. Every string in the
bundle with compact in it is inherited VS Code UI density vocabulary. Showing
someone a filling bar with no lever is worse than not showing the bar.

**Show what TokenFold selected.** This is the part I care about most and it is why
I built what I built. TokenFold ships real machinery, a 106MB local embedding
model and a 1.1GB local reranker, so the reduction costs no API tokens, which is
genuinely the right architecture. But I cannot see what it picked. If I could see
which files it pulled in and which it skipped for a given question, I could tell
whether a bad answer was retrieval's fault or the model's. Right now I cannot,
and neither can you, in front of a customer.

**Hybrid retrieval.** From my own numbers, BM25 and dense embeddings fail on
different questions, five to four with uncorrelated errors. TokenFold is embed
plus rerank. A cheap lexical pass costs nothing next to a 1.1GB reranker and
would cover the queries where a dense model gets pulled to documentation instead
of implementation, which I measured happening.

**The thing you already do that I would build on.** The chat told me
"Not verified: 10 citations point at files this session never opened". I have not
seen another tool admit that. It is the same instinct as my project. I would make
it louder, not quieter, and I would extend it to retrieval, so it also says what
it looked at and did not find.

### UI issues and how they hit users

**New chat wipes the current chat.** This is the one that actually cost me. I hit
new chat expecting a second conversation and the first one was gone from view.
Sessions do persist, they are written as jsonl per workspace, so the data model
already supports many chats and the UI just does not list them. VS Code with the
Claude extension puts a new chat alongside the old ones. Here it replaces. When
a user is comparing two approaches, or wants to go back to what the agent said
twenty minutes ago, losing the thread is the fastest way to make them distrust
the tool.

**Auto with no resolution.** Covered above. Two dropdowns both saying Auto tells
me nothing about what just happened.

**Help links are dead.** The in product docs links are VS Code URLs with the
domain swapped. `onesuperbrain.com/docs/copilot/chat/mcp-servers` returns 404,
and the same path on `code.visualstudio.com` returns 200. The word copilot even
survived the rename. A user clicking help at the moment they are confused lands
on nothing, which is the worst possible moment to lose them.

**The context meter is read only.** Same point as the compact button, but as a UI
issue it is specifically that the meter looks interactive and is not.
