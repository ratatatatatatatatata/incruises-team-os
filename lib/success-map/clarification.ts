import type { StarterAnswers } from "@/lib/success-map/contracts";
import { parseWeeklyCapacityMinutes } from "./capacity.mjs";
export { parseWeeklyCapacityMinutes } from "./capacity.mjs";

export const STARTER_ANSWER_KEYS = [
  "currentContext",
  "goal30Day",
  "weeklyCapacity",
  "primaryBlocker",
  "growthPreferences",
] as const;

export type StarterAnswerKey = (typeof STARTER_ANSWER_KEYS)[number];
export type ClarificationReason = "blank" | "unknown" | "needs_detail" | "invalid_capacity";

export const STARTER_ANSWER_MINIMUMS: Record<StarterAnswerKey, number> = {
  currentContext: 10,
  goal30Day: 10,
  weeklyCapacity: 3,
  primaryBlocker: 10,
  growthPreferences: 10,
};

export const CLARIFICATION_GUIDANCE: Record<StarterAnswerKey, {
  prompt: string;
  choices: readonly string[];
}> = {
  currentContext: {
    prompt: "Таны өдөр тутамд хамгийн их цаг, анхаарал авч байгаа зүйл юу вэ?",
    choices: [
      "Одоогоор ажил, гэр бүлийн ажлаа зэрэг амжуулахад ихэнх цаг явж байна.",
      "Шинэ зүйл сурч байгаа ч хаанаас эхлэхээ тодорхойлоогүй байна.",
      "Өдрийн ажлаа төлөвлөж, хийх зүйлээ нэг нэгээр нь амжуулж сурмаар байна.",
      "Тэтгэвэрт гарсан, өөртөө хэрэгтэй шинэ зүйл сурч эхэлмээр байна.",
      "Баг эсвэл бизнесийн ажлаа хариуцаж, бусдад тусалж байна.",
    ],
  },
  goal30Day: {
    prompt: "30 хоногийн дараа юу арай дээр болсон байвал та ‘тус боллоо’ гэж мэдэх вэ?",
    choices: [
      "30 хоногийн дараа нэг жижиг дадлыг тогтмол хийдэг болсон баймаар байна.",
      "30 хоногийн дараа санаагаа илүү ойлгомжтой хэлдэг болсон баймаар байна.",
      "30 хоногийн дараа ажлын нэг чухал зүйлээ тогтмол хийдэг болсон баймаар байна.",
      "30 хоногийн дараа хамгийн түрүүнд юуг өөрчлөхөө тодорхой мэддэг болсон баймаар байна.",
      "Одоохондоо зорилгоо мэдэхгүй, юу хүсэж байгаагаа тодруулж эхний нэг зорилгоо сонгомоор байна.",
    ],
  },
  weeklyCapacity: {
    prompt: "Долоо хоногт үнэхээр гаргаж чадах хамгийн бага нийт хугацаа аль вэ?",
    choices: [
      "Долоо хоногт нийт 5 минут гаргаж чадна.",
      "Долоо хоногт нийт 10 минут гаргаж чадна.",
      "Долоо хоногт нийт 20 минут гаргаж чадна.",
      "Долоо хоногт нийт 30 минут гаргаж чадна.",
      "Долоо хоногт нийт 45 минут гаргаж чадна.",
    ],
  },
  primaryBlocker: {
    prompt: "Эхлэхэд юу саад болж байна вэ? Саад байхгүй байж бас болно.",
    choices: [
      "Яг эхний алхмаа мэдэхгүй байгаа нь хамгийн том саад.",
      "Тогтмол цаг гаргаж чаддаггүй нь хамгийн том саад.",
      "Эхлэхээсээ өмнө эргэлзэж, хойшлуулдаг нь хамгийн том саад.",
      "Туршсан зүйлээс юу нь ажилласныг ойлгоогүй нь хамгийн том саад.",
      "Одоогоор саад байхгүй, нэг жижиг ажлаас эхэлмээр байна.",
    ],
  },
  growthPreferences: {
    prompt: "Яг одоо аль тусламж танд хамгийн амархан санагдаж байна?",
    choices: [
      "Нэг удаад нэг жижиг ажил өгвөл хамгийн хэрэгтэй.",
      "Бодит жишээг алхам алхмаар харвал хамгийн хэрэгтэй.",
      "Богино хичээл үзээд дараа нь дадлага хийвэл хамгийн хэрэгтэй.",
      "Намайг урьсан хүн эсвэл дасгалжуулагчаас товч зөвлөгөө авбал хамгийн хэрэгтэй.",
      "Аппаа нээхэд хийх нэг ажил, өмнөх явц минь харагдвал хамгийн хэрэгтэй.",
    ],
  },
};

const STANDALONE_UNKNOWN_ANSWERS = new Set([
  "мэдэхгүй",
  "мэдэхгүй байна",
  "мэдэхгүй ээ",
  "мэдэхгүй юм",
  "сайн мэдэхгүй",
  "сайн мэдэхгүй байна",
  "яг мэдэхгүй",
  "яг сайн мэдэхгүй",
  "одоо мэдэхгүй",
  "одоогоор мэдэхгүй",
  "одоохондоо мэдэхгүй",
  "одоо тодорхойгүй",
  "одоогоор тодорхойгүй",
  "одоохондоо тодорхойгүй",
  "тодорхойгүй",
  "хариулж мэдэхгүй",
  "хариулж мэдэхгүй байна",
  "юу гэж хариулахаа мэдэхгүй",
  "юу гэж хариулахаа мэдэхгүй байна",
  "medehgui",
  "medehgui baina",
  "sain medehgui",
  "yag medehgui",
  "odoogoor medehgui",
  "odoohondoo medehgui",
  "not sure",
  "i don t know",
  "dont know",
  "idk",
  "n a",
  "na",
]);

function normalizeUnknownCandidate(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("mn-MN")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function isStarterAnswerKey(value: unknown): value is StarterAnswerKey {
  return typeof value === "string" && STARTER_ANSWER_KEYS.some((key) => key === value);
}

export function isStandaloneUnknown(value: string) {
  const normalized = normalizeUnknownCandidate(value);
  if (normalized.length === 0 || STANDALONE_UNKNOWN_ANSWERS.has(normalized)) return true;
  return /^(?:яг\s+)?(?:сайн\s+)?мэдэхгүй(?:\s+(?:байна(?:\s+аа)?|ээ|юм))?$/u.test(normalized)
    || /^(?:yag\s+)?(?:sain\s+)?medehgui(?:\s+(?:baina|bn|aa))?$/u.test(normalized)
    || /^not sure(?: yet)?$/u.test(normalized);
}

export function clarificationReason(key: StarterAnswerKey, value: string): ClarificationReason | null {
  const trimmed = value.trim();
  if (!trimmed) return "blank";
  if (isStandaloneUnknown(trimmed)) return "unknown";
  if (key === "weeklyCapacity") {
    if (parseWeeklyCapacityMinutes(trimmed) === null) return "invalid_capacity";
    return null;
  }
  if (trimmed.length < STARTER_ANSWER_MINIMUMS[key]) return "needs_detail";
  return null;
}

export function answerNeedsClarification(key: StarterAnswerKey, value: string) {
  return clarificationReason(key, value) !== null;
}

export function clarificationMessage(reason: ClarificationReason) {
  if (reason === "blank") return "Энэ хэсэг хоосон байна. Доорх жишээнээс сонгох эсвэл өөрийн үгээр товч бичээрэй.";
  if (reason === "needs_detail") return "Хариултыг тань зөв ойлгохын тулд арай дэлгэрүүлж асууя.";
  if (reason === "invalid_capacity") return "Хугацааг ойлгож чадсангүй. Хамгийн багадаа 5 минутыг минут эсвэл цагаар сонгоно уу.";
  return "Мэдэхгүй байж болно. Доорх жишээнээс өөрт ойрыг сонгоё; зорилгоо тодруулахыг ч эхний ажил болгож болно.";
}

export function firstAnswerNeedingClarification(answers: StarterAnswers): StarterAnswerKey | null {
  return STARTER_ANSWER_KEYS.find((key) => answerNeedsClarification(key, answers[key])) ?? null;
}
