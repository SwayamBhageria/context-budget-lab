import type { Chunk } from "@/lib/types";

/**
 * Split a source file into chunks at top-level declaration boundaries.
 *
 * Deliberately not an AST parse. A tree-sitter pass per language would be more
 * precise, but it costs a WASM download per language and the win is small:
 * what matters for selection is that a chunk is small enough to be cheap and
 * whole enough to be understandable. Indentation-anchored splitting gets that
 * for every C-family and Python-family language at once.
 */
const DECL = /^(export\s+)?(async\s+)?(function|class|const|let|var|interface|type|enum|def|struct|impl|fn|func|package|public|private|protected)\b/;

/** Chunks larger than this are split again; smaller ones absorb their neighbour. */
const MAX_LINES = 80;
const MIN_LINES = 6;

export function chunkFile(path: string, text: string): Omit<Chunk, "tokens">[] {
  const lines = text.split("\n");
  const starts: number[] = [0];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // A top-level declaration (no leading whitespace) starts a new chunk.
    if (line.length > 0 && !/^\s/.test(line) && DECL.test(line)) {
      starts.push(i);
    }
  }

  // Force-split anything that ran long without hitting a declaration.
  const bounded: number[] = [];
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i];
    const to = i + 1 < starts.length ? starts[i + 1] : lines.length;
    bounded.push(from);
    for (let cut = from + MAX_LINES; cut < to; cut += MAX_LINES) bounded.push(cut);
  }

  const chunks: Omit<Chunk, "tokens">[] = [];
  for (let i = 0; i < bounded.length; i++) {
    const startLine = bounded[i];
    const endLine = i + 1 < bounded.length ? bounded[i + 1] : lines.length;
    if (endLine - startLine < MIN_LINES && chunks.length > 0) {
      // Too small to stand alone — fold it into the previous chunk.
      const prev = chunks[chunks.length - 1];
      prev.endLine = endLine;
      prev.text = lines.slice(prev.startLine, endLine).join("\n");
      prev.defines = definedSymbols(prev.text);
      continue;
    }
    const body = lines.slice(startLine, endLine).join("\n");
    if (body.trim().length === 0) continue;
    chunks.push({
      id: `${path}#${startLine}-${endLine}`,
      path,
      startLine,
      endLine,
      text: body,
      defines: definedSymbols(body),
    });
  }
  return chunks;
}

const DEF_NAME =
  /\b(?:function|class|interface|type|enum|def|struct|fn|const|let|var)\s+([A-Za-z_$][\w$]*)/g;

/** Names this chunk introduces — the hooks the import graph joins on. */
export function definedSymbols(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(DEF_NAME)) out.add(m[1]);
  return [...out];
}
