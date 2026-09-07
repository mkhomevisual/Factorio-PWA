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

  async getSnapshot(): Promise<FactorySnapshot> {
    const response = await this.command('/hal-telemetry snapshot 1');
    const json = response.split(/\r?\n/).find((line) => line.startsWith(PREFIX))?.slice(PREFIX.length);
    if (!json) throw new Error('Telemetry mod did not return a HAL_TELEMETRY_V1 response.');
    return JSON.parse(json) as FactorySnapshot;
  }

  async save() { await this.command('/save'); }
  async sendMessage(message: string) {
    const safe = message.replace(/[\r\n]/g, ' ').slice(0, 250);
    await this.command(`/silent-command game.print(${JSON.stringify('[HAL] ' + safe)})`);
  }
}
