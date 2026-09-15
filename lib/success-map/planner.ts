import type { AcademyLessonCandidate, StarterAnswers, SuccessMapPlan } from "./contracts";

const DAY_LABELS = ["1 дэх өдөр", "2 дахь өдөр", "3 дахь өдөр", "4 дэх өдөр", "5 дахь өдөр", "6 дахь өдөр", "7 дахь өдөр"];

function clean(value: string, maximum: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maximum);
}

function containsAny(value: string, words: string[]) {
  const normalized = value.toLocaleLowerCase("mn-MN");
  return words.some((word) => normalized.includes(word));
}

function actionMinutes(capacity: string) {
  if (containsAny(capacity, ["15 мин", "30 мин", "1 цаг", "бага"])) return 20;
  if (containsAny(capacity, ["10 цаг", "өдөр бүр", "бүтэн"])) return 45;
  return 30;
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
  const recommendedLesson = chooseLesson(lessons, answers);
  const wantsTeamManagement = containsAny(
    `${answers.currentContext} ${answers.goal30Day} ${answers.growthPreferences}`,
    ["баг", "удирд", "менеж", "coach", "director"],
  );
  const wantsContent = containsAny(
    `${answers.goal30Day} ${answers.growthPreferences}`,
    ["контент", "пост", "сошиал", "facebook", "instagram", "video", "reel"],
  );

  const pillars = wantsContent
    ? ["Хэрэгтэй тайлбар", "Бодит туршлага", "Дараагийн жижиг алхам"]
    : ["Сурсан зүйл", "Асуулт ба хариулт", "Бодит ахиц"];

  const profileSummary = `Одоогийн нөхцөл: ${answers.currentContext} 30 хоногийн гол зорилго: ${answers.goal30Day}`;
  const whyThisPlan = `Таны боломжит цаг (${answers.weeklyCapacity}) болон гол саад (${answers.primaryBlocker}) дээр тулгуурлан өдөр тутмын ачааллыг бага, хэмжиж болох алхам болгон хуваав.`;

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    profileSummary,
    whyThisPlan,
    todayAction: {
      title: "Зорилгоо нэг хэмжүүртэй болгох",
      detail: `“${answers.goal30Day}” зорилгыг энэ 7 хоногт батлах нэг тоо эсвэл бодит үр дүнгээр бичээд эхний ${minutes} минутын алхмаа календарьт оруул.`,
      minutes,
    },
    weeklyActions: [
      {
        title: "Суурь үзүүлэлтээ тогтоох",
        detail: "Одоогийн түвшнээ нэг тоо, нэг ажиглалтаар тэмдэглэж дараагийн долоо хоногтой харьцуулах суурь болго.",
        doneWhen: "Эхлэх үзүүлэлт болон зорилтот үзүүлэлт хоёулаа бичигдсэн байна.",
      },
      {
        title: "Гол саадыг жижиг туршилтаар шалгах",
        detail: `${answers.primaryBlocker} гэсэн саадыг багасгах нэг жижиг туршилт сонгож 3 удаа хэрэгжүүл.`,
        doneWhen: "3 оролдлогын үр дүн болон дараагийн өөрчлөлт тэмдэглэгдсэн байна.",
      },
      {
        title: wantsTeamManagement ? "Багийн 15 минутын review хийх" : "7 хоногийн review хийх",
        detail: wantsTeamManagement
          ? "Хийсэн ажил, саад, дараагийн эзэн ба хугацааг нэг хуудсанд баталгаажуул."
          : "Юу ажилласан, юу саад болсон, ирэх 7 хоногт юуг үргэлжлүүлэхээ 3 мөрөөр дүгнэ.",
        doneWhen: "Дараагийн долоо хоногийн хамгийн чухал 3 ажил тодорхой болсон байна.",
      },
    ],
    managementPlan: {
      focus: wantsTeamManagement
        ? ["Нэг гол зорилго", "Ажил бүрийн эзэн ба хугацаа", "Долоо хоногийн bottleneck"]
        : ["Нэг гол зорилго", "Өдөр тутмын жижиг алхам", "Долоо хоногийн бодит ахиц"],
      cadence: [
        `Даваа: ${minutes} минутын төлөвлөлт`,
        "Лхагва: 10 минутын явц ба саад шалгах",
        "Баасан: 20 минутын review, дараагийн 3 ажлыг сонгох",
      ],
      measures: ["Хийсэн гол алхмын тоо", "Хариу/уулзалт/үр дүнгийн бодит тоо", "Дараагийн долоо хоногт арилгах нэг саад"],
    },
    contentPlan: {
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
    },
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
