import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyLife,
  guidedReply,
  lifeSchema,
  suggestion,
  weeklyUsed,
  weekStart,
  capacityForWeek,
  weeklyMinutesFromAnswer,
} from "../lib/life/domain.ts";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const task = (n, date, minutes, status = "planned") => ({
  id: id(n),
  date,
  minutes,
  status,
  title: "Танилцуулгаа бичих",
  time: "20:30",
  outcome: "",
});
test("weekly budgets preserve past capacity when this week's capacity changes, and imported hours are not capped at 45", () => {
  const state = emptyLife();
  state.goal.weeklyMinutes = 5;
  state.weekBudgets = { "2026-10-12": 120, "2026-10-19": 5 };
  state.tasks = [task(1, "2026-10-15", 120, "done"), task(2, "2026-10-24", 5)];
  assert.equal(lifeSchema.safeParse(state).success, true);
  assert.equal(capacityForWeek(state, "2026-10-15"), 120);
  assert.equal(capacityForWeek(state, "2026-10-24"), 5);
  assert.equal(weeklyMinutesFromAnswer("7 хоногт 2 цаг."), 120);
  assert.equal(weeklyMinutesFromAnswer("15 minut"), 15);
  assert.equal(weeklyMinutesFromAnswer("өдөр бүр 10 минут"), null);
});
test("capacity counts all scheduled and completed tasks in the same local week, paused work releases time", () => {
  const state = emptyLife();
  state.goal.weeklyMinutes = 15;
  state.tasks = [
    task(1, "2026-10-19", 5, "done"),
    task(2, "2026-10-24", 10),
    task(3, "2026-10-25", 30, "paused"),
    task(4, "2026-10-26", 15),
  ];
  assert.equal(weeklyUsed(state, "2026-10-24"), 15);
  assert.equal(suggestion(state, "2026-10-24"), null);
  assert.equal(lifeSchema.safeParse(state).success, true);
  assert.equal(
    lifeSchema.safeParse({
      ...state,
      tasks: [...state.tasks, task(5, "2026-10-25", 1)],
    }).success,
    false,
  );
});
test("Monday week boundaries and leap dates are valid, invalid dates and duplicated records fail", () => {
  assert.equal(weekStart("2026-10-25"), "2026-10-19");
  assert.equal(weekStart("2026-10-26"), "2026-10-26");
  const state = emptyLife();
  state.tasks = [task(1, "2028-02-29", 5)];
  assert.equal(lifeSchema.safeParse(state).success, true);
  assert.equal(
    lifeSchema.safeParse({ ...state, tasks: [task(1, "2026-02-30", 5)] })
      .success,
    false,
  );
  assert.equal(
    lifeSchema.safeParse({ ...state, tasks: [...state.tasks, ...state.tasks] })
      .success,
    false,
  );
  assert.equal(
    lifeSchema.safeParse({ ...state, owner_id: "another-user" }).success,
    false,
  );
});
test("style and vision use the member selected action and previous outcome, without selling or forced lessons", () => {
  const state = emptyLife();
  state.goal.area = "style";
  state.style.practice = "Одоогийн хувцсаар нэг зохицол турших";
  assert.equal(suggestion(state, "2026-10-24").title, state.style.practice);
  state.tasks = [
    {
      ...task(1, "2026-10-24", 5, "done"),
      outcome: "Цэвэрхэн цагаан цамц өөрт тохирсон.",
    },
  ];
  assert.match(suggestion(state, "2026-10-24").why, /Цэвэрхэн цагаан цамц/);
  state.goal.area = "vision";
  state.vision.action = "Сургалтын хөтөлбөрийн эхний хуудсыг бичих";
  assert.equal(suggestion(state, "2026-10-24").title, state.vision.action);
  assert.doesNotMatch(
    suggestion(state, "2026-10-24").title,
    /борлуул|элсүүл|хичээл үз/,
  );
});
test("the always available guide reads actual member state and is honest about manifestation and empty progress", () => {
  const state = emptyLife();
  state.goal.title = "Өдрөө төлөвлөх";
  assert.match(
    guidedReply("Одоо юу хийх вэ?", state, "2026-10-24"),
    /Өдрөө төлөвлөх/,
  );
  assert.match(
    guidedReply("Одоо юу хийх вэ?", state, "2026-10-24"),
    /60 минут/,
  );
  assert.match(
    guidedReply("Manifest?", state, "2026-10-24"),
    /дангаараа үр дүнг батлахгүй/,
  );
  assert.match(guidedReply("7 хоногоо дүгнэе", state, "2026-10-24"), /0 ажил/);
});
