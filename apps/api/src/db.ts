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
    CREATE TABLE IF NOT EXISTS telemetry_flow_rollups (
      bucket_start TEXT NOT NULL,
      bucket_seconds INTEGER NOT NULL CHECK(bucket_seconds IN (3600, 86400)),
      flow_kind TEXT NOT NULL CHECK(flow_kind IN ('item', 'fluid')),
      prototype TEXT NOT NULL,
      produced_amount REAL NOT NULL DEFAULT 0,
      consumed_amount REAL NOT NULL DEFAULT 0,
      production_rate_sum REAL NOT NULL DEFAULT 0,
      consumption_rate_sum REAL NOT NULL DEFAULT 0,
      sample_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(bucket_start, bucket_seconds, flow_kind, prototype)
    );
    CREATE INDEX IF NOT EXISTS telemetry_flow_rollups_lookup ON telemetry_flow_rollups(flow_kind, bucket_seconds, bucket_start);
    CREATE TABLE IF NOT EXISTS telemetry_surface_samples (
      id TEXT PRIMARY KEY,
      collected_at TEXT NOT NULL,
      scope_key TEXT NOT NULL,
      force_name TEXT NOT NULL,
      surface_name TEXT NOT NULL,
      surface_kind TEXT NOT NULL,
      planet_name TEXT,
      platform_id TEXT,
      pollution REAL,
      evolution_factor REAL,
      power_available INTEGER NOT NULL,
      network_count INTEGER NOT NULL,
      production_watts REAL NOT NULL,
      consumption_watts REAL NOT NULL,
      accumulator_charge_joules REAL NOT NULL,
      accumulator_capacity_joules REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS telemetry_surface_samples_lookup ON telemetry_surface_samples(scope_key, collected_at DESC);
    CREATE TABLE IF NOT EXISTS logistic_stock_rules (
      id TEXT PRIMARY KEY,
      surface_name TEXT,
      item TEXT NOT NULL,
      minimum_amount REAL NOT NULL CHECK(minimum_amount >= 0),
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS logistic_stock_rules_surface ON logistic_stock_rules(surface_name, item);
    CREATE TABLE IF NOT EXISTS operation_preferences (
      entity_type TEXT NOT NULL CHECK(entity_type IN ('surface', 'platform', 'logistic-network')),
      entity_key TEXT NOT NULL,
      owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      icon TEXT NOT NULL DEFAULT 'factory',
      accent_color TEXT NOT NULL DEFAULT '#e69636',
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_by TEXT NOT NULL REFERENCES users(id),
      updated_at TEXT NOT NULL,
      PRIMARY KEY(entity_type, entity_key)
    );
    CREATE INDEX IF NOT EXISTS operation_preferences_owner ON operation_preferences(owner_user_id, entity_type, sort_order);
    CREATE TABLE IF NOT EXISTS production_goals (
      id TEXT PRIMARY KEY,
      item TEXT NOT NULL,
      target_amount REAL NOT NULL CHECK(target_amount > 0),
      progress_amount REAL NOT NULL DEFAULT 0,
      last_counter REAL NOT NULL DEFAULT 0,
      last_instance_id TEXT,
      linked_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      created_by TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      announced_at TEXT
    );
    CREATE INDEX IF NOT EXISTS production_goals_status ON production_goals(status, created_at DESC);
    CREATE TABLE IF NOT EXISTS achievement_unlocks (
      achievement_key TEXT NOT NULL,
      scope_key TEXT NOT NULL,
      unlocked_at TEXT NOT NULL,
      PRIMARY KEY(achievement_key, scope_key)
    );
  `);

  // Additive migrations keep the existing production volume and all user data.
  const columns = (table: string) => new Set((db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name));
  const taskColumns = columns('tasks');
  if (!taskColumns.has('due_at')) db.exec('ALTER TABLE tasks ADD COLUMN due_at TEXT');
  if (!taskColumns.has('is_pinned')) db.exec('ALTER TABLE tasks ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0');
  if (!taskColumns.has('is_archived')) db.exec('ALTER TABLE tasks ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0');
  if (!taskColumns.has('position')) db.exec('ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0');
  const productionGoalColumns = columns('production_goals');
  if (!productionGoalColumns.has('last_instance_id')) db.exec('ALTER TABLE production_goals ADD COLUMN last_instance_id TEXT');
  const messageColumns = columns('messages');
  if (!messageColumns.has('updated_at')) db.exec('ALTER TABLE messages ADD COLUMN updated_at TEXT');
  if (!messageColumns.has('is_pinned')) db.exec('ALTER TABLE messages ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0');
  return db;
}
