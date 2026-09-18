import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { FactorySnapshot } from './factory-adapter.js';
import { MockFactoryAdapter } from './mock-adapter.js';
import { openDatabase } from './db.js';
import { buildApp } from './server.js';

class GameTaskAdapter extends MockFactoryAdapter {
  mode: 'create' | 'done' = 'create';
  code = '';
  readonly messages: string[] = [];
  override async getSnapshot(): Promise<FactorySnapshot> {
    const snapshot = await super.getSnapshot();
    snapshot.events = this.mode === 'create' ? [{
      id: 'mock-space-age:task-create', type: 'task.create-requested', occurredAt: snapshot.generatedAt,
      message: 'task.create-requested', playerName: 'MarkanMegaBuilder', detail: { title: 'Doplnit obranu', surface: 'nauvis', x: 12.5, y: -8 }
    }] : [{
      id: 'mock-space-age:task-done', type: 'task.complete-requested', occurredAt: snapshot.generatedAt,
      message: 'task.complete-requested', playerName: 'MarkanMegaBuilder', detail: { code: this.code }
    }];
    snapshot.eventCursor = snapshot.events[0].id;
    return snapshot;
  }
  override async sendMessage(message: string) { this.messages.push(message); }
}

test('creates and completes an app task from deduplicated Factorio events', async () => {
  const db = openDatabase(':memory:'); const adapter = new GameTaskAdapter(); const now = new Date().toISOString(); const token = 'game-task-session';
  db.prepare('INSERT INTO users(id,login,display_name,factorio_name,password_hash,created_at) VALUES(?,?,?,?,?,?)')
    .run('user-1', 'martin', 'Martin', 'MarkanMegaBuilder', 'unused', now);
  db.prepare('INSERT INTO sessions(id,token_hash,user_id,csrf_token,expires_at,created_at) VALUES(?,?,?,?,?,?)')
    .run('session-1', createHash('sha256').update(token).digest('hex'), 'user-1', 'csrf', '2099-01-01T00:00:00.000Z', now);
  const app = buildApp({ db, adapter }); await app.ready();
  const first = await app.inject({ method: 'GET', url: '/api/tasks', cookies: { hal_session: token } });
  assert.equal(first.statusCode, 200); assert.equal(first.json().length, 1);
  assert.equal(first.json()[0].location, '[gps=12.5,-8,nauvis]');
  await app.inject({ method: 'POST', url: '/api/server/telemetry-refresh', cookies: { hal_session: token }, headers: { 'x-csrf-token': 'csrf' } });
  const deduplicated = await app.inject({ method: 'GET', url: '/api/tasks', cookies: { hal_session: token } });
  assert.equal(deduplicated.json().length, 1);
  adapter.code = first.json()[0].code; adapter.mode = 'done';
  const refresh = await app.inject({ method: 'POST', url: '/api/server/telemetry-refresh', cookies: { hal_session: token }, headers: { 'x-csrf-token': 'csrf' } });
  assert.equal(refresh.statusCode, 200);
  const completed = await app.inject({ method: 'GET', url: '/api/tasks', cookies: { hal_session: token } });
  assert.equal(completed.json()[0].status, 'Done');
  assert.equal(adapter.messages.some((message) => message.includes('vytvořen')), true);
  assert.equal(adapter.messages.some((message) => message.includes('hotový')), true);
  await app.close();
});
