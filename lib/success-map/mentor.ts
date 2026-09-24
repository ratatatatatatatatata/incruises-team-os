import type { StarterAnswers, SuccessMapPlan } from "./contracts";
import { parseWeeklyCapacityMinutes } from "./capacity.mjs";
import { normalizeMongolianIntent as normalize, isNegated, containsCertainPositiveAny } from "./intent.mjs";

export type MentorCheckin = {
  progressSummary: string;
  blocker: string;
  helpRequest: string;
  nextFocus: string;
  progressPercent: number;
  needsHelp: boolean;
};

export type MentorActionSuggestion = {
  title: string;
  why: string;
  steps: string[];
  detail: string;
  doneWhen: string;
  minutes: number;
  capacityMinutes: number;
};

const COMMUNICATION_INTENT_WORDS = ["илтгэ", "яри", "ярь", "харилца", "speaking", "өгүүлбэрээр хэл", "iltge", "yarih", "yaria", "hariltsaa"];

function excludes(value: string, terms: string[]) {
  return terms.some((term) => isNegated(value, term));
}

function plainAnswer(value: string) {
  return normalize(value).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/gu, " ").trim();
}

function hasSupportSignal(value: string) {
  const answer = plainAnswer(value);
  if (!answer) return false;
  // Only complete no-help answers are ignored. A later genuine difficulty still counts.
  return !/^(?:(?:одоогоор |одоо )?(?:(?:саад|асуудал|бэрхшээл|тусламж) )?(?:байхгүй|алга|үгүй)(?: байна| ээ| байгаа)?|(?:одоогоор |одоо )?тусламж (?:одоогоор |одоо )?(?:хэрэггүй|шаардлагагүй)(?: байна| ээ)?|(?:odoogoor |odoo )?(?:(?:saad|asuudal|berhsheel|tuslamj) )?(?:baihgui|alga|үгүй)(?: baina| bn| ee)?|tuslamj (?:odoogoor |odoo )?(?:хэрэггүй|shaardlagagui)(?: baina| bn| ee)?|no (?:help needed|help required|blockers?|issues?)|none|n a)$/u.test(answer);
}

function hasConcreteNextFocus(value: string) {
  const answer = plainAnswer(value);
  if (!answer) return false;
  return !/^(?:(?:яг |одоогоор |одоохондоо |одоо )?(?:сайн )?мэдэхгүй(?: байна(?: аа)?| ээ| юм)?|(?:одоогоор |одоохондоо |одоо )?тодорхойгүй(?: байна)?|(?:яг )?(?:юу хийхээ|юунаас эхлэхээ) мэдэхгүй(?: байна)?|(?:yag |odoogoor |odoohondoo |odoo )?(?:sain )?medehgui(?: baina| bn| aa)?|not sure(?: yet)?|i don t know|dont know|idk|n a)$/u.test(answer);
}

/** A local, bounded suggestion. Raw answers/check-in text never become shared action text. */
export function createMentorAction(
  answers: StarterAnswers,
  plan: SuccessMapPlan,
  checkin: MentorCheckin,
): MentorActionSuggestion | null {
  const capacityMinutes = parseWeeklyCapacityMinutes(answers.weeklyCapacity);
  if (capacityMinutes === null) return null;

  const originalIntent = Object.values(answers).join(". ");
  const combinedIntent = `${originalIntent}. ${checkin.nextFocus}`;
  // An explicit new direction wins; an unrecognized direction must not revive the old goal.
  const focus = normalize(hasConcreteNextFocus(checkin.nextFocus)
    ? checkin.nextFocus
    : `${answers.goal30Day} ${plan.todayAction.title}`);
  const supportSignals = [checkin.blocker, checkin.helpRequest].filter(hasSupportSignal);
  const difficulty = normalize(supportSignals.join(" "));
  const needsHelp = checkin.needsHelp || supportSignals.length > 0;
  const minutes = Math.min(capacityMinutes, needsHelp ? 5 : 10);
  let title: string;
  let why: string;
  let steps: string[];
  let doneWhen: string;

  if (needsHelp) {
    if (/цаг|завгүй|амжих|time|zav|tsag/u.test(difficulty)) {
      title = "Дараагийн ажлаа нэг жижиг алхам болгон багасгах";
      why = "Явцын тэмдэглэлд цагийн саад гарсан тул ажлын хэмжээг багасгаж байна.";
      steps = ["Дараагийн хийх ажлаасаа хамгийн амархан эхний хэсгийг сонго.", "Тэр хэсгийг таван минутад туршаад хийж амжсанаа нэг өгүүлбэрээр тэмдэглэ."];
      doneWhen = "Нэг жижиг хэсгийг туршиж, юу амжсанаа нэг өгүүлбэрээр бичсэн байна.";
    } else {
      title = "Гацсан нэг зүйлээ тодорхой асуулт болгох";
      why = "Явцын тэмдэглэлд тусламж хэрэгтэй гэж бичсэн тул эхлээд нэг саадыг тодруулж байна.";
      steps = ["Юуг хийх гэж оролдоод хаана гацсанаа нэг өгүүлбэрээр бич.", "Ойлгохыг хүссэн нэг асуултаа бичиж, шаардлагатай бол «Хүнээс тусламж авъя» товчоор илгээ."];
      doneWhen = "Оролдсон зүйл, гацсан хэсэг, асуух нэг асуулт бичигдсэн байна.";
    }
  } else if (checkin.progressPercent >= 100) {
    title = "Хийсэн ажлаасаа дараагийн нэг туршилтаа сонгох";
    why = "Та өмнөх ажлаа дууссан гэж тэмдэглэсэн тул юу тус болсныг дараагийн алхамтай холбож байна.";
    steps = ["Хийсэн ажлаас хамгийн хэрэгтэй байсан нэг аргаа бич.", "Тэр аргаа дараагийн зорилгодоо яаж нэг удаа хэрэглэхээ нэг өгүүлбэрээр төлөвлө."];
    doneWhen = "Тус болсон нэг арга, дараа нь турших нэг жижиг ажил тодорхой болсон байна.";
  } else if (containsCertainPositiveAny(focus, ["хэрэгцээ", "нээлттэй асуулт", "ярилцлаг", "discovery", "heregtsee"])
    && !excludes(combinedIntent, ["бизнес", "борлуул", "entrepreneur", "discovery", "хэрэгцээ"])) {
    title = "Нэг хүний хэрэгцээг ойлгох асуулт бэлдэх";
    why = "Та дараагийн алхамдаа хүний хэрэгцээг тодруулахаар сонгосон тул эхлээд нэг асуулт бэлдэж байна.";
    steps = ["Харилцаж буй хүний ямар нэг зүйлийг таамаглахгүйгээр ойлгохыг хүсэж байгаагаа бич.", "Тэр зүйлийг өөрийн үгээр тайлбарлах боломж өгсөн нэг нээлттэй асуулт бэлд."];
    doneWhen = "Ойлгохыг хүссэн нэг зүйл, түүнийг тодруулах нэг нээлттэй асуулт бичигдсэн байна.";
  } else if (containsCertainPositiveAny(focus, COMMUNICATION_INTENT_WORDS)
    && !excludes(combinedIntent, COMMUNICATION_INTENT_WORDS)) {
    title = "Нэг санаагаа гурван өгүүлбэрээр хэлж турших";
    why = "Таны зорилго болон дараагийн ажлын тэмдэглэл харилцах дадлагатай холбоотой байна.";
    steps = ["Хэлэх нэг санаагаа эхлэл, гол санаа, төгсгөл гэсэн гурван өгүүлбэрээр бич.", "Нэг удаа чангаар хэлээд ойлгомжгүй нэг өгүүлбэрээ зас."];
    doneWhen = "Гурван өгүүлбэрээ хэлж туршаад нэгийг нь сайжруулсан байна.";
  } else if (containsCertainPositiveAny(focus, ["контент", "пост", "сошиал", "reel", "video", "facebook", "instagram"])
    && !excludes(combinedIntent, ["контент", "пост", "сошиал", "reel", "video", "facebook", "instagram"])) {
    title = "Нэг асуултад хариулсан богино ноорог бичих";
    why = "Дараагийн хийх ажлын тэмдэглэлд хэрэгтэй тайлбар бэлдэх чиглэл байгаа тул нэг нооргоос эхэлж байна.";
    steps = ["Өмнөх ажлаас гарсан нэг бодит асуултыг сонго.", "Тэр асуултад хариулсан гурван өгүүлбэр бичээд баталгаагүй амлалт ороогүйг шалга."];
    doneWhen = "Нэг бодит асуултад хариулсан, хүнээр хянуулахад бэлэн гурван өгүүлбэр бичигдсэн байна.";
  } else if (containsCertainPositiveAny(focus, ["бизнес", "борлуул", "хэрэгцээ", "entrepreneur"])
    && !excludes(combinedIntent, ["бизнес", "борлуул", "entrepreneur"])) {
    title = "Шийдэхийг хүссэн нэг хэрэгцээгээ асуулт болгох";
    why = "Таны дараагийн чиглэл хүний хэрэгцээг ойлгохтой холбоотой тул амлалт өгөхөөс өмнө нэг асуулт бэлдэж байна.";
    steps = ["Хэнд, ямар өдөр тутмын асуудалд туслахыг хүсэж байгаагаа нэг өгүүлбэрээр бич.", "Тэр асуудлыг таамаглахгүйгээр ойлгоход хэрэгтэй нэг нээлттэй асуулт бэлд."];
    doneWhen = "Туслахыг хүссэн нэг хэрэгцээ, түүнийг тодруулах нэг асуулт бичигдсэн байна.";
  } else if (/(?:хувийн|өдөр тутмын|өдрийн|долоо хоногийн).*(?:цаг|ажил|ажл|төлөвл|хэмнэл)|(?:цаг|ажл)[\p{L}\s]*(?:цэгц|зохиц|хуваарил|төлөвл)|дадал|хойшлуул|personal management|time management|huviin|tsagaa/u.test(focus)) {
    title = "Хувийн нэг чухал ажлынхаа хийх цагийг сонгох";
    why = "Та дараагийн алхамдаа өөрийн ажил, цагаа цэгцлэхээр сонгосон тул нэг ажлыг тодорхой болгож байна.";
    steps = ["Дараагийн өдөр хийх ажлуудаасаа хамгийн чухал нэг жижиг ажлыг сонго.", "Тэр ажлыг хэзээ эхлэх, дууссаныг юугаар мэдэхээ тэмдэглэлдээ нэг мөрөөр бич."];
    doneWhen = "Нэг жижиг ажил, эхлэх цаг, дуусах шалгуур тэмдэглэлд бичигдсэн байна.";
  } else {
    title = "Дараагийн ажлынхаа эхний жижиг хэсгийг хийх";
    why = checkin.progressPercent > 0
      ? "Та ажлаа эхэлсэн гэж тэмдэглэсэн тул дараагийн нэг жижиг хэсгийг үргэлжлүүлж байна."
      : "Та эхлээгүй гэж тэмдэглэсэн тул сонгосон ажлын хамгийн амархан хэсгээс эхэлж байна.";
    steps = ["Явцын тэмдэглэлд бичсэн дараагийн ажлаасаа одоо хийж болох нэг жижиг хэсгийг сонго.", "Тэр хэсгийг хийж туршаад юу хийснээ нэг өгүүлбэрээр тэмдэглэ."];
    doneWhen = "Нэг жижиг хэсгийг хийж, гарсан үр дүнг нэг өгүүлбэрээр тэмдэглэсэн байна.";
  }

  return { title, why, steps, detail: `${why} ${steps.join(" ")}`, doneWhen, minutes, capacityMinutes };
}
