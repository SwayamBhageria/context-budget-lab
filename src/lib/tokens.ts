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
  return enc.encode(text).length;
}

export const TOKENIZER_NOTE =
  "Counts measured with cl100k_base. Claude's tokenizer differs by a few percent; the reduction ratio does not.";
