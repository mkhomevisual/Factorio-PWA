import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openDatabase } from './db.js';
import { FactorioLogTailer } from './log-tailer.js';

test('baselines existing logs and reads only bytes appended afterwards', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'hal-log-tail-'));
  const path = join(directory, 'factorio-current.log');
  const lines = Array.from({ length: 700 }, (_, index) => `Player User${index} joined the game ${'.'.repeat(280)}`).join('\n') + '\n';
  writeFileSync(path, lines);
  const db = openDatabase(':memory:');
  const tailer = new FactorioLogTailer(db, path);
  try {
    await tailer.poll();
    const initial = (db.prepare("SELECT count(*) AS count FROM activity_events WHERE source='factorio-log'").get() as { count: number }).count;
    assert.equal(initial, 0);
    const cursor = JSON.parse((db.prepare("SELECT cursor FROM telemetry_cursors WHERE source='factorio-log'").get() as { cursor: string }).cursor) as { offset: number };
    assert.equal(cursor.offset, statSync(path).size);

    appendFileSync(path, 'Player LastUser joined the game\n');
    await tailer.poll();
    const afterAppend = (db.prepare("SELECT count(*) AS count FROM activity_events WHERE source='factorio-log'").get() as { count: number }).count;
    assert.equal(afterAppend, 1);

    renameSync(path, `${path}.previous`);
    writeFileSync(path, 'Saving to old-autosave\nSaving finished\n');
    await tailer.poll();
    const afterRotation = (db.prepare("SELECT count(*) AS count FROM activity_events WHERE source='factorio-log'").get() as { count: number }).count;
    assert.equal(afterRotation, 1);

    appendFileSync(path, 'Player NewUser joined the game\n');
    await tailer.poll();
    const afterRotatedAppend = (db.prepare("SELECT count(*) AS count FROM activity_events WHERE source='factorio-log'").get() as { count: number }).count;
    assert.equal(afterRotatedAppend, 2);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
