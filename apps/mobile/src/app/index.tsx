import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';
import { levels, sources } from '@/constants/data';
import { supabase } from '@/lib/supabase';

type Membership = { role: 'builder' | 'coach' | 'director' | 'admin'; status: 'active' | 'disabled' };
type Task = { id: number; member_name: string; milestone: string; next_action: string; due_label: string; risk: string; status: string };
type Tab = 'home' | 'academy' | 'tasks' | 'sources';
const tabs: Record<Tab, string> = { home: 'Нүүр', academy: 'Сургалт', tasks: 'Ажил', sources: 'Эх сурвалж' };

function Logo() {
  return <View style={s.logo}><View style={[s.block, s.b1]} /><View style={[s.block, s.b2]} /><View style={[s.block, s.b3]} /></View>;
}

function Login() {
  const [signupMode, setSignupMode] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    setBusy(true); setError('');
    if (signupMode) {
      if (!displayName.trim() || password.length < 8) {
        setError('Нэрээ оруулж, 8-аас дээш тэмдэгттэй нууц үг сонгоно уу.');
        setBusy(false);
        return;
      }
      const result = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { full_name: displayName.trim() } } });
      if (result.error) setError('Бүртгэл үүсгэж чадсангүй. Имэйлээ шалгаад дахин оролдоно уу.');
      else if (!result.data.session) Alert.alert('Бүртгэл үүслээ', 'Имэйлээр ирсэн холбоосоор бүртгэлээ баталгаажуулна уу.');
    } else {
      const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) setError('Имэйл эсвэл нууц үг буруу байна.');
    }
    setBusy(false);
  }
  return <SafeAreaView style={s.safe}><View style={s.login}>
    <Logo /><Text style={s.eyebrow}>PRIVATE TEAM ACCESS</Text><Text style={s.brand}>inSuccess</Text><Text style={s.os}>TEAM OS</Text>
    <Text style={s.copy}>{signupMode ? 'Шинэ хэрэглэгчийн бүртгэлээ үүсгэнэ үү.' : 'Багийн сургалт, контентын хяналт, гишүүний дараагийн алхмыг нэг дор.'}</Text>
    {signupMode ? <TextInput style={s.input} value={displayName} onChangeText={setDisplayName} autoComplete="name" placeholder="Овог нэр" placeholderTextColor="#7290aa" /> : null}
    <TextInput style={s.input} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="Имэйл" placeholderTextColor="#7290aa" />
    <TextInput style={s.input} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" placeholder="Нууц үг" placeholderTextColor="#7290aa" onSubmitEditing={submit} />
    {error ? <Text style={s.error}>{error}</Text> : null}
    <Pressable style={[s.primary, (!email || !password || (signupMode && !displayName)) && s.disabled]} disabled={busy || !email || !password || (signupMode && !displayName)} onPress={submit}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>{signupMode ? 'Бүртгүүлэх' : 'Нэвтрэх'}</Text>}</Pressable>
    <Pressable style={s.authSwitch} onPress={() => { setSignupMode(value => !value); setError(''); }}><Text style={s.link}>{signupMode ? 'Бүртгэлтэй юу? Нэвтрэх' : 'Шинэ хэрэглэгч үү? Бүртгүүлэх'}</Text></Pressable>
  </View></SafeAreaView>;
}

function Pending({ email }: { email: string }) {
  return <SafeAreaView style={s.safe}><View style={s.pending}><Logo /><Text style={s.section}>Эрх хүлээгдэж байна</Text><Text style={s.muted}>{email}</Text><Text style={s.copy}>Админ таны багийн эрхийг идэвхжүүлсний дараа workspace нээгдэнэ.</Text><Pressable style={s.secondary} onPress={() => supabase.auth.signOut()}><Text style={s.link}>Гарах</Text></Pressable></View></SafeAreaView>;
}

function TaskCard({ task, done }: { task: Task; done: (id: number) => void }) {
  return <View style={s.card}><View style={s.row}><Text style={s.kicker}>{task.milestone} · {task.due_label}</Text><Text style={s.badge}>{task.risk}</Text></View><Text style={s.cardTitle}>{task.member_name}</Text><Text style={s.copySmall}>{task.next_action}</Text><Pressable style={s.smallButton} onPress={() => done(task.id)}><Text style={s.link}>Дууссан гэж тэмдэглэх</Text></Pressable></View>;
}

function Workspace({ session, member }: { session: Session; member: Membership }) {
  const [tab, setTab] = useState<Tab>('home');
  const [progress, setProgress] = useState<string[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const completed = useMemo(() => new Set(progress), [progress]);
  const total = levels.reduce((count, level) => count + level.lessons.length, 0);
  const load = useCallback(async () => {
    const [p, t] = await Promise.all([
      supabase.from('lesson_progress').select('lesson_id'),
      supabase.from('member_tasks').select('id,member_name,milestone,next_action,due_label,risk,status').order('updated_at', { ascending: false }).limit(40),
    ]);
    if (p.error || t.error) return Alert.alert('Алдаа', 'Мэдээллийг татаж чадсангүй.');
    setProgress((p.data ?? []).map(item => item.lesson_id)); setTasks((t.data ?? []) as Task[]);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function refresh() { setRefreshing(true); await load(); setRefreshing(false); }
  async function toggle(id: string) {
    const query = completed.has(id)
      ? supabase.from('lesson_progress').delete().eq('user_id', session.user.id).eq('lesson_id', id)
      : supabase.from('lesson_progress').insert({ user_id: session.user.id, lesson_id: id, status: 'completed' });
    const { error } = await query;
    if (error) Alert.alert('Алдаа', 'Сургалтын явцыг хадгалж чадсангүй.'); else await load();
  }
  async function done(id: number) {
    const { error } = await supabase.from('member_tasks').update({ status: 'complete', updated_at: new Date().toISOString() }).eq('id', id).eq('owner_id', session.user.id);
    if (error) Alert.alert('Алдаа', 'Даалгаврыг шинэчилж чадсангүй.'); else await load();
  }
  const open = tasks.filter(item => item.status === 'open');
  return <SafeAreaView style={s.safe} edges={['top']}>
    <View style={s.top}><View><Text style={s.topBrand}>inSuccess</Text><Text style={s.topSub}>{member.role.toUpperCase()} WORKSPACE</Text></View><Pressable onPress={() => supabase.auth.signOut()}><Text style={s.link}>Гарах</Text></Pressable></View>
    <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#3e95ff" />}>
      {tab === 'home' && <><Text style={s.eyebrow}>ӨНӨӨДРИЙН ХЯНАЛТЫН ТӨВ</Text><Text style={s.hero}>Сайн байна уу</Text><Text style={s.copySmall}>{session.user.email}</Text><View style={s.metrics}><View style={s.metric}><Text style={s.number}>{progress.length}/{total}</Text><Text style={s.muted}>Дууссан хичээл</Text></View><View style={s.metric}><Text style={s.number}>{open.length}</Text><Text style={s.muted}>Нээлттэй ажил</Text></View></View><Text style={s.section}>Дараагийн алхам</Text>{open.slice(0, 3).map(task => <TaskCard key={task.id} task={task} done={done} />)}{open.length === 0 && <Text style={s.empty}>Одоогоор нээлттэй ажил алга.</Text>}</>}
      {tab === 'academy' && <><Text style={s.eyebrow}>ACADEMY</Text><Text style={s.hero}>Сургалтын зам</Text>{levels.map(level => <View style={s.card} key={level.id}><Text style={s.kicker}>{level.label}</Text><Text style={s.cardTitle}>{level.title}</Text><Text style={s.muted}>{level.note}</Text>{level.lessons.map(lesson => <Pressable style={s.lesson} key={lesson[0]} onPress={() => toggle(lesson[0])}><View style={[s.check, completed.has(lesson[0]) && s.checkDone]}><Text style={s.checkText}>{completed.has(lesson[0]) ? '✓' : ''}</Text></View><View style={s.flex}><Text style={s.lessonTitle}>{lesson[1]}</Text><Text style={s.muted}>{lesson[2]}</Text></View></Pressable>)}</View>)}</>}
      {tab === 'tasks' && <><Text style={s.eyebrow}>MEMBER SUCCESS</Text><Text style={s.hero}>Дараагийн ажлууд</Text>{open.map(task => <TaskCard key={task.id} task={task} done={done} />)}{open.length === 0 && <Text style={s.empty}>Одоогоор нээлттэй ажил алга.</Text>}</>}
      {tab === 'sources' && <><Text style={s.eyebrow}>SOURCE VAULT</Text><Text style={s.hero}>Албан эх сурвалж</Text><Text style={s.copySmall}>Мэдээллээ нийтлэхийн өмнө албан баримтаар баталгаажуулна уу.</Text>{sources.map(source => <Pressable style={s.card} key={source[0]} onPress={() => Linking.openURL(source[2])}><Text style={s.kicker}>{source[1]} · CURRENT</Text><Text style={s.cardTitle}>{source[0]}</Text><Text style={s.link}>Баримт нээх ↗</Text></Pressable>)}</>}
    </ScrollView>
    <View style={s.tabs}>{(Object.keys(tabs) as Tab[]).map(item => <Pressable style={s.tab} key={item} onPress={() => setTab(item)}><View style={[s.dot, tab === item && s.dotOn]} /><Text style={[s.tabText, tab === item && s.tabOn]}>{tabs[item]}</Text></Pressable>)}</View>
  </SafeAreaView>;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [member, setMember] = useState<Membership | null>(null);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session) { setMember(null); setBusy(false); return; }
    setBusy(true);
    supabase.from('team_members').select('role,status').eq('user_id', session.user.id).maybeSingle().then(({ data, error }) => { setMember(error ? null : data as Membership | null); setBusy(false); });
  }, [session]);
  if (busy) return <SafeAreaView style={[s.safe, s.center]}><ActivityIndicator size="large" color="#3e95ff" /></SafeAreaView>;
  if (!session) return <Login />;
  if (!member || member.status !== 'active') return <Pending email={session.user.email ?? ''} />;
  return <Workspace session={session} member={member} />;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#061729' }, center: { alignItems: 'center', justifyContent: 'center' }, flex: { flex: 1 },
  login: { flex: 1, justifyContent: 'center', padding: 28 }, logo: { width: 38, height: 38, marginBottom: 28 }, block: { position: 'absolute', borderRadius: 5 }, b1: { width: 18, height: 18, backgroundColor: '#3e95ff' }, b2: { width: 13, height: 13, backgroundColor: '#70caff', right: 2 }, b3: { width: 13, height: 13, backgroundColor: '#2785dd', bottom: 3 },
  eyebrow: { color: '#72b7ff', fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 9 }, brand: { color: '#fff', fontSize: 53, fontWeight: '300', letterSpacing: -3 }, os: { color: '#fff', fontSize: 39, fontWeight: '300', letterSpacing: -2, marginTop: -8 },
  copy: { color: '#a9bed1', fontSize: 15, lineHeight: 23, marginVertical: 23 }, copySmall: { color: '#afc3d3', fontSize: 14, lineHeight: 21 }, muted: { color: '#7894aa', fontSize: 12, lineHeight: 18 }, error: { color: '#ff8796', marginBottom: 10 },
  input: { backgroundColor: '#0b263b', borderColor: '#173e58', borderWidth: 1, borderRadius: 10, color: '#fff', fontSize: 16, marginBottom: 12, padding: 15 }, primary: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#398cf6', borderRadius: 10, height: 52 }, primaryText: { color: '#fff', fontWeight: '800' }, disabled: { opacity: .45 },
  authSwitch: { alignItems: 'center', padding: 16 },
  pending: { backgroundColor: '#0a2236', borderColor: '#173b55', borderWidth: 1, borderRadius: 17, margin: 24, marginVertical: 'auto', padding: 26 }, secondary: { borderColor: '#31516a', borderWidth: 1, borderRadius: 9, padding: 13, alignItems: 'center' },
  top: { padding: 16, paddingHorizontal: 20, borderBottomColor: '#15354d', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, topBrand: { color: '#fff', fontSize: 24, fontWeight: '600' }, topSub: { color: '#6faadb', fontSize: 9, fontWeight: '800', letterSpacing: 1.4 }, link: { color: '#68b7ff', fontWeight: '700' },
  content: { padding: 20, paddingBottom: 35 }, hero: { color: '#fff', fontSize: 35, fontWeight: '700', letterSpacing: -1.2, marginBottom: 7 }, section: { color: '#f5f9fc', fontSize: 22, fontWeight: '700', marginTop: 25, marginBottom: 12 },
  metrics: { flexDirection: 'row', gap: 11, marginTop: 22 }, metric: { flex: 1, backgroundColor: '#0a2438', borderRadius: 14, borderColor: '#173b55', borderWidth: 1, padding: 17 }, number: { color: '#62b5ff', fontSize: 27, fontWeight: '800' },
  card: { backgroundColor: '#0a2236', borderColor: '#173b55', borderWidth: 1, borderRadius: 15, padding: 16, marginTop: 11 }, kicker: { color: '#65adf1', fontSize: 10, fontWeight: '800', letterSpacing: 1 }, cardTitle: { color: '#f2f7fb', fontSize: 17, fontWeight: '700', marginVertical: 7 }, row: { flexDirection: 'row', justifyContent: 'space-between' }, badge: { color: '#bcd6e8', fontSize: 10, backgroundColor: '#17394e', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, overflow: 'hidden' }, smallButton: { backgroundColor: '#123b59', borderRadius: 8, marginTop: 14, padding: 10, alignItems: 'center' },
  lesson: { flexDirection: 'row', gap: 11, alignItems: 'center', borderTopColor: '#16364d', borderTopWidth: 1, paddingTop: 12, marginTop: 12 }, check: { width: 25, height: 25, borderRadius: 13, borderWidth: 1, borderColor: '#42647e', alignItems: 'center', justifyContent: 'center' }, checkDone: { backgroundColor: '#278bef', borderColor: '#278bef' }, checkText: { color: '#fff', fontWeight: '900' }, lessonTitle: { color: '#dce9f3', fontSize: 14, fontWeight: '600' },
  empty: { color: '#7894aa', textAlign: 'center', borderColor: '#254359', borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, padding: 25 }, tabs: { flexDirection: 'row', backgroundColor: '#081d30', borderTopColor: '#17364e', borderTopWidth: 1, paddingTop: 9, paddingBottom: 10 }, tab: { flex: 1, alignItems: 'center', gap: 5 }, dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#38536a' }, dotOn: { backgroundColor: '#49a7ff' }, tabText: { color: '#68869f', fontSize: 11, fontWeight: '700' }, tabOn: { color: '#75baff' },
});
