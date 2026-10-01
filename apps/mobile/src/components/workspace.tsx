import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, RefreshControl, ScrollView, Switch, Text, View } from 'react-native';
import { api, ApiError, plainMongolianText as plain, webOrigin, type WorkspacePayload } from '../lib/api';
import { actionView, localSchedule } from '../lib/action-view';
import { Body, Busy, Button, Card, Field, Fold, LinkButton, Title, c } from './ui';
import { Onboarding } from './onboarding';
import { officialSources } from '../../../../app/team-os-data';

type Action = (body: Record<string, unknown>, notice?: string) => Promise<boolean>;
type ActionRow = NonNullable<WorkspacePayload['activeAction']>;
const statuses: Record<string, string> = { proposed: 'Санал болгосон', accepted: 'Хийхээр сонгосон', started: 'Хийж байгаа', paused: 'Түр завсарласан', blocked: 'Тусламж хэрэгтэй', done: 'Дууссан', superseded: 'Шинэ ажлаар сольсон', submitted: 'Илгээсэн', reviewed: 'Санал ирсэн', assigned: 'Хүн хариуцсан', open: 'Хүлээгдэж байгаа', acknowledged: 'Хүлээн авсан', in_progress: 'Тусалж байгаа', resolved: 'Үр дүнг хүлээж байгаа', closed: 'Хаагдсан', draft: 'Ноорог', review: 'Хяналтад', internal_approved: 'Дотоод хяналт тэнцсэн', corporate_approved: 'Баталгааны эх бүртгэгдсэн' };
const label = (status: string) => statuses[status] ?? plain(status);
const date = (value: string | null) => value ? new Date(value).toLocaleString('mn-MN') : 'Товлоогүй';

function CurrentAction({ row, enabled, act, busy }: { row: ActionRow; enabled: boolean; act: Action; busy: boolean }) {
  const [help, setHelp] = useState(false);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [kind, setKind] = useState('not_understood');
  const [minutes, setMinutes] = useState(String(row.minutes));
  const [day, setDay] = useState('');
  const [time, setTime] = useState('');
  const [error, setError] = useState('');
  const copy = actionView(row.detail, row.sourceCheckinId);
  const transition = (nextStatus: string) => act({ action: 'transition_member_action', actionId: row.id, nextStatus });
  async function schedule() {
    const value = localSchedule(day, time);
    if (!value) {
      setError('Өдөр, цагаа зөв, одооноос хойших хугацаагаар оруулаарай.'); return;
    }
    setError(''); await act({ action: 'schedule_member_action', actionId: row.id, plannedFor: value }, 'Хийх цагаа хадгаллаа. Утасны мэдэгдэл автоматаар ирэхгүй.');
  }
  return <><Card title={plain(row.title)}><Body>{label(row.status)} · {row.minutes} минут</Body>
    {copy.reason && <Body>Яагаад энэ ажил вэ? {copy.reason}</Body>}
    {copy.steps.map((step, index) => <Body key={index}>{index + 1}. {step}</Body>)}
    <Title>Ингэвэл дууссан</Title><Body>{plain(row.doneWhen)}</Body>
    {['proposed', 'accepted', 'paused', 'blocked'].includes(row.status) && <Button disabled={busy} onPress={() => void transition('started')}>{['paused', 'blocked'].includes(row.status) ? 'Үргэлжлүүлье' : 'Эхэлье'}</Button>}
    {['proposed', 'accepted', 'started'].includes(row.status) && <><Button disabled={busy} onPress={() => void transition('done')}>Хийж дуусгалаа</Button><Button disabled={busy} secondary onPress={() => setHelp(!help)}>Гацлаа · Хүнээс тусламж авъя</Button></>}
    {['accepted', 'started'].includes(row.status) && <Button secondary disabled={busy} onPress={() => void transition('paused')}>Түр завсарлая</Button>}
    {row.plannedFor && <Body>Товлосон цаг: {date(row.plannedFor)}</Body>}
  </Card>
  {help && <Card title="Ямар тусламж хэрэгтэй байна?">
    <Field label="Юун дээр гацсан бэ?" multiline value={reason} onChangeText={setReason} maxLength={1200} />
    {Object.entries({ not_understood: 'Ойлгоогүй зүйлээ тайлбарлуулах', cannot_start: 'Эхний алхмаа тодруулах', insufficient_time: 'Цагтаа тааруулж багасгах', needs_practice: 'Дадлага, жишээ авах', needs_person: 'Хүнтэй ярилцах' }).map(([key, text]) => <Button key={key} secondary={key !== kind} onPress={() => setKind(key)}>{text}</Button>)}
    <Field label="Хариуцах хүнд хэлэх зүйл" multiline value={message} onChangeText={setMessage} maxLength={1200} />
    <Body>Энэ хүсэлтэд бичсэн зүйл хариуцах хүнд харагдана. Эхний 5 хариултаа хуваалцах зөвшөөрлөөс тусдаа.</Body>
    <Button disabled={busy || reason.trim().length < 3 || message.trim().length < 3} onPress={() => { void act({ action: 'transition_member_action', actionId: row.id, nextStatus: 'blocked', blockedReason: reason, requestType: kind, requestText: message }, 'Хүсэлт хадгалагдлаа. Хариуцах хүн, хугацааг хүсэлтийн төлөвөөс хараарай.').then(ok => { if (ok) setHelp(false); }); }}>Хүсэлтээ илгээх</Button>
  </Card>}
  <Fold title="Хийх цаг, хугацаагаа тохируулах"><Field label={`Гаргах минут (5–${row.capacityMinutes})`} value={minutes} keyboardType="number-pad" onChangeText={setMinutes} />
    <Body>Минутыг солих нь ажлын алхмыг автоматаар багасгахгүй. Амжихгүй бол дээрх тусламжаас “Цагтаа тааруулж багасгах”-ыг сонгоорой.</Body>
    <Button disabled={busy || !Number.isInteger(Number(minutes)) || Number(minutes) < 5 || Number(minutes) > row.capacityMinutes} onPress={() => void act({ action: 'change_member_action_time', actionId: row.id, minutes: Number(minutes) })}>Минутыг хадгалах</Button>
    {enabled && <><Field label="Хийх өдөр · жишээ 2026-10-15" value={day} onChangeText={setDay} maxLength={10} /><Field label="Хийх цаг · жишээ 18:30" value={time} onChangeText={setTime} maxLength={5} /><Body>Таны төхөөрөмжийн орон нутгийн цагаар хадгална. Утасны автомат сануулга биш.</Body><Button disabled={busy} onPress={() => void schedule()}>Цагаа товлох</Button>{!!error && <Body>{error}</Body>}</>}
  </Fold></>;
}

function Checkin({ act, busy }: { act: Action; busy: boolean }) {
  const [form, setForm] = useState({ progressSummary: '', blocker: '', helpRequest: '', nextFocus: '', progressPercent: '0', needsHelp: false });
  const fields = { progressSummary: 'Сүүлийн удаа юу хийсэн бэ?', nextFocus: 'Одоо юуг хийж эсвэл тодруулмаар байна?' } as const;
  return <Card title="Хийсэн зүйлээ хэлээрэй"><Body>Хийгээгүй байж болно. Үнэнээр нь товч бичээрэй. Үүн дээр тулгуурлан дараагийн нэг алхмыг санал болгоно. Одоо хийж буй ажлыг автоматаар солихгүй.</Body>
    {Object.entries(fields).map(([key, title]) => <Field key={key} label={title} multiline maxLength={1200} value={form[key as keyof typeof fields]} onChangeText={value => setForm({ ...form, [key]: value })} />)}
    <Fold title="Гацсан зүйл, хүссэн тусламжаа нэмэх (хүсвэл)">
    <Field label="Юун дээр гацав?" multiline maxLength={1200} value={form.blocker} onChangeText={blocker => setForm({ ...form, blocker })} />
    <Field label="Ямар тусламж хэрэгтэй вэ?" multiline maxLength={1200} value={form.helpRequest} onChangeText={helpRequest => setForm({ ...form, helpRequest })} />
    <Field label="Өөрийн үнэлсэн зорилгын явц · 0–100%" keyboardType="number-pad" value={form.progressPercent} onChangeText={value => setForm({ ...form, progressPercent: value })} />
    <Body>Урьсан хүн, дасгалжуулагчийн тусламж хэрэгтэй</Body><Switch accessibilityLabel="Хүний тусламж хүсэх" value={form.needsHelp} onValueChange={needsHelp => setForm({ ...form, needsHelp })} />
    <Body>Энд тусламж хэрэгтэйг тэмдэглэнэ; хүнд автоматаар мэдэгдэл илгээхгүй. Шууд хүсэлт явуулах бол ажлын “Хүнээс тусламж авъя”-г ашиглаарай.</Body></Fold>
    <Button disabled={busy || form.progressSummary.trim().length < 3 || form.nextFocus.trim().length < 3 || !Number.isInteger(Number(form.progressPercent)) || Number(form.progressPercent) < 0 || Number(form.progressPercent) > 100 || (form.needsHelp && form.blocker.trim().length < 3 && form.helpRequest.trim().length < 3)} onPress={() => void act({ ...form, action: 'weekly_checkin', progressPercent: Number(form.progressPercent) }, 'Явцаа хадгаллаа.')}>Явцаа хадгалж, дараагийн алхмаа харъя</Button>
  </Card>;
}

function Practice({ item, own, act, busy, sharing }: { item: WorkspacePayload['academyPractices'][number]; own: boolean; act: Action; busy: boolean; sharing: boolean }) {
  const [text, setText] = useState(own ? item.submission : '');
  return <Card title={own ? 'Хичээлээс туршсан зүйл' : 'Гишүүний дадлага'}><Body>{plain(item.prompt)}</Body><Body>{label(item.status)}</Body>
    {!!item.submission && <Body>Илгээсэн үр дүн: {item.submission}</Body>}{!!item.feedback && <Body>Дасгалжуулагчийн санал: {item.feedback}</Body>}
    {own && item.status !== 'reviewed' && <><Field label="Юу туршиж, ямар үр дүн гарсан бэ?" value={text} onChangeText={setText} multiline maxLength={2400} /><Body>{sharing ? 'Хуваалцах зөвшөөрөлтэй, хариуцсан хүнтэй бол санал авах боломжтой.' : 'Хуваалцах зөвшөөрөл унтраалттай. Дасгалжуулагчид илгээсэн гэж тооцохгүй.'}</Body><Button disabled={busy || text.trim().length < 10} onPress={() => void act({ action: 'submit_academy_practice', practiceId: item.id, submission: text })}>Үр дүнгээ хадгалах</Button></>}
    {!own && item.status === 'submitted' && <><Field label="Яг юуг сайн хийсэн, юуг сайжруулах вэ?" value={text} onChangeText={setText} multiline maxLength={1600} /><Button disabled={busy || text.trim().length < 3} onPress={() => void act({ action: 'review_academy_practice', practiceId: item.id, feedback: text })}>Саналаа илгээх</Button></>}
  </Card>;
}

function Support({ item, own, assigned, act, busy }: { item: WorkspacePayload['supportRequests'][number]; own: boolean; assigned: boolean; act: Action; busy: boolean }) {
  const [note, setNote] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  async function advance(nextStatus: string) {
    const parsed = new Date(next);
    if (nextStatus === 'resolved' && (note.trim().length < 3 || !Number.isFinite(parsed.getTime()) || parsed.getTime() <= Date.now())) { setError('Өгсөн тусламж болон дахин шалгах ирээдүйн хугацааг оруулаарай.'); return; }
    setError(''); await act({ action: 'advance_support_request', supportRequestId: item.id, nextStatus, resolutionNote: note, nextCheckAt: Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null });
  }
  return <Card title="Тусламжийн хүсэлт"><Body>{item.requestText}</Body><Body>{label(item.status)} · {item.assignedTo ? 'Хариуцах хүнтэй' : 'Хариуцах хүн хараахан оноогоогүй'}</Body><Body>Эргэж шалгах: {date(item.nextCheckAt)}</Body>{!!item.resolutionNote && <Body>{item.resolutionNote}</Body>}
    {own && item.status === 'resolved' && <><Body>Өгсөн тусламж хэрэг болсон уу?</Body><Button disabled={busy} onPress={() => void act({ action: 'confirm_support_request', supportRequestId: item.id, helpful: true })}>Тийм, тус болсон</Button><Button secondary disabled={busy} onPress={() => void act({ action: 'confirm_support_request', supportRequestId: item.id, helpful: false })}>Үгүй, өөр арга хэрэгтэй</Button></>}
    {!own && assigned && !['closed', 'resolved'].includes(item.status) && <>
      <Button secondary disabled={busy} onPress={() => void advance('acknowledged')}>Хүлээн авлаа</Button><Button secondary disabled={busy} onPress={() => void advance('in_progress')}>Тусалж эхэллээ</Button>
      <Field label="Ямар тусламж өгсөн бэ?" multiline value={note} onChangeText={setNote} maxLength={1600} /><Field label="Дахин шалгах өдөр, цаг · 2026-10-15T18:30" value={next} onChangeText={setNext} /><Button disabled={busy} onPress={() => void advance('resolved')}>Тусламж өгсөн · үр дүнг эргэж шалгана</Button>{!!error && <Body>{error}</Body>}
    </>}
  </Card>;
}

function TeamMember({ member, workspace: w, act, busy }: { member: WorkspacePayload['supportMembers'][number]; workspace: WorkspacePayload; act: Action; busy: boolean }) {
  const [note, setNote] = useState(''); const [next, setNext] = useState('');
  return <Fold title={`${member.displayName} · ${member.teamName}`}><Body>Урьсан хүн: {member.sponsorName ?? 'Оноогоогүй'} · Дасгалжуулагч: {member.coachName ?? 'Оноогоогүй'}</Body>
    {member.summary ? <><Body>Зорилго: {member.summary.goal30Day}</Body><Body>Цаг: {member.summary.weeklyCapacity}</Body><Body>Саад: {member.summary.primaryBlocker}</Body><Body>Хүссэн тусламж: {member.summary.supportNeeds}</Body><Body>Одоогийн ажил: {plain(member.summary.todayAction)}</Body></> : <Body>Төлөвлөгөөний мэдээлэл хуваалцаагүй эсвэл хараахан бөглөөгүй байна. Хувийн яриаг энд харуулахгүй.</Body>}
    {member.latestCheckin && <Body>Сүүлийн явц: {member.latestCheckin.progressSummary}{'\n'}Саад: {member.latestCheckin.blocker}</Body>}
    {w.supportRequests.filter(r => r.memberUserId === member.id).map(item => <Support key={item.id} item={item} own={false} assigned={item.assignedTo === w.viewer.userId} act={act} busy={busy} />)}
    {w.academyPractices.filter(r => r.memberUserId === member.id).map(item => <Practice key={item.id} item={item} own={false} sharing act={act} busy={busy} />)}
    <Field label="Гишүүнд өгөх товч зөвлөгөө" multiline value={note} onChangeText={setNote} maxLength={1600} /><Field label="Хамт тохирсон дараагийн алхам" value={next} onChangeText={setNext} maxLength={800} /><Body>Энэ зөвлөгөө тухайн гишүүнд харагдана.</Body>
    <Button disabled={busy || note.trim().length < 3} onPress={() => void act({ action: 'add_coach_note', memberUserId: member.id, note, nextAction: next, visibleToMember: true })}>Зөвлөгөөг хадгалах</Button>
  </Fold>;
}

export function Workspace({ userId }: { userId: string }) {
  const [w, setW] = useState<WorkspacePayload | null>(null);
  const [tab, setTab] = useState('today');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fresh, setFresh] = useState(false);
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState('');
  const sequence = useRef(0); const saving = useRef(false);
  const load = useCallback(async () => {
    const current = ++sequence.current; setLoading(true); setFresh(false);
    try {
      const result = await api<WorkspacePayload>('/api/workspace');
      if (current !== sequence.current) return;
      if (result.viewer?.userId !== userId || !Array.isArray(result.lessons)) throw new Error('Серверийн хариу нийцэхгүй байна.');
      setW(result); setFresh(true);
    } catch (error) {
      if (current !== sequence.current) return;
      setW(null); setNotice(error instanceof ApiError && error.status === 403 ? 'Багийн эрх идэвхгүй байна. Таныг урьсан хүнтэй холбогдоорой.' : 'Мэдээллийг авч чадсангүй. Холболтоо шалгаад дахин ачаална уу.');
    } finally { if (current === sequence.current) setLoading(false); }
  }, [userId]);
  useEffect(() => {
    void load(); const sub = AppState.addEventListener('change', state => { if (state === 'active') void load(); else setFresh(false); });
    return () => { sequence.current += 1; sub.remove(); };
  }, [load]);
  const act: Action = async (body, message = 'Хадгаллаа.') => {
    if (!fresh || saving.current) return false;
    saving.current = true; setBusy(true); setNotice('');
    try {
      const result = await api<{ mentorNotice?: string | null }>('/api/workspace', body);
      setNotice(result.mentorNotice ?? message); await load(); return true;
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'Холболт тасарлаа. Хадгалагдсан эсэхийг дахин ачаалж шалгаарай.');
      if (error instanceof ApiError && [401, 403].includes(error.status)) setW(null);
      setFresh(false); return false;
    } finally { saving.current = false; setBusy(false); }
  };
  const disabled = busy || !fresh;
  const mine = w?.viewer.userId;
  const nav = [['today', 'Өнөөдөр'], ['path', 'Миний зам'], ['academy', 'Сургалт'], ...(w?.viewer.role !== 'user' ? [['team', 'Баг']] : []), ['more', 'Бусад']];
  return <View style={{ flex: 1 }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, gap: 18, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}>
    {!!notice && <Card><Text accessibilityRole="alert" style={{ color: c.ink, fontSize: 17 }}>{notice}</Text></Card>}
    {!fresh && !loading && <Button onPress={() => void load()}>Дахин ачаалах</Button>}
    {loading && !w && <Busy />}
    {w && (editing || !w.successMap) ? <Onboarding key={editing ? 'edit' : 'new'} map={w.successMap} onSaved={async () => { await load(); setEditing(false); setTab('today'); }} onCancel={w.successMap ? () => setEditing(false) : undefined} /> : w && <>
      {(tab === 'today' || tab === 'path') && <><Title>{tab === 'today' ? 'Өнөөдрийн нэг жижиг алхам' : 'Миний хөгжлийн зам'}</Title>
        {w.activeAction && w.first30DayEnabled ? <CurrentAction key={`${w.activeAction.id}-${w.activeAction.updatedAt}`} row={w.activeAction} enabled={w.mentorLoopEnabled} act={act} busy={disabled} /> : <Card title={w.first30DayEnabled ? 'Дараагийн алхмаа сонгоё' : 'Төлөвлөгөө · унших горим'}><Body>{w.first30DayEnabled ? 'Өмнөх ажлын үр дүнгээ доорх хэсэгт хэлээрэй.' : plain(w.successMap!.plan.todayAction.detail)}</Body>{!w.first30DayEnabled && <Body>Энэ орчинд ажлын явц, тусламжийн хүсэлт хадгалах боломж хараахан нээгдээгүй байна.</Body>}</Card>}
        {w.mentorLoopEnabled && <Checkin act={act} busy={disabled} />}
        {w.coachNotes.filter(n => n.memberUserId === mine && n.visibleToMember).map(n => <Card key={n.id} title={`${n.authorName}-ийн зөвлөгөө`}><Body>{n.note}</Body><Body>{n.nextAction}</Body></Card>)}
        {w.supportRequests.filter(r => r.memberUserId === mine).map(item => <Support key={item.id} item={item} own assigned={false} act={act} busy={disabled} />)}
        {tab === 'path' && <><Fold title="Миний 5 хариулт ба дэлгэрэнгүй төлөвлөгөө"><Body>{plain(w.successMap!.plan.profileSummary)}</Body><Body>{plain(w.successMap!.plan.whyThisPlan)}</Body>{Object.values(w.successMap!.answers).map((answer, i) => <Body key={i}>{i + 1}. {answer}</Body>)}{w.successMap!.plan.weeklyActions.map((a, i) => <Card key={i} title={plain(a.title)}><Body>{plain(a.detail)}</Body></Card>)}<Button secondary onPress={() => setEditing(true)}>Хариулт, хуваалцах зөвшөөрлөө засах</Button></Fold>
          <Fold title="Өмнөх ажлууд ба санал">{w.myActionHistory.map(item => <Body key={item.id}>{plain(item.title)} · {label(item.status)}</Body>)}{w.academyPractices.filter(p => p.memberUserId === mine).map(item => <Practice key={item.id} item={item} own sharing={w.successMap!.supportSummaryConsent} act={act} busy={disabled} />)}</Fold>
          <Fold title="Өмнөх явцын тэмдэглэл">{w.myCheckins.map(item => <Body key={item.id}>{date(item.createdAt)}{'\n'}{item.progressSummary}{'\n'}{item.nextFocus}</Body>)}</Fold>
        </>}
      </>}
      {tab === 'academy' && <><Title>Сургалт ба дадлага</Title><Body>Нэг хичээлээс нэг санааг бодитоор туршаарай.</Body>{w.lessons.filter(l => l.isPublished).map(lesson => <Fold key={lesson.id} title={`${plain(lesson.title)} · ${lesson.minutes} мин`}><Body>{lesson.content}</Body>{w.progress.some(p => p.lessonId === lesson.id && p.status === 'completed') ? <Body>✓ Үзсэн гэж тэмдэглэсэн</Body> : <Button disabled={disabled} onPress={() => void act({ action: 'toggle_lesson', lessonId: lesson.id })}>Хичээлээ үзлээ</Button>}</Fold>)}
        {w.academyPractices.filter(p => p.memberUserId === mine).map(item => <Practice key={item.id} item={item} own sharing={w.successMap!.supportSummaryConsent} act={act} busy={disabled} />)}
      </>}
      {tab === 'team' && w.viewer.role !== 'user' && <><Title>Багтаа туслах</Title><Body>Зөвхөн таны эрхийн хүрээнд хуваалцсан мэдээлэл харагдана. Таны хувийн хөгжлийн зам хэвээр байна.</Body>{w.supportMembers.length === 0 && <Body>Одоогоор танд хамаарах гишүүн харагдахгүй байна.</Body>}{w.supportMembers.filter(m => m.id !== mine).map(member => <TeamMember key={member.id} member={member} workspace={w} act={act} busy={disabled} />)}</>}
      {tab === 'more' && <><Title>Нийтлэл ба эх сурвалж</Title><Card title="Шинэ нийтлэлийн ноорог"><Field label="Ямар сэдвээр нийтлэл бэлдэх вэ?" value={draft} onChangeText={setDraft} maxLength={160} /><Body>Facebook-д зориулсан ноорог үүсгэнэ. Нийтлэхээс өмнө эх сурвалж, хүний хяналт шаардлагатай. Автоматаар нийтлэхгүй.</Body><Button disabled={disabled || draft.trim().length < 3} onPress={() => void act({ action: 'create_draft', title: draft, channel: 'Facebook', sourceId: officialSources[0].id })}>Ноорог үүсгэх</Button></Card>
        {w.drafts.map(d => <Card key={d.id} title={d.title}><Body>{label(d.status)}</Body><Body>{d.excerpt}</Body>{!!d.reviewNote && <Body>{d.reviewNote}</Body>}{d.isOwner && d.status === 'draft' && <Button disabled={disabled} onPress={() => void act({ action: 'submit_draft', id: d.id })}>Хүнээр хянуулах</Button>}</Card>)}
        <Fold title="Албан эх сурвалж">{officialSources.map(source => <LinkButton key={source.id} title={source.title} url={source.url} />)}</Fold>
        <LinkButton title="Вебийн нэмэлт удирдлага · тусдаа нэвтэрнэ" url={webOrigin} /><LinkButton title="Тусламж" url={`${webOrigin}/support`} /><LinkButton title="Нууцлалын бодлого" url={`${webOrigin}/privacy`} />
      </>}
    </>}
  </ScrollView><View style={{ flexDirection: 'row', backgroundColor: '#071c31', paddingVertical: 12 }}>{nav.map(([id, title]) => <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: id === tab }} style={{ flex: 1, minHeight: 48, justifyContent: 'center', paddingHorizontal: 3 }} onPress={() => { setTab(id); setEditing(false); }}><Text style={{ color: id === tab ? '#75cfff' : '#c4d2df', textAlign: 'center', fontSize: 13, fontWeight: '700' }}>{title}</Text></Pressable>)}</View></View>;
}
