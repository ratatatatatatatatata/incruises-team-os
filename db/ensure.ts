import { env } from "cloudflare:workers";

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS user_profiles (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'builder',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS lesson_progress (
    user_id TEXT NOT NULL,
    lesson_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    score INTEGER,
    completed_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, lesson_id)
  )`,
  `CREATE TABLE IF NOT EXISTS content_drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    owner_id TEXT NOT NULL,
    title TEXT NOT NULL,
    channel TEXT NOT NULL,
    source_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    excerpt TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS member_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    owner_id TEXT NOT NULL,
    member_name TEXT NOT NULL,
    milestone TEXT NOT NULL,
    next_action TEXT NOT NULL,
    due_label TEXT NOT NULL DEFAULT 'Өнөөдөр',
    risk TEXT NOT NULL DEFAULT 'normal',
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE INDEX IF NOT EXISTS idx_lesson_progress_user ON lesson_progress(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_content_drafts_owner_status ON content_drafts(owner_id, status)",
  "CREATE INDEX IF NOT EXISTS idx_member_tasks_owner_status ON member_tasks(owner_id, status)",
];

let initialized = false;

export async function ensureTeamOsSchema() {
  if (initialized) return;
  const d1 = env.DB;
  if (!d1) throw new Error("D1 binding DB is unavailable");

  await d1.batch(schemaStatements.map((statement) => d1.prepare(statement)));
  await d1.prepare("PRAGMA optimize").run();
  initialized = true;
}
