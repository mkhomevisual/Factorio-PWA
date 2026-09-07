import net from 'node:net';

const AUTH = 3;
const AUTH_RESPONSE = 2;
const EXEC_COMMAND = 2;
const RESPONSE_VALUE = 0;
const MAX_PACKET_SIZE = 4 * 1024 * 1024;

interface RconPacket {
  id: number;
  type: number;
  body: Buffer;
}

export interface FactorioRconOptions {
  host: string;
  port: number;
  password: string;
  timeoutMs?: number;
}

/**
 * Executes one Factorio RCON command on a short-lived connection.
 *
 * Factorio sends an empty RESPONSE_VALUE packet immediately before its
 * AUTH_RESPONSE. Several generic RCON clients treat that first packet as a
 * successful login and then get their request/response sequence out of sync.
 */
export async function executeFactorioRconCommand(
  options: FactorioRconOptions,
  command: string
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const socket = net.createConnection({ host: options.host, port: options.port });
  const reader = new PacketReader(socket);

  try {
    await waitForConnection(socket, timeoutMs);

    const authId = 1;
    await writePacket(socket, { id: authId, type: AUTH, body: Buffer.from(options.password, 'utf8') });

    // Factorio may first send an empty RESPONSE_VALUE, then AUTH_RESPONSE.
    let authenticated = false;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const packet = await reader.next(timeoutMs);
      if (packet.id === -1) throw new Error('RCON authentication failed.');
      if (packet.id !== authId) throw new Error('RCON returned an unexpected authentication packet ID.');
      if (packet.type === RESPONSE_VALUE && packet.body.length === 0) continue;
      if (packet.type !== AUTH_RESPONSE) throw new Error('RCON returned an unexpected authentication packet.');
      authenticated = true;
      break;
    }
    if (!authenticated) throw new Error('RCON did not confirm authentication.');

    const commandId = 2;
    await writePacket(socket, { id: commandId, type: EXEC_COMMAND, body: Buffer.from(command, 'utf8') });
    const response = await reader.next(timeoutMs);
    if (response.id !== commandId || response.type !== RESPONSE_VALUE) {
      throw new Error('RCON returned an unexpected command response.');
    }
    return response.body.toString('utf8');
  } finally {
    // A command gets its full response before this runs. Closing our short-lived
    // client socket is intentional and must not turn a successful command into an error.
    socket.end();
  }
}

class PacketReader {
  private buffered = Buffer.alloc(0);
  private readonly packets: RconPacket[] = [];
  private readonly waiters: Array<{
    resolve: (packet: RconPacket) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];
  private failure: Error | null = null;

  constructor(socket: net.Socket) {
    socket.on('data', (data: Buffer) => this.accept(data));
    socket.on('error', (error) => this.fail(error));
    socket.on('end', () => this.fail(new Error('RCON connection closed.')));
    socket.on('close', () => this.fail(new Error('RCON connection closed.')));
  }

  next(timeoutMs: number): Promise<RconPacket> {
    if (this.failure) return Promise.reject(this.failure);
    const packet = this.packets.shift();
    if (packet) return Promise.resolve(packet);

    return new Promise<RconPacket>((resolve, reject) => {
      const waiter = {
        resolve: (received: RconPacket) => {
          clearTimeout(waiter.timer);
          resolve(received);
        },
        reject: (error: Error) => {
          clearTimeout(waiter.timer);
          reject(error);
        },
        timer: setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error('RCON response timed out.'));
        }, timeoutMs)
      };
      this.waiters.push(waiter);
    });
  }

  private accept(data: Buffer) {
    this.buffered = Buffer.concat([this.buffered, data]);
    while (this.buffered.length >= 4) {
      const size = this.buffered.readInt32LE(0);
      if (size < 10 || size > MAX_PACKET_SIZE) {
        this.fail(new Error('RCON returned an invalid packet size.'));
        return;
      }
      if (this.buffered.length < size + 4) return;

      const bodyEnd = size + 2;
      const packet: RconPacket = {
        id: this.buffered.readInt32LE(4),
        type: this.buffered.readInt32LE(8),
        body: this.buffered.subarray(12, bodyEnd)
      };
      this.buffered = this.buffered.subarray(size + 4);
      const waiter = this.waiters.shift();
      if (waiter) waiter.resolve(packet);
      else this.packets.push(packet);
    }
  }

  private fail(error: Error) {
    if (this.failure) return;
    this.failure = error;
    while (this.waiters.length) {
      const waiter = this.waiters.shift();
      waiter?.reject(error);
    }
  }
}

function waitForConnection(socket: net.Socket, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('RCON connection timed out.')), timeoutMs);
    const onConnect = () => finish();
    const onError = (error: Error) => finish(error);
    const finish = (error?: Error) => {
      clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('error', onError);
      if (error) reject(error);
      else resolve();
    };
    socket.once('connect', onConnect);
    socket.once('error', onError);
  });
}

function writePacket(socket: net.Socket, packet: RconPacket): Promise<void> {
  const encoded = Buffer.alloc(packet.body.length + 14);
  encoded.writeInt32LE(packet.body.length + 10, 0);
  encoded.writeInt32LE(packet.id, 4);
  encoded.writeInt32LE(packet.type, 8);
  packet.body.copy(encoded, 12);
  return new Promise((resolve, reject) => socket.write(encoded, (error) => error ? reject(error) : resolve()));
}
