import { open } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { AppDatabase } from './db.js';

type Cursor = { inode: number; offset: number };
type ParsedLogEvent = { type: string; message: string; playerName?: string };

function parseLine(line: string): ParsedLogEvent | null {
  const joined = line.match(/Player\s+(.+?)\s+joined the game/i);
  if (joined) return { type: 'player.joined', playerName: joined[1], message: `${joined[1]} se připojil do hry.` };
  const left = line.match(/Player\s+(.+?)\s+left the game/i);
  if (left) return { type: 'player.left', playerName: left[1], message: `${left[1]} opustil hru.` };
  if (/saving to /i.test(line)) return { type: 'save.started', message: 'Factorio zahájilo ukládání hry.' };
  if (/saving finished|saved successfully/i.test(line)) return { type: 'save.completed', message: 'Factorio dokončilo ukládání hry.' };
  const research = line.match(/research (?:finished|completed)[:\s]+(.+)$/i);
  if (research) return { type: 'research.finished', message: `Dokončen výzkum: ${research[1]}.` };
  if (/rocket.*launched/i.test(line)) return { type: 'rocket.launched', message: 'Byla vystřelena raketa.' };
  return null;
}

export class FactorioLogTailer {
  private busy = false;
  constructor(private readonly db: AppDatabase, private readonly path: string) {}

  async poll() {
    if (this.busy) return;
    this.busy = true;
    let file: Awaited<ReturnType<typeof open>> | undefined;
    try {
      file = await open(this.path, 'r');
      const metadata = await file.stat();
      const persisted = this.db.prepare('SELECT cursor FROM telemetry_cursors WHERE source=?').get('factorio-log') as { cursor: string } | undefined;
      // First contact reads only a bounded tail. Subsequent runs read from the
      // persisted byte offset and never load the complete log into memory.
      let cursor: Cursor = persisted ? JSON.parse(persisted.cursor) : { inode: metadata.ino, offset: Math.max(0, metadata.size - 128 * 1024) };
      if (cursor.inode !== metadata.ino || cursor.offset > metadata.size) cursor = { inode: metadata.ino, offset: 0 };
      if (cursor.offset === metadata.size) return;
      const readLength = Math.min(256 * 1024, metadata.size - cursor.offset);
      const newBytes = Buffer.allocUnsafe(readLength);
      const { bytesRead } = await file.read(newBytes, 0, readLength, cursor.offset);
      const chunk = newBytes.subarray(0, bytesRead);
      const finalNewline = chunk.lastIndexOf(10);
      if (finalNewline < 0) return;
      let parseStart = 0;
      if (!persisted && cursor.offset > 0) {
        const firstNewline = chunk.indexOf(10);
        parseStart = firstNewline < 0 ? finalNewline + 1 : firstNewline + 1;
      }
      const complete = chunk.subarray(parseStart, finalNewline + 1);
      const lines = complete.toString('utf8').split('\n').slice(-501, -1);
      const now = new Date().toISOString();
      const insert = this.db.prepare(`INSERT OR IGNORE INTO activity_events(id,source,event_type,actor_user_id,external_event_id,payload_json,occurred_at,created_at)
        VALUES(?,?,?,?,?,?,?,?)`);
      const actor = this.db.prepare('SELECT id FROM users WHERE factorio_name=?');
      const transaction = this.db.transaction(() => {
        let byteOffset = cursor.offset + parseStart;
        for (const line of lines) {
          const event = parseLine(line);
          if (event) {
            const user = event.playerName ? actor.get(event.playerName) as { id: string } | undefined : undefined;
            insert.run(randomUUID(), 'factorio-log', event.type, user?.id ?? null, `${metadata.ino}:${byteOffset}`, JSON.stringify({ message: event.message }), now, now);
          }
          byteOffset += Buffer.byteLength(line) + 1;
        }
        const next: Cursor = { inode: metadata.ino, offset: cursor.offset + finalNewline + 1 };
        this.db.prepare(`INSERT INTO telemetry_cursors(source,cursor,updated_at) VALUES(?,?,?) ON CONFLICT(source) DO UPDATE SET cursor=excluded.cursor,updated_at=excluded.updated_at`)
          .run('factorio-log', JSON.stringify(next), now);
      });
      transaction();
    } catch (error) {
      // Missing log is normal in mock/local environments. Do not leak paths or file contents.
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) console.warn('factorio log tail failed', error instanceof Error ? error.message : 'unknown error');
    } finally { await file?.close().catch(() => undefined); this.busy = false; }
  }
}
