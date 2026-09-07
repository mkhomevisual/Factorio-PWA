import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { openDatabase } from './db.js';

test('adds workspace columns and collaboration tables to an existing database', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hal-db-'));
  const path = join(directory, 'legacy.db');
  const legacy = new Database(path);
  legacy.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, login TEXT, display_name TEXT, factorio_name TEXT, color TEXT, password_hash TEXT, created_at TEXT, last_online_at TEXT);
    CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, description TEXT, status TEXT, priority INTEGER, location TEXT, blueprint_string TEXT, created_by TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE messages (id TEXT PRIMARY KEY, user_id TEXT, body TEXT, created_at TEXT);
  `);
  legacy.close();

  const db = openDatabase(path);
  const taskColumns = (db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>).map((column) => column.name);
  const messageColumns = (db.prepare('PRAGMA table_info(messages)').all() as Array<{ name: string }>).map((column) => column.name);
  assert.ok(taskColumns.includes('due_at'));
  assert.ok(taskColumns.includes('is_pinned'));
  assert.ok(taskColumns.includes('is_archived'));
  assert.ok(messageColumns.includes('updated_at'));
  assert.ok(messageColumns.includes('is_pinned'));
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='message_reactions'").get());
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='message_reads'").get());
  db.close();
  rmSync(directory, { recursive: true, force: true });
});
