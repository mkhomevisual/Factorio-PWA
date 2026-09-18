import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { openDatabase } from './db.js';
import { MockFactoryAdapter } from './mock-adapter.js';
import { buildApp } from './server.js';

test('serves V3 operations and fluid production to an authenticated user', async () => {
  const db = openDatabase(':memory:');
  const userId = '11111111-1111-4111-8111-111111111111';
  const now = new Date().toISOString();
  const rawToken = 'test-session-token';
  db.prepare('INSERT INTO users(id,login,display_name,factorio_name,password_hash,created_at) VALUES(?,?,?,?,?,?)')
    .run(userId, 'martin', 'Martin', 'MarkanMegaBuilder', 'unused', now);
  db.prepare('INSERT INTO sessions(id,token_hash,user_id,csrf_token,expires_at,created_at) VALUES(?,?,?,?,?,?)')
    .run('session-1', createHash('sha256').update(rawToken).digest('hex'), userId, 'csrf', '2099-01-01T00:00:00.000Z', now);
  const app = buildApp({ db, adapter: new MockFactoryAdapter() });
  await app.ready();

  const operations = await app.inject({ method: 'GET', url: '/api/operations', cookies: { hal_session: rawToken } });
  assert.equal(operations.statusCode, 200);
  const body = operations.json();
  assert.equal(body.capabilities.includes('space-platforms'), true);
  assert.equal(body.surfaces.some((surface: { planetName: string | null }) => surface.planetName === 'vulcanus'), true);
  assert.equal(body.platforms[0].name, 'Orbital Hauler');
  assert.equal(body.logisticNetworks[0].name, 'Nauvis main bus');
  assert.equal(body.probes[0].name, 'Kyselina pro uran');
  assert.equal(body.profiles[0].factorioName, 'MarkanMegaBuilder');
  assert.deepEqual(body.preferences, []);

  const preference = await app.inject({ method: 'PUT', url: '/api/operations/preferences/platform/7', cookies: { hal_session: rawToken }, headers: { 'x-csrf-token': 'csrf' }, payload: { ownerUserId: userId, icon: 'rocket', accentColor: '#4aa3df', sortOrder: 10 } });
  assert.equal(preference.statusCode, 204);
  const personalized = await app.inject({ method: 'GET', url: '/api/operations', cookies: { hal_session: rawToken } });
  assert.deepEqual(personalized.json().preferences[0], { entityType: 'platform', entityKey: '7', ownerUserId: userId, icon: 'rocket', accentColor: '#4aa3df', sortOrder: 10 });

  const rule = await app.inject({ method: 'POST', url: '/api/logistics/rules', cookies: { hal_session: rawToken }, headers: { 'x-csrf-token': 'csrf' }, payload: { surfaceName: 'vulcanus', item: 'repair-pack', minimumAmount: 50 } });
  assert.equal(rule.statusCode, 201);
  const shortages = await app.inject({ method: 'GET', url: '/api/operations', cookies: { hal_session: rawToken } });
  assert.equal(shortages.json().logisticNetworks.find((network: { surfaceName: string }) => network.surfaceName === 'vulcanus').shortages[0].currentAmount, 24);

  const fluids = await app.inject({ method: 'GET', url: '/api/production?kind=fluid&range=1h', cookies: { hal_session: rawToken } });
  assert.equal(fluids.statusCode, 200);
  assert.equal(fluids.json().kind, 'fluid');
  assert.equal(fluids.json().catalog.some((entry: { item: string }) => entry.item === 'molten-iron'), true);
  await app.close();
});
