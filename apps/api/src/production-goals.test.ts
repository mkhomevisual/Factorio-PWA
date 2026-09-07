import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openDatabase } from './db.js';
import type { FactorySnapshot } from './factory-adapter.js';
import { advanceProductionGoals, productionCounterDelta } from './production-goals.js';

test('production counter delta ignores a counter reset', () => {
  assert.equal(productionCounterDelta(1_000, 1_125), 125);
  assert.equal(productionCounterDelta(1_000, 20), 0);
});

test('advances a goal by produced counter deltas and completes exactly once', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hal-goals-'));
  const db = openDatabase(join(directory, 'goals.db'));
  const now = new Date().toISOString();
  db.prepare('INSERT INTO users(id,login,display_name,factorio_name,password_hash,created_at) VALUES(?,?,?,?,?,?)').run('user-1', 'markan', 'Martin', 'MarkanMegaBuilder', 'hash', now);
  db.prepare(`INSERT INTO production_goals(id,item,target_amount,progress_amount,last_counter,created_by,status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,'active',?,?)`).run('goal-1', 'speed-module', 100, 0, 1_000, 'user-1', now, now);
  const snapshot = (produced: number): FactorySnapshot => ({
    contractVersion: 2, generatedAt: now,
    server: { online: true, version: '2.0', gameState: 'running', uptimeSeconds: 1, lastSaveAt: null }, players: [], events: [],
    sharedFactory: [{ item: 'speed-module', produced, consumed: 0, productionRate: 20, consumptionRate: 0 }]
  });
  assert.equal(advanceProductionGoals(db, snapshot(1_040), now).length, 0);
  assert.equal((db.prepare('SELECT progress_amount FROM production_goals WHERE id=?').get('goal-1') as { progress_amount: number }).progress_amount, 40);
  assert.equal(advanceProductionGoals(db, snapshot(1_110), now).length, 1);
  assert.equal(advanceProductionGoals(db, snapshot(1_210), now).length, 0);
  const goal = db.prepare('SELECT progress_amount,status FROM production_goals WHERE id=?').get('goal-1') as { progress_amount: number; status: string };
  assert.deepEqual(goal, { progress_amount: 100, status: 'completed' });
  db.close(); rmSync(directory, { recursive: true, force: true });
});
