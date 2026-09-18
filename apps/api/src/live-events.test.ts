import assert from 'node:assert/strict';
import test from 'node:test';
import { formatSseEvent, LiveEventBroker } from './live-events.js';

test('broadcasts framed SSE updates and supports unsubscribe', () => {
  const broker = new LiveEventBroker();
  const received: string[] = [];
  const unsubscribe = broker.subscribe((update) => received.push(formatSseEvent(update)));
  broker.publish('task.created', { id: 'task-1' });
  unsubscribe();
  broker.publish('ignored');
  assert.equal(received.length, 1);
  assert.match(received[0], /^event: update\ndata: /);
  assert.match(received[0], /"topic":"task.created"/);
  assert.equal(broker.size, 0);
});
