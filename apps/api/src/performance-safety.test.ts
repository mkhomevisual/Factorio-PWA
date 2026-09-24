import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { FastifyInstance } from 'fastify';
import { openDatabase } from './db.js';
import { MockFactoryAdapter } from './mock-adapter.js';
import { buildApp } from './server.js';
import type { SafeRconQuery } from './factory-adapter.js';

const token = 'performance-session';
const csrf = 'performance-csrf';

class CountingAdapter extends MockFactoryAdapter {
  snapshots = 0;
  active = 0;
  maxActive = 0;
  fail = false;
  delayMs = 25;

  override async getSnapshot(afterEventId?: string) {
    this.snapshots += 1;
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    try {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      if (this.fail) throw new Error('RCON response timed out.');
      return await super.getSnapshot(afterEventId);
    } finally { this.active -= 1; }
  }

  override async query(command: SafeRconQuery) {
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    try { await new Promise((resolve) => setTimeout(resolve, this.delayMs)); return await super.query(command); }
    finally { this.active -= 1; }
  }
}

async function fixture(adapter = new CountingAdapter(), refreshCooldownMs = 10_000) {
  const db = openDatabase(':memory:');
  const now = new Date().toISOString();
  db.prepare('INSERT INTO users(id,login,display_name,factorio_name,password_hash,created_at) VALUES(?,?,?,?,?,?)')
    .run('user-1', 'martin', 'Martin', 'MarkanMegaBuilder', 'unused', now);
  db.prepare('INSERT INTO sessions(id,token_hash,user_id,csrf_token,expires_at,created_at) VALUES(?,?,?,?,?,?)')
    .run('session-1', createHash('sha256').update(token).digest('hex'), 'user-1', csrf, '2099-01-01T00:00:00.000Z', now);
  const app = buildApp({ db, adapter, refreshCooldownMs });
  await app.ready();
  return { app, adapter };
}

function refresh(app: FastifyInstance) {
  return app.inject({ method: 'POST', url: '/api/server/telemetry-refresh', cookies: { hal_session: token }, headers: { 'x-csrf-token': csrf } });
}

test('startup, health and cached GET requests never contact the adapter', async () => {
  const { app, adapter } = await fixture();
  try {
    assert.equal(adapter.snapshots, 0);
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(adapter.snapshots, 0);
    assert.equal((await app.inject({ method: 'GET', url: '/health' })).statusCode, 200);
    for (let index = 0; index < 5; index += 1) {
      const dashboard = await app.inject({ method: 'GET', url: '/api/dashboard', cookies: { hal_session: token } });
      assert.equal(dashboard.statusCode, 200);
      assert.equal(dashboard.json().telemetry.hasData, false);
    }
    assert.equal(adapter.snapshots, 0);
  } finally { await app.close(); }
});

test('concurrent refresh requests share one job and RCON concurrency stays at one', async () => {
  const { app, adapter } = await fixture();
  try {
    const requests = [refresh(app), refresh(app), refresh(app), refresh(app), refresh(app)];
    const query = app.inject({ method: 'POST', url: '/api/server/query', cookies: { hal_session: token }, headers: { 'x-csrf-token': csrf }, payload: { action: 'players' } });
    const responses = await Promise.all(requests);
    assert.equal((await query).statusCode, 200);
    assert.ok(responses.every((response) => response.statusCode === 200));
    assert.equal(adapter.snapshots, 1);
    assert.equal(adapter.maxActive, 1);
    assert.equal(responses.filter((response) => response.json().disposition === 'deduplicated').length, 4);
    for (let index = 0; index < 5; index += 1) {
      assert.equal((await app.inject({ method: 'GET', url: '/api/dashboard', cookies: { hal_session: token } })).json().telemetry.hasData, true);
    }
    assert.equal(adapter.snapshots, 1);
    const diagnostics = await app.inject({ method: 'GET', url: '/api/server/diagnostics', cookies: { hal_session: token } });
    assert.equal(diagnostics.json().telemetry.metrics.deduplicated, 4);
    assert.equal(diagnostics.json().rconQueue.maxConcurrency, 1);
  } finally { await app.close(); }
});

test('global cooldown prevents a second snapshot', async () => {
  const { app, adapter } = await fixture();
  try {
    assert.equal((await refresh(app)).json().disposition, 'started');
    assert.equal((await refresh(app)).json().disposition, 'cooldown');
    assert.equal(adapter.snapshots, 1);
  } finally { await app.close(); }
});

test('refresh timeout preserves the last successful cached snapshot', async () => {
  const { app, adapter } = await fixture(undefined, 0);
  try {
    assert.equal((await refresh(app)).statusCode, 200);
    const before = (await app.inject({ method: 'GET', url: '/api/dashboard', cookies: { hal_session: token } })).json();
    adapter.fail = true;
    const failed = await refresh(app);
    assert.equal(failed.statusCode, 502);
    const after = (await app.inject({ method: 'GET', url: '/api/dashboard', cookies: { hal_session: token } })).json();
    assert.equal(after.telemetry.hasData, true);
    assert.equal(after.snapshot.generatedAt, before.snapshot.generatedAt);
    assert.match(after.telemetry.lastError, /timed out/);
  } finally { await app.close(); }
});
