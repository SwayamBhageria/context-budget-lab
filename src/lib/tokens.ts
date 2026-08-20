import { getEncoding } from "js-tiktoken";

/**
 * Token counting.
 *
 * Anthropic's exact count lives behind an authenticated `count_tokens` call, and
 * this app must work for a visitor holding no key at all. So counts come from a
 * local BPE (cl100k) instead.
 *
 * That is a deliberate, stated tradeoff. Absolute counts drift a few percent
 * from Claude's tokenizer; the *reduction ratio* — the only number this product
 * actually claims — does not, because both sides of the ratio drift together.
 */
const enc = getEncoding("cl100k_base");

export function countTokens(text: string): number {
  // Special tokens must be allowed, not rejected. By default the encoder throws
  // on strings like <|endoftext|>, which appear as ordinary source text
  // throughout ML codebases — nanoGPT, minGPT, whisper, tiktoken and vllm were
  // all unreadable until this was passed. A tokenizer that refuses the corpus
  // the tool is aimed at is not a tokenizer error, it is a missing argument.
  return enc.encode(text, "all").length;
}

export const TOKENIZER_NOTE =
  "Counts measured with cl100k_base. Claude's tokenizer differs by a few percent; the reduction ratio does not.";
