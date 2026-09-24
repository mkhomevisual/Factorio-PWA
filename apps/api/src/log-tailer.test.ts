import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openDatabase } from './db.js';
import { FactorioLogTailer } from './log-tailer.js';

test('reads a bounded initial tail and then only appended log bytes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'hal-log-tail-'));
  const path = join(directory, 'factorio-current.log');
  const lines = Array.from({ length: 700 }, (_, index) => `Player User${index} joined the game ${'.'.repeat(280)}`).join('\n') + '\n';
  writeFileSync(path, lines);
  const db = openDatabase(':memory:');
  const tailer = new FactorioLogTailer(db, path);
  try {
    await tailer.poll();
    const initial = (db.prepare("SELECT count(*) AS count FROM activity_events WHERE source='factorio-log'").get() as { count: number }).count;
    assert.ok(initial > 0 && initial <= 500);
    const cursor = JSON.parse((db.prepare("SELECT cursor FROM telemetry_cursors WHERE source='factorio-log'").get() as { cursor: string }).cursor) as { offset: number };
    assert.equal(cursor.offset, statSync(path).size);

    appendFileSync(path, 'Player LastUser joined the game\n');
    await tailer.poll();
    const afterAppend = (db.prepare("SELECT count(*) AS count FROM activity_events WHERE source='factorio-log'").get() as { count: number }).count;
    assert.equal(afterAppend, initial + 1);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
