import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

test('frontend has no recurring application data polling or automatic live refresh', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../../web/src/app.tsx'), 'utf8');
  const intervals = [...source.matchAll(/setInterval\(/g)];
  // The sole remaining interval checks the PWA service worker once per hour and
  // explicitly skips hidden tabs. It never calls the HAL API or RCON.
  assert.equal(intervals.length, 1);
  assert.match(source, /document\.visibilityState === 'visible'/);
  assert.equal([...source.matchAll(/\/api\/server\/telemetry-refresh/g)].length, 2);
  assert.match(source, /const refreshTelemetry = async \(\) =>/);
});
