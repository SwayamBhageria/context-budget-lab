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
    slug: "lukeed/clsx",
    question: "how does clsx handle nested arrays and objects?",
    anchors: [
      { path: "src/index.js", line: 1, holds: "toVal() — recurses on arrays, iterates object keys (grep 'function toVal')" },
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
    // No rare term to latch onto: component, state, change appear everywhere.
    // The documented weakness of any lexical method, kept because it is unflattering.
    expectation: "expected-hard",
    whyHard:
      "Every word in this question — component, state, change, render — appears throughout the repo, so BM25 has no rare term to grip and the answer scores no higher than anything else. The answer lives in useSyncExternalStore and a listeners.forEach call, neither of which shares vocabulary with the question. This is the standard failure mode of lexical retrieval and the reason production systems add embeddings. It is in the suite on purpose: a benchmark where every question passes is a benchmark whose questions were chosen to pass.",
  },
  {
    slug: "vercel/swr",
    question: "what is the deduping interval and where is it enforced?",
    anchors: [
      { path: "src/_internal/utils/config.ts", line: 74, holds: "dedupingInterval: 2 * 1000 default (grep)" },
      { path: "src/index/use-swr.ts", line: 585, holds: "setTimeout(cleanupState, config.dedupingInterval) (grep)" },
    ],
    expectation: "should-pass",
  },
  {
    slug: "vercel/swr",
    question: "how does revalidation on focus work?",
    anchors: [
      { path: "src/_internal/utils/web-preset.ts", line: 29, holds: "initFocus registers visibilitychange + focus" },
      { path: "src/index/use-swr.ts", line: 800, holds: "FOCUS_EVENT handling with throttle and isActive gate" },
    ],
    expectation: "should-pass",
    quarantined: "Anchors written after inspecting selector output for this question. Excluded from headline recall.",
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
