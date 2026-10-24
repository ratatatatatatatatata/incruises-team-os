"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { WebWorkerMLCEngine } from "@mlc-ai/web-llm";
import { LOCAL_MODEL_ID, LOCAL_MODEL_LABEL } from "@/lib/life/local-ai";
import type { LifeState } from "@/lib/life/domain";
import { coachReply, initialCoachMemory, localDecisionMessages, localDecisionSchema, parseLocalDecision } from "@/lib/life/coach";

type Message = { role: "user" | "assistant"; content: string; source?: string; followUps?: string[] };
export function LifeAssistant({
  state,
  day,
}: {
  state: LifeState;
  day: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [memory, setMemory] = useState(initialCoachMemory);
  const messageEnd = useRef<HTMLDivElement | null>(null);
  const pending = useRef(false);
  const engine = useRef<WebWorkerMLCEngine | null>(null);
  const worker = useRef<Worker | null>(null);
  const alive = useRef(true);
  const operation = useRef(0);
  useEffect(() => { messageEnd.current?.scrollIntoView({ block: "nearest" }); }, [messages, busy]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      worker.current?.terminate();
    };
  }, []);

  async function enableAI() {
    if (pending.current) return;
    if (!("gpu" in navigator)) {
      setStatus(
        "Энэ хөтөч төхөөрөмжийн AI-г дэмжихгүй байна. Доорх чиглүүлэгчийг шууд ашиглаж болно.",
      );
      return;
    }
    setBusy(true);
    pending.current = true;
    const currentOperation = ++operation.current;
    setStatus("AI загварыг татаж байна. Эхний удаа хэдэн минут шаардаж болно.");
    try {
      const { CreateWebWorkerMLCEngine } = await import("@mlc-ai/web-llm");
      const modelWorker = new Worker(
        /* webpackChunkName: "life-ai-worker" */ new URL(
          "../../lib/life/ai-worker.ts",
          import.meta.url,
        ),
        { type: "module", name: "life-ai-worker" },
      );
      worker.current = modelWorker;
      const loadedEngine = await CreateWebWorkerMLCEngine(
        modelWorker,
        LOCAL_MODEL_ID,
        {
          initProgressCallback: (report) => {
            if (alive.current && currentOperation === operation.current)
              setStatus(
                `AI бэлдэж байна: ${Math.round(report.progress * 100)}%`,
              );
          },
        },
      );
      if (alive.current && currentOperation === operation.current) {
        engine.current = loadedEngine;
        setReady(true);
        setStatus(
          "Төхөөрөмжийн AI бэлэн. Асуултын утга, холбогдох ажлыг сонгоход ашиглана; зөвлөгөөг Монгол хэлний бэлдсэн бүтэцтэй харуулна.",
        );
      } else modelWorker.terminate();
    } catch (error) {
      console.warn(
        "Local AI initialization failed",
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error.slice(0, 600)
            : "unknown",
      );
      if (currentOperation === operation.current) {
        worker.current?.terminate();
        engine.current = null;
        if (alive.current)
          setStatus(
            "AI-г ачаалж чадсангүй. Хөтөч, санах ой эсвэл сүлжээ дэмжихгүй байж болно. Чиглүүлэгч хэвийн ажиллана.",
          );
      }
    } finally {
      if (alive.current && currentOperation === operation.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  function stop() {
    operation.current += 1;
    worker.current?.terminate();
    engine.current = null;
    setReady(false);
    setBusy(false);
    pending.current = false;
    setStatus("Төхөөрөмжийн AI зогссон. Чиглүүлэгчийг үргэлжлүүлж болно.");
  }
  async function ask(event: FormEvent) {
    event.preventDefault();
    await send(input);
  }
  async function send(value: string) {
    const question = value.trim().slice(0, 1200);
    if (!question || pending.current) return;
    pending.current = true;
    const currentOperation = ++operation.current;
    const next: Message[] = [
      ...messages.slice(-18),
      { role: "user", content: question },
    ];
    setMessages(next);
    setInput("");
    setBusy(true);
    let answer = coachReply(question, state, day, memory);
    let source = "Төлөвлөгөөнд тулгуурласан чиглүүлэгч · AI загвар ашиглаагүй";
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (ready && engine.current && answer.needsInterpretation) {
      try {
        setStatus("Асуултыг төлөвлөгөөтэй тань холбож байна…");
        const inference = engine.current.chat.completions.create({
          messages: localDecisionMessages(question, state, day, memory, messages.filter(m => m.role === "user").map(m => m.content)),
          response_format: { type: "json_object", schema: JSON.stringify(localDecisionSchema(state, day, memory)) },
          max_tokens: 140,
          temperature: 0,
          seed: 17,
          extra_body: { enable_thinking: false },
        });
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => { if (currentOperation === operation.current) { worker.current?.terminate(); engine.current = null; if (alive.current) setReady(false); } reject(new Error("Local inference timeout")); }, 30000);
        });
        const reply = await Promise.race([inference, timeout]);
        const decision = parseLocalDecision(reply.choices[0]?.message.content ?? "", reply.choices[0]?.finish_reason, state, day, memory);
        if (!decision) throw new Error("Invalid local decision");
        answer = coachReply(question, state, day, memory, decision);
        source = `Төхөөрөмжийн AI · ${LOCAL_MODEL_LABEL} · Монгол тайлбартай чиглүүлэг`;
      } catch {
        source = "AI сонголт баталгаажаагүй тул төлөвлөгөөнд тулгуурласан чиглүүлэгч хариулав";
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    if (alive.current && currentOperation === operation.current) {
      setMessages([...next, { role: "assistant", content: answer.content, followUps: answer.followUps, source }]);
      setMemory(answer.memory);
      pending.current = false;
      setBusy(false);
      setStatus(ready && engine.current ? "Төхөөрөмжийн AI асаалттай. Яриа төхөөрөмж дээр боловсруулагдана." : "Чиглүүлэгч бэлэн. Төлбөртэй AI үйлчилгээ ашиглаагүй.");
    }
  }
  return (
    <section
      className="life-panel life-assistant"
      aria-labelledby="assistant-title"
    >
      <span className="life-kicker">ТАНЫ ХАЖУУД</span>
      <h2 id="assistant-title">Хамт цэгцэлье.</h2>
      <p>
        Энэ хуудсанд байгаа зорилго, ажил, дадал, дүгнэлтэд тань тулгуурлан
        дараагийн алхмыг хамт тодорхойлно. Яриа хуудсыг дахин ачаалахад арилна.
        Зөвлөгөө нь төлөвлөгөөг өөрөө хадгалахгүй.
      </p>
      <div className="life-chips">
        {[
          "Одоо юу хийх вэ?",
          "Гацсан ажлаа жижиг болгоё",
          "Manifest яаж хийх вэ?",
          "Миний style image",
          "7 хоногоо дүгнэе",
        ].map((q) => (
          <button
            type="button"
            key={q}
            onClick={() => void send(q)}
            disabled={busy}
          >
            {q}
          </button>
        ))}
      </div>
      <div
        className="life-messages"
        role="log"
        aria-label="Туслахтай ярилцсан нь"
        aria-live="polite"
        aria-busy={busy}
      >
        {messages.length === 0 && (
          <p className="life-hint">
            Жишээ: «Маргаашийн ажлаа байнга хойшлуулаад байна. Юунаас эхлэх вэ?»
          </p>
        )}
        {messages.map((m, i) => (
          <article className={`life-message ${m.role}`} key={i}>
            <small>{m.role === "user" ? "Та" : m.source}</small>
            <p>{m.content}</p>
            {i === messages.length - 1 && m.followUps && <div className="life-chips" aria-label="Үргэлжлүүлэн асуух">
              {m.followUps.map(q => <button type="button" key={q} disabled={busy} onClick={() => void send(q)}>{q}</button>)}
            </div>}
          </article>
        ))}
        <div ref={messageEnd} />
      </div>
      <form onSubmit={ask} className="life-chat-form">
        <label htmlFor="life-question">Юун дээр туслах вэ?</label>
        <textarea
          id="life-question"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={1200}
          rows={2}
          placeholder="Жишээ: Танилцуулгаа бичиж эхлэхэд хэцүү байна. Надад 5 минут бий."
        />
        <div className="life-actions">
          <button className="life-primary" disabled={busy || !input.trim()}>
            {busy ? "Бэлдэж байна…" : "Тусламж авах →"}
          </button>
          {busy && (
            <button type="button" className="life-secondary" onClick={stop}>
              Зогсоох
            </button>
          )}
        </div>
      </form>
      <details className="life-local-ai">
        <summary>API төлбөргүй төхөөрөмжийн AI (туршилт)</summary>
        <p>
          {LOCAL_MODEL_LABEL} загвар таны төхөөрөмж дээр ажиллана. Эхний удаа их
          хэмжээний файл татна; дата, санах ой, батарей хэрэглэнэ. Ойролцоогоор
          3.4 GB GPU санах ой шаардлагатай. WebGPU дэмждэг хөтөч хэрэгтэй.
          AI нь асуултын утга, холбогдох ажлыг сонгоно; зөвлөгөө нь Монгол хэлний
          бэлдсэн бүтэцтэй тул чөлөөт сэдвээр ярилцах боломж хязгаартай. Загварын файл татахдаа
          Hugging Face, GitHub руу холбогдоно; энэ туслах яриагаа тийш
          илгээхгүй.
        </p>
        <p>
          AI үйлчилгээний түлхүүр болон төлбөрийн карт шаардлагагүй. Сайтын
          хостинг, хадгалалтын зардлыг энэ нь арилгахгүй.
        </p>
        <button
          className="life-secondary"
          type="button"
          disabled={busy || ready}
          onClick={enableAI}
        >
          {ready ? "Төхөөрөмжийн AI асаалттай" : "Загвар татаж AI асаах"}
        </button>
        {ready && (
          <button className="life-secondary" type="button" onClick={stop}>
            AI-г зогсоох
          </button>
        )}
        <p role="status">{status}</p>
      </details>
    </section>
  );
}
