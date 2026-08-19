import type { Chunk } from "@/lib/types";

/**
 * Lexical scoring, BM25.
 *
 * Chosen over embeddings deliberately. Embeddings would score better on questions
 * that share no vocabulary with the code ("why is this slow?"), but they need a
 * model call per chunk at ingest, a vector store, and a warm index — none of which
 * a visitor holding no API key can have. BM25 runs in milliseconds on the server
 * for free, which is what makes the live budget slider possible at all.
 *
 * The cost of that choice is stated in the report: questions with no distinctive
 * terms score flat, and the app says so rather than pretending otherwise.
 */
const K1 = 1.5; // how fast term frequency saturates
const B = 0.75; // how hard to penalise long chunks

/**
 * Words that appear in nearly every question and nearly every file. BM25's idf
 * already drives their weight toward zero, but they still surface in the
 * "matched" reason shown to the user, where they read as noise and make a good
 * selection look accidental.
 */
const STOPWORDS = new Set([
  "how", "does", "do", "the", "this", "that", "what", "when", "where", "why",
  "which", "who", "is", "are", "was", "were", "and", "or", "but", "for", "with",
  "from", "into", "onto", "on", "in", "at", "to", "of", "it", "its", "work",
  "works", "working", "use", "used", "uses", "get", "set", "make", "made",
  "can", "will", "would", "should", "there", "here", "than", "then", "all",
  "any", "some", "not", "you", "your", "way", "does", "doing", "done",
]);

/** Split code into terms: identifiers, and the words inside camelCase/snake_case. */
export function tokenize(text: string): string[] {
  const raw = text.match(/[A-Za-z_$][\w$]*/g) ?? [];
  const out: string[] = [];
  for (const t of raw) {
    const lower = t.toLowerCase();
    out.push(lower);
    // revalidateOnFocus also matches a question asking about "revalidate" or "focus"
    const parts = t
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .split(/[_$\s]+/)
      .filter((p) => p.length > 2)
      .map((p) => p.toLowerCase());
    if (parts.length > 1) out.push(...parts);
  }
  return out;
}

export interface ScoredChunk {
  chunk: Chunk;
  score: number;
  /** Query terms this chunk actually contains — shown in the UI as the reason. */
  matched: string[];
}

export function scoreChunks(query: string, chunks: Chunk[]): ScoredChunk[] {
  const qTerms = [...new Set(tokenize(query))].filter((t) => !STOPWORDS.has(t));
  const N = chunks.length;

  const termFreqs = chunks.map((c) => {
    const counts = new Map<string, number>();
    for (const t of tokenize(c.text)) counts.set(t, (counts.get(t) ?? 0) + 1);
    return counts;
  });
  const lengths = termFreqs.map((m) => [...m.values()].reduce((a, b) => a + b, 0));
  const avgLen = lengths.reduce((a, b) => a + b, 0) / Math.max(N, 1);

  // Document frequency per query term.
  const df = new Map<string, number>();
  for (const term of qTerms) {
    let n = 0;
    for (const m of termFreqs) if (m.has(term)) n++;
    df.set(term, n);
  }

  return chunks.map((chunk, i) => {
    let score = 0;
    const matched: string[] = [];
    for (const term of qTerms) {
      const f = termFreqs[i].get(term);
      if (!f) continue;
      const n = df.get(term)!;
      // A term in nearly every chunk carries almost no information; idf goes to ~0.
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      const norm = f * (K1 + 1) /
        (f + K1 * (1 - B + (B * lengths[i]) / (avgLen || 1)));
      score += idf * norm;
      matched.push(term);
    }
    // A chunk that *defines* something the question names is worth more than one
    // that merely mentions it.
    const defBoost = chunk.defines.some((d) =>
      qTerms.includes(d.toLowerCase()),
    ) ? 1.4 : 1;

    return { chunk, score: score * defBoost, matched };
  });
}
