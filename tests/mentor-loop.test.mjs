import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createMentorAction } from "../lib/success-map/mentor.ts";
import { createStarterPlan } from "../lib/success-map/planner.ts";

const answers = {
  currentContext: "Өдөр тутмын ажлынхаа хажуугаар өөрийгөө хөгжүүлэхийг хүсэж байна.",
  goal30Day: "Илтгэх чадвараа сайжруулж, санаагаа ойлгомжтой хэлдэг болно.",
  weeklyCapacity: "Долоо хоногт нийт 15 минут",
  primaryBlocker: "Юунаас эхлэхээ сайн мэдэхгүй, цаг бага байна.",
  growthPreferences: "Нэг удаад нэг жижиг ажил хийж сурмаар байна.",
};
const checkin = {
  progressSummary: "Нэг богино тайлбар бичиж туршсан.",
  blocker: "",
  helpRequest: "",
  nextFocus: "Санаагаа гурван өгүүлбэрээр хэлж турших",
  progressPercent: 50,
  needsHelp: false,
};

function suggest(answerOverrides = {}, checkinOverrides = {}) {
  const input = { ...answers, ...answerOverrides };
  return createMentorAction(input, createStarterPlan(input, []), { ...checkin, ...checkinOverrides });
}

test("mentor gives one concrete Mongolian action with reason, steps, time and done criterion", () => {
  const action = suggest();
  assert.ok(action);
  assert.match(action.title, /гурван өгүүлбэр/);
  assert.equal(action.steps.length, 2);
  assert.equal(action.detail, `${action.why} ${action.steps.join(" ")}`);
  assert.ok(action.minutes <= action.capacityMinutes);
  assert.doesNotMatch(JSON.stringify(action), /check-in|feedback|review|goal|dream|focus|manifest/i);
});

test("five-minute weekly capacity is never inflated", () => {
  for (const value of ["5", "5 минут", "5 min", "5 minut", "0.083 цаг"]) {
    const action = suggest({ weeklyCapacity: value });
    if (value === "0.083 цаг") {
      assert.equal(action, null);
    } else {
      assert.equal(action.minutes, 5, value);
      assert.equal(action.capacityMinutes, 5, value);
    }
  }
  assert.equal(suggest({ weeklyCapacity: "тодорхойгүй" }), null);
  assert.equal(suggest({ weeklyCapacity: "1 минут" }), null);
});

test("no-business intent is preserved even when next-focus requests selling", () => {
  for (const restriction of ["Бизнес хийхгүй, зөвхөн дадал бий болгох.", "business hiihgui, зөвхөн дадал бий болгох."]) {
    const action = suggest({ goal30Day: restriction }, { nextFocus: "Борлуулалтын ажлыг эхлүүлэх" });
    assert.doesNotMatch(`${action.title} ${action.detail}`, /бизнес|борлуул|хэрэгцээ/u);
    assert.match(action.title, /жижиг хэсгийг/);
  }
});

test("declined content is not reintroduced by the suggested next focus", () => {
  const action = suggest({ goal30Day: "Контент хийхгүй, зөвхөн хувийн дадлаа тогтмол болгох." }, { nextFocus: "Facebook пост бичих" });
  assert.doesNotMatch(`${action.title} ${action.detail}`, /контент|ноорог|Facebook|пост/u);
});

test("later business or content refusals and uncertainty never become opted-in tasks", () => {
  for (const nextFocus of [
    "Бизнес хиймээргүй", "Бизнес хийхийг одоогоор огт хүсэхгүй байна", "Бизнес сонирхохгүй",
    "Бизнес хийх эсэхээ мэдэхгүй", "Бизнес эхлүүлэх хэрэгтэй юу", "Biznes hiimeergui",
    "Business sonirhohgui", "Biznes hiih esehee medehgui", "Контент хийхийг огт хүсэхгүй",
    "Контент хиймээргүй", "Kontent hiimeergui", "Контент хийх эсэхээ мэдэхгүй",
  ]) {
    const action = suggest({}, { nextFocus });
    assert.doesNotMatch(`${action.title} ${action.detail}`, /бизнес|борлуул|хэрэгцээ|контент|ноорог|пост|Facebook/iu, nextFocus);
  }
});

test("long original refusals keep their scope across later business or content keywords", () => {
  for (const refusal of ["Бизнес хиймээргүй", "Бизнес хийхийг одоогоор огт хүсэхгүй байна", "Бизнес сонирхохгүй", "Biznes hiimeergui"]) {
    const action = suggest({ growthPreferences: refusal }, { nextFocus: "Бизнесийн санаагаа эхлүүлэх" });
    assert.doesNotMatch(`${action.title} ${action.detail}`, /бизнес|борлуул|хэрэгцээ/iu, refusal);
  }
  for (const refusal of ["Контент хийхийг огт хүсэхгүй", "Контент бэлдэхэд одоохондоо цаг гаргах сонирхолгүй", "Kontent hiimeergui"]) {
    const action = suggest({ growthPreferences: refusal }, { nextFocus: "Facebook пост бичих" });
    assert.doesNotMatch(`${action.title} ${action.detail}`, /контент|ноорог|пост|Facebook/iu, refusal);
  }
});

test("a certain positive later focus still permits an opted-in business or content step", () => {
  assert.match(suggest({}, { nextFocus: "Бизнесийн санаагаа туршиж үзмээр байна" }).title, /хэрэгцээгээ асуулт болгох/u);
  assert.match(suggest({}, { nextFocus: "Facebook пост бичих" }).title, /богино ноорог/u);
});

test("communication refusals and uncertainty cannot override a different later activity", () => {
  for (const nextFocus of [
    "Илтгэх дасгал хийхгүй. Номын нэг хуудас уншина.",
    "Ярих дасгал хийхийг одоогоор огт хүсэхгүй. Номын нэг хуудас уншина.",
    "Харилцааны тухай мэдэхгүй. Эхлээд өөрийн ажлаа төлөвлөнө.",
    "Илтгэх дасгал хийх эсэхээ мэдэхгүй. Өөрийн ажлаа төлөвлөнө.",
    "Iltgeh dasgal hiihgui. Nomiin neg huudas unshina.",
    "Yarih chadvar hiihgui. Huviin tsagaa tsegtslene.",
    "Hariltsaa medehgui. Huviin tsagaa tsegtslene.",
    "Speaking not sure. Time management.",
  ]) {
    const action = suggest({}, { nextFocus });
    assert.doesNotMatch(`${action.title} ${action.detail}`, /гурван өгүүлбэрээр хэл|чангаар хэлээд|харилцах дадлагатай/u, nextFocus);
  }
  assert.match(suggest({}, { nextFocus: "Харилцааны тухай мэдэхгүй. Эхлээд өөрийн ажлаа төлөвлөнө." }).title, /Хувийн нэг чухал ажлынхаа/u);
});

test("original speaking refusals remain exclusions and affirmative speaking still works", () => {
  for (const refusal of ["Илтгэх дасгал хийхгүй", "Ярих дасгал хийхийг огт хүсэхгүй", "Iltgeh dasgal hiihgui", "Yarih chadvar hiimeergui"]) {
    const action = suggest({ growthPreferences: refusal }, { nextFocus: "Илтгэх дасгал хийнэ" });
    assert.doesNotMatch(action.title, /гурван өгүүлбэрээр хэл/u, refusal);
  }
  for (const nextFocus of ["Илтгэх дасгал хийж туршина", "Санаагаа гурван өгүүлбэрээр хэлж турших", "Iltgeh dasgal hiij turshina", "Yarih chadvar dasgal hiine"]) {
    assert.match(suggest({}, { nextFocus }).title, /гурван өгүүлбэрээр хэл/u, nextFocus);
  }
});

test("blocked check-in simplifies the task and does not claim support has been sent", () => {
  const action = suggest({}, { needsHelp: true, blocker: "Хаанаас эхлэхээ ойлгохгүй байна.", helpRequest: "Нэг жишээ авмаар байна." });
  assert.equal(action.minutes, 5);
  assert.match(action.title, /асуулт болгох/);
  assert.match(action.detail, /шаардлагатай бол/);
  assert.match(action.detail, /«Хүнээс тусламж авъя» товчоор/);
  assert.doesNotMatch(action.detail, /«Тусламж хэрэгтэй»/);
  assert.doesNotMatch(action.detail, /илгээлээ|очлоо|холбогдоно/u);
});

test("time difficulty creates a smaller concrete experiment", () => {
  const action = suggest({ weeklyCapacity: "5 минут" }, { needsHelp: true, blocker: "Цаг хүрэхгүй байна." });
  assert.match(action.title, /багасгах/);
  assert.equal(action.minutes, 5);
  assert.match(action.doneWhen, /туршиж/);
});

test("completed progress selects reflection and a next experiment rather than repeating the starter", () => {
  const action = suggest({}, { progressPercent: 100 });
  assert.match(action.title, /дараагийн нэг туршилт/);
  assert.match(action.why, /дууссан гэж тэмдэглэсэн/);
  assert.notEqual(action.title, createStarterPlan(answers, []).todayAction.title);
});

test("help takes priority over a completed percentage", () => {
  const action = suggest({}, { progressPercent: 100, needsHelp: true, helpRequest: "Тайлбар авах хэрэгтэй байна." });
  assert.match(action.title, /асуулт болгох/);
});

test("explicit no-blocker and no-help answers do not invent a support need", () => {
  for (const noHelp of [
    "Байхгүй", "Байхгүй байна.", "Саад алга", "Тусламж хэрэггүй", "Тусламж шаардлагагүй байна",
    "baihgui", "baihgui bn", "saad baihgui", "tuslamj hereggui", "tuslamj hereg gui baina",
    "tuslamj shaardlagagui", "no help needed", "no blockers", "none", "n/a",
  ]) {
    for (const field of ["blocker", "helpRequest"]) {
      const action = suggest({}, { [field]: noHelp, needsHelp: false });
      assert.match(action.title, /гурван өгүүлбэр/, `${field}: ${noHelp}`);
      assert.equal(action.minutes, 10, `${field}: ${noHelp}`);
    }
  }
  const action = suggest({}, { blocker: "Байхгүй", helpRequest: "Тусламж хэрэггүй", needsHelp: false });
  assert.match(action.title, /гурван өгүүлбэр/);
});

test("explicit needsHelp=true wins even when written answers deny difficulty", () => {
  for (const denied of ["Байхгүй", "Тусламж хэрэггүй", "baihgui", "tuslamj hereggui"]) {
    const action = suggest({}, { blocker: denied, helpRequest: denied, needsHelp: true });
    assert.match(action.title, /асуулт болгох/, denied);
    assert.equal(action.minutes, 5);
  }
});

test("a real difficulty is retained beside a no-help answer or within a longer response", () => {
  assert.match(suggest({}, { blocker: "Цаг хүрэхгүй байна", helpRequest: "Тусламж хэрэггүй", needsHelp: false }).title, /багасгах/);
  assert.match(suggest({}, { blocker: "Байхгүй", helpRequest: "Нэг жишээ хэрэгтэй байна", needsHelp: false }).title, /асуулт болгох/);
  assert.match(suggest({}, { helpRequest: "Тусламж хэрэггүй гэж бодсон ч одоо асуух зүйл байна", needsHelp: false }).title, /асуулт болгох/);
});

test("latest self-management focus wins over an old Facebook content goal and starter", () => {
  const oldContent = { goal30Day: "Facebook дээр тогтмол хэрэгтэй пост бичиж сурна", growthPreferences: "Богино контент бэлдэх дадлага хэрэгтэй" };
  for (const nextFocus of ["Хувийн ажлынхаа цагийг цэгцлэх", "Өдөр тутмын ажлаа төлөвлөх", "Huviin tsagaa tsegtsleh", "Time management"]) {
    const action = suggest(oldContent, { nextFocus });
    assert.match(action.title, /Хувийн нэг чухал ажлынхаа хийх цагийг сонгох/, nextFocus);
    assert.doesNotMatch(`${action.title} ${action.detail}`, /ноорог|пост|контент|Facebook/u);
    assert.match(action.doneWhen, /эхлэх цаг/);
  }
});

test("latest discovery focus precedes old speaking goals and broad conversation keywords", () => {
  const action = suggest({}, { nextFocus: "Хэрэгцээ тодруулах ярианы асуулт бэлдэх" });
  assert.match(action.title, /хэрэгцээг ойлгох асуулт/);
  assert.match(action.doneWhen, /нээлттэй асуулт/);
  assert.doesNotMatch(action.title, /гурван өгүүлбэр/);
});

test("explicit unrecognized focus does not revive an old speaking or content direction", () => {
  for (const goal30Day of [answers.goal30Day, "Facebook дээр хэрэгтэй пост бичиж сурна"]) {
    const action = suggest({ goal30Day }, { nextFocus: "Ургамлынхаа навчийг арчлах" });
    assert.match(action.title, /эхний жижиг хэсгийг/);
    assert.doesNotMatch(action.title, /гурван өгүүлбэр|ноорог/);
  }
});

test("old goal is a fallback only for blank or genuinely unknown latest focus", () => {
  const oldContent = { goal30Day: "Facebook дээр тогтмол хэрэгтэй пост бичиж сурна", growthPreferences: "Богино контент бэлдэх дадлага хэрэгтэй" };
  for (const nextFocus of ["", "   ", "?", "Мэдэхгүй байна", "Мэдэхгүй байна аа", "Одоогоор тодорхойгүй байна", "Юу хийхээ мэдэхгүй", "medehgui bn", "not sure", "n/a"]) {
    assert.match(suggest(oldContent, { nextFocus }).title, /богино ноорог/, nextFocus);
  }
});

test("private source text is used as signals, never copied into the shared action", () => {
  const marker = "PRIVATE_SENTINEL_7713";
  const action = suggest({ currentContext: marker, primaryBlocker: marker }, { progressSummary: marker, nextFocus: marker, blocker: marker });
  assert.doesNotMatch(JSON.stringify(action), new RegExp(marker));
});

const migrationUrl = new URL("../supabase/migrations/20260924004452_add_mentor_checkin_continuation.sql", import.meta.url);

test("mentor migration is additive and preserves the existing starter transitions and RLS", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /add column if not exists source_checkin_id bigint references public\.member_checkins\(id\)/);
  assert.match(sql, /add column if not exists planned_for timestamptz/);
  assert.match(sql, /create unique index if not exists member_actions_source_checkin_unique/);
  assert.doesNotMatch(sql, /\b(?:drop|delete|truncate)\b|disable row level security|create policy/i);
  assert.doesNotMatch(sql, /create(?: or replace)? function (?:public|private)\.transition_my_member_action/);
  assert.doesNotMatch(sql, /grant\s+(?:insert|update|delete|all).*on\s+table/i);
  assert.match(sql, /greatest\(3, coalesce\(max\(sequence_no\), 0\)\) \+ 1/);
});

test("continuation RPC enforces ownership, idempotency, latest map and one active action", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /v_user_id is null or not \(select private\.current_user_has_active_membership\(\)\)/);
  assert.match(sql, /where id = p_checkin_id and user_id = v_user_id/);
  assert.match(sql, /where user_id = v_user_id for update/);
  assert.match(sql, /source_checkin_id = p_checkin_id and member_user_id = v_user_id/);
  assert.match(sql, /if found then return v_result; end if;/);
  assert.match(sql, /p_expected_plan_version <> v_map\.plan_version/);
  assert.match(sql, /\(later.created_at, later.id\) > \(v_checkin.created_at, v_checkin.id\)/);
  assert.match(sql, /status not in \('done', 'superseded'\)/);
  assert.match(sql, /on conflict do nothing/);
  assert.match(sql, /p_capacity_minutes not between 5 and least\(45, v_capacity\)/);
  assert.match(sql, /p_minutes not between 5 and p_capacity_minutes/);
  const continuation = sql.slice(sql.indexOf("create function private.continue_my_member_path"), sql.indexOf("create function public.continue_my_member_path"));
  assert.doesNotMatch(continuation, /update public\.member_actions/);
});

test("new RPCs use private definer plus public invoker and restricted execute grants", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const name of ["continue_my_member_path", "schedule_my_member_action"]) {
    assert.match(sql, new RegExp(`create function private\\.${name}[\\s\\S]*?security definer\\s+set search_path = ''`));
    assert.match(sql, new RegExp(`create function public\\.${name}[\\s\\S]*?security invoker\\s+set search_path = ''`));
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}[^;]+from public, anon, authenticated;`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}[^;]+to authenticated;`));
  }
  assert.doesNotMatch(sql, /user_metadata|service_role/);
});

test("scheduling stores or clears only the owner's nonterminal action with an audit event", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const scheduling = sql.slice(sql.indexOf("create function private.schedule_my_member_action"));
  assert.match(scheduling, /where id = p_action_id and member_user_id = v_user_id for update/);
  assert.match(scheduling, /v_action.status in \('done', 'superseded'\)/);
  assert.match(scheduling, /p_planned_for is not null and not isfinite\(p_planned_for\)/);
  assert.match(scheduling, /set planned_for = p_planned_for/);
  assert.match(scheduling, /is not distinct from p_planned_for/);
  assert.match(scheduling, /insert into public\.member_action_events/);
  assert.match(scheduling, /'field', 'planned_for'/);
});

test("workspace flags new columns and scheduling, keeps saved check-in on continuation failure", async () => {
  const route = await readFile(new URL("../app/api/workspace/route.ts", import.meta.url), "utf8");
  assert.match(route, /first30DayEnabled && process.env.MENTOR_LOOP_ENABLED === "true"/);
  assert.match(route, /const memberActionSelect = mentorLoopEnabled/);
  assert.match(route, /planned_for,source_checkin_id/);
  assert.match(route, /plannedFor: activeActionRow.planned_for \?\? null/);
  assert.match(route, /sourceCheckinId: activeActionRow.source_checkin_id \?\? null/);
  assert.match(route, /action === "schedule_member_action" && !mentorLoopEnabled/);
  assert.match(route, /plannedFor !== null && !isTimestamp/);
  assert.match(route, /!activeResult.data && mapResult.data/);
  assert.match(route, /supabase.rpc\("continue_my_member_path"/);
  assert.match(route, /return Response.json\(\{ checkin, mentorActionCreated, mentorNotice \}, \{ status: 201 \}\)/);
  assert.ok(route.indexOf('.insert({\n          user_id: userId,\n          progress_summary: progressSummary,') < route.indexOf('supabase.rpc("continue_my_member_path"'));
  assert.doesNotMatch(route, /service_role|createMentorAction\([^)]*aiConsent/s);
});
