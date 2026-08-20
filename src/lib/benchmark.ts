import type { Selected } from "./types";

/**
 * The benchmark.
 *
 * Ground truth is anchored to a LINE, not a file. An earlier version credited a
 * hit whenever any chunk of the right file was retrieved, and a 22-token
 * fragment of that file's first three lines — imports, no mechanism — scored as
 * "found the answer". File-level recall is too generous to mean anything.
 *
 * Every anchor below was located by grepping the repository for the defining
 * expression, never by looking at what the selector returned. Ground truth
 * written after seeing output is a target drawn around an arrow that already
 * landed. The one case where that ordering was violated is quarantined and
 * excluded from headline figures.
 *
 * Questions expected to fail are included deliberately. A suite that scores
 * 100% is a suite that was chosen to score 100%.
 */
export interface Anchor {
  path: string;
  /** 1-indexed line, as grep reports it. */
  line: number;
  /** What lives there, and how the line was found. */
  holds: string;
}

export interface BenchmarkCase {
  slug: string;
  question: string;
  anchors: Anchor[];
  /** Shown to the reader when a case fails, so a demonstrated limitation does
   *  not read as a broken app. */
  whyHard?: string;
  /** Declared before the run, so a pass cannot be claimed retroactively. */
  expectation: "should-pass" | "expected-hard";
  quarantined?: string;
}

export const BENCHMARK: BenchmarkCase[] = [
  {
    slug: "karpathy/micrograd",
    question: "how does backward propagate gradients through the graph?",
    anchors: [
      { path: "micrograd/engine.py", line: 54, holds: "Value.backward — seeds grad=1 and walks the topo order (grep 'def backward')" },
      { path: "micrograd/engine.py", line: 59, holds: "build_topo — the topological sort the walk depends on (grep 'build_topo')" },
    ],
    expectation: "should-pass",
  },
  {
    slug: "karpathy/nanoGPT",
    question: "how is causal self-attention masked?",
    anchors: [
      { path: "model.py", line: 49, holds: "register_buffer('bias', torch.tril(...)) — the causal mask itself (grep 'torch.tril')" },
      { path: "model.py", line: 68, holds: "att.masked_fill(self.bias == 0, -inf) — where it is applied (grep 'masked_fill')" },
    ],
    expectation: "should-pass",
  },
  {
    slug: "karpathy/llm.c",
    question: "how does the CPU reference implementation compute attention?",
    anchors: [
      { path: "train_gpt2.c", line: 271, holds: "attention_forward — the CPU reference, distinct from the CUDA kernels (grep 'void attention_forward')" },
    ],
    expectation: "should-pass",
  },
  {
    slug: "pallets/flask",
    question: "how does flask match a URL to a view function?",
    anchors: [
      { path: "src/flask/app.py", line: 969, holds: "dispatch_request — resolves the matched rule to a view (grep 'def dispatch_request')" },
      { path: "src/flask/sansio/app.py", line: 605, holds: "add_url_rule — registers the URL rule against an endpoint (grep 'def add_url_rule')" },
    ],
    expectation: "should-pass",
  },
  {
    slug: "pmndrs/zustand",
    question: "how does shallow compare Maps and Sets?",
    anchors: [
      { path: "src/vanilla/shallow.ts", line: 12, holds: "compareEntries — Map-like comparison (grep 'const compareEntries')" },
      { path: "src/vanilla/shallow.ts", line: 48, holds: "shallow() — prototype check then dispatch (grep 'export function shallow')" },
    ],
    expectation: "should-pass",
  },
  {
    slug: "pmndrs/zustand",
    question: "what does the devtools middleware connect to?",
    anchors: [
      { path: "src/middleware/devtools.ts", line: 203, holds: "window.__REDUX_DEVTOOLS_EXTENSION__ (grep, only file in repo)" },
    ],
    expectation: "should-pass",
  },
  {
    slug: "pmndrs/zustand",
    question: "how does persist know it has finished hydrating?",
    anchors: [
      { path: "src/middleware/persist.ts", line: 354, holds: "hasHydrated: () => hasHydrated — the implementation, not the type (grep)" },
    ],
    expectation: "should-pass",
  },
  {
    slug: "pmndrs/zustand",
    question: "how does subscribeWithSelector decide whether to call the listener?",
    anchors: [
      { path: "src/middleware/subscribeWithSelector.ts", line: 54, holds: "equalityFn || Object.is, then fire on inequality (grep 'equalityFn')" },
    ],
    expectation: "should-pass",
  },
  {
    slug: "pmndrs/zustand",
    question: "why might a component not re-render after a state change?",
    anchors: [
      { path: "src/react.ts", line: 30, holds: "React.useSyncExternalStore subscription (grep)" },
      { path: "src/vanilla.ts", line: 79, holds: "listeners.forEach notify on setState (grep)" },
    ],
    expectation: "expected-hard",
    whyHard:
      "The question is phrased as a symptom while the answer is a mechanism. Every word in it — component, state, change, render — appears throughout the repo, so BM25 has no rare term to grip, and the code that answers it (useSyncExternalStore, a listeners.forEach notify) shares no vocabulary with the question. Turn markdown off and it improves sharply: the docs discussing re-rendering were outranking the code implementing it. Kept in the suite on purpose — a benchmark where every question passes is a benchmark whose questions were chosen to pass.",
  },
];


/**
 * A hit requires a retrieved chunk whose span covers the anchor line.
 * Chunk bounds are 0-indexed half-open; anchors are 1-indexed like grep.
 */
export function measureCase(c: BenchmarkCase, kept: Selected[]) {
  const hits = c.anchors.map((a) => {
    const zero = a.line - 1;
    const covered = kept.some(
      (k) => k.chunk.path === a.path && k.chunk.startLine <= zero && zero < k.chunk.endLine,
    );
    return { ...a, covered };
  });
  const found = hits.filter((h) => h.covered).length;
  return { hits, found, total: c.anchors.length, recallPct: (found / c.anchors.length) * 100 };
}
