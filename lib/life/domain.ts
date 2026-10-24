import { z } from "zod";

export const areas = ["management", "planning", "vision", "style"] as const;
export type Area = (typeof areas)[number];
export const areaLabels: Record<Area, string> = {
  management: "Өөрийгөө удирдах",
  planning: "Төлөвлөгөөтэй амьдрах",
  vision: "Мөрөөдлөө бодит болгох",
  style: "Өөрийн хэв маяг",
};
const text = (max: number) => z.string().trim().max(max);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T12:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  });
export const lifeSchema = z
  .object({
    version: z.literal(1),
    goal: z
      .object({
        area: z.enum(areas),
        title: text(240),
        why: text(400),
        measure: text(240),
        weeklyMinutes: z.number().int().min(5).max(10080),
      })
      .strict(),
    tasks: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            date,
            title: text(240).min(2),
            minutes: z.number().int().min(1).max(480),
            time: z.union([
              z.literal(""),
              z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
            ]),
            status: z.enum(["planned", "done", "paused"]),
            outcome: text(600),
          })
          .strict(),
      )
      .max(180),
    habit: z
      .object({ title: text(160), dates: z.array(date).max(366) })
      .strict(),
    vision: z
      .object({
        wish: text(500),
        reason: text(500),
        obstacle: text(500),
        ifThen: text(500),
        action: text(240),
      })
      .strict(),
    style: z
      .object({
        words: text(160),
        values: text(500),
        introduction: text(600),
        practice: text(240),
      })
      .strict(),
    reviews: z
      .array(
        z
          .object({
            week: date,
            win: text(600),
            obstacle: text(600),
            next: text(240),
          })
          .strict(),
      )
      .max(104),
  })
  .strict()
  .superRefine((state, ctx) => {
    if (new Set(state.tasks.map((t) => t.id)).size !== state.tasks.length)
      ctx.addIssue({
        code: "custom",
        message: "Ажлын дугаар давхардсан байна.",
      });
    if (new Set(state.habit.dates).size !== state.habit.dates.length)
      ctx.addIssue({
        code: "custom",
        message: "Дадлын өдөр давхардсан байна.",
      });
    if (new Set(state.reviews.map((r) => r.week)).size !== state.reviews.length)
      ctx.addIssue({
        code: "custom",
        message: "Долоо хоногийн дүгнэлт давхардсан байна.",
      });
    const weeks = new Set(state.tasks.map((t) => weekStart(t.date)));
    for (const week of weeks) {
      if (weeklyUsed(state, week) > state.goal.weeklyMinutes)
        ctx.addIssue({
          code: "custom",
          message:
            "Төлөвлөсөн ажил долоо хоногийн боломжит цагаас хэтэрлээ. Хугацаагаа багасгах эсвэл өөр долоо хоног сонгоорой.",
        });
    }
  });
export type LifeState = z.infer<typeof lifeSchema>;
export type LifeTask = LifeState["tasks"][number];

export function emptyLife(): LifeState {
  return {
    version: 1,
    goal: {
      area: "management",
      title: "",
      why: "",
      measure: "",
      weeklyMinutes: 60,
    },
    tasks: [],
    habit: { title: "", dates: [] },
    vision: { wish: "", reason: "", obstacle: "", ifThen: "", action: "" },
    style: { words: "", values: "", introduction: "", practice: "" },
    reviews: [],
  };
}
export function localDay(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function weekStart(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export function weeklyUsed(state: LifeState, day: string) {
  const start = weekStart(day);
  return state.tasks
    .filter((t) => weekStart(t.date) === start && t.status !== "paused")
    .reduce((n, t) => n + t.minutes, 0);
}
export function suggestion(
  state: LifeState,
  day: string,
): { title: string; why: string; done: string; minutes: number } | null {
  const remaining = state.goal.weeklyMinutes - weeklyUsed(state, day);
  if (remaining <= 0) return null;
  const last = [...state.tasks].reverse().find((t) => t.status === "done");
  const byArea: Record<Area, [string, string, string]> = {
    management: [
      "Маргаашийн чухал нэг ажлын эхний хэсгийг хийх",
      "Ажлын жагсаалтаа өсгөхөөс өмнө сонгосон нэг ажил дээрээ бодит ахиц гаргана.",
      "Сонгосон ажлын нэг хэсэг бэлэн болж, юу хийснээ тэмдэглэсэн байна.",
    ],
    planning: [
      "Дараагийн 7 хоногийн гурван чухал ажлыг хуанлидаа байрлуулах",
      "Юу хийхээс гадна хэзээ хийхийг шийдвэл төлөвлөгөөгөө хэрэглэхэд хялбар болно.",
      "Гурван ажлын өдөр, эхлэх цаг тодорхой болсон байна.",
    ],
    vision: [
      state.vision.action || "Хүссэн өөрчлөлтийнхөө эхний бодит алхмыг хийх",
      "Төсөөллөө өөрийн хийж чадах нэг үйлдэлтэй холбоно.",
      "Туршсан нэг үйлдэл, түүний бодит үр дүнг бичсэн байна.",
    ],
    style: [
      state.style.practice ||
        "Өөрийгөө танилцуулах гурван өгүүлбэрээ хэлж турших",
      "Өөрийн үнэт зүйл, хүссэн дүр төрхөө өдөр тутмын нэг үйлдлээр илэрхийлнэ.",
      "Нэг удаа туршиж, өөрт тохирсон ба өөрчлөх нэг зүйлээ тэмдэглэсэн байна.",
    ],
  };
  const [title, why, done] = byArea[state.goal.area];
  return {
    title,
    why: last
      ? `Өмнөх ажлын үр дүн: «${last.outcome || last.title}». ${why}`
      : why,
    done,
    minutes: Math.min(10, remaining),
  };
}

/** A transparent guide, never advertised as model-generated conversation. No network or billing. */
export function guidedReply(message: string, state: LifeState, day: string) {
  const q = message.toLocaleLowerCase("mn-MN");
  const remaining = Math.max(
    0,
    state.goal.weeklyMinutes - weeklyUsed(state, day),
  );
  if (/гац|амжихгүй|хэцүү|хойшлуул|gats|hetsuu/u.test(q))
    return "Одоо хийж болох хамгийн жижиг хэсгийг сонгоё. Яг аль ажил дээр гацсан бэ: эхлэх, цаг гаргах, эсвэл юу хийхээ мэдэхгүй байна уу? Тэр ажлынхаа нэрийг бичээд 2–5 минутад хийх нэг хэсэг болгоорой. Хийсэн үр дүнгээ өнөөдрийн ажилд тэмдэглэнэ.";
  if (/manifest|мөрөөд|төсөөл|muruud/u.test(q))
    return `«${state.vision.wish || state.goal.title || "Хүссэн өөрчлөлт"}» гэдгээ төсөөлөөд, яагаад чухлыг нэг өгүүлбэрээр бич. Дараа нь бодит саадаа нэрлэ. «Хэрэв … тохиолдвол би … хийнэ» гэсэн төлөвлөгөө гарга. Өөрийн хийж чадах нэг үйлдлийг «Мөрөөдөл» хэсгээс өнөөдрийн ажилд нэмээрэй. Төсөөлөл дангаараа үр дүнг батлахгүй.`;
  if (/style|image|хэв маяг|дүр төрх|танилцуул/u.test(q))
    return `Таны сонгосон төрх: ${state.style.words || "хараахан сонгоогүй"}. Өөрийгөө илэрхийлэх гурван үг, түүний цаадах үнэт зүйлээ «Миний хэв маяг» хэсэгт бич. Хувцас худалдан авах шаардлагагүй. Одоогийн хувцсаараа нэг зохицол гаргах, эсвэл танилцуулгаа нэг удаа хэлэхээс сонгоод юу тохирсныг тэмдэглэ.`;
  if (/дүгнэ|үр дүн|review|dugne/u.test(q)) {
    const done = state.tasks.filter(
      (t) => weekStart(t.date) === weekStart(day) && t.status === "done",
    );
    return `Энэ долоо хоногт ${done.length} ажил дууссан гэж тэмдэглэсэн байна. ${done.length ? done.map((t) => `«${t.title}»: ${t.outcome || "үр дүнгээ нөхөж бичээрэй"}`).join("\n") : "Хийсэн нэг жижиг зүйлээсээ эхэлж тэмдэглэж болно."}\nЮу тус болсон, хаана гацсан, дараа юу өөрчлөхөө «Төлөвлөгөө» хэсэгт хадгалаарай.`;
  }
  const next = suggestion(state, day);
  return `Таны 30 хоногийн зорилго: ${state.goal.title || "эхлээд өөрийн үгээр бичээрэй"}. Энэ долоо хоногийн үлдсэн боломж: ${remaining} минут. ${next ? `Санал: ${next.title} (${next.minutes} минут). Дууссан гэж үзэх нь: ${next.done} Саналыг засаж байгаад өнөөдрийн ажилд нэмэх боломжтой.` : "Төлөвлөсөн хугацаа дүүрсэн байна. Одоо байгаа ажлаасаа үргэлжлүүлэх эсвэл дараагийн долоо хоногт төлөвлөөрэй."} Илүү тодорхой тусламж авахын тулд ажлын нэр, яг гацсан хэсгээ бичээрэй.`;
}
