import type { AppDatabase } from './db.js';

export type LiveUpdate = { topic: string; at: string; detail?: object };
type Listener = (update: LiveUpdate) => void;

export class LiveEventBroker {
  private readonly listeners = new Set<Listener>();
  subscribe(listener: Listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  publish(topic: string, detail?: object) {
    const update = { topic, at: new Date().toISOString(), detail };
    for (const listener of this.listeners) listener(update);
  }
  get size() { return this.listeners.size; }
}

const brokers = new WeakMap<AppDatabase, LiveEventBroker>();
export function registerLiveBroker(db: AppDatabase, broker: LiveEventBroker) { brokers.set(db, broker); }
export function unregisterLiveBroker(db: AppDatabase) { brokers.delete(db); }
export function publishLive(db: AppDatabase, topic: string, detail?: object) { brokers.get(db)?.publish(topic, detail); }

export function formatSseEvent(update: LiveUpdate) {
  return `event: update\ndata: ${JSON.stringify(update)}\n\n`;
}
