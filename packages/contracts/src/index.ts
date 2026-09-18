export type TelemetryCapability =
  | 'item-flow'
  | 'fluid-flow'
  | 'quality-flow'
  | 'surface-flow'
  | 'research'
  | 'space-platforms'
  | 'power'
  | 'pollution'
  | 'event-ticks'
  | 'logistics'
  | 'probes'
  | 'game-tasks';

export type FlowKind = 'item' | 'fluid';

export type ServerState = {
  online: boolean;
  version: string | null;
  gameState: 'running' | 'paused' | 'unknown';
  uptimeSeconds: number | null;
  lastSaveAt: string | null;
};

export type PersonalActivity = {
  handCrafted: number;
  mined: number;
  built: number;
  deaths: number;
};

export type PlayerState = {
  factorioName: string;
  forceName?: string;
  online: boolean;
  lastOnlineAt: string | null;
  playtimeSeconds: number;
  surfaceName?: string | null;
  personalActivity: PersonalActivity;
};

// `item` is the Factorio prototype name. The field name is retained for API
// compatibility and is also used for fluid prototypes.
export type ProductionCounter = {
  item: string;
  produced: number;
  consumed: number;
  productionRate: number;
  consumptionRate: number;
};

// Sparse breakdown of non-normal qualities. Normal quality is the aggregate
// counter minus these entries, avoiding a large duplicate telemetry payload.
export type QualityProductionCounter = ProductionCounter & { quality: string };

export type PowerMetrics = {
  available: boolean;
  networkCount: number;
  productionWatts: number;
  consumptionWatts: number;
  accumulatorChargeJoules: number;
  accumulatorCapacityJoules: number;
  producers: Array<{ prototype: string; watts: number }>;
  consumers: Array<{ prototype: string; watts: number }>;
};

export type SurfaceState = {
  key: string;
  forceName: string;
  surfaceName: string;
  surfaceIndex: number;
  kind: 'planet' | 'platform' | 'other';
  planetName: string | null;
  platformId: string | null;
  items: ProductionCounter[];
  itemQualities: QualityProductionCounter[];
  fluids: ProductionCounter[];
  pollution: number | null;
  evolutionFactor: number | null;
  power: PowerMetrics;
};

export type ResearchIngredient = { item: string; amount: number };

export type ResearchState = {
  forceName: string;
  current: null | {
    technology: string;
    level: number;
    progress: number;
    unitCount: number;
    unitEnergy: number;
    ingredients: ResearchIngredient[];
  };
  queue: string[];
};

export type PlatformCargo = { item: string; quality: string | null; count: number };

export type SpacePlatformState = {
  id: string;
  name: string;
  forceName: string;
  state: string;
  paused: boolean;
  location: string | null;
  lastLocation: string | null;
  destination: string | null;
  connection: string | null;
  distance: number | null;
  speed: number;
  weight: number;
  damagedTiles: number;
  cargo: PlatformCargo[];
};

export type LogisticNetworkState = {
  id: string;
  forceName: string;
  surfaceName: string;
  name: string | null;
  x: number | null;
  y: number | null;
  totalItems: number;
  contents: PlatformCargo[];
  logisticRobots: { available: number; total: number };
  constructionRobots: { available: number; total: number };
  chargingRobots: number;
  waitingToChargeRobots: number;
};

export type TelemetryProbeState = {
  id: string;
  name: string;
  entityName: string;
  entityType: string;
  forceName: string;
  surfaceName: string;
  x: number;
  y: number;
  valid: boolean;
  status: string | null;
  items: PlatformCargo[];
  fluids: Array<{ name: string; amount: number }>;
  signals: Array<{ type: string; name: string; quality: string | null; count: number }>;
  power: PowerMetrics | null;
  logisticRobots: { available: number; total: number } | null;
  constructionRobots: { available: number; total: number } | null;
};

export type FactoryEvent = {
  id: string;
  type: string;
  occurredAt: string;
  tick?: number;
  message: string;
  playerName?: string;
  detail?: Record<string, unknown>;
};

export type FactorySnapshot = {
  contractVersion: 2 | 3;
  capabilities: TelemetryCapability[];
  instanceId: string | null;
  generatedAtTick: number | null;
  generatedAt: string;
  server: ServerState;
  players: PlayerState[];
  sharedFactory: ProductionCounter[];
  sharedFluids: ProductionCounter[];
  surfaces: SurfaceState[];
  research: ResearchState[];
  platforms: SpacePlatformState[];
  logisticNetworks: LogisticNetworkState[];
  probes: TelemetryProbeState[];
  events: FactoryEvent[];
  eventCursor?: string;
};

export type ProductionRange = '1m' | '15m' | '1h' | '6h' | '24h' | '7d' | '30d' | '1y';

export type OperationEntityType = 'surface' | 'platform' | 'logistic-network';

export type OperationPreference = {
  entityType: OperationEntityType;
  entityKey: string;
  ownerUserId: string | null;
  icon: 'factory' | 'planet' | 'rocket' | 'power' | 'logistics' | 'star' | 'shield' | 'train';
  accentColor: string;
  sortOrder: number;
};

export type EnergyHistorySeries = {
  surfaceKey: string;
  points: Array<{ at: string; productionWatts: number; consumptionWatts: number }>;
};

export type OperationsResponse = {
  generatedAt: string;
  capabilities: TelemetryCapability[];
  instanceId: string | null;
  surfaces: Array<SurfaceState & { players: string[] }>;
  research: Array<ResearchState & { scienceRate: number; etaSeconds: number | null }>;
  platforms: SpacePlatformState[];
  logisticNetworks: Array<LogisticNetworkState & {
    shortages: Array<{ ruleId: string; item: string; minimumAmount: number; currentAmount: number }>;
  }>;
  probes: TelemetryProbeState[];
  profiles: Array<{ id: string; displayName: string; factorioName: string; color: string }>;
  preferences: OperationPreference[];
  energyHistory: EnergyHistorySeries[];
};

export type BlueprintInspection = {
  kind: 'blueprint' | 'blueprint-book' | 'deconstruction-planner' | 'upgrade-planner';
  label: string | null;
  description: string | null;
  version: string | null;
  entityCount: number;
  tileCount: number;
  wireCount: number;
  entities: Array<{ name: string; count: number }>;
  tiles: Array<{ name: string; count: number }>;
  icons: Array<{ type: string; name: string }>;
  bounds: { width: number; height: number } | null;
  bookEntries: number;
  preview: Array<{ name: string; x: number; y: number }>;
};
