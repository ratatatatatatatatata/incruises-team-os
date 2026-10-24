export const LOCAL_MODEL_ID = "Qwen3-4B-q4f16_1-MLC";
export const LOCAL_MODEL_LABEL = "Qwen3 4B";

/** Reject obvious repetition, truncated thinking and unusable language. Not a semantic accuracy guarantee. */
export function usableLocalReply(value: string, finishReason: string | null | undefined) {
  const words = value.toLocaleLowerCase("mn-MN").match(/[\p{L}\p{N}]+/gu) ?? [];
  if (finishReason === "length" || words.length < 6 || /<think>/u.test(value)) return false;
  const letters = value.match(/\p{L}/gu) ?? [];
  const cyrillic = value.match(/[А-Яа-яӨөҮүЁё]/gu) ?? [];
  if (cyrillic.length < letters.length * 0.5) return false;
  const triples = words.slice(2).map((_, i) => words.slice(i, i + 3).join(" "));
  return new Set(triples).size >= triples.length * 0.7;
}
