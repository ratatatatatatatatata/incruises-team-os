import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { webOrigin } from '../lib/api';
import { Body, Busy, Button, Card, Field, LinkButton, Title, c } from '../components/ui';
import { Workspace } from '../components/workspace';

function Login() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [legacy, setLegacy] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submitting = useRef(false);
  async function login() {
    if (submitting.current) return;
    if (!email.trim() || (!legacy && !/^[0-9]{8}$/.test(password))) { setError('Имэйл болон 8 оронтой PIN кодоо оруулаарай.'); return; }
    submitting.current = true; setBusy(true); setError('');
    try {
      const result = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (result.error) setError('Имэйл эсвэл PIN код буруу, эсвэл урилга баталгаажаагүй байна. Урилгын холбоосоор эхлээд PIN кодоо тохируулаарай.');
    } catch { setError('Холболтоо шалгаад дахин оролдоно уу.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, gap: 20, flexGrow: 1, justifyContent: 'center' }}>
    <Image source={require('../../assets/images/icon-release.png')} style={{ width: 72, height: 72, borderRadius: 16 }} accessibilityLabel="inSuccess лого" />
    <Title>inSuccess · Миний хөгжлийн зам</Title><Body>Том зорилгоо нэг жижиг алхам болгож, өөрийн боломжит цагтаа хийж суръя.</Body>
    <Card><Field label="Имэйл" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label={legacy ? 'Хуучин нууц үг' : '8 оронтой PIN код'} key={legacy ? 'legacy' : 'pin'} value={password} onChangeText={value => setPassword(legacy ? value : value.replace(/[^0-9]/g, '').slice(0, 8))} secureTextEntry autoCapitalize="none" autoComplete="current-password" keyboardType={legacy ? 'default' : 'number-pad'} maxLength={legacy ? 128 : 8} />
      {!!error && <Text accessibilityRole="alert" style={{ color: '#a61e35', fontSize: 16 }}>{error}</Text>}
      <Button disabled={busy || !email || !password} onPress={() => void login()}>{busy ? 'Нэвтэрч байна…' : 'Нэвтрэх'}</Button>
      <Button secondary disabled={busy} onPress={() => { setLegacy(!legacy); setPassword(''); setError(''); }}>{legacy ? '8 оронтой PIN ашиглах' : 'Хуучин нууц үгээр нэвтрэх'}</Button>
      <LinkButton title="PIN код / нууц үгээ мартсан уу?" url={`${webOrigin}/auth/forgot-password`} />
    </Card><Body>Зөвхөн админы имэйл урилгаар нэвтэрнэ. Урилгын холбоосоо нээгээд PIN кодоо тохируулсны дараа энд нэвтрээрэй. Өмнөх нууц үг хэвээр ажиллана.</Body>
    <LinkButton title="Тусламж" url={`${webOrigin}/support`} /><LinkButton title="Нууцлалын бодлого" url={`${webOrigin}/privacy`} />
  </ScrollView></KeyboardAvoidingView>;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null); const [ready, setReady] = useState(false); const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => { if (!active) return; setSession(data.session); setError(error ? 'Нэвтрэлтийг сэргээж чадсангүй. Дахин нэвтэрнэ үү.' : ''); setReady(true); }).catch(() => { if (active) { setError('Нэвтрэлтийг сэргээж чадсангүй. Дахин нэвтэрнэ үү.'); setReady(true); } });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { if (active) { setSession(next); setReady(true); } });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  async function logout() {
    try { const { error } = await supabase.auth.signOut({ scope: 'local' }); if (error) throw error; }
    catch { Alert.alert('Гарч чадсангүй', 'Холболтоо шалгаад дахин оролдоорой.'); }
  }
  return <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
    {!ready ? <Busy /> : !session ? <>{!!error && <Body>{error}</Body>}<Login /></> : <><View style={{ padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><Text style={{ fontSize: 24, color: c.ink, fontWeight: '700' }}>inSuccess</Text><Button secondary onPress={() => void logout()}>Гарах</Button></View><Workspace key={session.user.id} userId={session.user.id} /></>}
  </SafeAreaView>;
}
