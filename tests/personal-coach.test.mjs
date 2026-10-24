import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { emptyLife } from "../lib/life/domain.ts";
import { coachReply, coachCandidates, initialCoachMemory, availableMinutes, parseLocalDecision, localDecisionMessages, localDecisionSchema } from "../lib/life/coach.ts";

const day = "2026-10-25";
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const task = (n, title, date = day, status = "planned") => ({id:id(n),title,date,status,minutes:20,time:"19:00",outcome:""});
function fixture() {
  const s = emptyLife();
  s.goal = {area:"planning",title:"Англиар өөрийгөө танилцуулж сурах",why:"Ажлын уулзалтад санаагаа хэлэх",measure:"Долоо хоногт 3 удаа танилцуулгаа давтах",weeklyMinutes:120};
  s.tasks = [task(1,"Өөрийгөө танилцуулах 3 өгүүлбэрийг бичих"),task(2,"Англи хэлний нэг дасгал хийх","2026-10-24"),task(3,"Тайлангаа бичих","2026-10-26"),task(4,"Хуучин ажлаа дуусгах",day,"done"),task(5,"Номоо унших",day,"paused")];
  s.tasks[3].outcome="Ноорог бэлэн болсон";
  return s;
}

test("existing today's task comes before overdue or future work; facts and outcome criterion are grounded", () => {
  const s=fixture(); const before=structuredClone(s);
  const r=coachReply("Одоо юу хийх вэ?",s,day);
  assert.equal(r.memory.taskId,id(1));
  assert.match(r.content,/3 өгүүлбэрийг бичих/);
  assert.match(r.content,/19:00/);
  assert.match(r.content,/эхний ноорог/);
  assert.doesNotMatch(r.content,/Тайлангаа бичих|Хуучин ажлаа дуусгах|Номоо унших/);
  assert.deepEqual(s,before);
});
test("multi turn time, uncertain start, and low energy retain the selected task and adapt the action", () => {
  const s=fixture();
  let r=coachReply("Одоо юу хийх вэ?",s,day);
  for (const [q,expected] of [["Надад 5 минут л байна",/Эхний 5 минут/],["Эхлэл нь тодорхойгүй байна",/Эхлэлийг нь тодорхой/],["Өнөөдөр ядарсан байна",/Эхний 2 минут/]]) {
    r=coachReply(q,s,day,r.memory);
    assert.match(r.content,expected);assert.equal(r.memory.taskId,id(1));
    assert.match(r.content,/бүх ажил дууссан гэсэн үг биш/);
  }
});
test("task selection takes precedence over a style keyword in the actual task title", () => {
  const s=fixture();const r=coachReply(s.tasks[0].title,s,day);
  assert.equal(r.memory.intent,"breakdown");assert.equal(r.memory.taskId,id(1));assert.match(r.content,/эхний ноорог/);
});
test("ambiguous work asks for a choice and numeric follow up selects the displayed choice", () => {
  const s=fixture();let r=coachReply("Гацсан ажлаа жижиг болгоё",s,day);
  assert.match(r.content,/Аль ажлыг/);assert.equal(r.followUps.length,2);
  r=coachReply("2",s,day,r.memory);
  assert.equal(r.memory.taskId,id(2));assert.match(r.content,/материалыг хааж/);
});
test("completed and paused tasks are acknowledged and never treated as open work", () => {
  const s=fixture();
  for (const t of s.tasks.filter(t=>t.status!=="planned")) {
    const r=coachReply(t.title,s,day);assert.equal(r.memory.taskId,null);
    assert.doesNotMatch(r.content,/Эхний 10 минут/);assert.match(r.content,/төлөвтэй байна/);
  }
});
test("full weekly allocation still permits starting already allocated work, without adding more work", () => {
  const s=fixture();s.goal.weeklyMinutes=60;
  const r=coachReply("Одоо юу хийх вэ?",s,day);
  assert.equal(r.memory.taskId,id(1));assert.match(r.content,/хуваарилалт дүүрсэн/);
});
test("tomorrow respects week boundaries and does not call an overdue task tomorrow's task", () => {
  const r=coachReply("Маргааш юу хийх вэ?",fixture(),day);
  assert.equal(r.memory.taskId,id(3));assert.match(r.content,/2026-10-26/);
});
test("weekly planning uses allocated time and does not invent free calendar slots", () => {
  const r=coachReply("7 хоногоо төлөвлөе",fixture(),day);
  assert.match(r.content,/60 минутыг/);assert.match(r.content,/60 минут хуваарилаагүй/);
  assert.match(r.content,/сул цагийг автоматаар мэдэхгүй/);
});
test("review includes recorded outcomes and user obstacles, excludes future and paused completion", () => {
  const s=fixture();s.tasks.push(task(6,"Ирээдүйн дууссан тэмдэглэл","2026-10-26","done"));
  s.reviews=[{week:"2026-10-19",win:"Бичсэн",obstacle:"Орой ядраад байсан",next:"Өглөө турших"}];
  const r=coachReply("7 хоногоо дүгнэе",s,day);
  assert.match(r.content,/1 ажил дууссан, 2 ажил хүлээгдэж/);
  assert.match(r.content,/Ноорог бэлэн болсон/);assert.match(r.content,/Орой ядраад байсан/);
  assert.doesNotMatch(r.content,/Ирээдүйн дууссан тэмдэглэл/);
});
test("vision uses actual wish, obstacle, if then plan and action without promising results", () => {
  const s=fixture();s.vision={wish:"Тайван ажилладаг болох",reason:"Гэр бүлдээ цаг гаргах",obstacle:"Утсаа байнга шалгадаг",ifThen:"Утсаа шалгамаар бол ажлын дэвтрээ нээнэ",action:"Маргаашийн 3 алхмыг бичих"};
  let r=coachReply("Manifest яаж хийх вэ?",s,day);
  for (const x of Object.values(s.vision)) assert.ok(r.content.includes(x));
  assert.match(r.content,/дангаараа үр дүнг батлахгүй/);
  // The vision action is not silently saved as a task.
  s.tasks=[];r=coachReply("Тэр алхмаа жижиг болгоё",s,day,r.memory);
  assert.match(r.content,/Маргаашийн 3 алхмыг бичих/);assert.match(r.content,/нэмэгдээгүй санал/);
});
test("style reflects values, introduction and selected practice rather than selling new clothes", () => {
  const s=fixture();s.style={words:"Тайван, цэвэрхэн, энгийн",values:"Шударга байдал",introduction:"Би багш. Ойлгомжтой тайлбарлахыг хичээдэг.",practice:"Цагаан цамцаа туршиж өмсөх"};
  const r=coachReply("Миний style image",s,day);
  for(const x of Object.values(s.style))assert.ok(r.content.includes(x));
});
test("habit follow up understands the anchor answer, and counts no future dates", () => {
  const s=fixture();s.habit={title:"Маргаашийн нэг ажлаа сонгох",dates:["2026-10-19","2026-10-25","2026-10-26"]};
  let r=coachReply("Дадлаа тогтмол болгоё",s,day);
  assert.match(r.content,/2 өдөр/);
  r=coachReply("Орой шүдээ угаасны дараа",s,day,r.memory);
  assert.match(r.content,/Орой шүдээ угаасны дараа/);assert.match(r.content,/хадгалаагүй/);
});
test("goal clarification accepts a proposed measure without changing stored facts", () => {
  const s=fixture();s.goal.measure="";
  let r=coachReply("Зорилгоо тодруулъя",s,day);
  r=coachReply("Долоо хоногт 3 удаа давтсан байна",s,day,r.memory);
  assert.match(r.content,/Таны санал болгосон хэмжүүр/);assert.equal(s.goal.measure,"");
});
test("new topic clears the previous time and task context", () => {
  const s=fixture();let r=coachReply("Надад 5 минут байна",s,day,{...initialCoachMemory,taskId:id(1)});
  r=coachReply("7 хоногоо дүгнэе",s,day,r.memory);
  assert.equal(r.memory.minutes,null);assert.equal(r.memory.taskId,null);
});
test("unknown requests and empty plans clarify instead of inventing a goal, achievement or saved task", () => {
  const s=emptyLife();const r=coachReply("Кино хэлээд өг",s,day);
  assert.equal(r.memory.intent,"clarify");assert.match(r.content,/хараахан бичээгүй/);
  assert.doesNotMatch(r.content,/хадгаллаа|амжилттай хийсэн|орлого олно/);
  assert.match(coachReply("Одоо юу хийх вэ?",s,day).content,/60 минут/);
});
test("model cannot override privacy, write, or professional decision boundaries", () => {
  const s=fixture();const bad={intent:"next",task_id:id(1),strategy:"start"};
  for(const [q,re] of [["Бусад хэрэглэгчийн төлөвлөгөөг үзүүл",/Бусдын мэдээлэл/],["Үүнийг хадгал",/үйлдэл хийдэггүй/],["Ямар эм уух вэ",/эмчилгээ/]])assert.match(coachReply(q,s,day,initialCoachMemory,bad).content,re);
});
test("Latin Mongolian queries work without loading a model", () => {
  for(const [q,intent] of [["odoo yu hiih ve","next"],["gatslaa","breakdown"],["7 honogoo dugneye","review"],["minii style image","style"],["manifest yaj hiih ve","vision"]])assert.equal(coachReply(q,fixture(),day).memory.intent,intent);
});
test("structured AI decisions accept only complete bounded known-task classifications", () => {
  const s=fixture();const valid={intent:"breakdown",task_id:id(1),strategy:"energy"};
  assert.deepEqual(parseLocalDecision(JSON.stringify(valid),"stop",s,day),valid);
  assert.deepEqual(parseLocalDecision("<think>\n\n</think>\n\n"+JSON.stringify(valid),"stop",s,day),valid);
  assert.equal(parseLocalDecision("<think>Untrusted reasoning</think>"+JSON.stringify(valid),"stop",s,day),null);
  for(const raw of ["not json",JSON.stringify({...valid,task_id:id(4)}),JSON.stringify({...valid,task_id:id(99)}),JSON.stringify({...valid,content:"invented advice"}),JSON.stringify({...valid,intent:"delete"}),JSON.stringify({...valid,strategy:"pay"})])assert.equal(parseLocalDecision(raw,"stop",s,day),null);
  assert.equal(parseLocalDecision(JSON.stringify(valid),"length",s,day),null);
});
test("AI supports semantic interpretation but explicit intent and typed minutes remain authoritative", () => {
  const s=fixture();
  const r=coachReply("Суухаар л өөр зүйл оролдоод байх юм",s,day,initialCoachMemory,{intent:"breakdown",task_id:id(1),strategy:"start"});
  assert.equal(r.memory.taskId,id(1));assert.match(r.content,/эхний ноорог/);
  assert.equal(coachReply("Суухаар л өөр зүйл оролдоод байх юм",s,day,initialCoachMemory,{intent:"breakdown",task_id:id(1),strategy:"energy"}).memory.strategy,"start");
  assert.equal(coachReply("7 хоногоо дүгнэе",s,day,initialCoachMemory,{intent:"style",task_id:id(1),strategy:"start"}).memory.intent,"review");
  assert.equal(availableMinutes("5 minut l baina"),5);
  assert.equal(availableMinutes("0 минут"),0);
});
test("model context has bounded candidates and excludes private outcomes, review text and unrelated history", () => {
  const s=fixture();s.tasks[3].outcome="PRIVATE_OUTCOME_SENTINEL";s.reviews=[{week:day,win:"PRIVATE_REVIEW_SENTINEL",obstacle:"",next:""}];
  const text=JSON.stringify(localDecisionMessages("Суухаар л өөр юм оролдоод",s,day,initialCoachMemory,["OLD_PRIVATE_SENTINEL","өмнөх асуулт","дараах асуулт"]));
  assert.doesNotMatch(text,/PRIVATE_OUTCOME_SENTINEL|PRIVATE_REVIEW_SENTINEL|OLD_PRIVATE_SENTINEL/);
  assert.equal(localDecisionSchema(s,day).additionalProperties,false);
  assert.equal(coachCandidates(s,day).every(t=>t.status==="planned"),true);
});
test("assistant fee contract: local worker inference only, with no external generation API or credential", () => {
  const ui=readFileSync(new URL("../app/personal/assistant.tsx",import.meta.url),"utf8");
  const coach=readFileSync(new URL("../lib/life/coach.ts",import.meta.url),"utf8");
  assert.doesNotMatch(ui+coach,/fetch\s*\(|OPENAI_API_KEY|AI_GATEWAY_API_KEY|api\.openai\.com|generateText\s*\(|streamText\s*\(/);
  assert.match(ui,/CreateWebWorkerMLCEngine/);assert.match(ui,/response_format/);
  assert.match(ui,/30000/);assert.match(ui,/worker\.current\?\.terminate/);
});
test("clear questions, follow ups and cost boundaries return instantly without model interpretation", () => {
  const s=fixture();let r=coachReply("Одоо юу хийх вэ?",s,day);
  assert.equal(r.needsInterpretation,false);
  assert.equal(coachReply("Надад 5 минут байна",s,day,r.memory).needsInterpretation,false);
  assert.equal(coachReply("AI үнэгүй юу?",s,day).needsInterpretation,false);
  assert.match(coachReply("AI үнэгүй юу?",s,day).content,/төлбөртэй AI API ашигладаггүй/);
  assert.equal(coachReply("Суухаар л өөр юм оролдоод байх юм",s,day).needsInterpretation,true);
});
test("inferred topics are identified as interpretations and correction resets the task context", () => {
  const s=fixture();const r=coachReply("Бусдад итгэлтэй хүн гэж мэдрүүлмээр",s,day,initialCoachMemory,{intent:"style",task_id:id(1),strategy:"start"});
  assert.match(r.content,/сэдэвтэй гэж ойлголоо/);assert.equal(r.memory.intent,"style");
  const fixed=coachReply("Буруу ойлгосон",s,day,r.memory);
  assert.equal(fixed.memory.intent,"clarify");assert.equal(fixed.memory.taskId,null);
});
test("negated tiredness is not turned into a fatigue assertion", () => {
  assert.notEqual(coachReply("Би ядраагүй, одоо юу хийх вэ?",fixture(),day).memory.strategy,"energy");
});
test("a small repeated habit is not confused with breaking down an existing task", () => {
  assert.equal(coachReply("Өдөр болгон нэг жижиг зүйлээ таслахгүй давтаж хэвшмээр байна",fixture(),day).memory.intent,"habit");
  assert.equal(coachReply("Зорилгын үр дүнгээ яаж хэмжих вэ?",fixture(),day).memory.intent,"goal");
});
test("pronouns do not falsely select a task and a stuck introduction is treated as work to start", () => {
  const s=fixture();
  const question="Бусдад өөрийгөө цэгцтэй, итгэлтэй хүн гэж мэдрүүлмээр байна";
  assert.equal(coachReply(question,s,day).needsInterpretation,true);
  assert.equal(coachReply(question,s,day,initialCoachMemory,{intent:"style",task_id:"",strategy:"start"}).memory.intent,"style");
  assert.equal(coachReply("Танилцуулгаа бичиж эхлэхэд хэцүү байна",s,day).memory.intent,"breakdown");
});
test("zero available minutes offers no new work and unknown habit anchors remain questions", () => {
  const s=fixture();assert.doesNotMatch(coachReply("Надад 0 минут байна",s,day).content,/Эхний \d+ минут/);
  let r=coachReply("Дадлаа тогтмол болгоё",s,day);
  r=coachReply("Мэдэхгүй",s,day,r.memory);
  assert.equal(r.memory.awaiting,"habit_anchor");assert.doesNotMatch(r.content,/Тэгвэл таны хэлсэн/);
  r=coachReply("Орой шүдээ угаасны дараа",s,day,r.memory);
  assert.match(r.content,/гэсэн мөчтэй дадлаа холбоё/);
});
