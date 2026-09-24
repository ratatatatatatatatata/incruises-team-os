/** Shared conservative intent rules for onboarding and later check-ins.
 * @param {string} value
 * @returns {string}
 */
export function normalizeMongolianIntent(value) {
  return value.normalize("NFKC")
    .toLocaleLowerCase("mn-MN")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/follow\s*[- ]?\s*up/g, "follow-up")
    .replace(/hereg\s*g(?:ui|vi)/g, "хэрэггүй")
    .replace(/hiih\s*g(?:ui|vi)/g, "хийхгүй")
    .replace(/hiimeer\s*g(?:ui|vi)/g, "хиймээргүй")
    .replace(/huse(?:h|e)\s*g(?:ui|vi)/g, "хүсэхгүй")
    .replace(/sonirhol\s*g(?:ui|vi)/g, "сонирхолгүй")
    .replace(/sonirhoh\s*g(?:ui|vi)/g, "сонирхохгүй")
    .replace(/\bbusiness\b/g, "бизнес")
    .replace(/\bbish\b/g, "биш")
    .replace(/\bugui\b|\bgui\b|\bgvi\b/g, "үгүй")
    .replace(/\bminut\b/g, "минут")
    .replace(/\bmin(?:ute)?s?\b/g, "минут")
    .replace(/\btsag\b/g, "цаг")
    .replace(/\bbiznes(?:s)?\b|\bentrepreneur(?:ship)?\b/g, "бизнес")
    .replace(/\b(?:huviin|personal)\s+(?:management|menegment)\b/g, "өөрийгөө удирдах")
    .replace(/\booriigoo\s+udird(?:ah|aj)\b/g, "өөрийгөө удирдах")
    .replace(/\b(?:tsagaa|ajlaa|udroo)\s+(?:tuluvluh|tolovloh)\b/g, "өдрөө төлөвлөх")
    .replace(/\b(?:zorilgoo|zorilgo)\s+todorhoil(?:oh|ohod)\b/g, "зорилгоо тодорхойлох")
    .replace(/\b(?:muruudul|muruudluu|moroodol|manifest(?:ation)?)\b/g, "мөрөөдөл")
    .replace(/\b(?:dadal|hevshil)\b/g, "дадал")
    .replace(/\bkontent\b/g, "контент")
    .replace(/\bborluulalt\b/g, "борлуулалт")
    .replace(/\byarih\s+(?:chadvar|dasgal)\b/g, "ярих чадвар")
    .replace(/\s+/g, " ")
    .trim();
}

const NEGATION_WORDS = ["хэрэггүй", "хийхгүй", "хиймээргүй", "хүсэхгүй", "хүсээгүй", "хүсэлгүй", "сонирхолгүй", "сонирхохгүй", "сонирхдоггүй", "шаардлагагүй", "төлөвлөөгүй", "төлөвлөхгүй", "үгүй", "биш", "болих", "татгалз"];

/** @param {string} value @param {string} word */
export function isNegated(value, word) {
  const normalized = normalizeMongolianIntent(value);
  const targetTokens = normalizeMongolianIntent(word).split(" ");
  return normalized
    .split(/[.;!?]|(?:^|\s)(?:харин|гэхдээ)(?=\s|$)/iu)
    .flatMap((sentence) => {
      const clauses = sentence.split(",");
      return clauses.map((clause, index) => {
        // Carry a trailing exclusion across noun lists, not across full statements.
        const words = clause.match(/[\p{L}\p{N}-]+/gu) ?? [];
        return words.length === 1 ? clauses.slice(index).join(" ") : clause;
      });
    })
    .some((clause) => {
      const tokens = clause.match(/[\p{L}\p{N}-]+/gu) ?? [];
      const targetIndexes = tokens.flatMap((_, index) =>
        targetTokens.every((targetToken, offset) => tokens[index + offset]?.startsWith(targetToken))
          ? [index + targetTokens.length - 1] : [],
      );
      const negativeIndexes = tokens.flatMap((token, index) =>
        NEGATION_WORDS.some((negative) => token.startsWith(negative)) ? [index] : [],
      );
      // Mongolian refusals follow their subject, even after a long explanation.
      return targetIndexes.some((targetIndex) => negativeIndexes.some((negativeIndex) => negativeIndex >= targetIndex));
    });
}

/** @param {string} value @param {string[]} words */
export function containsPositiveAny(value, words) {
  const normalized = normalizeMongolianIntent(value);
  return words.some((word) => normalized.includes(normalizeMongolianIntent(word)) && !isNegated(normalized, word));
}

/** @param {string} value @param {string[]} words */
export function containsCertainPositiveAny(value, words) {
  return normalizeMongolianIntent(value).split(/[.;!?]|(?:^|\s)(?:харин|гэхдээ)(?=\s|$)/iu).some((clause) =>
    containsPositiveAny(clause, words)
    && !/мэдэхгүй|тодорхойгүй|эргэлз|эсэх|магадгүй|байх уу|хэрэгтэй юу|болов уу|medehgui|not sure/iu.test(clause),
  );
}
