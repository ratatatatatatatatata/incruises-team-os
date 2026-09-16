"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Invitation = {
  id: string;
  email: string;
  display_name: string;
  role: "user" | "builder" | "coach" | "director";
  status: "pending" | "sent" | "provisioned" | "accepted" | "failed";
  invited_at: string;
  expires_at: string;
  accepted_at: string | null;
};

const statusText: Record<Invitation["status"], string> = {
  pending: "Бэлтгэж байна",
  sent: "Илгээсэн",
  provisioned: "Эрх үүссэн",
  accepted: "Onboarding дууссан",
  failed: "Илгээгүй",
};

export function AdminInvitations() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [form, setForm] = useState({ displayName: "", email: "", role: "user" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const result = await fetch("/api/admin/invitations", { cache: "no-store" });
    const body = (await result.json().catch(() => ({}))) as { invitations?: Invitation[]; error?: string };
    if (!result.ok) throw new Error(body.error ?? "Урилгыг уншиж чадсангүй.");
    setInvitations(body.invitations ?? []);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/invitations", { cache: "no-store" })
      .then(async (result) => {
        const body = (await result.json().catch(() => ({}))) as { invitations?: Invitation[]; error?: string };
        if (!result.ok) throw new Error(body.error ?? "Урилгыг уншиж чадсангүй.");
        if (active) setInvitations(body.invitations ?? []);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Урилгыг уншиж чадсангүй.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const result = await fetch("/api/admin/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = (await result.json().catch(() => ({}))) as { error?: string };
      if (!result.ok) throw new Error(body.error ?? "Урилгыг илгээж чадсангүй.");
      setForm({ displayName: "", email: "", role: "user" });
      setMessage("Урилга илгээгдлээ. Хүлээн авагч имэйл дэх холбоосоор нэвтэрнэ.");
      await load();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Урилгыг илгээж чадсангүй.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <article className="panel invitation-panel">
        <div className="panel-heading">
          <div><p className="eyebrow blue">INVITE-ONLY ACCESS</p><h3>Имэйлээр хэрэглэгч урих</h3></div>
          <span className="tag">7 хоног хүчинтэй</span>
        </div>
        <p>Зөвхөн эндээс урьсан имэйлд membership үүснэ. Хэрэглэгч өөрөө бүртгүүлэх боломжгүй.</p>
        <form className="invitation-form" onSubmit={submit}>
          <label>Нэр<input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} maxLength={80} required /></label>
          <label>Имэйл<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} maxLength={320} required /></label>
          <label>Эхний эрх<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="user">Хэрэглэгч</option><option value="builder">Builder</option><option value="coach">Coach</option><option value="director">Director</option></select></label>
          <button className="primary-button" type="submit" disabled={saving}>{saving ? "Илгээж байна..." : "Урилга илгээх"}</button>
        </form>
        {message && <p className="auth-message success" role="status">{message}</p>}
        {error && <p className="auth-message error" role="alert">{error}</p>}
      </article>

      <article className="panel invitation-list">
        <div className="panel-heading"><div><p className="eyebrow blue">INVITATION STATUS</p><h3>Сүүлийн урилгууд</h3></div><span className="count-badge">{invitations.length}</span></div>
        {loading ? <p>Уншиж байна...</p> : invitations.length === 0 ? <p>Одоогоор урилга алга.</p> : invitations.map((invitation) => (
          <div className="invitation-row" key={invitation.id}>
            <div><strong>{invitation.display_name}</strong><span>{invitation.email}</span><small>{new Date(invitation.invited_at).toLocaleString("mn-MN")}</small></div>
            <div><span className={`status status-${invitation.status}`}>{statusText[invitation.status]}</span><small>{invitation.role}</small></div>
          </div>
        ))}
      </article>
    </>
  );
}
