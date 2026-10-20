import { useState } from 'react';
import { Switch, View } from 'react-native';
import { api, ApiError, type StarterAnswers, type StoredSuccessMap } from '../lib/api';
import { CLARIFICATION_GUIDANCE, STARTER_ANSWER_KEYS, clarificationReason, clarificationMessage, firstAnswerNeedingClarification, isStarterAnswerKey } from '../../../../lib/success-map/clarification';
import { Body, Button, Card, Field, Title } from './ui';

const titles = [
  'Та яг одоо ямар нөхцөлтэй байна вэ?',
  'Ирэх 30 хоногт юу өөр болсон байгаасай гэж хүсэж байна вэ?',
  'Долоо хоногт нийт хэдэн минут бодитоор гаргаж чадах вэ?',
  'Юун дээр гацаж байна, өмнө нь юу туршсан бэ?',
  'Ямар хэлбэрийн тусламж танд хэрэгтэй вэ?',
];
export function Onboarding({ map, onSaved, onCancel }: { map: StoredSuccessMap | null; onSaved: () => Promise<void>; onCancel?: () => void }) {
  const [answers, setAnswers] = useState<StarterAnswers>(map?.answers ?? { currentContext: '', goal30Day: '', weeklyCapacity: '', primaryBlocker: '', growthPreferences: '' });
  const [step, setStep] = useState(0);
  const [clarify, setClarify] = useState(false);
  const [aiConsent, setAiConsent] = useState(map?.aiConsent ?? false);
  const [sharing, setSharing] = useState(map?.supportSummaryConsent ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = STARTER_ANSWER_KEYS[Math.min(step, 4)];
  function next() {
    const reason = clarificationReason(key, answers[key]);
    if (reason) { setClarify(true); setError(clarificationMessage(reason)); return; }
    setError(''); setClarify(false); setStep(step + 1);
  }
  async function save() {
    const missing = firstAnswerNeedingClarification(answers);
    if (missing) { setStep(STARTER_ANSWER_KEYS.indexOf(missing)); setClarify(true); return; }
    setBusy(true); setError('');
    try {
      await api('/api/success-map', { ...answers, aiConsent, supportSummaryConsent: sharing });
      await onSaved();
    } catch (e) {
      if (e instanceof ApiError && isStarterAnswerKey(e.detail.clarificationKey)) {
        setStep(STARTER_ANSWER_KEYS.indexOf(e.detail.clarificationKey)); setClarify(true);
      }
      setError(e instanceof Error ? e.message : 'Хадгалж чадсангүй. Холболтоо шалгаарай.');
    } finally { setBusy(false); }
  }
  return <View style={{ gap: 18 }}><Title>Өөрт тохирох эхний алхмаа олъё</Title><Body>Нэг удаад нэг асуулт. Мэдэхгүй байж болно — жишээнээс сонгоод өөрийн үгээр засаарай. Амжилт, орлого амлахгүй; юу хийхээ та сонгоно.</Body>
    {step < 5 ? <Card title={`${step + 1}/5 · ${titles[step]}`}>
      <Field label="Таны хариулт" multiline value={answers[key]} maxLength={key === 'weeklyCapacity' ? 800 : 1600} onChangeText={value => setAnswers({ ...answers, [key]: value })} />
      <Button secondary onPress={() => setClarify(!clarify)}>Мэдэхгүй байна · Жишээ харъя</Button>
      {clarify && <><Body>{CLARIFICATION_GUIDANCE[key].prompt}</Body>{CLARIFICATION_GUIDANCE[key].choices.map(choice => <Button secondary key={choice} onPress={() => { setAnswers({ ...answers, [key]: choice }); setError(''); }}>{choice}</Button>)}</>}
      <Button onPress={next}>Дараагийн асуулт</Button>
    </Card> : <Card title="Мэдээллээ хэнтэй хуваалцах вэ?">
      <Body>Зөвшөөрвөл 5 хариулт, суурь төлөвлөгөө, санал болгосон хичээл гаднын хиймэл оюуны үйлчилгээнд дамжина. Хувийн нууцаа хариултдаа бүү бичээрэй. Зөвшөөрөхгүй ч төлөвлөгөө гарна. Цаашдын яриаг энэ зөвшөөрлөөр дамжуулахгүй.</Body>
      <Switch accessibilityLabel="Хиймэл оюунаар төлөвлөгөөг найруулах" value={aiConsent} onValueChange={setAiConsent} disabled={busy} />
      <Body>Урьсан хүн, дасгалжуулагчид 2–5 дахь хариулт (зорилго, цаг, саад, тусламж) болон явцаа бичсэнээр нь харуулах уу? 1 дэх хариулт, хувийн яриа харагдахгүй. Өөрөө илгээсэн тусламжийн хүсэлт үүнээс тусдаа.</Body>
      <Switch accessibilityLabel="Урьсан хүнтэй дөрвөн хариулт, явцаа хуваалцах" value={sharing} onValueChange={setSharing} disabled={busy} />
      <Button disabled={busy} onPress={() => void save()}>{busy ? 'Төлөвлөгөө гаргаж байна…' : 'Эхний ажлаа харъя'}</Button>
    </Card>}
    {!!error && <Body>{error}</Body>}
    {step > 0 && <Button secondary disabled={busy} onPress={() => { setStep(step - 1); setError(''); setClarify(false); }}>Өмнөх асуулт</Button>}
    {onCancel && <Button secondary disabled={busy} onPress={onCancel}>Өөрчлөлтгүй буцах</Button>}
  </View>;
}
