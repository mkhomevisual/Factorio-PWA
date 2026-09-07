import type { FactoryAdapter, FactorySnapshot } from './factory-adapter.js';

const startedAt = Date.now();
const baseCounters = [
  ['iron-plate', 214_880, 196_102], ['copper-plate', 160_200, 148_920],
  ['electronic-circuit', 89_340, 86_201], ['steel-plate', 31_220, 29_832],
  ['low-density-structure', 5_120, 4_820]
] as const;

export class MockFactoryAdapter implements FactoryAdapter {
  async getSnapshot(_afterEventId?: string): Promise<FactorySnapshot> {
    const elapsedMinutes = Math.floor((Date.now() - startedAt) / 60_000);
    const now = new Date();
    return {
      contractVersion: 2,
      generatedAt: now.toISOString(),
      server: { online: true, version: '2.0.77 (Space Age)', gameState: 'running', uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000), lastSaveAt: new Date(now.getTime() - 9 * 60_000).toISOString() },
      players: [
        { factorioName: 'MarkanMegaBuilder', online: true, lastOnlineAt: now.toISOString(), playtimeSeconds: 182_400, personalActivity: { handCrafted: 423, mined: 1840, built: 1121, deaths: 3 } },
        { factorioName: 'Hajnej', online: false, lastOnlineAt: new Date(now.getTime() - 75 * 60_000).toISOString(), playtimeSeconds: 146_640, personalActivity: { handCrafted: 318, mined: 1220, built: 894, deaths: 1 } }
      ],
      sharedFactory: baseCounters.map(([item, produced, consumed], index) => ({
        item,
        produced: produced + elapsedMinutes * (index + 4) * 7,
        consumed: consumed + elapsedMinutes * (index + 4) * 6,
        productionRate: 3_400 - index * 510,
        consumptionRate: 3_070 - index * 470
      })),
      events: [
        { id: 'mock-1042', type: 'player.joined', occurredAt: new Date(now.getTime() - 4 * 60_000).toISOString(), message: 'MarkanMegaBuilder se připojil do hry.' },
        { id: 'mock-1041', type: 'research.finished', occurredAt: new Date(now.getTime() - 42 * 60_000).toISOString(), message: 'Dokončen výzkum: Rocket Turret.' }
      ]
    };
  }
  async save() { return; }
  async sendMessage(_message: string) { return; }
}
