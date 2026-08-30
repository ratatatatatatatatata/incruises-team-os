"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import styles from "./admin.module.css";

type TeamRole = "builder" | "coach" | "director" | "admin";
type MembershipStatus = "active" | "disabled";

type AdminUser = {
  id: string;
  email: string | null;
  invitedAt: string | null;
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
  createdAt: string;
  membership: {
    role: TeamRole;
    status: MembershipStatus;
    createdAt: string;
    updatedAt: string;
  } | null;
};

type AdminPageData = {
  actorId: string;
  users: AdminUser[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    lastPage: number;
    nextPage: number | null;
  };
};

type ApiError = { error?: string; code?: string };

class AdminActionError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

const roleLabels: Record<TeamRole, string> = {
  builder: "Builder",
  coach: "Coach",
  director: "Director",
  admin: "Admin",
};

const statusLabels: Record<MembershipStatus, string> = {
  active: "Идэвхтэй",
  disabled: "Хаалттай",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

async function readError(response: Response): Promise<AdminActionError> {
  const body = (await response.json().catch(() => ({}))) as ApiError;
  return new AdminActionError(body.error || "Үйлдлийг гүйцэтгэж чадсангүй.", body.code);
}

async function postAdminAction(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/members", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

function MemberRow({
  user,
  isSelf,
  globalLoading,
  onChanged,
}: {
  user: AdminUser;
  isSelf: boolean;
  globalLoading: boolean;
  onChanged: (message: string) => Promise<void>;
}) {
  const [role, setRole] = useState<TeamRole>(user.membership?.role ?? "builder");
  const [status, setStatus] = useState<MembershipStatus>(user.membership?.status ?? "disabled");
  const membershipVersion = `${user.membership?.role ?? "none"}:${user.membership?.status ?? "none"}`;
  const [serverMembershipVersion, setServerMembershipVersion] = useState(membershipVersion);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailLabel = user.email ?? "Имэйлгүй auth user";
  const controlsDisabled = saving || globalLoading;

  if (serverMembershipVersion !== membershipVersion) {
    setServerMembershipVersion(membershipVersion);
    setRole(user.membership?.role ?? "builder");
    setStatus(user.membership?.status ?? "disabled");
  }

  async function registerMembership() {
    setSaving(true);
    setError(null);
    try {
      await postAdminAction({ action: "register_membership", userId: user.id });
      await onChanged(`${emailLabel}: disabled builder membership үүслээ.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Membership үүсгэж чадсангүй.");
    } finally {
      setSaving(false);
    }
  }

  async function saveMembership() {
    if (!user.membership) return;

    const removesAdmin = user.membership.role === "admin" && role !== "admin";
    const disablesAccess = user.membership.status === "active" && status === "disabled";
    if (
      (removesAdmin || disablesAccess) &&
      !window.confirm(`${emailLabel} хэрэглэгчийн одоогийн эрхийг өөрчлөхөө баталгаажуулна уу.`)
    ) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await postAdminAction({ action: "update_membership", userId: user.id, role, status });
      await onChanged(`${emailLabel}: ${roleLabels[role]}, ${statusLabels[status]} болж шинэчлэгдлээ.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Membership шинэчилж чадсангүй.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className={styles.memberCard} aria-labelledby={`member-${user.id}`}>
      <div className={styles.memberIdentity}>
        <div className={styles.avatar} aria-hidden="true">
          {(user.email?.[0] ?? "?").toUpperCase()}
        </div>
        <div>
          <h3 id={`member-${user.id}`}>{emailLabel}</h3>
          <p title={user.id}>{user.id}</p>
          <div className={styles.authMeta}>
            <span className={user.emailConfirmedAt ? styles.confirmed : styles.pending}>
              {user.emailConfirmedAt ? "Имэйл баталгаажсан" : "Урилга хүлээгдэж байна"}
            </span>
            {isSelf ? <span className={styles.selfBadge}>Та</span> : null}
          </div>
        </div>
      </div>

      <dl className={styles.dateList}>
        <div>
          <dt>Үүссэн</dt>
          <dd>{formatDate(user.createdAt)}</dd>
        </div>
        <div>
          <dt>Сүүлд нэвтэрсэн</dt>
          <dd>{formatDate(user.lastSignInAt)}</dd>
        </div>
      </dl>

      {user.membership ? (
        <div className={styles.memberControls}>
          <label>
            Role
            <select aria-label={`${emailLabel}: Role`} value={role} onChange={(event) => setRole(event.target.value as TeamRole)} disabled={controlsDisabled || isSelf}>
              {(Object.keys(roleLabels) as TeamRole[]).map((value) => (
                <option key={value} value={value}>
                  {roleLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Access
            <select
              value={status}
              aria-label={`${emailLabel}: Access`}
              onChange={(event) => setStatus(event.target.value as MembershipStatus)}
              disabled={controlsDisabled || isSelf}
            >
              {(Object.keys(statusLabels) as MembershipStatus[]).map((value) => (
                <option key={value} value={value}>
                  {statusLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={saveMembership}
            aria-label={`${emailLabel}: role болон access өөрчлөлт хадгалах`}
            disabled={
              controlsDisabled ||
              isSelf ||
              (role === user.membership.role && status === user.membership.status)
            }
          >
            {saving ? "Хадгалж байна…" : "Өөрчлөлт хадгалах"}
          </button>
          {isSelf ? <p className={styles.controlHint}>Өөрийн admin access-ийг энэ console-оос өөрчлөхгүй.</p> : null}
        </div>
      ) : (
        <div className={styles.memberControls}>
          <p className={styles.noMembership}>Workspace membership бүртгэлгүй.</p>
          <button className={styles.primaryButton} type="button" onClick={registerMembership} aria-label={`${emailLabel}: disabled membership үүсгэх`} disabled={controlsDisabled}>
            {saving ? "Үүсгэж байна…" : "Disabled membership үүсгэх"}
          </button>
        </div>
      )}

      {error ? <p className={styles.inlineError} role="alert">{error}</p> : null}
    </article>
  );
}

export function AdminConsole() {
  const [data, setData] = useState<AdminPageData | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadUsers = useCallback(async (targetPage: number, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/members?page=${targetPage}&perPage=50`, {
        credentials: "same-origin",
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw await readError(response);
      setData((await response.json()) as AdminPageData);
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") return;
      setError(requestError instanceof Error ? requestError.message : "Хэрэглэгчдийн жагсаалтыг ачаалж чадсангүй.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const loadTimer = window.setTimeout(() => {
      void loadUsers(page, controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(loadTimer);
      controller.abort();
    };
  }, [loadUsers, page]);

  async function refreshWithNotice(message: string) {
    setNotice(message);
    await loadUsers(page);
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviting(true);
    setError(null);
    setNotice(null);
    try {
      await postAdminAction({ action: "invite", email });
      const invitedEmail = email;
      setEmail("");
      setNotice(`${invitedEmail} рүү урилга илгээлээ. Access нь default-аар хаалттай.`);
      if (page !== 1) setPage(1);
      else await loadUsers(1);
    } catch (requestError) {
      if (requestError instanceof AdminActionError && requestError.code === "membership_registration_failed") {
        setError(`${requestError.message} Жагсаалтыг шинэчилж, membership-гүй хэрэглэгч дээр recovery үйлдлийг ашиглана уу.`);
        if (page !== 1) setPage(1);
        else await loadUsers(1);
      } else {
        setError(requestError instanceof Error ? requestError.message : "Урилга илгээж чадсангүй.");
      }
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className={styles.console}>
      <section className={styles.invitePanel}>
        <div>
          <p className={styles.eyebrow}>INVITE-ONLY</p>
          <h2>Шинэ хэрэглэгч урих</h2>
          <p>Урилга үүсэхэд builder membership автоматаар үүсэх боловч access нь идэвхгүй байна.</p>
        </div>
        <form onSubmit={invite} className={styles.inviteForm}>
          <label htmlFor="admin-invite-email">Имэйл</label>
          <div>
            <input
              id="admin-invite-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="member@example.com"
              required
              maxLength={254}
              disabled={inviting}
            />
            <button className={styles.primaryButton} type="submit" disabled={inviting || !email.trim()}>
              {inviting ? "Илгээж байна…" : "Урилга илгээх"}
            </button>
          </div>
        </form>
      </section>

      <section className={styles.guardrails} aria-label="Admin safety rules">
        <span>New access: disabled</span>
        <span>Self-lockout: blocked</span>
        <span>Last admin: protected</span>
        <span>Changes: audited RPC</span>
      </section>

      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      <section className={styles.membersSection}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>AUTH + MEMBERSHIP</p>
            <h2>Хэрэглэгчид</h2>
          </div>
          <div className={styles.listActions}>
            <span role="status" aria-live="polite">{loading ? "Ачаалж байна…" : `${data?.pagination.total ?? 0} хэрэглэгч`}</span>
            <button type="button" onClick={() => void loadUsers(page)} disabled={loading}>
              Дахин ачаалах
            </button>
          </div>
        </div>

        {loading && !data ? <p className={styles.loading} role="status">Хэрэглэгчдийн жагсаалтыг ачаалж байна…</p> : null}
        {!loading && data?.users.length === 0 ? <p className={styles.loading}>Auth хэрэглэгч олдсонгүй.</p> : null}

        <div className={styles.memberList} aria-busy={loading}>
          {data?.users.map((user) => (
            <MemberRow
              key={user.id}
              user={user}
              isSelf={user.id === data.actorId}
              globalLoading={loading}
              onChanged={refreshWithNotice}
            />
          ))}
        </div>

        {data && data.pagination.lastPage > 1 ? (
          <nav className={styles.pagination} aria-label="Хэрэглэгчдийн хуудас">
            <button type="button" onClick={() => setPage(Math.max(1, data.pagination.page - 1))} disabled={loading || data.pagination.page <= 1}>
              Өмнөх
            </button>
            <span>{data.pagination.page} / {data.pagination.lastPage}</span>
            <button
              type="button"
              onClick={() => setPage(Math.min(data.pagination.lastPage, data.pagination.page + 1))}
              disabled={loading || data.pagination.page >= data.pagination.lastPage}
            >
              Дараах
            </button>
          </nav>
        ) : null}
      </section>
    </div>
  );
}
