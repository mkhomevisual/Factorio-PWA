import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTelemetryResponse } from './rcon-adapter.js';

test('normalizes V3 scopes, fluids and tick-based event times', () => {
  const raw = {
    contractVersion: 3,
    capabilities: ['item-flow', 'fluid-flow', 'surface-flow', 'event-ticks'],
    instanceId: 'save-42',
    generatedAtTick: 6_600,
    server: { online: true, version: '2.0.77', gameState: 'running', uptimeSeconds: 110, lastSaveAt: null },
    players: [{ factorioName: 'Martin', online: false, lastOnlineAtTick: 6_000, playtimeSeconds: 100, surfaceName: 'nauvis', personalActivity: { handCrafted: 1, mined: 2, built: 3, deaths: 0 } }],
    scopes: [{
      forceName: 'player', surface: { name: 'nauvis', index: 1, kind: 'planet', planetName: 'nauvis' },
      items: [{ item: 'iron-plate', produced: 100, consumed: 50, productionRate: 10, consumptionRate: 5 }],
      fluids: [{ item: 'water', produced: 1_000, consumed: 800, productionRate: 100, consumptionRate: 80 }],
      pollution: 12, evolutionFactor: 0.4,
      power: { available: true, networkCount: 1, productionWatts: 10_000, consumptionWatts: 8_000, accumulatorChargeJoules: 200, accumulatorCapacityJoules: 400, producers: [], consumers: [] }
    }],
    research: [{ forceName: 'player', current: { technology: 'automation-3', progress: 4 }, queue: [null, 'automation-3'] }], platforms: [],
    logisticNetworks: [{
      id: 17, forceName: 'player', surfaceName: 'nauvis', name: 'Main network', x: 5, y: -3,
      contents: [{ item: 'repair-pack', quality: 'normal', count: 42 }],
      logisticRobots: { available: 8, total: 10 }, constructionRobots: { available: 4, total: 5 }
    }],
    probes: [{
      id: 'probe-9', name: 'Acid tank', entityName: 'storage-tank', entityType: 'storage-tank',
      forceName: 'player', surfaceName: 'nauvis', x: 9.5, y: 4.5, valid: true,
      fluids: [{ name: 'sulfuric-acid', amount: 12_000 }]
    }],
    events: { highWatermark: 'save-42:9', items: [{ id: '9', type: 'player.left', tick: 6_000, playerName: 'Martin', detail: {} }] }
  };
  const snapshot = parseTelemetryResponse(`HAL_TELEMETRY_V3:${JSON.stringify(raw)}`, '2026-09-10T10:00:00.000Z');
  assert.equal(snapshot.contractVersion, 3);
  assert.equal(snapshot.sharedFactory[0].item, 'iron-plate');
  assert.equal(snapshot.sharedFluids[0].item, 'water');
  assert.equal(snapshot.events[0].id, 'save-42:9');
  assert.equal(snapshot.events[0].occurredAt, '2026-09-10T09:59:50.000Z');
  assert.equal(snapshot.players[0].lastOnlineAt, '2026-09-10T09:59:50.000Z');
  assert.equal(snapshot.logisticNetworks[0].id, '17');
  assert.equal(snapshot.logisticNetworks[0].waitingToChargeRobots, 0);
  assert.equal(snapshot.probes[0].fluids[0].amount, 12_000);
  assert.deepEqual(snapshot.probes[0].signals, []);
  assert.equal(snapshot.research[0].current?.progress, 1);
  assert.deepEqual(snapshot.research[0].current?.ingredients, []);
  assert.deepEqual(snapshot.research[0].queue, ['automation-3']);
});

test('keeps V2 telemetry usable during a rolling upgrade', () => {
  const raw = {
    contractVersion: 2,
    server: { online: true, version: '2.0.77', gameState: 'running', uptimeSeconds: 10, lastSaveAt: null },
    players: [], sharedFactory: [], events: { highWatermark: '4', items: [] }
  };
  const snapshot = parseTelemetryResponse(`HAL_TELEMETRY_V2:${JSON.stringify(raw)}`, '2026-09-10T10:00:00.000Z');
  assert.equal(snapshot.contractVersion, 2);
  assert.deepEqual(snapshot.sharedFluids, []);
  assert.deepEqual(snapshot.capabilities, ['item-flow']);
  assert.deepEqual(snapshot.logisticNetworks, []);
  assert.deepEqual(snapshot.probes, []);
});
