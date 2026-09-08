begin;

create table if not exists public.academy_lessons (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  level_id text not null check (level_id in ('l0', 'l1', 'l2', 'l3', 'l5')),
  title text not null check (char_length(title) between 1 and 140),
  lesson_type text not null check (char_length(lesson_type) between 1 and 40),
  minutes integer not null check (minutes between 1 and 480),
  content text not null check (char_length(content) between 1 and 12000),
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists academy_lessons_level_sort_idx
  on public.academy_lessons(level_id, sort_order, created_at);

insert into public.academy_lessons (id, level_id, title, lesson_type, minutes, content, sort_order)
values
  ('l0-1', 'l0', 'inCruises-ийн философи ба зорилго', 'Хичээл', 8, E'Энэ хичээлээр аяллын гишүүнчлэлийн үндсэн санаа, хэрэглэгчид бодитой хүлээлт өгөх зарчмыг ойлгоно.\n\nГол санаа:\n• Албан мэдээллийг баталгаатай эх сурвалжаас ашиглана.\n• Аялал, үнэ, боломжийг хэтрүүлэлгүй тайлбарлана.\n• Бүртгэл, төлбөр, booking-ийг зөвхөн албан ёсны portal дээр хийнэ.', 10),
  ('l0-2', 'l0', 'Member ба Partner-ийн ялгаа', 'Хичээл', 10, E'Member нь аяллын гишүүнчлэлийн хэрэглэгч, Partner нь бизнесийн үйл ажиллагаанд оролцох тусдаа статустай. Хоёр ойлголтыг холихгүйгээр зорилго, эрх, хариуцлагыг тодорхой тайлбарлана.', 20),
  ('l0-3', 'l0', 'Амлалт өгөхгүй зөв тайлбарлах', 'Role-play', 12, E'Дадлага: баталгаагүй орлого, тогтсон хэмнэлт, заавал гарах үр дүн амлахгүйгээр бүтээгдэхүүний үнэ цэнийг тайлбарлана. Нөгөө хүний хэрэгцээг асууж, албан эх сурвалж руу чиглүүлнэ.', 30),
  ('l0-4', 'l0', 'L0 мэдлэгийн шалгалт', 'Quiz', 5, E'Өөрийгөө шалгах асуултууд:\n1. Member болон Partner-ийн гол ялгаа юу вэ?\n2. Ямар мэдээллийг амлалт хэлбэрээр өгч болохгүй вэ?\n3. Бүртгэл, төлбөрийг хаана хийх ёстой вэ?', 40),
  ('l1-1', 'l1', 'Membership 3.X үндсэн ойлголт', 'Хичээл', 12, E'Membership-ийн одоогийн нөхцөлийг зөвхөн хүчинтэй Agreement болон FAQ баримттай тулган тайлбарлана. Үнэ, credit, benefit өөрчлөгдөж болох тул тогтмол тоо цээжээр амлахгүй.', 10),
  ('l1-2', 'l1', 'Аяллын зорилгыг тодруулах', 'Workshop', 10, E'Хэрэглэгчийн аяллын хугацаа, чиглэл, хамт явах хүмүүс, төсөв, уян хатан байдлыг асуултаар тодруул. Шийдэл санал болгохоос өмнө сонссон зүйлээ нэг өгүүлбэрээр баталгаажуул.', 20),
  ('l1-3', 'l1', 'Үнэ цэнийг харьцуулж тайлбарлах', 'Role-play', 16, E'Ижил нөхцөлтэй сонголтуудыг огноо, өрөө, татвар, цуцлалтын нөхцөлөөр нь харьцуул. Зөвхөн хямд гэсэн нэг үзүүлэлтээр дүгнэхгүй.', 30),
  ('l1-4', 'l1', 'L1 teach-back', 'Assessment', 10, E'2 минутын тайлбар бэлтгэ: хэрэглэгчийн зорилгыг тодруулах, Membership-ийн үнэ цэнийг албан нөхцөлд тулгуурлан хэлэх, дараагийн алхмыг зөв санал болгох.', 40),
  ('l2-1', 'l2', 'Discovery асуултын бүтэц', 'Хичээл', 10, E'Нээлттэй асуулт → тодруулах асуулт → баталгаажуулах өгүүлбэр гэсэн дарааллаар ярилц. Шууд санал тавихаас өмнө бодит хэрэгцээг ол.', 10),
  ('l2-2', 'l2', 'Хэрэгцээг буцааж баталгаажуулах', 'Role-play', 15, E'“Таны хэлснээр...” гэж эхлэн сонссон хэрэгцээгээ товч буцааж хэл. Буруу ойлгосон бол хэрэглэгчид засах боломж өг.', 20),
  ('l2-3', 'l2', 'Follow-up-ийн 3 алхам', 'Workshop', 15, E'1. Өмнөх яриаг сануул.\n2. Хэрэгтэй нэг мэдээлэл өг.\n3. Дарамтгүй, тодорхой дараагийн алхам санал болго.', 30),
  ('l2-4', 'l2', 'L2 conversation review', 'Assessment', 15, E'Ярианыхаа тэмдэглэлийг шалга: асуулт хангалттай байсан уу, хэрэглэгчийн үгийг баталгаажуулсан уу, дарамт эсвэл баталгаагүй амлалт орсон уу?', 40),
  ('l3-1', 'l3', '72 цагийн onboarding', 'Playbook', 18, E'Шинэ гишүүний эхний 72 цагт нэвтрэх эрх, зорилго, эхний сургалт, дараагийн холбоо барих хугацааг тодорхой болго. Хийсэн алхам бүрийг Member Success хэсэгт бүртгэ.', 10),
  ('l3-2', 'l3', '30/60/90 success review', 'Workshop', 20, E'30, 60, 90 хоног бүр хэрэглээ, ойлголт, саад, дараагийн зорилгыг хамт дүгнэ. Хэрэглэгчийн бодит үр дүнд тулгуурлан дараагийн task үүсгэ.', 20),
  ('l3-3', 'l3', 'Builder-ийн долоо хоногийн хэмнэл', 'Playbook', 22, E'Долоо хоногийн хэмнэлд суралцах цаг, хэрэглэгчийн follow-up, багийн review, албан эх сурвалжийн шинэчлэл шалгах цагийг оруул.', 30),
  ('l3-4', 'l3', 'Member Success teach-back', 'Assessment', 20, E'Нэг бодит кейс сонгон 72 цаг болон 30/60/90 хоногийн дараагийн алхмыг тайлбарлаж, coach-оос санал ав.', 40),
  ('l5-1', 'l5', 'Coach review rubric', 'Playbook', 20, E'Coach нь зөвхөн үр дүн биш, процессийг шалгана: асуулт, сонсох чадвар, эх сурвалж, амлалтын эрсдэл, тодорхой next action.', 10),
  ('l5-2', 'l5', 'Багийн KPI ба bottleneck', 'Workshop', 25, E'Сургалтын ахиц, хугацаа хэтэрсэн task, review-д гацсан контент зэрэг хэмжигдэхүүнийг ажиглаж хамгийн том саадыг сонго.', 20),
  ('l5-3', 'l5', 'Compliance escalation', 'Simulation', 25, E'Баталгаагүй claim, зөвшөөрөлгүй материал, хэрэглэгчийн гомдлыг өөрөө нуухгүй. Баримтыг хадгалж, эрх бүхий хянагч руу шуурхай шилжүүл.', 30),
  ('l5-4', 'l5', 'Director readiness board', 'Assessment', 35, E'Багийн сургалт, member success, контентын хяналт, эрсдэлийн ажиллагааг нэг самбараас тайлбарлаж, шийдвэр бүрийн эзэн ба хугацааг тодорхойл.', 40)
on conflict (id) do nothing;

alter table public.academy_lessons enable row level security;

create policy "academy_lessons_select_active"
on public.academy_lessons
for select
to authenticated
using (
  is_published
  or (select private.current_user_is_team_admin())
);

create policy "academy_lessons_insert_admin"
on public.academy_lessons
for insert
to authenticated
with check ((select private.current_user_is_team_admin()));

create policy "academy_lessons_update_admin"
on public.academy_lessons
for update
to authenticated
using ((select private.current_user_is_team_admin()))
with check ((select private.current_user_is_team_admin()));

create policy "academy_lessons_delete_admin"
on public.academy_lessons
for delete
to authenticated
using ((select private.current_user_is_team_admin()));

revoke all on table public.academy_lessons from anon, authenticated;
grant select on table public.academy_lessons to authenticated;
grant insert (id, level_id, title, lesson_type, minutes, content, sort_order, is_published, created_by)
  on table public.academy_lessons to authenticated;
grant update (title, lesson_type, minutes, content, sort_order, is_published, updated_at)
  on table public.academy_lessons to authenticated;
grant delete on table public.academy_lessons to authenticated;

commit;
