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
  [/\bpurpose-limited summary\b/giu, "дэмжлэгт хэрэгтэй товч мэдээлэл"],
  [/\bstarter success map\b/giu, "эхлэх төлөвлөгөө"],
  [/\bpersonal management\b/giu, "өөрийн ажлаа зохицуулах"],
  [/\bpersonal ai\b/giu, "хиймэл оюуны зөвлөх"],
  [/\bcontent studio\b/giu, "контент бэлтгэх хэсэг"],
  [/\bsource vault\b/giu, "албан эх сурвалжийн сан"],
  [/\baction history\b/giu, "өмнөх ажлын түүх"],
  [/\bsponsor\s*\/\s*coach\b/giu, "урьсан хүн эсвэл дасгалжуулагч"],
  [/\bsponsor\b/giu, "урьсан хүн"],
  [/\bcoach\b/giu, "дасгалжуулагч"],
  [/\bmentor\b/giu, "чиглүүлэгч"],
  [/\bsecretary\b/giu, "хувийн туслах"],
  [/\bentrepreneur(?:ship)?\b/giu, "бизнес эрхлэх"],
  [/\bmanifest(?:ation)?\b/giu, "хүссэн ирээдүйгээ төсөөлөх"],
  [/\bvision\b/giu, "хүссэн ирээдүй"],
  [/\bdream\b/giu, "мөрөөдөл"],
  [/\bgoal\b/giu, "зорилго"],
  [/\bproposed\b/giu, "санал болгосон"],
  [/\baccepted\b/giu, "зөвшөөрсөн"],
  [/\bstarted\b/giu, "хийж байгаа"],
  [/\bblocked\b/giu, "гацсан"],
  [/\bpaused\b/giu, "түр зогссон"],
  [/\bsuperseded\b/giu, "дараагийн хувилбарт шилжсэн"],
  [/\bdone\b/giu, "дууссан"],
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
