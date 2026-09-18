import assert from 'node:assert/strict';
import test from 'node:test';
import { openDatabase } from './db.js';
import { persistTelemetryMetrics, listFlowRollups } from './telemetry-storage.js';
import type { FactorySnapshot } from './factory-adapter.js';

function snapshot(produced: number, rate: number): FactorySnapshot {
  return {
    contractVersion: 3,
    capabilities: ['item-flow', 'fluid-flow'],
    instanceId: 'test-save', generatedAtTick: 100, generatedAt: '2026-09-10T10:00:00.000Z',
    server: { online: true, version: '2.0.77', gameState: 'running', uptimeSeconds: 100, lastSaveAt: null },
    players: [], surfaces: [], research: [], platforms: [], logisticNetworks: [], probes: [], events: [],
    sharedFactory: [{ item: 'iron-plate', produced, consumed: produced / 2, productionRate: rate, consumptionRate: rate / 2 }],
    sharedFluids: [{ item: 'water', produced: produced * 10, consumed: produced * 8, productionRate: rate * 10, consumptionRate: rate * 8 }]
  };
}

test('rollups retain positive deltas and average rates for items and fluids', () => {
  const db = openDatabase(':memory:');
  const first = snapshot(1_000, 100);
  const second = snapshot(1_120, 140);
  persistTelemetryMetrics(db, first, null, '2026-09-10T10:01:00.000Z');
  persistTelemetryMetrics(db, second, first, '2026-09-10T10:02:00.000Z');

  const items = listFlowRollups(db, 'item', '2026-09-10T00:00:00.000Z', 3600);
  assert.equal(items.length, 1);
  assert.equal(items[0].producedAmount, 120);
  assert.equal(items[0].consumedAmount, 60);
  assert.equal(items[0].productionRate, 120);

  const fluids = listFlowRollups(db, 'fluid', '2026-09-10T00:00:00.000Z', 3600);
  assert.equal(fluids[0].producedAmount, 1_200);
  assert.equal(fluids[0].consumedAmount, 960);
  db.close();
});

test('rollups ignore counter resets', () => {
  const db = openDatabase(':memory:');
  const first = snapshot(2_000, 100);
  const reset = snapshot(20, 80);
  persistTelemetryMetrics(db, first, null, '2026-09-10T10:01:00.000Z');
  persistTelemetryMetrics(db, reset, first, '2026-09-10T10:02:00.000Z');
  assert.equal(listFlowRollups(db, 'item', '2026-09-10T00:00:00.000Z', 3600)[0].producedAmount, 0);
  db.close();
});
