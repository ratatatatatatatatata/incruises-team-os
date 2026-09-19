const MEMBER_FACING_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bnext best action\b/giu, "одоо хийх нэг ажил"],
  [/\bfollow[ -]?up\b/giu, "эргэж холбогдох"],
  [/\bdiscovery\b/giu, "хэрэгцээ тодруулах"],
  [/\bcheck[ -]?in\b/giu, "явцын тэмдэглэл"],
  [/\breview-д/giu, "хүнээр хянуулахад"],
  [/\bfeedback-ээ/giu, "саналаа"],
  [/\bfocus-оо/giu, "гол ажлаа"],
  [/\bclaim-ийг/giu, "баримт шаардсан өгүүлбэрийг"],
  [/\breview\b/giu, "хүний хяналт"],
  [/\bfeedback\b/giu, "санал"],
  [/\bfocus\b/giu, "гол ажил"],
  [/\bclaim\b/giu, "баримт шаардсан өгүүлбэр"],
  [/\bauto-publish\b/giu, "автоматаар нийтлэх"],
];

export function plainMongolianText(value: string) {
  return MEMBER_FACING_REPLACEMENTS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value,
  ).replace(/\s+/g, " ").trim();
}

export function readableAnswerExcerpt(value: string, maximum = 90) {
  const plain = plainMongolianText(value);
  const cyrillicCount = (plain.match(/[\u0400-\u04ff]/gu) ?? []).length;
  const latinCount = (plain.match(/[a-z]/giu) ?? []).length;
  if (cyrillicCount === 0 || latinCount > cyrillicCount) return null;
  return plain.length > maximum ? `${plain.slice(0, maximum - 1).trim()}…` : plain;
}

export function actionSteps(value: string) {
  const plain = plainMongolianText(value);
  const numbered = plain
    .split(/\s+(?=\d{1,2}[.)]\s)/u)
    .map((part) => part.replace(/^\d{1,2}[.)]\s*/u, "").trim())
    .filter(Boolean);
  if (numbered.length > 1) return numbered.slice(0, 3);

  const sentences = plain
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return (sentences.length ? sentences : [plain]).slice(0, 3);
}
