import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeProduction } from './production.js';

test('uses Factorio one-minute rates even with a single snapshot', () => {
  const result = summarizeProduction([{ collectedAt: '2026-09-07T12:00:00.000Z', sharedFactory: [
    { item: 'speed-module', produced: 42, consumed: 2, productionRate: 12.5, consumptionRate: 1 }
  ] }]);
  assert.equal(result.points[0]?.productionRate, 13);
  assert.deepEqual(result.topProduced[0], { item: 'speed-module', amount: 12.5, rate: 12.5 });
  assert.equal(result.basis, 'current');
});

test('ranks production and consumption independently across an interval', () => {
  const result = summarizeProduction([
    { collectedAt: '2026-09-07T12:00:00.000Z', sharedFactory: [
      { item: 'speed-module', produced: 10, consumed: 0, productionRate: 1, consumptionRate: 0 },
      { item: 'iron-plate', produced: 100, consumed: 100, productionRate: 4, consumptionRate: 4 }
    ] },
    { collectedAt: '2026-09-07T12:01:00.000Z', sharedFactory: [
      { item: 'speed-module', produced: 20, consumed: 1, productionRate: 10, consumptionRate: 1 },
      { item: 'iron-plate', produced: 104, consumed: 130, productionRate: 4, consumptionRate: 30 },
      { item: 'steel-chest', produced: 5, consumed: 0, productionRate: 5, consumptionRate: 0 }
    ] }
  ]);
  assert.equal(result.topProduced[0]?.item, 'speed-module');
  assert.equal(result.topProduced.find((item) => item.item === 'steel-chest')?.amount, 5);
  assert.equal(result.topConsumed[0]?.item, 'iron-plate');
  assert.equal(result.basis, 'interval');
});
