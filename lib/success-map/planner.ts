import type { AcademyLessonCandidate, StarterAnswers, SuccessMapPlan } from "./contracts";
import { parseWeeklyCapacityMinutes } from "./capacity.mjs";
import { normalizeMongolianIntent, isNegated, containsPositiveAny, containsCertainPositiveAny } from "./intent.mjs";
export { normalizeMongolianIntent } from "./intent.mjs";

const DAY_LABELS = ["1 дэх өдөр", "2 дахь өдөр", "3 дахь өдөр", "4 дэх өдөр", "5 дахь өдөр", "6 дахь өдөр", "7 дахь өдөр"];

type FocusTrack = "content" | "follow_up" | "discovery" | "communication" | "learning" | "team" | "self_management" | "vision" | "entrepreneurship" | "general";

type ActionTemplate = {
  title: string;
  detail: string;
  doneWhen: string;
};

function clean(value: string, maximum: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maximum);
}

function containsAny(value: string, words: string[]) {
  const normalized = normalizeMongolianIntent(value);
  return words.some((word) => normalized.includes(word));
}

const BUSINESS_INTENT_WORDS = ["бизнес", "бүтээгдэхүүн турш", "үйлчилгээ турш", "өөрийн жижиг ажил эхл"];

function hasAffirmativeBusinessIntent(answers: StarterAnswers) {
  return [answers.goal30Day, answers.growthPreferences].some((answer) =>
    normalizeMongolianIntent(answer).split(/[.;!?]/u).some((clause) =>
      containsCertainPositiveAny(clause, BUSINESS_INTENT_WORDS)
      && /хүс|хиймээр|үзмээр|турш|эхлүүл|эхлэх|эхэлнэ|эрхлэх|эрхэлмээр|шалга|husej|hiimeer|turshi|ehluul|ehleh|shalgah|\b(?:want|start|try)\b/iu.test(clause),
    ),
  );
}

export function actionConflictsWithAnswers(answers: StarterAnswers, actionText: string) {
  const combined = Object.values(answers).join(". ");
  if (!hasAffirmativeBusinessIntent(answers)
    && actionText.split(/[.;!?,]/u).some((clause) => containsPositiveAny(clause, BUSINESS_INTENT_WORDS))) return true;
  const excludedGroups = [
    ["follow-up", "follow up", "фоллов", "эргэж холбог", "дахин холбог"],
    ["контент", "пост", "нийтлэл", "сошиал", "facebook", "instagram", "video", "видео", "reel"],
    ["бизнес", "борлуулалт", "борлуул"],
    ["багийн", "багаа", "баг удирд"],
  ];

  return excludedGroups.some((words) =>
    words.some((word) => isNegated(combined, word))
      && actionText.split(/[.;!?,]/u).some((clause) => containsPositiveAny(clause, words)),
  );
}

// These are conservative rejection rules, not a guarantee that generated advice is safe.
export function adviceNeedsSafetyFallback(value: string, maximumMinutes?: number) {
  const normalized = normalizeMongolianIntent(value);
  if (maximumMinutes !== undefined) {
    const durations = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(минут|цаг)/gu)];
    if (durations.some(([, amount, unit]) => Number(amount) * (unit === "цаг" ? 60 : 1) > maximumMinutes)) return true;
  }
  return /(?:орлого|амжилт|мөнгө).{0,35}(?:баталгаатай|заавал ирнэ|заавал олно)|(?:бодоход|төсөөлөхөд|хүсэхэд)\s+л.{0,45}(?:биелнэ|баяжина|ирнэ)|орчлон.{0,30}(?:өгнө|илгээнэ)/u.test(normalized)
    || /(?:апп|систем|би|бид).{0,35}(?:мэдэгдэл илгээнэ|автоматаар сануулна|өдөр бүр сануулна)/u.test(normalized);
}

export function actionMinutes(capacity: string) {
  const parsedMinutes = parseWeeklyCapacityMinutes(capacity);
  if (parsedMinutes !== null) return parsedMinutes;
  const normalized = normalizeMongolianIntent(capacity);
  if (containsAny(normalized, ["бага", "завгүй"])) return 10;
  if (containsAny(normalized, ["өдөр бүр", "бүтэн"])) return 45;
  return 30;
}

function focusTrack(answers: StarterAnswers): FocusTrack {
  const preferred = normalizeMongolianIntent(answers.growthPreferences);
  const goal = normalizeMongolianIntent(answers.goal30Day);
  const combined = `${goal}. ${answers.primaryBlocker}. ${preferred}`;
  const allAnswers = Object.values(answers).join(". ");
  const tracks: Array<{ track: FocusTrack; words: string[] }> = [
    { track: "self_management", words: ["өөрийгөө удирд", "өөрийн удирд", "өдрөө төлөвл", "ажлаа төлөвл", "цагаа төлөвл", "цагийн хуваарь", "эмх цэгц", "дадал", "хэвшил", "personal management"] },
    { track: "vision", words: ["мөрөөдөл", "төсөөл", "хүссэн ирээдүй", "зорилгоо тодорхойл", "зорилгоо сонго", "юу хүсэж байгаагаа", "юуг өөрчлөхөө", "manifest"] },
    { track: "follow_up", words: ["follow-up", "follow up", "фоллов", "эргэж холбог", "дахин холбог"] },
    { track: "communication", words: ["public speaking", "presentation", "илтгэх", "илтгэл", "ярих чадвар", "ярих дасгал", "ярьдаг болох", "яриагаа", "олны өмнө ярих"] },
    { track: "content", words: ["контент", "пост", "нийтлэл", "сошиал", "facebook", "instagram", "video", "видео", "reel"] },
    { track: "entrepreneurship", words: BUSINESS_INTENT_WORDS },
    { track: "discovery", words: ["discovery", "уулзалт", "борлуул", "ярилцлага", "хэрэгцээ тодруулах"] },
    { track: "team", words: ["багийн", "багаа", "баг удирд", "манлайл"] },
    { track: "learning", words: ["сургалт", "суралц", "ойлгох", "мэдлэг", "хичээл"] },
  ];
  const allowedTracks = tracks.filter(({ track, words }) => {
    if (words.some((word) => isNegated(allAnswers, word))) return false;
    if (track === "entrepreneurship" && !hasAffirmativeBusinessIntent(answers)) return false;
    if (track === "entrepreneurship" || track === "discovery") {
      return !["бизнес", "борлуулалт", "борлуул"].some((word) => isNegated(allAnswers, word));
    }
    return true;
  });

  // The desired result takes precedence over the requested help format (such as a lesson).
  return allowedTracks.find(({ words }) => containsPositiveAny(goal, words))?.track
    ?? allowedTracks.find(({ words }) => containsPositiveAny(preferred, words))?.track
    ?? allowedTracks.find(({ words }) => containsPositiveAny(combined, words))?.track
    ?? "general";
}

function focusLabel(track: FocusTrack) {
  return {
    content: "контент",
    follow_up: "эргэж холбогдох ажил",
    discovery: "хэрэгцээ тодруулах яриа",
    communication: "илтгэх ба харилцах чадвар",
    learning: "сургалт",
    team: "багийн удирдлага",
    self_management: "өдөр тутмын ажлаа зохицуулах",
    vision: "хүссэн ирээдүйгээ бодит алхамтай холбох",
    entrepreneurship: "бизнесийн санаагаа жижиг туршилтаар шалгах",
    general: "30 хоногийн зорилго",
  }[track];
}

function trackActions(track: FocusTrack, answers: StarterAnswers, minutes: number): {
  today: { title: string; detail: string; doneWhen: string };
  weekly: ActionTemplate[];
  measures: string[];
} {
  const commonReview: ActionTemplate = {
    title: "7 хоногийн үр дүнгээ дүгнэх",
    detail: "Хийсэн нэг ажил, гарсан үр дүнгээ товч тэмдэглэ. Түүнд үндэслэн дараагийн удаа хийх ганц ажлыг сонго.",
    doneWhen: "Бодит үр дүн ба дараагийн нэг ажил бичигдсэн байна.",
  };

  if (track === "self_management") {
    return {
      today: {
        title: "Өдрийн нэг чухал ажлаа сонгож, хийх цагаа бичих",
        detail: `Цаас эсвэл утасны тэмдэглэлдээ ойрын хугацаанд хийх зүйлээ бич. Тэдгээрээс нэгийг сонгоод ${minutes} минутад багтах эхний жижиг алхам, хийх цагаа тэмдэглэ.`,
        doneWhen: "Нэг чухал ажил, эхний жижиг алхам, хийх цаг бичигдсэн байна.",
      },
      weekly: [
        { title: "Нэг ажлаа хийх цагийг сонгох", detail: "Өдрийнхөө боломжтой нэг үеийг сонгоод түүнд багтах нэг жижиг ажил бич.", doneWhen: "Хийх нэг ажил, түүнд зориулсан цаг тодорхой болсон байна." },
        { title: "Сонгосон жижиг алхмаа нэг удаа хийх", detail: "Тэмдэглэсэн ажлынхаа эхний жижиг алхмыг хий. Дууссан эсвэл гацсан зүйлээ нэг өгүүлбэрээр тэмдэглэ.", doneWhen: "Нэг алхмыг туршиж, юу болсныг тэмдэглэсэн байна." },
        commonReview,
      ],
      measures: ["Хийж үзсэн жижиг алхам", "Танд тохирсон хийх цаг", "Дараагийн удаа өөрчлөх нэг зүйл"],
    };
  }

  if (track === "vision") {
    return {
      today: {
        title: "Хүссэн өөрчлөлтөө нэг өгүүлбэрээр бичих",
        detail: `Өдөр тутмын амьдралд тань юу арай дээр болсон байгаасай гэж хүсэж байгаагаа нэг өгүүлбэрээр бич. ${minutes} минутын дотор яагаад чухал болон өөрөө хийж чадах эхний нэг алхмаа нэм.`,
        doneWhen: "Хүссэн нэг өөрчлөлт, түүний шалтгаан, өөрийн хийх нэг алхам бичигдсэн байна.",
      },
      weekly: [
        { title: "Хүссэн өөрчлөлтөө сонгох", detail: "Ажил, сурах зүйл, гэр бүл эсвэл өөртөө зориулсан цагаас нэгийг сонго. Юу өөр байвал тус болохыг өөрийн үгээр бич.", doneWhen: "Өөрийн сонгосон нэг өөрчлөлт тодорхой болсон байна." },
        { title: "Хүслээ 30 хоногийн бодит зорилго болгох", detail: "Өөрийн хийж чадах, үр дүнг нь анзаарч болох нэг жижиг өөрчлөлт сонго. Эхний алхмыг туршиж, юу болсныг тэмдэглэ.", doneWhen: "Нэг зорилго, туршсан нэг алхам, ажигласан үр дүнтэй болсон байна." },
        commonReview,
      ],
      measures: ["Тодорхой болгосон хүсэл", "Өөрөө хийж үзсэн алхам", "Ажигласан бодит өөрчлөлт"],
    };
  }

  if (track === "entrepreneurship") {
    return {
      today: {
        title: "Нэг асуудал, түүнийг шийдэх жижиг санаагаа бичих",
        detail: `Өөрийн анзаарсан нэг бодит бэрхшээлийг сонго. ${minutes} минутын дотор хэнд хэрэгтэй, яаж тусалж болох, мөнгө зарцуулахгүйгээр юуг эхэлж шалгахаа нэг нэг өгүүлбэрээр бич.`,
        doneWhen: "Нэг асуудал, хэрэгцээтэй хүн, шалгах жижиг санаа бичигдсэн байна.",
      },
      weekly: [
        { title: "Шалгах нэг санаагаа сонгох", detail: "Бусдын бодит хэрэгцээнд туслах нэг санаа сонго. Орлого амлахгүйгээр ямар таамгийг эхэлж шалгахаа бич.", doneWhen: "Шалгах нэг таамаг тодорхой болсон байна." },
        { title: "Санааныхаа хэрэгцээг нэг жижиг туршилтаар шалгах", detail: "Зөвшөөрсөн нэг хүнээс энэ асуудал түүнд тулгардаг эсэхийг асуу. Борлуулах эсвэл элсүүлэхийг ятгалгүй, бодит хариуг нь тэмдэглэ.", doneWhen: "Нэг бодит хариу, санаандаа хийх нэг өөрчлөлт тэмдэглэгдсэн байна." },
        commonReview,
      ],
      measures: ["Шалгасан хэрэгцээ", "Хүнээс авсан бодит хариу", "Туршилтаас сурсан нэг зүйл"],
    };
  }

  if (track === "content") {
    const contentText = `${answers.goal30Day} ${answers.growthPreferences}`;
    const format = containsPositiveAny(contentText, ["reel"])
      ? { label: "богино видео", possessive: "богино видеоны" }
      : containsPositiveAny(contentText, ["video", "видео"])
        ? { label: "видео", possessive: "видеоны" }
        : containsPositiveAny(contentText, ["facebook", "пост"])
          ? { label: "пост", possessive: "постын" }
          : { label: "контент", possessive: "контентын" };
    return {
      today: {
        title: `Эхний ${format.possessive} 5–7 өгүүлбэрийг бичих`,
        detail: `Хүмүүсээс бодитоор ирсэн нэг асуултыг сонго. ${minutes} минутын дотор тэр асуултад хариулсан 5–7 өгүүлбэртэй ${format.label} бэлд. Нийтлэхээсээ өмнө хүнээр хянуул.`,
        doneWhen: `Нэг бодит асуултад хариулсан 5–7 өгүүлбэртэй ${format.label} хүнээр хянуулахад бэлэн болсон байна.`,
      },
      weekly: [
        {
          title: "Хэнд, ямар асуудлыг тайлбарлахаа сонгох",
          detail: "Нэг зорилтот үзэгч, түүний хамгийн их асуудаг 3 асуултыг жагсаа.",
          doneWhen: "1 үзэгчийн тодорхойлолт, 3 бодит асуулт бичигдсэн байна.",
        },
        {
          title: "Нэг нооргоо хүнээр хянуулах",
          detail: "Бэлдсэн нэг нооргоо унш. Баталгаагүй амлалт, эх сурвалжгүй өгүүлбэрийг засаад зөвшөөрсөн нэг хүнд үзүүл.",
          doneWhen: "Нэг нооргоо хүнээр хянуулж, авсан саналыг тэмдэглэсэн байна.",
        },
        commonReview,
      ],
      measures: ["Бэлдсэн нооргийн тоо", "Хүнээр хянуулсан контентын тоо", "Авсан бодит асуулт эсвэл хариу үйлдлийн тоо"],
    };
  }

  if (track === "follow_up") {
    return {
      today: {
        title: "Эргэж холбогдох нэг хүнээ сонгох",
        detail: `Өмнө нь ярилцаж, эргэж холбогдохоор тохирсон нэг хүнийг сонго. ${minutes} минутад түүнд зориулсан дарамтгүй, богино мессеж бэлд.`,
        doneWhen: "Холбогдох нэг хүн ба илгээх нэг богино мессеж бэлэн болсон байна.",
      },
      weekly: [
        {
          title: "Эргэж холбогдох жагсаалтаа нэг дор болгох",
          detail: "Нэр, өмнөх ярианы огноо, хэрэгцээ, дараагийн алхам гэсэн 4 баганатай жагсаалт үүсгэ.",
          doneWhen: "Холбогдох хүн бүр дараагийн алхам, огноотой болсон байна.",
        },
        {
          title: "Нэг хүнтэй эргэж холбогдоод хариуг тэмдэглэх",
          detail: "Тохиролцсон нэг хүнд нөхцөлд нь тохирсон мессеж илгээж, хариуг тэмдэглэ. Хариулаагүй бол хариу ирээгүй гэж л бич.",
          doneWhen: "Илгээсэн огноо, бодит хариу эсвэл хүлээж буй төлөв бүртгэгдсэн байна.",
        },
        commonReview,
      ],
      measures: ["Эргэж холбогдсон хүний тоо", "Хариу авсан хүний тоо", "Товлосон дараагийн яриа эсвэл уулзалтын тоо"],
    };
  }

  if (track === "discovery") {
    return {
      today: {
        title: "Хэрэгцээг нь ойлгох 5 асуулт бэлдэх",
        detail: `Харилцаж буй хүний нөхцөл, хэрэгцээ, саадыг ойлгох 5 нээлттэй асуулт бич. ${minutes} минутын дараа нэг асуултыг чангаар туршиж зас.`,
        doneWhen: "5 нээлттэй асуулт бичиж, нэгийг нь чангаар туршаад зассан байна.",
      },
      weekly: [
        {
          title: "Хэрэгцээ тодруулах асуултуудаа дараалуулах",
          detail: "Нөхцөл → хэрэгцээ → саад → хүссэн үр дүн → дараагийн алхам гэсэн дарааллаар асуултаа байрлуул.",
          doneWhen: "5 асуулт нэг ойлгомжтой дараалалд орсон байна.",
        },
        {
          title: "Бодит ярианд туршиж тэмдэглэл хийх",
          detail: "Боломжтой яриа бүрийн дараа юу ойлгосон, юу тодорхойгүй үлдсэнийг 3 мөрөөр тэмдэглэ.",
          doneWhen: "Хийсэн яриа бүр дүгнэлт, зөвшөөрсөн дараагийн алхамтай болсон байна.",
        },
        commonReview,
      ],
      measures: ["Хэрэгцээ тодруулсан ярианы тоо", "Тодорхой болсон хэрэгцээний тоо", "Харилцан зөвшөөрсөн дараагийн алхмын тоо"],
    };
  }

  if (track === "communication") {
    return {
      today: {
        title: "Нэг минутын илтгэлээ бэлдэж, чангаар хэлэх",
        detail: `Өөрийн зорилготой холбоотой нэг санааг эхлэл, гол санаа, төгсгөл гэсэн 3 өгүүлбэрээр бич. ${minutes} минутад нэг удаа чангаар хэлээд хамгийн ойлгомжгүй нэг өгүүлбэрээ зас.`,
        doneWhen: "3 өгүүлбэр бичиж, нэг удаа чангаар хэлээд ойлгомжгүй нэг өгүүлбэрээ зассан байна.",
      },
      weekly: [
        {
          title: "Нэг минутын илтгэлийн 3 хэсгийг бичих",
          detail: "Яагаад энэ сэдэв чухал, сонсогч юу ойлгох, дараа нь юу хийх гэсэн 3 өгүүлбэр бэлд.",
          doneWhen: "Эхлэл, гол санаа, төгсгөл гэсэн 3 өгүүлбэр бичигдсэн байна.",
        },
        {
          title: "Илтгэлээ бичиж аваад нэг удаа сайжруулах",
          detail: "Утсаараа нэг минутын яриагаа бич. Дахин сонсоод хэт урт эсвэл ойлгомжгүй нэг хэсгийг зас.",
          doneWhen: "Нэг бичлэг, зассан нэг хувилбар бэлэн болсон байна.",
        },
        commonReview,
      ],
      measures: ["Хийсэн нэг минутын дадлагын тоо", "Засаж сайжруулсан өгүүлбэрийн тоо", "Бусдаас авсан бодит санал"],
    };
  }

  if (track === "learning") {
    return {
      today: {
        title: "Нэг ойлголтыг сурч, өөрийн үгээр тайлбарлах",
        detail: `Одоо ойлгохыг хүсэж буй нэг асуултаа сонго. Байгаа хичээл эсвэл таньдаг хүний тайлбараас нэг санааг ${minutes} минутад багтаан уншиж, өөрийн үгээр товч бич.`,
        doneWhen: "Нэг хичээлийн гол санааг өөрийн үгээр 3 өгүүлбэрээр тайлбарласан байна.",
      },
      weekly: [
        {
          title: "Ойлгох ёстой нэг сэдвээ сонгох",
          detail: "Шийдэх нэг асуултаа тодорхой бичээд сургалтын сангаас тохирох хичээл байгаа эсэхийг хар. Олдохгүй бол урьсан хүн эсвэл дасгалжуулагчаасаа асуу.",
          doneWhen: "Нэг асуулт, нэг сонгосон хичээл тодорхой болсон байна.",
        },
        {
          title: "Сурсан зүйлээ бодит жишээнд хэрэглэх",
          detail: "Хичээлийн гол санааг нэг бодит яриа, даалгавар эсвэл тайлбарт ашиглаад юу өөрчлөгдсөнийг тэмдэглэ.",
          doneWhen: "Нэг бодит хэрэглээ болон үр дүнгийн тэмдэглэлтэй болсон байна.",
        },
        commonReview,
      ],
      measures: ["Дуусгасан хичээлийн тоо", "Өөрийн үгээр тайлбарлаж чадсан гол санааны тоо", "Бодит ажилд туршсан жишээний тоо"],
    };
  }

  if (track === "team") {
    return {
      today: {
        title: "Багийн нэг саад, нэг эзэн, нэг хугацааг тодруулах",
        detail: `Багийн одоогийн нэг саадыг шийдэх хамгийн жижиг ажлыг сонго. ${minutes} минутад хэн хийх, хэзээ дуусгах, дууссаныг юугаар мэдэхийг нэг мөрөөр баталгаажуул.`,
        doneWhen: "Нэг ажил, хариуцах хүн, хугацаа, дуусах шалгуур нэг мөрөөр бичигдсэн байна.",
      },
      weekly: [
        {
          title: "Багийн 7 хоногийн нэг үр дүнг сонгох",
          detail: "30 хоногийн зорилготой шууд холбоотой нэг үр дүнг багийн энэ 7 хоногийн тэргүүлэх чиглэл болго.",
          doneWhen: "Нэг үр дүн, эзэн, хугацаа багийн бүх хүнд ойлгомжтой болсон байна.",
        },
        {
          title: "Нэг гишүүнд хэрэгтэй тусламжийг тодруулах",
          detail: "Тусламж хүссэн нэг хүнээс хаана гацсан, ямар дэмжлэг хэрэгтэйг асуу. Өөрийн хийх нэг ажил, эргэн шалгах цагаа тохир.",
          doneWhen: "Нэг тусламжийн ажил, хариуцах хүн, эргэн шалгах хугацаатай болсон байна.",
        },
        commonReview,
      ],
      measures: ["Эзэн, хугацаатай болсон ажлын тоо", "Хугацаандаа дууссан ажлын тоо", "Шийдвэрлэсэн багийн саадын тоо"],
    };
  }

  return {
    today: {
      title: "30 хоногийн зорилгоос эхний ажлаа сонгох",
      detail: `30 хоногийн зорилгыг урагшлуулах хамгийн жижиг бодит ажлыг сонго. ${minutes} минутад багтах эхний алхам, хийх цаг, дууссаныг юугаар мэдэхээ цаас эсвэл утасны тэмдэглэлд бич.`,
      doneWhen: "Нэг жижиг ажил, хийх цаг, дуусах шалгуур тэмдэглэгдсэн байна.",
    },
    weekly: [
      {
        title: "Энэ 7 хоногийн нэг үр дүнг тодорхойлох",
        detail: "30 хоногийн зорилгоос энэ долоо хоногт заавал дуусгах нэг бодит үр дүнг сонго.",
        doneWhen: "Нэг үр дүн, нэг хугацаа, нэг хэмжих шалгуур бичигдсэн байна.",
      },
      {
          title: "Сонгосон аргаа нэг удаа турших",
          detail: "Зорилгодоо ойртох нэг жижиг арга сонгоод бодит ажил дээр турш. Гацсан зүйл гарвал түүнийг тэмдэглэ.",
        doneWhen: "Туршсан арга, гарсан үр дүн, дараагийн өөрчлөлт тэмдэглэгдсэн байна.",
      },
      commonReview,
    ],
    measures: ["Дуусгасан гол ажлын тоо", "Зорилгод ойртуулсан бодит үр дүн", "Дараагийн удаа өөрчлөх нэг зүйл"],
  };
}

const LESSON_MATCH_RULES: Record<FocusTrack, Array<{ terms: string[]; score: number }>> = {
  content: [
    { terms: ["амлалт өгөхгүй"], score: 8 },
    { terms: ["тайлбарлах"], score: 5 },
    { terms: ["compliance"], score: 4 },
  ],
  follow_up: [
    { terms: ["follow-up", "эргэж холбог"], score: 9 },
  ],
  discovery: [
    { terms: ["discovery"], score: 9 },
    { terms: ["хэрэгцээ"], score: 7 },
    { terms: ["аяллын зорилго", "асуултын бүтэц"], score: 6 },
  ],
  communication: [
    { terms: ["teach-back"], score: 9 },
    { terms: ["conversation", "яриа"], score: 7 },
    { terms: ["тайлбарлах"], score: 5 },
    { terms: ["баталгаажуулах"], score: 4 },
  ],
  learning: [
    { terms: ["үндсэн ойлголт"], score: 9 },
    { terms: ["мэдлэгийн шалгалт"], score: 8 },
    { terms: ["философи", "member", "partner"], score: 5 },
  ],
  team: [
    { terms: ["багийн kpi", "director"], score: 9 },
    { terms: ["coach", "bottleneck"], score: 8 },
    { terms: ["builder", "success review", "30/60/90"], score: 7 },
    { terms: ["72 цаг"], score: 5 },
  ],
  self_management: [
    { terms: ["өөрийгөө удирд", "цагийн менежмент", "цаг төлөвл", "дадал"], score: 8 },
  ],
  vision: [
    { terms: ["зорилго тодорхойл", "зорилгоо тодорхойл", "хувийн зорилго"], score: 8 },
  ],
  entrepreneurship: [
    { terms: ["бизнесийн санаа", "хэрэгцээ шалгах", "жижиг туршилт"], score: 8 },
  ],
  general: [],
};

function lessonScore(lesson: AcademyLessonCandidate, track: FocusTrack) {
  const title = `${lesson.levelId} ${lesson.title}`.toLocaleLowerCase("mn-MN");
  return LESSON_MATCH_RULES[track].reduce(
    (score, rule) => score + (containsAny(title, rule.terms) ? rule.score : 0),
    0,
  );
}

function chooseLesson(lessons: AcademyLessonCandidate[], answers: StarterAnswers, track: FocusTrack) {
  const combined = Object.values(answers).join(". ");
  if (["academy", "хичээл", "сургалт"].some((term) => isNegated(combined, term))) return null;
  const availableMinutes = actionMinutes(answers.weeklyCapacity);
  const ranked = lessons.filter((lesson) => Number.isFinite(lesson.minutes) && lesson.minutes > 0 && lesson.minutes <= availableMinutes).sort((left, right) => {
    const scoreDiff = lessonScore(right, track) - lessonScore(left, track);
    return scoreDiff || left.levelId.localeCompare(right.levelId) || left.title.localeCompare(right.title);
  });
  const best = ranked[0] ?? null;
  return best && lessonScore(best, track) >= 4 ? best : null;
}

function lessonReason(track: FocusTrack) {
  return {
    content: "Контентоо баталгаагүй амлалтгүй, ойлгомжтой тайлбарлахад туслах нэмэлт хичээл.",
    follow_up: "Хүнтэй дарамтгүй эргэж холбогдох ажлаа хийхэд туслах нэмэлт хичээл.",
    discovery: "Хүний хэрэгцээг асуултаар ойлгоход туслах нэмэлт хичээл.",
    communication: "Санаагаа богино, ойлгомжтой хэлэхэд туслах нэмэлт хичээл.",
    learning: "Одоогийн гол саадыг ойлгож, дадлага хийхэд туслах нэмэлт хичээл.",
    team: "Багийн ажлыг эзэн, хугацаатай болгоход туслах нэмэлт хичээл.",
    self_management: "Өдрийн нэг ажлаа сонгож, цагтаа багтаахад туслах нэмэлт хичээл.",
    vision: "Хүссэн өөрчлөлтөө хийж болох зорилго болгоход туслах нэмэлт хичээл.",
    entrepreneurship: "Таны сонгосон бизнесийн санааг бага хэмжээгээр шалгахад туслах нэмэлт хичээл.",
    general: "Өнөөдрийн ажлаа хийхэд шууд хэрэглэж болох нэмэлт хичээл.",
  }[track];
}

export function normalizeStarterAnswers(input: StarterAnswers): StarterAnswers {
  const weeklyCapacity = clean(input.weeklyCapacity, 800).normalize("NFKC");
  const bareCapacity = weeklyCapacity.match(/^([0-9]{1,3})$/u);
  return {
    currentContext: clean(input.currentContext, 1600),
    goal30Day: clean(input.goal30Day, 1600),
    weeklyCapacity: bareCapacity ? `${Number(bareCapacity[1])} минут` : weeklyCapacity,
    primaryBlocker: clean(input.primaryBlocker, 1600),
    growthPreferences: clean(input.growthPreferences, 1600),
  };
}

export function createStarterPlan(
  rawAnswers: StarterAnswers,
  lessons: AcademyLessonCandidate[],
): SuccessMapPlan {
  const answers = normalizeStarterAnswers(rawAnswers);
  const minutes = actionMinutes(answers.weeklyCapacity);
  const track = focusTrack(answers);
  const actionPlan = trackActions(track, answers, minutes);
  const recommendedLesson = chooseLesson(lessons, answers, track);
  const wantsTeamManagement = track === "team";
  const wantsContent = track === "content" && !actionConflictsWithAnswers(answers, "контент бэлдэх") && containsPositiveAny(
    `${answers.goal30Day} ${answers.growthPreferences}`,
    ["контент", "пост", "нийтлэл", "сошиал", "facebook", "instagram", "video", "видео", "reel"],
  );

  const pillars = wantsContent
    ? ["Хэрэгтэй тайлбар", "Бодит туршлага", "Дараагийн жижиг алхам"]
    : ["Сурсан зүйл", "Асуулт ба хариулт", "Бодит ахиц"];

  const profileSummary = `Таны эхлэх чиглэл: ${focusLabel(track)}. Нэг жижиг алхам хийж үзээд, юу болсныг өөрийн үгээр тэмдэглэнэ.`;
  const whyThisPlan = `Таны хариултаас ${focusLabel(track)} чиглэлийг сонголоо. Эхлээд ${minutes} минутад багтах ганц ажил хийнэ. Дараах алхмуудыг бүгдийг энэ долоо хоногт хийх албагүй; нийт боломжит цаг дуусвал дараагийн долоо хоногт үргэлжлүүлнэ.`;

  return {
    version: 3,
    generatedAt: new Date().toISOString(),
    profileSummary,
    whyThisPlan,
    todayAction: {
      ...actionPlan.today,
      minutes,
      doneWhen: actionPlan.today.doneWhen,
    },
    weeklyActions: actionPlan.weekly.map((action) => ({
      ...action,
      detail: `${action.detail} Өмнөх ажлын дараа үлдсэн цагтаа багтахгүй бол дараагийн долоо хоногт үргэлжлүүл.`,
    })),
    managementPlan: {
      focus: wantsTeamManagement
        ? ["Нэг гол зорилго", "Ажил бүрийн эзэн ба хугацаа", "Долоо хоногийн гол саад"]
        : ["Нэг гол зорилго", "Боломжит цагтаа багтах нэг алхам", "Долоо хоногийн бодит ахиц"],
      cadence: [
        `Эхлээд: зөвхөн ${minutes} минутад багтах нэг ажлыг хий. Энэ нь өдөр бүрийн нэмэлт даалгавар биш.`,
        "Дууссаны дараа: хийсэн эсвэл гацсанаа тэмдэглэ.",
        "Дараа нь: долоо хоногийн нийт боломжит цагаас үлдсэнд багтах ганц алхмыг сонго. Цаг дууссан бол дараагийн долоо хоногт үргэлжлүүл.",
      ],
      measures: actionPlan.measures,
    },
    contentPlan: wantsContent ? {
      pillars,
      sevenDayPlan: DAY_LABELS.map((day, index) => ({
        day,
        action: [
          "Таны зорилготой холбоотой нэг бодит асуултыг сонго.",
          `${pillars[0]} сэдвээр 5 өгүүлбэрийн ноорог бич.`,
          `${pillars[1]} сэдвээр бодит жишээ эсвэл ажиглалтаа баримттай тэмдэглэ.`,
          "Баримт шаардсан өгүүлбэр бүрийг албан эх сурвалжтай тулгаж, баталгаагүй амлалтыг хас.",
          "Нэг сувгийн хэлбэрт тохируулж, хүнээр хянуул.",
          "Хариу үйлдэл, асуулт, уулзалтын тоог бүртгэ.",
          "Үр дүнгээ дүгнэж, дараагийн нэг сэдвийг сонго.",
        ][index] + " Нийт боломжит цагтаа багтах үед л үргэлжлүүл; заавал өдөр бүр хийхгүй.",
      })),
      guardrails: [
        "Орлого, үр дүнг баталгаатай мэт амлахгүй.",
        "Баримт шаардсан өгүүлбэр бүрт албан эх сурвалжийн санг ашиглана.",
        "Нийтлэхээс өмнө хүн заавал хянана; автоматаар нийтлэхгүй.",
      ],
    } : null,
    academyRecommendation: recommendedLesson
      ? {
          lessonId: recommendedLesson.id,
          levelId: recommendedLesson.levelId,
          title: recommendedLesson.title,
          minutes: recommendedLesson.minutes,
          reason: `${lessonReason(track)} Үлдсэн цагтаа багтахгүй бол дараагийн долоо хоногт үзэж болно.`,
        }
      : null,
    generation: {
      source: "deterministic",
      aiModel: null,
      aiFallbackReason: null,
    },
  };
}
