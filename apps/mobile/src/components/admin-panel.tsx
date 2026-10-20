import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { api, type WorkspacePayload } from '../lib/api';
import { Body, Button, Card, Field, Fold, Title } from './ui';

type User = WorkspacePayload['users'][number];
type Action = (body: Record<string, unknown>, notice?: string) => Promise<boolean>;
const roles = ['user', 'builder', 'coach', 'director', 'admin'] as const;
export const roleLabel = (role: string) => ({ user: 'Гишүүн', builder: 'Баг бүрдүүлэгч', coach: 'Дасгалжуулагч', director: 'Багийн удирдагч', admin: 'Админ' }[role] ?? role);
function Choice({ title, value, options, onChange, disabled }: { title: string; value: string; options: { id: string; name: string }[]; onChange: (value: string) => void; disabled: boolean }) {
  return <Fold title={`${title}: ${options.find(o => o.id === value)?.name ?? 'Оноогоогүй'}`}>{options.map(o => <Button key={o.id} secondary={o.id !== value} disabled={disabled} onPress={() => onChange(o.id)}>{o.name}</Button>)}</Fold>;
}
function MemberEditor({ member, users, mine, act, busy }: { member: User; users: User[]; mine: string; act: Action; busy: boolean }) {
  const [form, setForm] = useState(member);
  const self = member.id === mine;
  const options = (allowed: string[]) => [{ id: '', name: 'Оноохгүй' }, ...users.filter(u => u.id !== member.id && u.status === 'active' && allowed.includes(u.role)).map(u => ({ id: u.id, name: u.displayName }))];
  function save() {
    Alert.alert('Өөрчлөлтийг хадгалах уу?', `${member.displayName}\n${roleLabel(form.role)} · ${form.status === 'active' ? 'Идэвхтэй' : 'Идэвхгүй'}`, [
      { text: 'Болих', style: 'cancel' }, { text: 'Хадгалах', onPress: () => { void act({ action: 'update_user', userId: member.id, role: form.role, status: form.status, sponsorUserId: form.sponsorUserId || null, coachUserId: form.coachUserId || null, teamName: form.teamName }, 'Эрх болон багийн мэдээлэл шинэчлэгдлээ.'); } },
    ]);
  }
  return <Fold title={`${member.displayName} · ${roleLabel(member.role)}`}><Body>{member.email}</Body>
    <Choice title="Эрх" value={form.role} options={roles.map(id => ({ id, name: roleLabel(id) }))} disabled={busy || self} onChange={role => setForm({ ...form, role: role as User['role'] })} />
    <Choice title="Төлөв" value={form.status} options={[{ id: 'active', name: 'Идэвхтэй' }, { id: 'disabled', name: 'Идэвхгүй' }]} disabled={busy || self} onChange={status => setForm({ ...form, status: status as User['status'] })} />
    {self && <Body>Өөрийн админ эрхийг бууруулах, идэвхгүй болгох боломжгүй.</Body>}
    <Field label="Багийн нэр" value={form.teamName} editable={!busy} maxLength={80} onChangeText={teamName => setForm({ ...form, teamName })} />
    <Choice title="Урьсан хүн" value={form.sponsorUserId ?? ''} options={options(['builder', 'coach', 'director', 'admin'])} disabled={busy} onChange={sponsorUserId => setForm({ ...form, sponsorUserId })} />
    <Choice title="Дасгалжуулагч" value={form.coachUserId ?? ''} options={options(['coach', 'director', 'admin'])} disabled={busy} onChange={coachUserId => setForm({ ...form, coachUserId })} />
    <Button disabled={busy || !form.teamName.trim()} onPress={save}>Өөрчлөлтийг хадгалах</Button>
  </Fold>;
}
type Invitation = { id: string; display_name: string; email: string; role: string; status: string };
function Invitations({ users }: { users: User[] }) {
  const [form, setForm] = useState({ displayName: '', email: '', role: 'user', sponsorUserId: '', coachUserId: '', teamName: 'inSuccess Team' });
  const [rows, setRows] = useState<Invitation[]>([]); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const sending = useRef(false);
  async function load() { const result = await api<{ invitations: Invitation[] }>('/api/admin/invitations'); setRows(result.invitations); }
  useEffect(() => { void load().catch(() => setMessage('Урилгын жагсаалтыг уншиж чадсангүй.')); }, []);
  async function send() {
    if (sending.current) return;
    sending.current = true; setBusy(true); setMessage('');
    try { await api('/api/admin/invitations', { ...form, sponsorUserId: form.sponsorUserId || null, coachUserId: form.coachUserId || null }); setForm(f => ({ ...f, email: '', displayName: '' })); setMessage('Урилга илгээгдлээ.'); await load().catch(() => setMessage('Урилга илгээгдсэн. Жагсаалтыг дахин ачаална уу.')); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Урилгыг илгээж чадсангүй.'); }
    finally { sending.current = false; setBusy(false); }
  }
  const options = (allowed: string[]) => [{ id: '', name: 'Оноохгүй' }, ...users.filter(u => u.status === 'active' && allowed.includes(u.role)).map(u => ({ id: u.id, name: u.displayName }))];
  return <Fold title="Шинэ гишүүн урих, урилгууд"><Field label="Овог нэр" value={form.displayName} editable={!busy} maxLength={80} onChangeText={displayName => setForm({ ...form, displayName })} /><Field label="Имэйл" value={form.email} editable={!busy} autoCapitalize="none" keyboardType="email-address" onChangeText={email => setForm({ ...form, email })} />
    <Choice title="Эрх" value={form.role} options={roles.filter(r => r !== 'admin').map(id => ({ id, name: roleLabel(id) }))} disabled={busy} onChange={role => setForm({ ...form, role })} />
    <Field label="Багийн нэр" value={form.teamName} editable={!busy} maxLength={80} onChangeText={teamName => setForm({ ...form, teamName })} />
    <Choice title="Урьсан хүн" value={form.sponsorUserId} options={options(['builder', 'coach', 'director', 'admin'])} disabled={busy} onChange={sponsorUserId => setForm({ ...form, sponsorUserId })} />
    <Choice title="Дасгалжуулагч" value={form.coachUserId} options={options(['coach', 'director', 'admin'])} disabled={busy} onChange={coachUserId => setForm({ ...form, coachUserId })} />
    <Button disabled={busy || !form.displayName.trim() || !form.email.includes('@') || !form.teamName.trim()} onPress={() => Alert.alert('Урилга илгээх үү?', form.email, [{ text: 'Болих', style: 'cancel' }, { text: 'Илгээх', onPress: () => void send() }])}>{busy ? 'Илгээж байна…' : 'Имэйлээр урилга илгээх'}</Button>
    {!!message && <Body>{message}</Body>}{rows.map(row => <Body key={row.id}>{row.display_name} · {row.email} · {roleLabel(row.role)} · {({ pending: 'Хүлээгдэж буй', sent: 'Илгээсэн', provisioned: 'Эрх үүссэн', accepted: 'Баталгаажсан', failed: 'Алдаатай' }[row.status] ?? row.status)}</Body>)}
  </Fold>;
}
export function AdminPanel({ workspace: w, act, busy }: { workspace: WorkspacePayload; act: Action; busy: boolean }) {
  const [search, setSearch] = useState('');
  if (w.viewer.role !== 'admin') return null;
  const users = w.users.filter(u => `${u.displayName} ${u.email} ${u.teamName}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <><Title>Админ удирдлага</Title><Card><Body>Нийт {w.users.length} хэрэглэгч · Идэвхтэй {w.users.filter(u => u.status === 'active').length} · Нийтлэгдсэн {w.lessons.filter(l => l.isPublished).length} хичээл</Body></Card><Invitations users={w.users} /><Field label="Нэр, имэйл, багаар хайх" value={search} onChangeText={setSearch} />
    {users.length === 0 && <Body>Хайлтанд тохирох хэрэглэгч олдсонгүй.</Body>}{users.map(u => <MemberEditor key={JSON.stringify(u)} member={u} users={w.users} mine={w.viewer.userId} act={act} busy={busy} />)}</>;
}
