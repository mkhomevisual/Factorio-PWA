import { randomUUID } from 'node:crypto';
import { stdin } from 'node:process';
import argon2 from 'argon2';
import { z } from 'zod';
import { config } from './config.js';
import { openDatabase } from './db.js';

const args = Object.fromEntries(process.argv.slice(2).filter((item) => item.startsWith('--')).map((item) => {
  const [key, value] = item.slice(2).split('='); return [key, value ?? 'true'];
}));
const input = z.object({ login: z.string().regex(/^[a-z0-9_-]{3,32}$/), displayName: z.string().min(1).max(60), factorioName: z.string().min(1).max(60), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).safeParse(args);
if (!input.success) {
  console.error('Usage: users:create --login=martin --displayName=Martin --factorioName=MarkanMegaBuilder --color=#e69636 < password via stdin');
  process.exit(1);
}
const chunks: Buffer[] = [];
for await (const chunk of stdin) chunks.push(Buffer.from(chunk));
const password = Buffer.concat(chunks).toString('utf8').trim();
const minimumPasswordLength = config.FACTORY_MODE === 'mock' ? 6 : 14;
if (password.length < minimumPasswordLength) {
  console.error(`Password must contain at least ${minimumPasswordLength} characters in ${config.FACTORY_MODE} mode.`);
  process.exit(1);
}
const db = openDatabase(config.DATABASE_PATH);
const userCount = (db.prepare('SELECT count(*) AS count FROM users').get() as { count: number }).count;
if (userCount >= 2) { console.error('Exactly two accounts are supported; no further account can be created.'); process.exit(1); }
try {
  db.prepare('INSERT INTO users(id,login,display_name,factorio_name,color,password_hash,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(randomUUID(), input.data.login, input.data.displayName, input.data.factorioName, input.data.color, await argon2.hash(password, { type: argon2.argon2id }), new Date().toISOString());
  console.log(`Created ${input.data.login}.`);
} finally { db.close(); }
