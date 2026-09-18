import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import test from 'node:test';
import { inspectBlueprintString } from './blueprint-inspector.js';

function encode(value: object) { return `0${deflateSync(JSON.stringify(value)).toString('base64')}`; }

test('inspects a Factorio blueprint without executing its contents', () => {
  const result = inspectBlueprintString(encode({ blueprint: {
    label: 'Green circuits', version: 562949955649536,
    icons: [{ signal: { type: 'item', name: 'electronic-circuit' } }],
    entities: [{ name: 'assembling-machine-3', position: { x: 0, y: 0 } }, { name: 'transport-belt', position: { x: 3, y: 2 } }, { name: 'transport-belt', position: { x: 4, y: 2 } }],
    tiles: [{ name: 'refined-concrete', position: { x: 0, y: 0 } }], wires: [[1, 1, 2, 1]]
  } }));
  assert.equal(result.kind, 'blueprint');
  assert.equal(result.label, 'Green circuits');
  assert.equal(result.entityCount, 3);
  assert.deepEqual(result.entities[0], { name: 'transport-belt', count: 2 });
  assert.deepEqual(result.bounds, { width: 5, height: 3 });
  assert.equal(result.wireCount, 1);
});

test('rejects malformed and oversized blueprint strings', () => {
  assert.throws(() => inspectBlueprintString('0not-base64'), /nepodařilo/);
  assert.throws(() => inspectBlueprintString(`0${'a'.repeat(100_000)}`), /příliš velký/);
});
