import { readFile } from 'node:fs/promises';
import { executeFactorioRconCommand } from './factorio-rcon-client.js';
import type {
  FactoryAdapter,
  FactorySnapshot,
  LogisticNetworkState,
  PowerMetrics,
  ProductionCounter,
  SafeRconQuery,
  SpacePlatformState,
  SurfaceState,
  TelemetryProbeState,
  TelemetryCapability
} from './factory-adapter.js';
import type { Config } from './config.js';

const V3_PREFIX = 'HAL_TELEMETRY_V3:';
const V2_PREFIX = 'HAL_TELEMETRY_V2:';
const V1_PREFIX = 'HAL_TELEMETRY_V1:';
const ERROR_PREFIX = 'HAL_TELEMETRY_ERROR:';

const emptyPower = (): PowerMetrics => ({
  available: false,
  networkCount: 0,
  productionWatts: 0,
  consumptionWatts: 0,
  accumulatorChargeJoules: 0,
  accumulatorCapacityJoules: 0,
  producers: [],
  consumers: []
});

function normalizePower(value?: Partial<PowerMetrics> | null): PowerMetrics {
  if (!value) return emptyPower();
  const entries = (items: PowerMetrics['producers'] | undefined) => Array.isArray(items)
    ? items.filter((entry) => entry && typeof entry.prototype === 'string' && Number.isFinite(entry.watts)).map((entry) => ({ prototype: entry.prototype, watts: Math.max(0, Number(entry.watts)) }))
    : [];
  return {
    available: value.available ?? false,
    networkCount: Number.isFinite(value.networkCount) ? Math.max(0, Number(value.networkCount)) : 0,
    productionWatts: Number.isFinite(value.productionWatts) ? Math.max(0, Number(value.productionWatts)) : 0,
    consumptionWatts: Number.isFinite(value.consumptionWatts) ? Math.max(0, Number(value.consumptionWatts)) : 0,
    accumulatorChargeJoules: Number.isFinite(value.accumulatorChargeJoules) ? Math.max(0, Number(value.accumulatorChargeJoules)) : 0,
    accumulatorCapacityJoules: Number.isFinite(value.accumulatorCapacityJoules) ? Math.max(0, Number(value.accumulatorCapacityJoules)) : 0,
    producers: entries(value.producers),
    consumers: entries(value.consumers)
  };
}

function mergeFlows(groups: ProductionCounter[][]): ProductionCounter[] {
  const merged = new Map<string, ProductionCounter>();
  for (const group of groups) for (const entry of group) {
    const current = merged.get(entry.item) ?? { item: entry.item, produced: 0, consumed: 0, productionRate: 0, consumptionRate: 0 };
    current.produced += Math.max(0, entry.produced);
    current.consumed += Math.max(0, entry.consumed);
    current.productionRate += Math.max(0, entry.productionRate);
    current.consumptionRate += Math.max(0, entry.consumptionRate);
    merged.set(entry.item, current);
  }
  return [...merged.values()].sort((left, right) => left.item.localeCompare(right.item));
}

function eventTime(observedAt: string, generatedAtTick: number | null, tick?: number) {
  if (generatedAtTick === null || tick === undefined || tick > generatedAtTick) return observedAt;
  return new Date(new Date(observedAt).getTime() - (generatedAtTick - tick) / 60 * 1_000).toISOString();
}

type RawEvent = { id: string; type: string; tick?: number; playerName?: string; detail?: Record<string, unknown> };

function normalizeEvent(event: RawEvent, observedAt: string, generatedAtTick: number | null, instanceId: string | null) {
  const id = instanceId && !event.id.startsWith(`${instanceId}:`) ? `${instanceId}:${event.id}` : event.id;
  return {
    id,
    type: event.type,
    tick: event.tick,
    playerName: event.playerName,
    detail: event.detail,
    occurredAt: eventTime(observedAt, generatedAtTick, event.tick),
    message: eventMessage(event)
  };
}

export function parseTelemetryResponse(response: string, observedAt = new Date().toISOString()): FactorySnapshot {
  const lines = response.split(/\r?\n/);
  const telemetryError = lines.find((line) => line.startsWith(ERROR_PREFIX))?.slice(ERROR_PREFIX.length);
  if (telemetryError) throw new Error(`Telemetry mod failed: ${telemetryError}`);
  if (response.includes(V1_PREFIX)) throw new Error('HAL telemetry mod is outdated (V1); install hal-telemetry 0.2.0 or newer.');

  const v3 = lines.find((line) => line.startsWith(V3_PREFIX))?.slice(V3_PREFIX.length);
  if (v3) {
    const raw = JSON.parse(v3) as {
      contractVersion: number;
      capabilities?: TelemetryCapability[];
      instanceId?: string;
      generatedAtTick?: number;
      server: FactorySnapshot['server'];
      players?: Array<Omit<FactorySnapshot['players'][number], 'lastOnlineAt'> & { lastOnlineAtTick?: number }>;
      scopes?: Array<{
        forceName: string;
        surface: { name: string; index: number; kind?: SurfaceState['kind']; planetName?: string; platformId?: string };
        items?: ProductionCounter[];
        itemQualities?: SurfaceState['itemQualities'];
        fluids?: ProductionCounter[];
        pollution?: number;
        evolutionFactor?: number;
        power?: PowerMetrics;
      }>;
      research?: Array<Partial<FactorySnapshot['research'][number]> & Pick<FactorySnapshot['research'][number], 'forceName'>>;
      platforms?: Array<Partial<SpacePlatformState> & Pick<SpacePlatformState, 'id' | 'name' | 'forceName' | 'state'>>;
      logisticNetworks?: Array<Partial<LogisticNetworkState> & Pick<LogisticNetworkState, 'id' | 'forceName' | 'surfaceName'>>;
      probes?: Array<Partial<TelemetryProbeState> & Pick<TelemetryProbeState, 'id' | 'name' | 'entityName' | 'entityType' | 'forceName' | 'surfaceName' | 'x' | 'y'>>;
      events: { highWatermark: string; items: RawEvent[] };
    };
    if (raw.contractVersion !== 3 || !Array.isArray(raw.scopes) || !Array.isArray(raw.events?.items)) throw new Error('Unsupported HAL telemetry V3 contract.');
    const generatedAtTick = Number.isFinite(raw.generatedAtTick) ? Number(raw.generatedAtTick) : null;
    const instanceId = raw.instanceId ?? null;
    const surfaces: SurfaceState[] = raw.scopes.map((scope) => ({
      key: `${scope.forceName}:${scope.surface.name}`,
      forceName: scope.forceName,
      surfaceName: scope.surface.name,
      surfaceIndex: scope.surface.index,
      kind: scope.surface.kind ?? 'other',
      planetName: scope.surface.planetName ?? null,
      platformId: scope.surface.platformId ? String(scope.surface.platformId) : null,
      items: Array.isArray(scope.items) ? scope.items : [],
      itemQualities: Array.isArray(scope.itemQualities) ? scope.itemQualities : [],
      fluids: Array.isArray(scope.fluids) ? scope.fluids : [],
      pollution: Number.isFinite(scope.pollution) ? Number(scope.pollution) : null,
      evolutionFactor: Number.isFinite(scope.evolutionFactor) ? Number(scope.evolutionFactor) : null,
      power: normalizePower(scope.power)
    }));
    return {
      contractVersion: 3,
      capabilities: raw.capabilities ?? [],
      instanceId,
      generatedAtTick,
      generatedAt: observedAt,
      server: {
        online: raw.server?.online ?? true,
        version: raw.server?.version ?? null,
        gameState: raw.server?.gameState ?? 'unknown',
        uptimeSeconds: raw.server?.uptimeSeconds ?? null,
        lastSaveAt: raw.server?.lastSaveAt ?? null
      },
      players: (raw.players ?? []).map((player) => ({
        ...player,
        lastOnlineAt: player.online ? observedAt : player.lastOnlineAtTick === undefined ? null : eventTime(observedAt, generatedAtTick, player.lastOnlineAtTick)
      })),
      sharedFactory: mergeFlows(surfaces.map((scope) => scope.items)),
      sharedFluids: mergeFlows(surfaces.map((scope) => scope.fluids)),
      surfaces,
      research: Array.isArray(raw.research) ? raw.research.map((entry) => {
        const current = entry.current && typeof entry.current.technology === 'string' ? {
          technology: entry.current.technology,
          level: Number.isFinite(entry.current.level) ? Number(entry.current.level) : 0,
          progress: Number.isFinite(entry.current.progress) ? Math.max(0, Math.min(1, Number(entry.current.progress))) : 0,
          unitCount: Number.isFinite(entry.current.unitCount) ? Math.max(0, Number(entry.current.unitCount)) : 0,
          unitEnergy: Number.isFinite(entry.current.unitEnergy) ? Math.max(0, Number(entry.current.unitEnergy)) : 0,
          ingredients: Array.isArray(entry.current.ingredients) ? entry.current.ingredients.filter((ingredient) => ingredient && typeof ingredient.item === 'string').map((ingredient) => ({ item: ingredient.item, amount: Number.isFinite(ingredient.amount) ? Math.max(0, Number(ingredient.amount)) : 0 })) : []
        } : null;
        return { forceName: entry.forceName, current, queue: Array.isArray(entry.queue) ? entry.queue.filter((technology): technology is string => typeof technology === 'string') : [] };
      }) : [],
      platforms: Array.isArray(raw.platforms) ? raw.platforms.map((platform) => ({
        id: String(platform.id), name: platform.name, forceName: platform.forceName, state: platform.state,
        paused: platform.paused ?? false, location: platform.location ?? null, lastLocation: platform.lastLocation ?? null,
        destination: platform.destination ?? null, connection: platform.connection ?? null, distance: platform.distance ?? null,
        speed: platform.speed ?? 0, weight: platform.weight ?? 0, damagedTiles: platform.damagedTiles ?? 0,
        cargo: Array.isArray(platform.cargo) ? platform.cargo : []
      })) : [],
      logisticNetworks: Array.isArray(raw.logisticNetworks) ? raw.logisticNetworks.map((network) => ({
        id: String(network.id), forceName: network.forceName, surfaceName: network.surfaceName, name: network.name ?? null,
        x: network.x ?? null, y: network.y ?? null, totalItems: network.totalItems ?? 0,
        contents: Array.isArray(network.contents) ? network.contents : [],
        logisticRobots: network.logisticRobots ?? { available: 0, total: 0 },
        constructionRobots: network.constructionRobots ?? { available: 0, total: 0 },
        chargingRobots: network.chargingRobots ?? 0, waitingToChargeRobots: network.waitingToChargeRobots ?? 0
      })) : [],
      probes: Array.isArray(raw.probes) ? raw.probes.map((probe) => ({
        id: String(probe.id), name: probe.name, entityName: probe.entityName, entityType: probe.entityType,
        forceName: probe.forceName, surfaceName: probe.surfaceName, x: probe.x, y: probe.y,
        valid: probe.valid ?? false, status: probe.status ?? null,
        items: Array.isArray(probe.items) ? probe.items : [], fluids: Array.isArray(probe.fluids) ? probe.fluids : [],
        signals: Array.isArray(probe.signals) ? probe.signals : [], power: probe.power ? normalizePower(probe.power) : null,
        logisticRobots: probe.logisticRobots ?? null, constructionRobots: probe.constructionRobots ?? null
      })) : [],
      eventCursor: raw.events.highWatermark,
      events: raw.events.items.map((event) => normalizeEvent(event, observedAt, generatedAtTick, instanceId))
    };
  }

  const v2 = lines.find((line) => line.startsWith(V2_PREFIX))?.slice(V2_PREFIX.length);
  if (!v2) throw new Error('Telemetry mod did not return a HAL_TELEMETRY_V3 or HAL_TELEMETRY_V2 response.');
  const raw = JSON.parse(v2) as {
    contractVersion: number;
    server: FactorySnapshot['server'];
    players: FactorySnapshot['players'];
    sharedFactory: FactorySnapshot['sharedFactory'];
    events: { highWatermark: string; items: RawEvent[] };
  };
  if (raw.contractVersion !== 2 || !Array.isArray(raw.sharedFactory) || !Array.isArray(raw.events?.items)) throw new Error('Unsupported HAL telemetry V2 contract.');
  return {
    contractVersion: 2,
    capabilities: ['item-flow'],
    instanceId: null,
    generatedAtTick: null,
    generatedAt: observedAt,
    server: {
      online: raw.server.online,
      version: raw.server.version ?? null,
      gameState: raw.server.gameState ?? 'unknown',
      uptimeSeconds: raw.server.uptimeSeconds ?? null,
      lastSaveAt: raw.server.lastSaveAt ?? null
    },
    players: raw.players,
    sharedFactory: raw.sharedFactory,
    sharedFluids: [],
    surfaces: [],
    research: [],
    platforms: [],
    logisticNetworks: [],
    probes: [],
    eventCursor: raw.events.highWatermark,
    events: raw.events.items.map((event) => normalizeEvent(event, observedAt, null, null))
  };
}

export class FactorioRconAdapter implements FactoryAdapter {
  constructor(private readonly options: Config) {}

  private async command(command: string): Promise<string> {
    const password = (await readFile(this.options.RCON_PASSWORD_FILE, 'utf8')).trim();
    return executeFactorioRconCommand({
      host: this.options.FACTORIO_RCON_HOST,
      port: this.options.FACTORIO_RCON_PORT,
      password,
      timeoutMs: 8_000
    }, command);
  }

  async getSnapshot(afterEventId = '0'): Promise<FactorySnapshot> {
    const response = await this.command(`/hal-telemetry snapshot ${afterEventId}`);
    return parseTelemetryResponse(response);
  }

  async save() { await this.command('/server-save'); }
  async sendMessage(message: string) {
    const safe = message.replace(/[\r\n]/g, ' ').slice(0, 250);
    await this.command(`[HAL] ${safe}`);
  }

  async query(query: SafeRconQuery) {
    const commands: Record<SafeRconQuery, string> = {
      players: '/players online',
      time: '/time',
      version: '/version',
      evolution: '/evolution',
      admins: '/admins',
      whitelist: '/whitelist get'
    };
    return this.command(commands[query]);
  }
}

function eventMessage(event: RawEvent) {
  if (event.type === 'player.joined') return `${event.playerName ?? 'Hráč'} se připojil do hry.`;
  if (event.type === 'player.left') return `${event.playerName ?? 'Hráč'} opustil hru.`;
  if (event.type === 'player.surface-changed') return `${event.playerName ?? 'Hráč'} se přesunul na ${String(event.detail?.surface ?? 'jiný povrch')}.`;
  if (event.type === 'research.finished') return `Dokončen výzkum: ${String(event.detail?.research ?? 'neznámý')}.`;
  if (event.type === 'research.started') return `Zahájen výzkum: ${String(event.detail?.research ?? 'neznámý')}.`;
  if (event.type === 'rocket.launched') return 'Byla vystřelena raketa.';
  if (event.type === 'player.died') return `${event.playerName ?? 'Hráč'} zemřel.`;
  if (event.type === 'space-platform.state-changed') return `Platforma ${String(event.detail?.platform ?? '')}: ${String(event.detail?.state ?? 'změna stavu')}.`;
  if (event.type === 'task.create-requested') return `${event.playerName ?? 'Hráč'} zadal ze hry úkol: ${String(event.detail?.title ?? '')}.`;
  if (event.type === 'task.complete-requested') return `${event.playerName ?? 'Hráč'} dokončil ze hry úkol ${String(event.detail?.code ?? '')}.`;
  if (event.type === 'probe.created') return `${event.playerName ?? 'Hráč'} vytvořil sondu ${String(event.detail?.name ?? '')}.`;
  if (event.type === 'probe.removed') return `${event.playerName ?? 'Hráč'} odebral sondu ${String(event.detail?.name ?? '')}.`;
  return event.type;
}
