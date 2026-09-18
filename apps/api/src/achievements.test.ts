import assert from 'node:assert/strict';
import test from 'node:test';
import { achievementDefinitions } from './achievements.js';

test('ships 150 unique achievements led by Factorio game telemetry', () => {
  assert.equal(achievementDefinitions.length, 150);
  assert.equal(new Set(achievementDefinitions.map((entry) => entry.key)).size, 150);
  assert.ok(achievementDefinitions.some((entry) => entry.audience === 'factory'));
  assert.ok(achievementDefinitions.some((entry) => entry.audience === 'player'));
  assert.ok(achievementDefinitions.every((entry) => Number.isFinite(entry.target) && entry.target > 0));
  assert.ok(new Set(achievementDefinitions.map((entry) => entry.metric)).size >= 25);
  assert.ok(achievementDefinitions.filter((entry) => !['completedTasks', 'createdTasks', 'messages', 'comments', 'reactions', 'completedGoals', 'factoryTasks', 'factoryMessages', 'factoryReactions'].includes(entry.metric)).length >= 130);
  assert.equal(new Set(achievementDefinitions.map((entry) => `${entry.audience}:${entry.metric}:${entry.subject ?? ''}:${entry.target}`)).size, 150);
  assert.ok(achievementDefinitions.filter((entry) => entry.metric === 'itemProduced').every((entry) => entry.subject));
  assert.ok(achievementDefinitions.filter((entry) => entry.metric === 'fluidProduced').every((entry) => entry.subject));
  assert.equal(new Set(achievementDefinitions.map((entry) => entry.title)).size, 150);
});
