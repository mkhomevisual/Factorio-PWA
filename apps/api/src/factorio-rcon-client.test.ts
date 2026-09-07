import assert from 'node:assert/strict';
import { createServer, type Socket } from 'node:net';
import { once } from 'node:events';
import test from 'node:test';
import { executeFactorioRconCommand } from './factorio-rcon-client.js';

interface Packet { id: number; type: number; body: Buffer; }

test('handles Factorio empty auth response before auth confirmation', async () => {
  const server = createServer((socket) => serveFactorioRcon(socket));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not expose a TCP port.');

  try {
    const response = await executeFactorioRconCommand({
      host: '127.0.0.1', port: address.port, password: 'test-password', timeoutMs: 1_000
    }, '/hal-telemetry snapshot 0');
    assert.equal(response, 'HAL_TELEMETRY_V2:{"contractVersion":2}');
  } finally {
    server.close();
    await once(server, 'close');
  }
});

function serveFactorioRcon(socket: Socket) {
  let buffered = Buffer.alloc(0);
  socket.on('data', (chunk: Buffer) => {
    buffered = Buffer.concat([buffered, chunk]);
    while (buffered.length >= 4) {
      const length = buffered.readInt32LE(0);
      if (buffered.length < length + 4) return;
      const packet: Packet = {
        id: buffered.readInt32LE(4),
        type: buffered.readInt32LE(8),
        body: buffered.subarray(12, length + 2)
      };
      buffered = buffered.subarray(length + 4);

      if (packet.type === 3) {
        assert.equal(packet.body.toString('utf8'), 'test-password');
        socket.write(Buffer.concat([encode({ id: packet.id, type: 0, body: Buffer.alloc(0) }), encode({ id: packet.id, type: 2, body: Buffer.alloc(0) })]));
      } else {
        assert.equal(packet.type, 2);
        assert.equal(packet.body.toString('utf8'), '/hal-telemetry snapshot 0');
        const response = encode({ id: packet.id, type: 0, body: Buffer.from('HAL_TELEMETRY_V2:{"contractVersion":2}') });
        socket.write(response.subarray(0, 9));
        socket.write(response.subarray(9));
      }
    }
  });
}

function encode(packet: Packet) {
  const output = Buffer.alloc(packet.body.length + 14);
  output.writeInt32LE(packet.body.length + 10, 0);
  output.writeInt32LE(packet.id, 4);
  output.writeInt32LE(packet.type, 8);
  packet.body.copy(output, 12);
  return output;
}
