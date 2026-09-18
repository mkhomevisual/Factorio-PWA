import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { openDatabase } from './db.js';
import { MockFactoryAdapter } from './mock-adapter.js';
import { buildApp } from './server.js';

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, expected: string) {
  const decoder = new TextDecoder();
  let received = '';
  const deadline = Date.now() + 3_000;
  while (!received.includes(expected)) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(`SSE stream did not contain ${expected}: ${received}`);
    const result = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`SSE read timed out waiting for ${expected}`)), remaining))
    ]);
    if (result.done) throw new Error(`SSE stream ended before ${expected}: ${received}`);
    received += decoder.decode(result.value, { stream: true });
  }
  return received;
}

test('serves authenticated SSE updates for shared app mutations', async () => {
  const db = openDatabase(':memory:');
  const now = new Date().toISOString();
  const token = 'sse-session-token';
  db.prepare('INSERT INTO users(id,login,display_name,factorio_name,password_hash,created_at) VALUES(?,?,?,?,?,?)')
    .run('user-1', 'martin', 'Martin', 'MarkanMegaBuilder', 'unused', now);
  db.prepare('INSERT INTO sessions(id,token_hash,user_id,csrf_token,expires_at,created_at) VALUES(?,?,?,?,?,?)')
    .run('session-1', createHash('sha256').update(token).digest('hex'), 'user-1', 'csrf', '2099-01-01T00:00:00.000Z', now);
  const app = buildApp({ db, adapter: new MockFactoryAdapter() });
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const response = await fetch(`${address}/api/events/stream`, {
      headers: { cookie: `hal_session=${token}` }, signal: controller.signal
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /^text\/event-stream/);
    reader = response.body!.getReader();
    assert.match(await readUntil(reader, 'event: ready'), /retry: 3000/);

    const mutation = await app.inject({
      method: 'POST', url: '/api/messages', cookies: { hal_session: token },
      headers: { 'x-csrf-token': 'csrf' }, payload: { body: 'SSE test' }
    });
    assert.equal(mutation.statusCode, 201);
    const update = await readUntil(reader, 'message.created');
    assert.match(update, /event: update/);
  } finally {
    controller.abort();
    await reader?.cancel().catch(() => undefined);
    await app.close();
  }
});
