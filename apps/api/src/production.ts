import type { ProductionCounter } from './factory-adapter.js';

export type StoredProductionSnapshot = {
  collectedAt: string;
  sharedFactory: ProductionCounter[];
};

export type ProductionItemSummary = {
  item: string;
  amount: number;
  rate: number;
};

function positiveDelta(current: number, previous: number) {
  return Math.max(0, current - previous);
}

function downsample<T>(values: T[], maximum = 240): T[] {
  if (values.length <= maximum) return values;
  const stride = Math.ceil(values.length / maximum);
  return values.filter((_value, index) => index % stride === 0 || index === values.length - 1);
}

export function summarizeProduction(snapshots: StoredProductionSnapshot[]) {
  const latest = snapshots.at(-1);
  const first = snapshots[0];
  const points = downsample(snapshots.map((entry) => ({
    at: entry.collectedAt,
    productionRate: Math.round(entry.sharedFactory.reduce((sum, item) => sum + Math.max(0, item.productionRate), 0)),
    consumptionRate: Math.round(entry.sharedFactory.reduce((sum, item) => sum + Math.max(0, item.consumptionRate), 0))
  })));

  if (!latest) {
    return { points, topProduced: [], topConsumed: [], sampleCount: 0, basis: 'empty' as const, lastUpdatedAt: null };
  }

  const initial = new Map((first?.sharedFactory ?? []).map((item) => [item.item, item]));
  const hasInterval = snapshots.length >= 2;
  const produced: ProductionItemSummary[] = [];
  const consumed: ProductionItemSummary[] = [];

  for (const item of latest.sharedFactory) {
    const previous = initial.get(item.item);
    const producedAmount = hasInterval ? positiveDelta(item.produced, previous?.produced ?? 0) : Math.max(0, item.productionRate);
    const consumedAmount = hasInterval ? positiveDelta(item.consumed, previous?.consumed ?? 0) : Math.max(0, item.consumptionRate);
    if (producedAmount > 0 || item.productionRate > 0) produced.push({ item: item.item, amount: producedAmount, rate: Math.max(0, item.productionRate) });
    if (consumedAmount > 0 || item.consumptionRate > 0) consumed.push({ item: item.item, amount: consumedAmount, rate: Math.max(0, item.consumptionRate) });
  }

  produced.sort((left, right) => right.amount - left.amount || right.rate - left.rate);
  consumed.sort((left, right) => right.amount - left.amount || right.rate - left.rate);
  return {
    points,
    topProduced: produced.slice(0, 10),
    topConsumed: consumed.slice(0, 10),
    sampleCount: snapshots.length,
    basis: hasInterval ? 'interval' as const : 'current' as const,
    lastUpdatedAt: latest.collectedAt
  };
}
