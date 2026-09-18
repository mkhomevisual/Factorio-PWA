import type { FactoryAdapter, FactorySnapshot, ProductionCounter, SurfaceState } from './factory-adapter.js';
import type { SafeRconQuery } from './factory-adapter.js';

const startedAt = Date.now();
const baseCounters = [
  ['iron-plate', 214_880, 196_102], ['copper-plate', 160_200, 148_920],
  ['electronic-circuit', 89_340, 86_201], ['steel-plate', 31_220, 29_832],
  ['low-density-structure', 5_120, 4_820]
] as const;

function flow(entries: ReadonlyArray<readonly [string, number, number]>, elapsedMinutes: number, scale = 1): ProductionCounter[] {
  return entries.map(([item, produced, consumed], index) => ({
    item,
    produced: produced + elapsedMinutes * (index + 4) * 7 * scale,
    consumed: consumed + elapsedMinutes * (index + 4) * 6 * scale,
    productionRate: Math.round((3_400 - index * 510) * scale),
    consumptionRate: Math.round((3_070 - index * 470) * scale)
  }));
}

function mergeFlows(groups: ProductionCounter[][]): ProductionCounter[] {
  const merged = new Map<string, ProductionCounter>();
  for (const entries of groups) for (const entry of entries) {
    const current = merged.get(entry.item) ?? { item: entry.item, produced: 0, consumed: 0, productionRate: 0, consumptionRate: 0 };
    current.produced += entry.produced; current.consumed += entry.consumed;
    current.productionRate += entry.productionRate; current.consumptionRate += entry.consumptionRate;
    merged.set(entry.item, current);
  }
  return [...merged.values()].sort((left, right) => left.item.localeCompare(right.item));
}

export class MockFactoryAdapter implements FactoryAdapter {
  async getSnapshot(_afterEventId?: string): Promise<FactorySnapshot> {
    const elapsedMinutes = Math.floor((Date.now() - startedAt) / 60_000);
    const now = new Date();
    const nauvisItems = [
      ...flow(baseCounters, elapsedMinutes, 0.62),
      ...flow([
        ['automation-science-pack', 46_000, 41_200], ['logistic-science-pack', 39_400, 36_100],
        ['military-science-pack', 18_600, 15_900], ['chemical-science-pack', 31_800, 29_700],
        ['production-science-pack', 14_200, 12_900], ['utility-science-pack', 11_800, 10_400],
        ['space-science-pack', 9_400, 8_600]
      ], elapsedMinutes, 0.08)
    ];
    const vulcanusItems = flow([
      ['tungsten-plate', 18_200, 16_100], ['foundry', 420, 300], ['metallurgic-science-pack', 8_800, 8_120]
    ], elapsedMinutes, 0.34);
    const platformItems = flow([
      ['space-platform-foundation', 4_800, 4_050], ['carbonic-asteroid-chunk', 21_400, 19_900]
    ], elapsedMinutes, 0.18);
    const nauvisFluids = flow([
      ['petroleum-gas', 880_000, 842_000], ['sulfuric-acid', 310_000, 281_000], ['lubricant', 94_000, 87_500]
    ], elapsedMinutes, 2.4);
    const vulcanusFluids = flow([
      ['molten-iron', 540_000, 512_000], ['molten-copper', 390_000, 372_000], ['sulfuric-acid', 120_000, 112_000]
    ], elapsedMinutes, 1.6);
    const surfaces: SurfaceState[] = [
      {
        key: 'player:nauvis', forceName: 'player', surfaceName: 'nauvis', surfaceIndex: 1, kind: 'planet', planetName: 'nauvis', platformId: null,
        items: nauvisItems, itemQualities: [{ ...nauvisItems[2], quality: 'uncommon', produced: 2_480, productionRate: 38 }], fluids: nauvisFluids, pollution: 184_200, evolutionFactor: 0.42,
        power: { available: true, networkCount: 3, productionWatts: 486_000_000, consumptionWatts: 421_000_000, accumulatorChargeJoules: 31_500_000_000, accumulatorCapacityJoules: 40_000_000_000, producers: [{ prototype: 'steam-turbine', watts: 390_000_000 }, { prototype: 'solar-panel', watts: 96_000_000 }], consumers: [{ prototype: 'assembling-machine-3', watts: 240_000_000 }, { prototype: 'beacon', watts: 181_000_000 }] }
      },
      {
        key: 'player:vulcanus', forceName: 'player', surfaceName: 'vulcanus', surfaceIndex: 2, kind: 'planet', planetName: 'vulcanus', platformId: null,
        items: vulcanusItems, itemQualities: [], fluids: vulcanusFluids, pollution: 62_400, evolutionFactor: 0.18,
        power: { available: true, networkCount: 1, productionWatts: 228_000_000, consumptionWatts: 194_000_000, accumulatorChargeJoules: 8_100_000_000, accumulatorCapacityJoules: 12_000_000_000, producers: [{ prototype: 'steam-turbine', watts: 215_000_000 }, { prototype: 'solar-panel', watts: 13_000_000 }], consumers: [{ prototype: 'foundry', watts: 194_000_000 }] }
      },
      {
        key: 'player:orbital-hauler', forceName: 'player', surfaceName: 'orbital-hauler', surfaceIndex: 3, kind: 'platform', planetName: null, platformId: '7',
        items: platformItems, itemQualities: [], fluids: [], pollution: null, evolutionFactor: null,
        power: { available: true, networkCount: 1, productionWatts: 64_000_000, consumptionWatts: 51_000_000, accumulatorChargeJoules: 1_800_000_000, accumulatorCapacityJoules: 2_500_000_000, producers: [{ prototype: 'solar-panel', watts: 64_000_000 }], consumers: [{ prototype: 'crusher', watts: 51_000_000 }] }
      }
    ];
    return {
      contractVersion: 3,
      capabilities: ['item-flow', 'fluid-flow', 'quality-flow', 'surface-flow', 'research', 'space-platforms', 'power', 'pollution', 'event-ticks', 'logistics', 'probes', 'game-tasks'],
      instanceId: 'mock-space-age',
      generatedAtTick: Math.floor((Date.now() - startedAt) / 1000 * 60),
      generatedAt: now.toISOString(),
      server: { online: true, version: '2.0.77 (Space Age)', gameState: 'running', uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000), lastSaveAt: new Date(now.getTime() - 9 * 60_000).toISOString() },
      players: [
        { factorioName: 'MarkanMegaBuilder', forceName: 'player', online: true, lastOnlineAt: now.toISOString(), surfaceName: 'vulcanus', playtimeSeconds: 182_400, personalActivity: { handCrafted: 423, mined: 1840, built: 1121, deaths: 3 } },
        { factorioName: 'Hajnej', forceName: 'player', online: false, lastOnlineAt: new Date(now.getTime() - 75 * 60_000).toISOString(), surfaceName: 'nauvis', playtimeSeconds: 146_640, personalActivity: { handCrafted: 318, mined: 1220, built: 894, deaths: 1 } }
      ],
      sharedFactory: mergeFlows(surfaces.map((surface) => surface.items)),
      sharedFluids: mergeFlows(surfaces.map((surface) => surface.fluids)),
      surfaces,
      research: [{
        forceName: 'player',
        current: { technology: 'promethium-science-pack', level: 1, progress: 0.68, unitCount: 2_000, unitEnergy: 60, ingredients: [{ item: 'agricultural-science-pack', amount: 1 }, { item: 'electromagnetic-science-pack', amount: 1 }] },
        queue: ['promethium-science-pack', 'research-productivity']
      }],
      platforms: [{
        id: '7', name: 'Orbital Hauler', forceName: 'player', state: 'on_the_path', paused: false,
        location: null, lastLocation: 'nauvis', destination: 'vulcanus', connection: 'nauvis-vulcanus', distance: 0.43,
        speed: 0.012, weight: 1_840_000, damagedTiles: 3,
        cargo: [{ item: 'space-platform-foundation', quality: 'normal', count: 840 }, { item: 'rocket-fuel', quality: 'normal', count: 190 }]
      }],
      logisticNetworks: [{
        id: 'player:nauvis:17', forceName: 'player', surfaceName: 'nauvis', name: 'Nauvis main bus', x: 42, y: -18,
        totalItems: 154_745,
        contents: [{ item: 'iron-plate', quality: 'normal', count: 48_200 }, { item: 'electronic-circuit', quality: 'normal', count: 21_840 }, { item: 'automation-science-pack', quality: 'normal', count: 2_800 }, { item: 'logistic-science-pack', quality: 'normal', count: 1_950 }, { item: 'chemical-science-pack', quality: 'normal', count: 1_040 }, { item: 'production-science-pack', quality: 'normal', count: 525 }, { item: 'repair-pack', quality: 'normal', count: 180 }],
        logisticRobots: { available: 812, total: 1_040 }, constructionRobots: { available: 306, total: 420 }, chargingRobots: 14, waitingToChargeRobots: 3
      }, {
        id: 'player:vulcanus:23', forceName: 'player', surfaceName: 'vulcanus', name: 'Vulcanus foundry', x: -11, y: 63,
        totalItems: 53_160,
        contents: [{ item: 'tungsten-plate', quality: 'normal', count: 8_400 }, { item: 'metallurgic-science-pack', quality: 'normal', count: 1_240 }, { item: 'repair-pack', quality: 'normal', count: 24 }],
        logisticRobots: { available: 184, total: 260 }, constructionRobots: { available: 72, total: 96 }, chargingRobots: 8, waitingToChargeRobots: 11
      }],
      probes: [{
        id: 'probe-1082', name: 'Kyselina pro uran', entityName: 'storage-tank', entityType: 'storage-tank', forceName: 'player', surfaceName: 'nauvis', x: 118.5, y: -44.5,
        valid: true, status: 'normal', items: [], fluids: [{ name: 'sulfuric-acid', amount: 18_430 }], signals: [], power: null, logisticRobots: null, constructionRobots: null
      }, {
        id: 'probe-2044', name: 'Hlavní roboport', entityName: 'roboport', entityType: 'roboport', forceName: 'player', surfaceName: 'vulcanus', x: -12, y: 64,
        valid: true, status: 'working', items: [{ item: 'logistic-robot', quality: 'normal', count: 38 }], fluids: [], signals: [], power: null,
        logisticRobots: { available: 184, total: 260 }, constructionRobots: { available: 72, total: 96 }
      }],
      events: [
        { id: 'mock-space-age:1042', type: 'player.joined', tick: 1_042, occurredAt: new Date(now.getTime() - 4 * 60_000).toISOString(), message: 'MarkanMegaBuilder se připojil do hry.' },
        { id: 'mock-space-age:1041', type: 'research.finished', tick: 1_041, occurredAt: new Date(now.getTime() - 42 * 60_000).toISOString(), message: 'Dokončen výzkum: Rocket Turret.' }
      ],
      eventCursor: 'mock-space-age:1042'
    };
  }
  async save() { return; }
  async sendMessage(_message: string) { return; }
  async query(command: SafeRconQuery) {
    const output: Record<SafeRconQuery, string> = {
      players: 'Online players (1): MarkanMegaBuilder',
      time: 'Map age: 57 hours 12 minutes',
      version: 'Version: 2.0.77 (build 84539, expansion space-age)',
      evolution: 'Evolution factor on nauvis: 0.42',
      admins: 'Admins: MarkanMegaBuilder, Hajnej',
      whitelist: 'Whitelisted players: MarkanMegaBuilder, Hajnej'
    };
    return output[command];
  }
}
