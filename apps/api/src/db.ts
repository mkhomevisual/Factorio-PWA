import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type AppDatabase = Database.Database;

export function openDatabase(path: string): AppDatabase {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      login TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      factorio_name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#e69636',
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_online_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf_token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK(status IN ('Now', 'Next', 'Later', 'Done')),
      priority INTEGER NOT NULL DEFAULT 2 CHECK(priority BETWEEN 1 AND 4),
      location TEXT,
      blueprint_string TEXT,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS task_assignees (
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY(task_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS task_tags (
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      PRIMARY KEY(task_id, tag)
    );
    CREATE TABLE IF NOT EXISTS task_checklist_items (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      is_done INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS task_comments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS task_history (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      action TEXT NOT NULL,
      detail_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      is_pinned INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS messages_created_at ON messages(created_at DESC);
    CREATE TABLE IF NOT EXISTS message_reactions (
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(message_id, user_id, emoji)
    );
    CREATE TABLE IF NOT EXISTS message_reads (
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      read_at TEXT NOT NULL,
      PRIMARY KEY(message_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS activity_events (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actor_user_id TEXT REFERENCES users(id),
      external_event_id TEXT UNIQUE,
      payload_json TEXT NOT NULL DEFAULT '{}',
      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS activity_events_occurred_at ON activity_events(occurred_at DESC);
    CREATE TABLE IF NOT EXISTS audit_actions (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      action TEXT NOT NULL,
      result TEXT NOT NULL,
      detail_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS telemetry_cursors (
      source TEXT PRIMARY KEY,
      cursor TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS telemetry_snapshots (
      id TEXT PRIMARY KEY,
      scope_type TEXT NOT NULL CHECK(scope_type IN ('shared', 'player', 'force')),
      scope_key TEXT NOT NULL,
      contract_version INTEGER NOT NULL,
      collected_at TEXT NOT NULL,
      payload BLOB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS telemetry_snapshots_scope_time ON telemetry_snapshots(scope_type, scope_key, collected_at DESC);
  `);

  // Additive migrations keep the existing production volume and all user data.
  const columns = (table: string) => new Set((db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name));
  const taskColumns = columns('tasks');
  if (!taskColumns.has('due_at')) db.exec('ALTER TABLE tasks ADD COLUMN due_at TEXT');
  if (!taskColumns.has('is_pinned')) db.exec('ALTER TABLE tasks ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0');
  if (!taskColumns.has('is_archived')) db.exec('ALTER TABLE tasks ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0');
  if (!taskColumns.has('position')) db.exec('ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0');
  const messageColumns = columns('messages');
  if (!messageColumns.has('updated_at')) db.exec('ALTER TABLE messages ADD COLUMN updated_at TEXT');
  if (!messageColumns.has('is_pinned')) db.exec('ALTER TABLE messages ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0');
  return db;
}
