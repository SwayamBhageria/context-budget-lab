import path from "node:path";

/** Import specifiers, in the shapes that actually appear in real source. */
const PATTERNS = [
  /\bimport\s+[^'"]*?from\s*['"]([^'"]+)['"]/g,   // import x from "y"
  /\bimport\s*['"]([^'"]+)['"]/g,                  // import "y"
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,       // require("y")
  /\bexport\s+[^'"]*?from\s*['"]([^'"]+)['"]/g,    // export * from "y"
  /^\s*from\s+([\w.]+)\s+import\b/gm,              // python: from x import y
];

const EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py"];

export function extractImports(text: string): string[] {
  const out = new Set<string>();
  for (const re of PATTERNS) {
    for (const m of text.matchAll(re)) out.add(m[1]);
  }
  return [...out];
}

/**
 * Resolve a specifier to a path that exists in this repo.
 *
 * Bare specifiers (`react`, `lodash`) resolve to nothing on purpose — a
 * dependency's source isn't in the repo, so it can never be selected, and
 * pretending otherwise would inflate the graph with dead edges.
 */
export function resolveImport(
  fromFile: string,
  spec: string,
  allPaths: Set<string>,
): string | null {
  let base: string;

  if (spec.startsWith(".")) {
    base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  } else if (spec.startsWith("@/")) {
    // The tsconfig alias every Next.js app ships with.
    base = path.posix.join("src", spec.slice(2));
  } else if (spec.includes(".") && !spec.includes("/")) {
    // Python dotted module: a.b.c -> a/b/c
    base = spec.split(".").join("/");
  } else {
    return null; // bare package specifier
  }

  if (allPaths.has(base)) return base;
  for (const ext of EXTS) {
    if (allPaths.has(base + ext)) return base + ext;
    if (allPaths.has(`${base}/index${ext}`)) return `${base}/index${ext}`;
    if (allPaths.has(`${base}/__init__${ext}`)) return `${base}/__init__${ext}`;
  }
  return null;
}

/** file -> files it imports, and the reverse. Both directions matter: a caller
 *  explains a definition just as often as a definition explains a caller. */
export function buildGraph(files: { path: string; imports: string[] }[]) {
  const allPaths = new Set(files.map((f) => f.path));
  const out = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();

  for (const f of files) {
    const resolved = new Set<string>();
    for (const spec of f.imports) {
      const hit = resolveImport(f.path, spec, allPaths);
      if (hit && hit !== f.path) resolved.add(hit);
    }
    out.set(f.path, resolved);
    for (const target of resolved) {
      if (!incoming.has(target)) incoming.set(target, new Set());
      incoming.get(target)!.add(f.path);
    }
  }
  return { out, incoming };
}

/** Files within `maxHops` of any seed, with the hop count that reached them. */
export function neighbours(
  seeds: string[],
  graph: { out: Map<string, Set<string>>; incoming: Map<string, Set<string>> },
  maxHops: number,
): Map<string, number> {
  const hops = new Map<string, number>();
  let frontier = new Set(seeds);
  for (const s of seeds) hops.set(s, 0);

  for (let hop = 1; hop <= maxHops; hop++) {
    const next = new Set<string>();
    for (const node of frontier) {
      const adjacent = [
        ...(graph.out.get(node) ?? []),
        ...(graph.incoming.get(node) ?? []),
      ];
      for (const n of adjacent) {
        if (!hops.has(n)) {
          hops.set(n, hop);
          next.add(n);
        }
      }
    }
    if (next.size === 0) break;
    frontier = next;
  }
  return hops;
}
