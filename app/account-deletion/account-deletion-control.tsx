"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./account-deletion.module.css";

type DeletionStatus = "requested" | "processing" | "cancelled" | "completed";

type DeletionRequest = {
  status: DeletionStatus;
  requestedAt: string;
  cancelledAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};

type Envelope = {
  request?: unknown;
  error?: unknown;
};

function parseRequest(value: unknown): DeletionRequest | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const status = row.status;
  if (status !== "requested" && status !== "processing" && status !== "cancelled" && status !== "completed") {
    return null;
  }
  return {
    status,
    requestedAt: typeof row.requestedAt === "string" ? row.requestedAt : "",
    cancelledAt: typeof row.cancelledAt === "string" ? row.cancelledAt : null,
    completedAt: typeof row.completedAt === "string" ? row.completedAt : null,
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
  };
}

function dateLabel(value: string) {
  if (!value) return "огноо тодорхойгүй";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "огноо тодорхойгүй";
  return new Intl.DateTimeFormat("mn-MN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function messageFrom(body: Envelope | null, fallback: string) {
  return typeof body?.error === "string" ? body.error : fallback;
}

export function AccountDeletionControl({ supportEmail }: { supportEmail: string | null }) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [request, setRequest] = useState<DeletionRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/account-deletion", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as Envelope | null;
        if (response.status === 401) {
          setAuthenticated(false);
          return;
        }
        if (!response.ok) throw new Error(messageFrom(body, "Хүсэлтийн төлөвийг уншиж чадсангүй."));
        setAuthenticated(true);
        setRequest(parseRequest(body?.request));
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "Хүсэлтийн төлөвийг уншиж чадсангүй.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function perform(action: "request" | "cancel") {
    setSubmitting(true);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch("/api/account-deletion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await response.json().catch(() => null)) as Envelope | null;
      if (!response.ok) throw new Error(messageFrom(body, "Үйлдлийг дуусгаж чадсангүй."));
      setRequest(parseRequest(body?.request));
      setConfirming(false);
      setNotice(
        action === "request"
          ? "Account устгах хүсэлт бүртгэгдлээ. Одоогоор өгөгдөл автоматаар устгагдаагүй."
          : "Account устгах хүсэлт цуцлагдлаа.",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Үйлдлийг дуусгаж чадсангүй.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className={styles.controlState} role="status">Account-ын төлөвийг шалгаж байна…</div>;
  }

  if (authenticated === false) {
    return (
      <div className={styles.signedOut}>
        <h2>Account-даа нэвтэрч хүсэлтээ илгээнэ</h2>
        <p>Өөрийн account-ын имэйл, нууц үгээр web хувилбарт нэвтэрсний дараа энэ хуудас руу буцаж хүсэлтээ баталгаажуулна.</p>
        <div className={styles.actions}>
          <Link className={styles.primary} href="/login?next=/account-deletion">Нэвтэрч үргэлжлүүлэх</Link>
          {supportEmail && (
            <a className={styles.secondary} href={`mailto:${supportEmail}?subject=${encodeURIComponent("inSuccess account deletion request")}`}>
              Тусламжаар хүсэлт гаргах
            </a>
          )}
        </div>
      </div>
    );
  }

  const active = request?.status === "requested" || request?.status === "processing";

  return (
    <div className={styles.control}>
      <div className={styles.statusLine}>
        <span className={active ? styles.activeDot : styles.idleDot} aria-hidden="true" />
        <div>
          <strong>
            {!request && "Идэвхтэй хүсэлт байхгүй"}
            {request?.status === "requested" && "Хүсэлт бүртгэгдсэн"}
            {request?.status === "processing" && "Хүсэлтийг боловсруулж байна"}
            {request?.status === "cancelled" && "Өмнөх хүсэлт цуцлагдсан"}
            {request?.status === "completed" && "Хүсэлт дууссан"}
          </strong>
          {request?.requestedAt && <small>Анх хүсэлт гаргасан: {dateLabel(request.requestedAt)}</small>}
        </div>
      </div>

      {request?.status === "requested" && (
        <>
          <p>Энэ нь дараалалд бүртгэгдсэн хүсэлт. Бодит account болон өгөгдөл хараахан устгагдаагүй.</p>
          <button className={styles.secondaryButton} type="button" disabled={submitting} onClick={() => void perform("cancel")}>
            {submitting ? "Цуцалж байна…" : "Устгах хүсэлтээ цуцлах"}
          </button>
        </>
      )}

      {request?.status === "processing" && (
        <p>Оператор хүсэлтийг боловсруулж эхэлсэн тул app-аас цуцлах боломжгүй. Өөрчлөх шаардлагатай бол тусламжийн хаягтай холбоо барина уу.</p>
      )}

      {request?.status === "completed" && (
        <p>Системийн хүсэлтийн бүртгэл дууссан төлөвтэй байна. Үлдэх ёстой хууль ёсны эсвэл аудитын өгөгдлийн талаар тусламжийн хаягаас лавлана уу.</p>
      )}

      {(!request || request.status === "cancelled") && !confirming && (
        <button className={styles.danger} type="button" onClick={() => setConfirming(true)}>
          Account устгах хүсэлт эхлүүлэх
        </button>
      )}

      {(!request || request.status === "cancelled") && confirming && (
        <div className={styles.confirm} role="group" aria-labelledby="deletion-confirm-title">
          <h3 id="deletion-confirm-title">Хүсэлтээ баталгаажуулах уу?</h3>
          <p>Энэ товч account-ыг шууд устгахгүй. Хүсэлтийг аюулгүй дараалалд бүртгэж, операторын шалгалтад шилжүүлнэ.</p>
          <div className={styles.actions}>
            <button className={styles.danger} type="button" disabled={submitting} onClick={() => void perform("request")}>
              {submitting ? "Бүртгэж байна…" : "Тийм, хүсэлт бүртгэх"}
            </button>
            <button className={styles.secondaryButton} type="button" disabled={submitting} onClick={() => setConfirming(false)}>
              Болих
            </button>
          </div>
        </div>
      )}

      {notice && <p className={styles.success} role="status">{notice}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {supportEmail && <p className={styles.support}>Тусламж: <a href={`mailto:${supportEmail}`}>{supportEmail}</a></p>}
    </div>
  );
}
