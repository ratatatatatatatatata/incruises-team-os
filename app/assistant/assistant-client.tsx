"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./assistant.module.css";

type MentorMode = "simple" | "step_by_step" | "fast";
type MessageRole = "user" | "assistant";
type UnknownRecord = Record<string, unknown>;

type MentorMessage = {
  id: string;
  role: MessageRole;
  content: string;
  source?: "ai_gateway" | "guided_fallback" | null;
};

type AssistantResult = {
  conversationId: string | null;
  messages: MentorMessage[];
  reply: string | null;
  source: "ai_gateway" | "guided_fallback" | null;
  suggestions: string[];
};

const modes: Array<{ id: MentorMode; label: string; description: string }> = [
  { id: "simple", label: "Энгийн", description: "Товч, ойлгомжтой үгээр" },
  { id: "step_by_step", label: "Алхам алхмаар", description: "Нэг нэгээр нь дагуулна" },
  { id: "fast", label: "Хурдан", description: "Шууд гол хариулт" },
];

const guidedActions = [
  {
    id: "today",
    symbol: "01",
    title: "Өнөөдрийн дараагийн алхам",
    description: "Одоо хийх хамгийн жижиг, хэрэгтэй ажлыг сонгоё.",
    prompt: "Миний профайл болон төлөвлөгөөнд тулгуурлаад өнөөдөр хийх нэг дараагийн алхмыг санал болго. Яагаад гэдгийг товч тайлбарла.",
  },
  {
    id: "lesson",
    symbol: "02",
    title: "Хичээл тайлбарлуулах",
    description: "Ойлгоогүй хэсгийг энгийн жишээгээр задлуулна.",
    prompt: "Миний одоогийн Academy хичээлийн гол санааг энгийн үгээр, нэг бодит жишээтэй тайлбарла.",
  },
  {
    id: "conversation_practice",
    symbol: "03",
    title: "Ярианы дасгал",
    description: "Дарамтгүй, зөв сонсох яриаг хамт давтана.",
    prompt: "Надтай дарамтгүй discovery ярианы богино role-play эхлүүл. Нэг удаад нэг асуулт асуугаад миний хариултыг хүлээ.",
  },
  {
    id: "content_idea",
    symbol: "04",
    title: "Контентын санаа",
    description: "Эх сурвалж шаарддаг, аюулгүй нооргийн чиглэл авна.",
    prompt: "Надад нэг аюулгүй контентын санаа өг. Ямар албан эх сурвалж шалгах, ямар claim-ээс зайлсхийхийг хамт хэл. Автоматаар нийтэлж болохгүй.",
  },
  {
    id: "weekly_reflection",
    symbol: "05",
    title: "7 хоногийн эргэцүүлэл",
    description: "Ахиц, саад, дараагийн төвлөрлөө цэгцэлнэ.",
    prompt: "Энэ долоо хоногийн ахиц, саад, дараагийн нэг төвлөрлөө дүгнэхэд туслах 3 богино асуулт асуу.",
  },
] as const;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function firstString(record: UnknownRecord | null, keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function safeConversationId(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 120 || !/^[a-zA-Z0-9_-]+$/.test(value)) return null;
  return value;
}

function normalizeMessages(value: unknown): MentorMessage[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item, index) => {
    const record = asRecord(item);
    const roleValue = firstString(record, ["role", "author", "type"]);
    const content = firstString(record, ["content", "text", "message", "reply"]);
    if (!content || !roleValue) return [];
    const role: MessageRole = roleValue === "user" || roleValue === "human" ? "user" : "assistant";
    const rawSource = firstString(record, ["source"]);
    const source = rawSource === "guided_fallback" || rawSource === "ai_gateway" ? rawSource : null;
    return [{ id: firstString(record, ["id", "messageId", "message_id"]) ?? `loaded-${index}`, role, content, source }];
  });
}

function normalizeAssistantPayload(payload: unknown): AssistantResult {
  const envelope = asRecord(payload) ?? {};
  const data = asRecord(envelope.data) ?? envelope;
  const conversation = asRecord(data.conversation);
  const messages = normalizeMessages(data.messages ?? conversation?.messages);
  const messageObject = asRecord(data.message);
  const reply =
    firstString(data, ["reply", "answer", "response"]) ??
    firstString(messageObject, ["content", "text", "reply"]) ??
    [...messages].reverse().find((message) => message.role === "assistant")?.content ??
    null;
  const rawSuggestions = Array.isArray(data.suggestions) ? data.suggestions : [];

  return {
    conversationId: safeConversationId(data.conversationId ?? data.conversation_id ?? conversation?.id),
    messages,
    reply,
    source: data.source === "guided_fallback" || data.source === "ai_gateway" ? data.source : null,
    suggestions: rawSuggestions.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : [])).slice(0, 4),
  };
}

async function readError(response: Response, fallback: string): Promise<string> {
  const payload = (await response.json().catch(() => null)) as unknown;
  const record = asRecord(payload);
  return firstString(record, ["error", "message"]) ?? fallback;
}

export function AssistantClient({
  initialConversationId,
  userName,
}: {
  initialConversationId: string | null;
  userName: string;
}) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<MentorMode>("simple");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<MentorMessage[]>([]);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(Boolean(initialConversationId));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyAttempt, setHistoryAttempt] = useState(0);

  useEffect(() => {
    if (!initialConversationId) return;

    const controller = new AbortController();

    fetch(`/api/assistant?conversation=${encodeURIComponent(initialConversationId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response, "Энэ харилцан яриаг нээж чадсангүй."));
        return normalizeAssistantPayload((await response.json()) as unknown);
      })
      .then((result) => {
        setMessages(result.messages);
        setConversationId(result.conversationId ?? initialConversationId);
        setSuggestions(result.suggestions);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "Энэ харилцан яриаг нээж чадсангүй.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingHistory(false);
      });

    return () => controller.abort();
  }, [historyAttempt, initialConversationId]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, submitting]);

  const sendPrompt = useCallback(
    async (prompt: string, action = "custom") => {
      const message = prompt.trim();
      if (!message || submitting) return;

      const optimisticMessage: MentorMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: message,
      };
      setMessages((current) => [...current, optimisticMessage]);
      setDraft("");
      setSuggestions([]);
      setError(null);
      setSubmitting(true);

      try {
        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message,
            mode,
            action,
            conversationId,
          }),
        });

        if (!response.ok) throw new Error(await readError(response, "Ментор одоогоор хариулж чадсангүй."));
        const result = normalizeAssistantPayload((await response.json()) as unknown);
        const nextConversationId = result.conversationId ?? conversationId;

        if (result.messages.length) {
          setMessages(result.messages);
        } else if (result.reply) {
          const reply = result.reply;
          setMessages((current) => [
            ...current,
            { id: `assistant-${Date.now()}`, role: "assistant", content: reply, source: result.source },
          ]);
        } else {
          throw new Error("Менторын хариулт хоосон ирлээ. Дахин оролдоно уу.");
        }

        setSuggestions(result.suggestions);
        if (nextConversationId && nextConversationId !== conversationId) {
          setConversationId(nextConversationId);
          router.replace(`/assistant?conversation=${encodeURIComponent(nextConversationId)}`, { scroll: false });
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Ментор одоогоор хариулж чадсангүй.");
        setDraft(message);
      } finally {
        setSubmitting(false);
      }
    },
    [conversationId, mode, router, submitting],
  );

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendPrompt(draft);
  }

  function startNewConversation() {
    setMessages([]);
    setConversationId(null);
    setSuggestions([]);
    setDraft("");
    setError(null);
    router.replace("/assistant", { scroll: false });
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  if (loadingHistory) {
    return (
      <section className={styles.stateCard} role="status" aria-live="polite" aria-busy="true">
        <span className={styles.loader} aria-hidden="true" />
        <h2>Харилцан яриаг нээж байна</h2>
        <p>Таны өмнөх алхмуудыг аюулгүй холбож байна.</p>
      </section>
    );
  }

  if (error && initialConversationId && messages.length === 0) {
    return (
      <section className={`${styles.stateCard} ${styles.errorState}`} role="alert">
        <span className={styles.stateIcon} aria-hidden="true">!</span>
        <h2>Харилцан яриа нээгдсэнгүй</h2>
        <p>{error}</p>
        <div className={styles.stateActions}>
          <button type="button" onClick={() => { setLoadingHistory(true); setError(null); setHistoryAttempt((value) => value + 1); }}>Дахин оролдох</button>
          <button type="button" className={styles.secondaryStateAction} onClick={startNewConversation}>Шинээр эхлэх</button>
        </div>
      </section>
    );
  }

  return (
    <div className={styles.assistantLayout}>
      <aside className={styles.guidePanel} aria-labelledby="guided-actions-title">
        <div className={styles.panelHeading}>
          <div>
            <p>GUIDED ACTIONS</p>
            <h2 id="guided-actions-title">Юунаас эхлэх вэ?</h2>
          </div>
          {conversationId ? <button type="button" onClick={startNewConversation}>Шинэ</button> : null}
        </div>
        <div className={styles.actionGrid}>
          {guidedActions.map((action) => (
            <button
              type="button"
              key={action.id}
              onClick={() => void sendPrompt(action.prompt, action.id)}
              disabled={submitting}
            >
              <span aria-hidden="true">{action.symbol}</span>
              <strong>{action.title}</strong>
              <small>{action.description}</small>
            </button>
          ))}
        </div>
        <div className={styles.safetyNote}>
          <strong>Таны хяналт хэвээр</strong>
          <p>Ментор санаа, дасгал, тайлбар өгнө. Контент автоматаар нийтлэхгүй, хүн заавал шалгана.</p>
        </div>
      </aside>

      <section className={styles.conversationPanel} aria-labelledby="conversation-title">
        <div className={styles.conversationHeader}>
          <div>
            <p>DIGITAL MENTOR</p>
            <h2 id="conversation-title">{conversationId ? "Үргэлжилж буй яриа" : `Сайн байна уу, ${userName}`}</h2>
          </div>
          <span className={styles.onlineState}><i aria-hidden="true" /> Чиглүүлэхэд бэлэн</span>
        </div>

        <fieldset className={styles.modePicker}>
          <legend>Хариултын хэлбэр</legend>
          <div>
            {modes.map((item) => (
              <label key={item.id}>
                <input
                  type="radio"
                  name="mentor-mode"
                  value={item.id}
                  checked={mode === item.id}
                  onChange={() => setMode(item.id)}
                />
                <span><strong>{item.label}</strong><small>{item.description}</small></span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className={styles.messages} aria-live="polite" aria-busy={submitting}>
          {messages.length === 0 ? (
            <div className={styles.emptyConversation}>
              <span aria-hidden="true">✦</span>
              <h3>Нэг жижиг асуултаас эхэлье</h3>
              <p>Зүүн талын бэлэн үйлдлээс сонгох эсвэл доор өөрийн асуултаа бичнэ үү.</p>
            </div>
          ) : (
            messages.map((message) => (
              <article className={message.role === "user" ? styles.userMessage : styles.assistantMessage} key={message.id}>
                <strong>{message.role === "user" ? "Та" : "Ментор"}</strong>
                <p>{message.content}</p>
                {message.role === "assistant" && message.source === "guided_fallback" ? (
                  <small className={styles.fallbackLabel}>AI үйлчилгээ түр хүрээгүй тул аюулгүй бэлэн чиглүүлэг үзүүлэв.</small>
                ) : null}
              </article>
            ))
          )}
          {submitting ? (
            <div className={styles.thinking} role="status">
              <span aria-hidden="true"><i /><i /><i /></span>
              Ментор бодож байна
            </div>
          ) : null}
          <div ref={messageEndRef} aria-hidden="true" />
        </div>

        {suggestions.length ? (
          <div className={styles.suggestions} aria-label="Үргэлжлүүлэх санал">
            {suggestions.map((suggestion) => (
              <button type="button" key={suggestion} onClick={() => void sendPrompt(suggestion, "custom")} disabled={submitting}>
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}

        {error ? <div className={styles.inlineError} role="alert">{error}</div> : null}

        <form className={styles.composer} onSubmit={submitMessage}>
          <label htmlFor="mentor-message">Менторт хэлэх зүйл</label>
          <textarea
            ref={textareaRef}
            id="mentor-message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Жишээ: Өнөөдөр 20 минутын дотор юунаас эхлэх вэ?"
            rows={4}
            maxLength={2000}
            disabled={submitting}
          />
          <div>
            <small>{draft.length}/2000</small>
            <button type="submit" disabled={submitting || !draft.trim()}>
              {submitting ? "Хүлээж байна…" : "Асуух →"}
            </button>
          </div>
        </form>

        <div className={styles.privacyNotice}>
          <span aria-hidden="true">⌁</span>
          <p><strong>Санах ой ба нууцлал:</strong> conversation ID байвал энэ яриаг дараа үргэлжлүүлж болно. Нууц үг, карт, паспорт, эрүүл мэндийн нууц мэдээлэл бүү оруул. Хариултыг хэрэглэхээс өмнө та өөрөө шалгана. <Link href="/privacy">Санах ойн сонголт</Link></p>
        </div>
      </section>
    </div>
  );
}
