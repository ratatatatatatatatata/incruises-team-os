import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

export const c = { bg: '#f3f7fc', ink: '#102338', muted: '#425d74', blue: '#176bce', line: '#d8e4ee', white: '#fff' };
export function Body({ children }: { children: ReactNode }) { return <Text style={s.body}>{children}</Text>; }
export function Title({ children }: { children: ReactNode }) { return <Text accessibilityRole="header" style={s.title}>{children}</Text>; }
export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return <View style={s.card}>{title && <Title>{title}</Title>}{children}</View>;
}
export function Button({ children, onPress, disabled, secondary = false }: { children: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={[s.button, secondary && s.secondary, disabled && { opacity: .45 }]}><Text style={[s.buttonText, secondary && { color: c.blue }]}>{children}</Text></Pressable>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={{ gap: 8 }}><Text style={s.label}>{label}</Text><TextInput {...props} accessibilityLabel={label} placeholderTextColor="#6b8092" style={[s.input, props.multiline && { minHeight: 100, textAlignVertical: 'top' }]} /></View>;
}
export function Fold({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <Card><Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)}><Text style={s.label}>{open ? '▾' : '▸'} {title}</Text></Pressable>{open && children}</Card>;
}
export function Busy() { return <ActivityIndicator size="large" color={c.blue} style={{ padding: 30 }} />; }
export function LinkButton({ title, url }: { title: string; url: string }) {
  const [error, setError] = useState('');
  return <><Button secondary onPress={() => { void Linking.openURL(url).catch(() => setError('Холбоос нээгдсэнгүй. Дахин оролдоно уу.')); }}>{title}</Button>{!!error && <Body>{error}</Body>}</>;
}
export const s = StyleSheet.create({
  body: { color: c.muted, fontSize: 17, lineHeight: 26 }, title: { color: c.ink, fontSize: 24, fontWeight: '700', lineHeight: 32 },
  card: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 18, padding: 20, gap: 16 },
  label: { color: c.ink, fontSize: 17, fontWeight: '600', lineHeight: 25 },
  input: { color: c.ink, backgroundColor: '#f8fbff', borderWidth: 1, borderColor: '#9aafc1', borderRadius: 10, padding: 14, fontSize: 18 },
  button: { minHeight: 48, backgroundColor: c.blue, borderRadius: 12, padding: 14, justifyContent: 'center', alignItems: 'center' },
  secondary: { backgroundColor: '#edf5ff', borderWidth: 1, borderColor: '#bbd5f0' },
  buttonText: { color: c.white, fontSize: 17, fontWeight: '700', textAlign: 'center' },
});
