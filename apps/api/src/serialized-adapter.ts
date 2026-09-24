import type { FactoryAdapter, FactorySnapshot, SafeRconQuery } from './factory-adapter.js';

export type RconQueueMetrics = {
  commands: number;
  completed: number;
  failed: number;
  active: number;
  queued: number;
  lastOperation: string | null;
  lastDurationMs: number | null;
  maxConcurrency: number;
};

/** Serializes every adapter operation through one process-wide queue. */
export class SerializedFactoryAdapter implements FactoryAdapter {
  private tail: Promise<void> = Promise.resolve();
  private readonly counters: RconQueueMetrics = {
    commands: 0, completed: 0, failed: 0, active: 0, queued: 0,
    lastOperation: null, lastDurationMs: null, maxConcurrency: 0
  };

  constructor(private readonly inner: FactoryAdapter) {}

  metrics(): RconQueueMetrics { return { ...this.counters }; }

  private enqueue<T>(operation: string, work: () => Promise<T>): Promise<T> {
    this.counters.commands += 1;
    this.counters.queued += 1;
    const run = this.tail.catch(() => undefined).then(async () => {
      this.counters.queued -= 1;
      this.counters.active += 1;
      this.counters.maxConcurrency = Math.max(this.counters.maxConcurrency, this.counters.active);
      const startedAt = performance.now();
      let ok = false;
      try {
        const result = await work();
        this.counters.completed += 1;
        ok = true;
        return result;
      } catch (error) {
        this.counters.failed += 1;
        throw error;
      } finally {
        this.counters.active -= 1;
        this.counters.lastOperation = operation;
        this.counters.lastDurationMs = Math.round(performance.now() - startedAt);
        console.info(JSON.stringify({ event: 'hal.rcon.operation', operation, ok, durationMs: this.counters.lastDurationMs, queued: this.counters.queued }));
      }
    });
    this.tail = run.then(() => undefined, () => undefined);
    return run;
  }

  getSnapshot(afterEventId?: string): Promise<FactorySnapshot> {
    return this.enqueue('telemetry.snapshot', () => this.inner.getSnapshot(afterEventId));
  }

  save(): Promise<void> { return this.enqueue('server.save', () => this.inner.save()); }
  sendMessage(message: string): Promise<void> { return this.enqueue('server.message', () => this.inner.sendMessage(message)); }
  query(command: SafeRconQuery): Promise<string> { return this.enqueue(`server.query.${command}`, () => this.inner.query(command)); }
  close() { this.inner.close?.(); }
}
