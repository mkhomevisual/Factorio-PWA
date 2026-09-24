import type { FactorySnapshot } from '@hal/contracts';

export type {
  FactorySnapshot,
  LogisticNetworkState,
  PlayerState,
  PowerMetrics,
  ProductionCounter,
  QualityProductionCounter,
  ResearchState,
  ServerState,
  SpacePlatformState,
  SurfaceState,
  TelemetryProbeState,
  TelemetryCapability
} from '@hal/contracts';

export type SafeRconQuery = 'players' | 'time' | 'version' | 'evolution' | 'admins' | 'whitelist';

export interface FactoryAdapter {
  getSnapshot(afterEventId?: string): Promise<FactorySnapshot>;
  save(): Promise<void>;
  sendMessage(message: string): Promise<void>;
  query(command: SafeRconQuery): Promise<string>;
  close?(): void;
}
