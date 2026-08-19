# Context Budget Lab

Every AI coding tool reads part of your repository before answering, and none of
them show you which part. You pay for the context, you don't get to see it, and
when the answer is wrong you can't tell whether the retrieval missed something.

This makes that visible, and measurable.

Point it at a repository, ask the question you'd ask a coding agent, and it shows
you which slices of the codebase are worth sending — what it kept, what it
dropped, what that costs in tokens, and whether the answer survives the cut.

## What it measures

**Reduction.** Tokens to send the whole repo versus tokens actually selected.

**Recall.** Whether the selected slice still answers the question. Compression is
trivial if you're allowed to be wrong; the number that matters is the smallest
context that stays correct.

**Minimum viable context.** Binary search over the budget to find the point where
a given question stops being answerable from a given repo.

## How selection works

Indexing happens once per repo, on the server, with no model involved:

- files are split at declaration boundaries into chunks
- each chunk is tokenized and its defined symbols recorded
- imports are parsed into a dependency graph

Per query, still with no model involved:

1. **Score** every chunk against the question with BM25. Rare terms carry weight,
   common ones carry none.
2. **Expand** along the import graph from the best-matching files. A definition
   two hops from a match is included at a decayed score — this is the step a text
   search structurally cannot perform.
3. **Pack** by score-per-token until the budget is full.

## Baselines

Compared against two things:

- **send-everything** — the whole repo in the prompt
- **grep** — every file containing a distinctive query term, included whole

Beating send-everything is arithmetic. Beating grep is the actual claim, because
grep-then-read is roughly what an agent does with no index. The report lists the
files the selector reached that grep could not.

## Deliberate tradeoffs

**BM25, not embeddings.** Embeddings score better on questions sharing no
vocabulary with the code — "why is this slow?" has nothing to latch onto. They
also require a model call per chunk at ingest, a vector store, and a warm index.
BM25 runs in milliseconds for free, which is what makes the live budget slider
possible. The cost of that choice is real and the app reports it rather than
hiding it.

**Indentation-anchored chunking, not an AST parse.** tree-sitter is more precise
and costs a WASM payload per language. What selection needs is chunks small
enough to be cheap and whole enough to be understood; declaration-boundary
splitting gets that across every C-family and Python-family language at once.

**Local tokenizer.** Exact counts require an authenticated API call, and this has
to work for a visitor with no key. Counts come from cl100k. Absolute numbers
drift a few percent from Claude's tokenizer; the reduction ratio does not,
because both sides drift together.

## Known limits

- Questions with no distinctive vocabulary score flat — the weak spot of any
  lexical method, and precisely what embeddings exist to fix.
- Import resolution covers relative paths, the `@/` alias, and Python dotted
  modules. Custom bundler aliases are not resolved.
- Bare package specifiers resolve to nothing on purpose: a dependency's source
  isn't in the repo, so it can never be selected.

## Running locally

```bash
npm install
npm run dev
```

No API key is required for indexing, scoring, selection, or any of the reported
numbers. A key is only needed to generate answers live; the bundled repositories
ship with their answers pre-recorded so the deployed app works without one.

Keys pasted into the UI are held in the browser and forwarded per request. They
are never persisted or logged.
