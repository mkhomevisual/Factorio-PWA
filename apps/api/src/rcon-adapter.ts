import { readFile } from 'node:fs/promises';
import { Rcon } from 'rcon-client';
import type { FactoryAdapter, FactorySnapshot } from './factory-adapter.js';
import type { Config } from './config.js';

const PREFIX = 'HAL_TELEMETRY_V1:';

export class FactorioRconAdapter implements FactoryAdapter {
  constructor(private readonly options: Config) {}

  private async command(command: string): Promise<string> {
    const password = (await readFile(this.options.RCON_PASSWORD_FILE, 'utf8')).trim();
    const rcon = await Rcon.connect({ host: this.options.FACTORIO_RCON_HOST, port: this.options.FACTORIO_RCON_PORT, password, timeout: 8_000 });
    try { return await rcon.send(command); } finally { await rcon.end(); }
  }

  async getSnapshot(afterEventId = '0'): Promise<FactorySnapshot> {
    const response = await this.command(`/hal-telemetry snapshot ${afterEventId}`);
    const json = response.split(/\r?\n/).find((line) => line.startsWith(PREFIX))?.slice(PREFIX.length);
    if (!json) throw new Error('Telemetry mod did not return a HAL_TELEMETRY_V1 response.');
    const raw = JSON.parse(json) as {
      contractVersion: number; server: FactorySnapshot['server']; players: FactorySnapshot['players']; sharedFactory: FactorySnapshot['sharedFactory'];
      events: { highWatermark: string; items: Array<{ id: string; type: string; playerName?: string; detail?: { research?: string } }> };
    };
    if (raw.contractVersion !== 1 || !Array.isArray(raw.events?.items)) throw new Error('Unsupported HAL telemetry contract.');
    const observedAt = new Date().toISOString();
    return {
      contractVersion: 1, generatedAt: observedAt, server: raw.server, players: raw.players, sharedFactory: raw.sharedFactory,
      eventCursor: raw.events.highWatermark,
      events: raw.events.items.map((event) => ({ id: event.id, type: event.type, occurredAt: observedAt, message: eventMessage(event) }))
    };
  }

  async save() { await this.command('/save'); }
  async sendMessage(message: string) {
    const safe = message.replace(/[\r\n]/g, ' ').slice(0, 250);
    await this.command(`/silent-command game.print(${JSON.stringify('[HAL] ' + safe)})`);
  }
}

function eventMessage(event: { type: string; playerName?: string; detail?: { research?: string } }) {
  if (event.type === 'player.joined') return `${event.playerName ?? 'Hráč'} se připojil do hry.`;
  if (event.type === 'player.left') return `${event.playerName ?? 'Hráč'} opustil hru.`;
  if (event.type === 'research.finished') return `Dokončen výzkum: ${event.detail?.research ?? 'neznámý'}.`;
  if (event.type === 'rocket.launched') return 'Byla vystřelena raketa.';
  if (event.type === 'player.died') return `${event.playerName ?? 'Hráč'} zemřel.`;
  return event.type;
}
