import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureTeamOsSchema } from "../../../db/ensure";
import { contentDrafts, lessonProgress, memberTasks, userProfiles } from "../../../db/schema";
import { getCurrentTeamOsUser } from "../../current-user";
import { officialSources } from "../../team-os-data";

const allowedSourceIds = new Set(officialSources.map((source) => source.id));
const allowedChannels = new Set(["Facebook", "Instagram", "Short video", "FAQ", "Message"]);
const allowedStatuses = new Set(["draft", "review", "approved", "archived"]);

async function authorizedUser() {
  const user = await getCurrentTeamOsUser();
  if (!user) return null;
  await ensureTeamOsSchema();

  const db = getDb();
  await db
    .insert(userProfiles)
    .values({ id: user.userId, email: user.email, displayName: user.displayName })
    .onConflictDoUpdate({
      target: userProfiles.id,
      set: { email: user.email, displayName: user.displayName, updatedAt: new Date().toISOString() },
    });
  return user;
}

export async function GET() {
  const user = await authorizedUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });

  const db = getDb();
  const [progress, drafts, tasks] = await Promise.all([
    db.select().from(lessonProgress).where(eq(lessonProgress.userId, user.userId)),
    db
      .select()
      .from(contentDrafts)
      .where(eq(contentDrafts.ownerId, user.userId))
      .orderBy(desc(contentDrafts.updatedAt), desc(contentDrafts.id))
      .limit(30),
    db
      .select()
      .from(memberTasks)
      .where(eq(memberTasks.ownerId, user.userId))
      .orderBy(desc(memberTasks.updatedAt), desc(memberTasks.id))
      .limit(40),
  ]);

  return Response.json({ progress, drafts, memberTasks: tasks });
}

export async function POST(request: Request) {
  const user = await authorizedUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });

  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const db = getDb();

  if (action === "toggle_lesson") {
    const lessonId = String(body.lessonId ?? "").slice(0, 80);
    if (!lessonId) return Response.json({ error: "lessonId required" }, { status: 400 });

    const [existing] = await db
      .select()
      .from(lessonProgress)
      .where(and(eq(lessonProgress.userId, user.userId), eq(lessonProgress.lessonId, lessonId)))
      .limit(1);

    if (existing) {
      await db
        .delete(lessonProgress)
        .where(and(eq(lessonProgress.userId, user.userId), eq(lessonProgress.lessonId, lessonId)));
      return Response.json({ completed: false });
    }

    await db.insert(lessonProgress).values({ userId: user.userId, lessonId, status: "completed" });
    return Response.json({ completed: true }, { status: 201 });
  }

  if (action === "create_draft") {
    const title = String(body.title ?? "").trim().slice(0, 140);
    const channel = String(body.channel ?? "");
    const sourceId = String(body.sourceId ?? "");
    if (!title || !allowedChannels.has(channel) || !allowedSourceIds.has(sourceId)) {
      return Response.json({ error: "Valid title, channel and approved source are required" }, { status: 400 });
    }

    const source = officialSources.find((item) => item.id === sourceId)!;
    const excerpt = `${title}. Энэ ноорог нь “${source.title}” эх сурвалжид тулгуурласан. Нийтлэхийн өмнө үнэ, боломж, үр дүнгийн claim бүрийг хянагч батална.`;
    const [draft] = await db
      .insert(contentDrafts)
      .values({ ownerId: user.userId, title, channel, sourceId, excerpt })
      .returning();
    return Response.json({ draft }, { status: 201 });
  }

  if (action === "set_draft_status") {
    const id = Number(body.id);
    const status = String(body.status ?? "");
    if (!Number.isInteger(id) || !allowedStatuses.has(status)) {
      return Response.json({ error: "Valid draft and status required" }, { status: 400 });
    }
    await db
      .update(contentDrafts)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(and(eq(contentDrafts.id, id), eq(contentDrafts.ownerId, user.userId)));
    return Response.json({ ok: true });
  }

  if (action === "add_member_task") {
    const memberName = String(body.memberName ?? "").trim().slice(0, 80);
    const milestone = String(body.milestone ?? "72 цаг").trim().slice(0, 40);
    const nextAction = String(body.nextAction ?? "").trim().slice(0, 180);
    const dueLabel = String(body.dueLabel ?? "Өнөөдөр").trim().slice(0, 40);
    const risk = ["normal", "attention", "urgent"].includes(String(body.risk)) ? String(body.risk) : "normal";
    if (!memberName || !nextAction) {
      return Response.json({ error: "Member name and next action are required" }, { status: 400 });
    }
    const [task] = await db
      .insert(memberTasks)
      .values({ ownerId: user.userId, memberName, milestone, nextAction, dueLabel, risk })
      .returning();
    return Response.json({ task }, { status: 201 });
  }

  if (action === "complete_member_task") {
    const id = Number(body.id);
    if (!Number.isInteger(id)) return Response.json({ error: "Valid task required" }, { status: 400 });
    await db
      .update(memberTasks)
      .set({ status: "complete", updatedAt: new Date().toISOString() })
      .where(and(eq(memberTasks.id, id), eq(memberTasks.ownerId, user.userId)));
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
