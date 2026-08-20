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
const DECL = /^(export\s+)?(async\s+)?(function|class|const|let|var|interface|type|enum|def|struct|impl|fn|func|package|public|private|protected|typedef|template|namespace)\b/;

/**
 * C-family definitions carry no keyword — `void gpt2_forward(GPT2 *m) {` starts
 * with its return type. Matched structurally instead: a line at column zero made
 * of identifier words, then a name, then an open paren, not ending in a
 * semicolon (which would be a prototype, not a definition). Qualifiers like
 * static, inline and __global__ are just identifiers, so they fall out for free.
 */
const C_DECL = /^(?:[A-Za-z_][\w]*\s+|\*)+\**[A-Za-z_]\w*\s*\([^;]*$/;

/** Chunks larger than this are split again; smaller ones absorb their neighbour. */
const MAX_LINES = 80;
const MIN_LINES = 6;

export function chunkFile(path: string, text: string): Omit<Chunk, "tokens">[] {
  const lines = text.split("\n");
  const starts: number[] = [0];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.length === 0) continue;
    const indented = /^\s/.test(line);
    const body = line.trimStart();

    // Methods inside a class are declarations too. Requiring column zero meant
    // every method was invisible and a long class was sliced blindly every 80
    // lines — flask force-split 33% of its chunks that way, the worst in the
    // corpus, against 9% for llm.c. C-style definitions stay column-anchored,
    // since the structural pattern is loose enough to match indented call
    // expressions if it is allowed to float.
    if (indented ? DECL.test(body) : DECL.test(body) || C_DECL.test(line)) {
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
  /\b(?:function|class|interface|type|enum|def|struct|fn|func|impl|typedef)\s+([A-Za-z_$][\w$]*)|\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g;

/** C-style definitions carry no keyword: the name is whatever precedes the paren. */
const C_DEF_NAME = /^(?:[A-Za-z_]\w*\s+|\*)+\**([A-Za-z_]\w*)\s*\([^;]*$/gm;

/** Names this chunk introduces — the hooks the import graph joins on. */
export function definedSymbols(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(DEF_NAME)) {
    const name = m[1] ?? m[2];
    if (name) out.add(name);
  }
  for (const m of text.matchAll(C_DEF_NAME)) out.add(m[1]);
  return [...out];
}
