"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./queue.module.css";

type QueueRow = {
  userId: string;
  status: "requested" | "processing" | "cancelled" | "completed";
  requestedAt: string;
  cancelledAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};

type QueueData = {
  requests: QueueRow[];
  pagination: { page: number; perPage: number; total: number; lastPage: number };
};

const statusLabels: Record<QueueRow["status"], string> = {
  requested: "Шинэ хүсэлт",
  processing: "Боловсруулж байна",
  cancelled: "Цуцлагдсан",
  completed: "Дууссан гэж тэмдэглэсэн",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("mn-MN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function AccountDeletionQueue() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<QueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (targetPage: number, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/account-deletion?page=${targetPage}&perPage=50`, {
        cache: "no-store",
        credentials: "same-origin",
        signal,
      });
      const body = (await response.json().catch(() => null)) as (QueueData & { error?: string }) | null;
      if (!response.ok) throw new Error(body?.error || "Queue-г ачаалж чадсангүй.");
      if (!body) throw new Error("Queue-ийн response хоосон байна.");
      setData(body);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "Queue-г ачаалж чадсангүй.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(page, controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load, page]);

  return (
    <section className={styles.queue} aria-busy={loading}>
      <div className={styles.queueHeading}>
        <div><p>REQUEST REGISTER</p><h2>Бүртгэгдсэн хүсэлтүүд</h2></div>
        <div><span>{loading ? "Ачаалж байна…" : `${data?.pagination.total ?? 0} хүсэлт`}</span><button type="button" disabled={loading} onClick={() => void load(page)}>Дахин ачаалах</button></div>
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {!loading && !error && data?.requests.length === 0 && <p className={styles.empty}>Account deletion хүсэлт бүртгэгдээгүй байна.</p>}

      <div className={styles.rows}>
        {data?.requests.map((request) => (
          <article className={styles.row} key={request.userId}>
            <div><span className={styles[request.status]}>{statusLabels[request.status]}</span><strong title={request.userId}>{request.userId}</strong></div>
            <dl>
              <div><dt>Хүсэлт</dt><dd>{formatDate(request.requestedAt)}</dd></div>
              <div><dt>Шинэчлэгдсэн</dt><dd>{formatDate(request.updatedAt)}</dd></div>
            </dl>
          </article>
        ))}
      </div>

      {data && data.pagination.lastPage > 1 && (
        <nav className={styles.pagination} aria-label="Account deletion queue pages">
          <button type="button" disabled={loading || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Өмнөх</button>
          <span>{page} / {data.pagination.lastPage}</span>
          <button type="button" disabled={loading || page >= data.pagination.lastPage} onClick={() => setPage((value) => value + 1)}>Дараах</button>
        </nav>
      )}
    </section>
  );
}
