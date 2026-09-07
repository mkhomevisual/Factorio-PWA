export type ServerState = {
  online: boolean;
  version: string | null;
  gameState: 'running' | 'paused' | 'unknown';
  uptimeSeconds: number | null;
  lastSaveAt: string | null;
};

export type PlayerState = {
  factorioName: string;
  online: boolean;
  lastOnlineAt: string | null;
  playtimeSeconds: number;
  personalActivity: { handCrafted: number; mined: number; built: number; deaths: number };
};

export type ProductionCounter = {
  item: string;
  produced: number;
  consumed: number;
  productionRate: number;
  consumptionRate: number;
};
export type FactorySnapshot = {
  contractVersion: 2;
  generatedAt: string;
  server: ServerState;
  players: PlayerState[];
  sharedFactory: ProductionCounter[];
  events: Array<{ id: string; type: string; occurredAt: string; message: string }>;
  eventCursor?: string;
};

export type SafeRconQuery = 'players' | 'time' | 'version' | 'evolution' | 'admins' | 'whitelist';

export interface FactoryAdapter {
  getSnapshot(afterEventId?: string): Promise<FactorySnapshot>;
  save(): Promise<void>;
  sendMessage(message: string): Promise<void>;
  query(command: SafeRconQuery): Promise<string>;
}
