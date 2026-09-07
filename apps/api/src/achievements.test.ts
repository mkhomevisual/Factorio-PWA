import assert from 'node:assert/strict';
import test from 'node:test';
import { achievementDefinitions } from './achievements.js';

test('ships 44 unique production and collaboration achievements', () => {
  assert.equal(achievementDefinitions.length, 44);
  assert.equal(new Set(achievementDefinitions.map((entry) => entry.key)).size, 44);
  assert.ok(achievementDefinitions.some((entry) => entry.audience === 'factory'));
  assert.ok(achievementDefinitions.some((entry) => entry.audience === 'player'));
});
