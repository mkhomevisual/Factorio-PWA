import { randomUUID } from 'node:crypto';
import type { FlowKind } from '@hal/contracts';
import type { AppDatabase } from './db.js';
import type { FactorySnapshot, ProductionCounter } from './factory-adapter.js';

export type StoredFlowRollup = {
  bucketStart: string;
  item: string;
  producedAmount: number;
  consumedAmount: number;
  productionRate: number;
  consumptionRate: number;
  sampleCount: number;
};

function positiveDelta(current: number, previous: number) {
  return current >= previous ? current - previous : 0;
}

function bucketStart(at: string, seconds: 3600 | 86400) {
  const milliseconds = seconds * 1_000;
  return new Date(Math.floor(new Date(at).getTime() / milliseconds) * milliseconds).toISOString();
}

function flows(snapshot: FactorySnapshot | null, kind: FlowKind): ProductionCounter[] {
  if (!snapshot) return [];
  return kind === 'item' ? snapshot.sharedFactory : snapshot.sharedFluids;
}

export function persistTelemetryMetrics(db: AppDatabase, snapshot: FactorySnapshot, previous: FactorySnapshot | null, collectedAt: string) {
  const upsert = db.prepare(`INSERT INTO telemetry_flow_rollups(
      bucket_start,bucket_seconds,flow_kind,prototype,produced_amount,consumed_amount,production_rate_sum,consumption_rate_sum,sample_count
    ) VALUES(?,?,?,?,?,?,?,?,1)
    ON CONFLICT(bucket_start,bucket_seconds,flow_kind,prototype) DO UPDATE SET
      produced_amount=produced_amount+excluded.produced_amount,
      consumed_amount=consumed_amount+excluded.consumed_amount,
      production_rate_sum=production_rate_sum+excluded.production_rate_sum,
      consumption_rate_sum=consumption_rate_sum+excluded.consumption_rate_sum,
      sample_count=sample_count+1`);
  const insertSurface = db.prepare(`INSERT INTO telemetry_surface_samples(
      id,collected_at,scope_key,force_name,surface_name,surface_kind,planet_name,platform_id,pollution,evolution_factor,
      power_available,network_count,production_watts,consumption_watts,accumulator_charge_joules,accumulator_capacity_joules
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  db.transaction(() => {
    for (const kind of ['item', 'fluid'] as const) {
      const prior = new Map(flows(previous, kind).map((entry) => [entry.item, entry]));
      for (const entry of flows(snapshot, kind)) {
        const earlier = prior.get(entry.item);
        const produced = earlier ? positiveDelta(entry.produced, earlier.produced) : 0;
        const consumed = earlier ? positiveDelta(entry.consumed, earlier.consumed) : 0;
        for (const seconds of [3600, 86400] as const) {
          upsert.run(
            bucketStart(collectedAt, seconds), seconds, kind, entry.item,
            produced, consumed, Math.max(0, entry.productionRate), Math.max(0, entry.consumptionRate)
          );
        }
      }
    }

    for (const surface of snapshot.surfaces) {
      insertSurface.run(
        randomUUID(), collectedAt, surface.key, surface.forceName, surface.surfaceName, surface.kind,
        surface.planetName, surface.platformId, surface.pollution, surface.evolutionFactor,
        surface.power.available ? 1 : 0, surface.power.networkCount, surface.power.productionWatts,
        surface.power.consumptionWatts, surface.power.accumulatorChargeJoules, surface.power.accumulatorCapacityJoules
      );
    }
    db.prepare("DELETE FROM telemetry_surface_samples WHERE collected_at < datetime('now', '-48 hours')").run();
  })();
}

export function listFlowRollups(db: AppDatabase, kind: FlowKind, since: string, bucketSeconds: 3600 | 86400): StoredFlowRollup[] {
  const rows = db.prepare(`SELECT bucket_start,prototype,produced_amount,consumed_amount,production_rate_sum,consumption_rate_sum,sample_count
    FROM telemetry_flow_rollups WHERE flow_kind=? AND bucket_seconds=? AND bucket_start>=? ORDER BY bucket_start,prototype`).all(kind, bucketSeconds, since) as Array<{
      bucket_start: string; prototype: string; produced_amount: number; consumed_amount: number;
      production_rate_sum: number; consumption_rate_sum: number; sample_count: number;
    }>;
  return rows.map((row) => ({
    bucketStart: row.bucket_start,
    item: row.prototype,
    producedAmount: row.produced_amount,
    consumedAmount: row.consumed_amount,
    productionRate: row.sample_count ? row.production_rate_sum / row.sample_count : 0,
    consumptionRate: row.sample_count ? row.consumption_rate_sum / row.sample_count : 0,
    sampleCount: row.sample_count
  }));
}
