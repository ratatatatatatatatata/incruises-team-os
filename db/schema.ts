import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const userProfiles = sqliteTable("user_profiles", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("builder"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const lessonProgress = sqliteTable(
  "lesson_progress",
  {
    userId: text("user_id").notNull(),
    lessonId: text("lesson_id").notNull(),
    status: text("status").notNull().default("completed"),
    score: integer("score"),
    completedAt: text("completed_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.lessonId] }),
    index("idx_lesson_progress_user").on(table.userId),
  ],
);

export const contentDrafts = sqliteTable(
  "content_drafts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ownerId: text("owner_id").notNull(),
    title: text("title").notNull(),
    channel: text("channel").notNull(),
    sourceId: text("source_id").notNull(),
    status: text("status").notNull().default("draft"),
    excerpt: text("excerpt").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_content_drafts_owner_status").on(table.ownerId, table.status),
  ],
);

export const memberTasks = sqliteTable(
  "member_tasks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ownerId: text("owner_id").notNull(),
    memberName: text("member_name").notNull(),
    milestone: text("milestone").notNull(),
    nextAction: text("next_action").notNull(),
    dueLabel: text("due_label").notNull().default("Өнөөдөр"),
    risk: text("risk").notNull().default("normal"),
    status: text("status").notNull().default("open"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_member_tasks_owner_status").on(table.ownerId, table.status),
  ],
);
