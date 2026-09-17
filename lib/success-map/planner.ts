import type { AcademyLessonCandidate, StarterAnswers, SuccessMapPlan } from "./contracts";

const DAY_LABELS = ["1 дэх өдөр", "2 дахь өдөр", "3 дахь өдөр", "4 дэх өдөр", "5 дахь өдөр", "6 дахь өдөр", "7 дахь өдөр"];

type FocusTrack = "content" | "follow_up" | "discovery" | "communication" | "learning" | "team" | "general";

type ActionTemplate = {
  title: string;
  detail: string;
  doneWhen: string;
};

function clean(value: string, maximum: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maximum);
}

export function normalizeMongolianIntent(value: string) {
  return value
    .toLocaleLowerCase("mn-MN")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/follow\s*[- ]?\s*up/g, "follow-up")
    .replace(/hereg\s*g(?:ui|vi)/g, "хэрэггүй")
    .replace(/hiih\s*g(?:ui|vi)/g, "хийхгүй")
    .replace(/sonirhol\s*g(?:ui|vi)/g, "сонирхолгүй")
    .replace(/\bbusiness\b/g, "бизнес")
    .replace(/\bbish\b/g, "биш")
    .replace(/\bugui\b|\bgui\b|\bgvi\b/g, "үгүй")
    .replace(/\bmin(?:ute)?s?\b/g, "минут")
    .replace(/\btsag\b/g, "цаг")
    .replace(/\s+/g, " ")
    .trim();
}

function containsAny(value: string, words: string[]) {
  const normalized = normalizeMongolianIntent(value);
  return words.some((word) => normalized.includes(word));
}

const NEGATION_WORDS = ["хэрэггүй", "хийхгүй", "сонирхолгүй", "үгүй", "биш", "болих", "татгалз"];

function isNegated(value: string, word: string) {
  const normalized = normalizeMongolianIntent(value);
  const target = normalizeMongolianIntent(word);

  return normalized
    .split(/[,.;!?]|\b(?:харин|гэхдээ)\b/iu)
    .some((clause) => {
      const tokens = clause.match(/[\p{L}\p{N}-]+/gu) ?? [];
      const targetIndexes = tokens.flatMap((token, index) =>
        token === target || token.startsWith(target) ? [index] : [],
      );
      const negativeIndexes = tokens.flatMap((token, index) =>
        NEGATION_WORDS.some((negative) => token === negative || token.startsWith(negative)) ? [index] : [],
      );

      return targetIndexes.some((targetIndex) =>
        negativeIndexes.some((negativeIndex) => Math.abs(targetIndex - negativeIndex) <= 4),
      );
    });
}

function containsPositiveAny(value: string, words: string[]) {
  const normalized = normalizeMongolianIntent(value);
  return words.some((word) => normalized.includes(normalizeMongolianIntent(word)) && !isNegated(normalized, word));
}

export function actionConflictsWithAnswers(answers: StarterAnswers, actionText: string) {
  const combined = Object.values(answers).join(" ");
  const excludedGroups = [
    ["follow-up", "follow up", "фоллов", "эргэж холбог", "дахин холбог"],
    ["контент", "пост", "сошиал", "facebook", "instagram", "video", "reel"],
    ["бизнес", "борлуулалт", "борлуул"],
    ["баг", "удирдлага", "удирд"],
  ];

  return excludedGroups.some((words) =>
    words.some((word) => isNegated(combined, word))
      && containsPositiveAny(actionText, words),
  );
}

export function actionMinutes(capacity: string) {
  const normalized = normalizeMongolianIntent(capacity);
  const minuteMatch = normalized.match(/(\d{1,3})\s*(?:минут|мин)(?=\s|$|[,.])/u);
  if (minuteMatch) return Math.max(5, Math.min(45, Number(minuteMatch[1])));

  const hourMatch = normalized.match(/(?:^|\s)(\d{1,2}(?:[.,]\d{1,2})?)\s*цаг(?=\s|$|[,.])/u);
  if (hourMatch) {
    const totalMinutes = Math.round(Number(hourMatch[1].replace(",", ".")) * 60);
    return Math.max(5, Math.min(45, totalMinutes));
  }

  if (containsAny(normalized, ["бага", "завгүй"])) return 10;
  if (containsAny(normalized, ["өдөр бүр", "бүтэн"])) return 45;
  return 30;
}

function focusTrack(answers: StarterAnswers): FocusTrack {
  const preferred = normalizeMongolianIntent(answers.growthPreferences);
  const combined = `${answers.goal30Day} ${answers.primaryBlocker} ${preferred}`;
  const tracks: Array<{ track: FocusTrack; words: string[] }> = [
    { track: "follow_up", words: ["follow-up", "follow up", "фоллов", "эргэж холбог", "дахин холбог"] },
    { track: "communication", words: ["public speaking", "presentation", "илтгэх", "илтгэл", "ярих чадвар", "ярих дасгал", "ярьдаг болох", "яриагаа", "олны өмнө ярих"] },
    { track: "discovery", words: ["discovery", "уулзалт", "борлуул", "асуулт", "ярилцлага"] },
    { track: "content", words: ["контент", "пост", "сошиал", "facebook", "instagram", "video", "reel"] },
    { track: "team", words: ["баг", "удирд", "менеж"] },
    { track: "learning", words: ["сургалт", "суралц", "ойлгох", "мэдлэг", "хичээл"] },
  ];

  return tracks.find(({ words }) => containsPositiveAny(preferred, words))?.track
    ?? tracks.find(({ words }) => containsPositiveAny(combined, words))?.track
    ?? "general";
}

function focusLabel(track: FocusTrack) {
  return {
    content: "контент",
    follow_up: "follow-up",
    discovery: "discovery уулзалт",
    communication: "илтгэх ба харилцах чадвар",
    learning: "сургалт",
    team: "багийн удирдлага",
    general: "30 хоногийн зорилго",
  }[track];
}

function trackActions(track: FocusTrack, answers: StarterAnswers, minutes: number): {
  today: { title: string; detail: string };
  weekly: ActionTemplate[];
  measures: string[];
} {
  const goal = `“${answers.goal30Day}”`;
  const blocker = `“${answers.primaryBlocker}”`;
  const commonReview: ActionTemplate = {
    title: "Баасан гарагт үр дүнгээ дүгнэх",
    detail: "Хийсэн ажил, авсан хариу, гарсан саадаа нэг дор тэмдэглээд дараагийн 7 хоногийн хамгийн чухал 3 ажлыг сонго.",
    doneWhen: "Бодит үр дүн, саад, дараагийн 3 ажил бичигдсэн байна.",
  };

  if (track === "content") {
    return {
      today: {
        title: "Нэг тодорхой контентын ноорог гаргах",
        detail: `${goal}-д хүрэхэд хэрэгтэй нэг хэрэглэгчийн асуултыг сонго. Тэр асуултад хариулах 5–7 өгүүлбэрийн нооргийг ${minutes} минутад бичээд нийтлэхээс өмнөх review-д бэлд.`,
      },
      weekly: [
        {
          title: "Хэнд, ямар асуудлыг тайлбарлахаа сонгох",
          detail: "Нэг зорилтот үзэгч, түүний хамгийн их асуудаг 3 асуултыг жагсаа.",
          doneWhen: "1 үзэгчийн тодорхойлолт, 3 бодит асуулт бичигдсэн байна.",
        },
        {
          title: "3 ноорог бэлдэж, 1-ийг review-д оруулах",
          detail: "Асуулт бүрээр нэг богино ноорог бич. Баталгаагүй амлалт, эх сурвалжгүй claim-ийг хасаад хамгийн ойлгомжтой нэгийг хүний review-д өг.",
          doneWhen: "3 ноорогтой, 1 ноорог review-д орсон байна.",
        },
        commonReview,
      ],
      measures: ["Бэлдсэн нооргийн тоо", "Review-д оруулсан контентын тоо", "Авсан бодит асуулт эсвэл хариу үйлдлийн тоо"],
    };
  }

  if (track === "follow_up") {
    return {
      today: {
        title: "Follow-up хийх хүмүүсээ дараалуулах",
        detail: `Хариу хүлээж буй хүмүүсээ нэг жагсаалтад оруулаад хамгийн түрүүнд холбогдох 3 хүнийг сонго. ${minutes} минутад дарамтгүй, дараагийн алхамтай богино мессеж бэлд.`,
      },
      weekly: [
        {
          title: "Follow-up жагсаалтаа нэг дор болгох",
          detail: "Нэр, өмнөх ярианы огноо, хэрэгцээ, дараагийн алхам гэсэн 4 баганатай жагсаалт үүсгэ.",
          doneWhen: "Холбогдох хүн бүр дараагийн алхам, огноотой болсон байна.",
        },
        {
          title: "3 бодит follow-up хийж, хариуг тэмдэглэх",
          detail: "Эхний 3 хүнд хувийн нөхцөлд нь тохирсон мессеж илгээж, хариу болон дараагийн алхмыг бүртгэ.",
          doneWhen: "3 follow-up-ийн илгээсэн огноо, хариу, дараагийн алхам бүртгэгдсэн байна.",
        },
        commonReview,
      ],
      measures: ["Хийсэн follow-up-ийн тоо", "Хариу авсан хүний тоо", "Товлосон дараагийн яриа эсвэл уулзалтын тоо"],
    };
  }

  if (track === "discovery") {
    return {
      today: {
        title: "Discovery ярианыхаа 5 асуултыг бэлдэх",
        detail: `${goal}-д хүрэхэд хэрэгтэй хэрэглэгчийн нөхцөл, хэрэгцээ, саадыг тодруулах 5 нээлттэй асуулт бич. ${minutes} минутын дараа нэг асуултыг чангаар туршиж зас.`,
      },
      weekly: [
        {
          title: "Discovery асуултын дараалал үүсгэх",
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
      measures: ["Хийсэн discovery ярианы тоо", "Тодорхой болсон хэрэгцээний тоо", "Харилцан зөвшөөрсөн дараагийн алхмын тоо"],
    };
  }

  if (track === "communication") {
    return {
      today: {
        title: "Нэг минутын илтгэлээ бэлдэж, чангаар хэлэх",
        detail: `${goal}-той холбоотой нэг гол санааг эхлэл, гол санаа, төгсгөл гэсэн 3 өгүүлбэрээр бич. ${minutes} минутад нэг удаа чангаар хэлээд хамгийн ойлгомжгүй нэг өгүүлбэрээ зас.`,
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
      measures: ["Хийсэн нэг минутын дадлагын тоо", "Засаж сайжруулсан өгүүлбэрийн тоо", "Бусдаас авсан бодит feedback"],
    };
  }

  if (track === "learning") {
    return {
      today: {
        title: "Нэг ойлголтыг сурч, өөрийн үгээр тайлбарлах",
        detail: `${blocker} гэдэг саадтай хамгийн ойр Academy хичээлийг ${minutes} минут судлаад гол санааг 3 өгүүлбэрээр өөрийн үгээр бич.`,
      },
      weekly: [
        {
          title: "Ойлгох ёстой нэг сэдвээ сонгох",
          detail: "Энэ 7 хоногт шийдэх нэг асуултаа тодорхой бичээд тохирох Academy хичээлийг сонго.",
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
        detail: `${blocker} гэдэг саадыг шийдэх хамгийн жижиг ажлыг сонго. ${minutes} минутад хэн хийх, хэзээ дуусгах, дууссаныг юугаар мэдэхийг нэг мөрөөр баталгаажуул.`,
      },
      weekly: [
        {
          title: "Багийн 7 хоногийн нэг үр дүнг сонгох",
          detail: `${goal}-той шууд холбоотой нэг үр дүнг багийн энэ 7 хоногийн тэргүүлэх чиглэл болго.`,
          doneWhen: "Нэг үр дүн, эзэн, хугацаа багийн бүх хүнд ойлгомжтой болсон байна.",
        },
        {
          title: "15 минутын саад шалгах уулзалт хийх",
          detail: "Хийсэн зүйл, гацсан зүйл, хэрэгтэй тусламж, дараагийн алхмыг хүн бүрээс нэг нэгээр ав.",
          doneWhen: "Нээлттэй саад бүр эзэн, дараагийн алхамтай болсон байна.",
        },
        commonReview,
      ],
      measures: ["Эзэн, хугацаатай болсон ажлын тоо", "Хугацаандаа дууссан ажлын тоо", "Шийдвэрлэсэн багийн саадын тоо"],
    };
  }

  return {
    today: {
      title: "30 хоногийн зорилгоос эхний ажлаа сонгох",
      detail: `${goal}-ыг энэ 7 хоногт урагшлуулах хамгийн жижиг бодит ажлыг сонго. ${minutes} минутын календарийн цаг гаргаад дууссаныг юугаар мэдэхээ нэг өгүүлбэрээр бич.`,
    },
    weekly: [
      {
        title: "Энэ 7 хоногийн нэг үр дүнг тодорхойлох",
        detail: "30 хоногийн зорилгоос энэ долоо хоногт заавал дуусгах нэг бодит үр дүнг сонго.",
        doneWhen: "Нэг үр дүн, нэг хугацаа, нэг хэмжих шалгуур бичигдсэн байна.",
      },
      {
        title: "Гол саадыг нэг туршилтаар багасгах",
        detail: `${blocker} гэдэг саадыг багасгах нэг арга сонгоод бодит ажил дээр турш.`,
        doneWhen: "Туршсан арга, гарсан үр дүн, дараагийн өөрчлөлт тэмдэглэгдсэн байна.",
      },
      commonReview,
    ],
    measures: ["Дуусгасан гол ажлын тоо", "Зорилгод ойртуулсан бодит үр дүн", "Дараагийн 7 хоногт арилгах нэг саад"],
  };
}

function lessonScore(lesson: AcademyLessonCandidate, combined: string) {
  const title = `${lesson.levelId} ${lesson.title}`.toLocaleLowerCase("mn-MN");
  let score = 0;
  const mappings = [
    { query: ["контент", "пост", "сошиал", "facebook", "instagram", "video"], lesson: ["яриа", "discovery", "follow-up", "тайлбар"] },
    { query: ["баг", "удирд", "менеж", "coach", "director"], lesson: ["builder", "success", "kpi", "coach", "director", "30/60/90"] },
    { query: ["шинэ", "эхэл", "туршлагагүй"], lesson: ["философи", "member", "нөхцөл", "үндсэн"] },
    { query: ["борлуул", "хэрэглэгч", "гишүүн", "уулзалт"], lesson: ["хэрэгцээ", "яриа", "follow-up", "тайлбар", "72 цаг"] },
  ];

  for (const mapping of mappings) {
    if (containsAny(combined, mapping.query) && containsAny(title, mapping.lesson)) score += 3;
  }
  if (title.includes("l0")) score += 1;
  return score;
}

function chooseLesson(lessons: AcademyLessonCandidate[], answers: StarterAnswers) {
  const combined = Object.values(answers).join(" ");
  return [...lessons].sort((left, right) => {
    const scoreDiff = lessonScore(right, combined) - lessonScore(left, combined);
    return scoreDiff || left.levelId.localeCompare(right.levelId) || left.title.localeCompare(right.title);
  })[0] ?? null;
}

export function normalizeStarterAnswers(input: StarterAnswers): StarterAnswers {
  return {
    currentContext: clean(input.currentContext, 1600),
    goal30Day: clean(input.goal30Day, 1600),
    weeklyCapacity: clean(input.weeklyCapacity, 800),
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
  const recommendedLesson = chooseLesson(lessons, answers);
  const wantsTeamManagement = containsPositiveAny(
    `${answers.currentContext} ${answers.goal30Day} ${answers.growthPreferences}`,
    ["баг", "удирд", "менеж"],
  );
  const wantsContent = containsPositiveAny(
    `${answers.goal30Day} ${answers.growthPreferences}`,
    ["контент", "пост", "сошиал", "facebook", "instagram", "video", "reel"],
  );

  const pillars = wantsContent
    ? ["Хэрэгтэй тайлбар", "Бодит туршлага", "Дараагийн жижиг алхам"]
    : ["Сурсан зүйл", "Асуулт ба хариулт", "Бодит ахиц"];

  const profileSummary = `Та одоо ${answers.currentContext} Ирэх 30 хоногийн хүссэн үр дүн: ${answers.goal30Day}`;
  const whyThisPlan = `Эхний төвлөрөх чиглэл: ${focusLabel(track)}. Таны боломжит цаг (${answers.weeklyCapacity}) болон гол саад (${answers.primaryBlocker})-д тааруулж өнөөдөр хийх нэг ажил, энэ 7 хоногт дуусгах 3 алхам, шалгах үзүүлэлтийг ялгаж өглөө.`;

  return {
    version: 3,
    generatedAt: new Date().toISOString(),
    profileSummary,
    whyThisPlan,
    todayAction: {
      ...actionPlan.today,
      minutes,
      doneWhen: actionPlan.weekly[0]?.doneWhen ?? "Ажлыг хийж, гарсан үр дүнгээ нэг өгүүлбэрээр тэмдэглэсэн байна.",
    },
    weeklyActions: actionPlan.weekly,
    managementPlan: {
      focus: wantsTeamManagement
        ? ["Нэг гол зорилго", "Ажил бүрийн эзэн ба хугацаа", "Долоо хоногийн bottleneck"]
        : ["Нэг гол зорилго", "Өдөр тутмын жижиг алхам", "Долоо хоногийн бодит ахиц"],
      cadence: [
        `Даваа: ${minutes} минутын төлөвлөлт`,
        "Лхагва: 10 минутын явц ба саад шалгах",
        "Баасан: 20 минутын review, дараагийн 3 ажлыг сонгох",
      ],
      measures: actionPlan.measures,
    },
    contentPlan: wantsContent ? {
      pillars,
      sevenDayPlan: DAY_LABELS.map((day, index) => ({
        day,
        action: [
          `“${answers.goal30Day}” зорилготой холбоотой хэрэглэгчийн нэг асуултыг сонго.`,
          `${pillars[0]} сэдвээр 5 өгүүлбэрийн ноорог бич.`,
          `${pillars[1]} сэдвээр бодит жишээ эсвэл ажиглалтаа баримттай тэмдэглэ.`,
          "Нооргийн claim бүрийг албан эх сурвалжтай тулгаж, баталгаагүй амлалтыг хас.",
          "Нэг сувгийн хэлбэрт тохируулж, хүний review-д оруул.",
          "Хариу үйлдэл, асуулт, уулзалтын тоог бүртгэ.",
          "Үр дүнгээ review хийж дараагийн 7 хоногийн 3 сэдвийг сонго.",
        ][index],
      })),
      guardrails: [
        "Орлого, үр дүнг баталгаатай мэт амлахгүй.",
        "Албан мэдээлэл шаардсан claim бүрт Source Vault-ийн эх ашиглана.",
        "Нийтлэхээс өмнө хүн заавал хянана; auto-publish хийхгүй.",
      ],
    } : null,
    academyRecommendation: recommendedLesson
      ? {
          lessonId: recommendedLesson.id,
          levelId: recommendedLesson.levelId,
          title: recommendedLesson.title,
          minutes: recommendedLesson.minutes,
          reason: "Таны зорилго, саад болон хүссэн ажлын хэлбэртэй хамгийн ойр, хараахан дуусаагүй Academy хичээл.",
        }
      : null,
    generation: {
      source: "deterministic",
      aiModel: null,
      aiFallbackReason: null,
    },
  };
}
