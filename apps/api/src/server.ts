import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import argon2 from 'argon2';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from './config.js';
import { openDatabase } from './db.js';
import type { AppDatabase } from './db.js';
import type { FactoryAdapter, FactorySnapshot } from './factory-adapter.js';
import { MockFactoryAdapter } from './mock-adapter.js';
import { FactorioRconAdapter } from './rcon-adapter.js';
import { FactorioLogTailer } from './log-tailer.js';
import { summarizeProduction } from './production.js';

const SESSION_COOKIE = 'hal_session';
const sessionLifetimeMs = 1000 * 60 * 60 * 24 * 14;
const bundledIconDirectory = resolve(import.meta.dirname, '../../../assets/factorio-icons');
const taskInput = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(10_000).default(''),
  status: z.enum(['Now', 'Next', 'Later', 'Done']).default('Next'),
  priority: z.number().int().min(1).max(4).default(2),
  location: z.string().trim().max(100).nullable().optional(),
  blueprintString: z.string().max(100_000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(10).default([]),
  assigneeIds: z.array(z.string().uuid()).min(1).max(2),
  dueAt: z.string().datetime().nullable().optional(),
  isPinned: z.boolean().default(false),
  isArchived: z.boolean().default(false)
});
const taskUpdateInput = taskInput.partial();

type SessionUser = { id: string; login: string; displayName: string; factorioName: string; color: string; csrfToken: string };

function tokenHash(value: string) { return createHash('sha256').update(value).digest('hex'); }
function timestamp() { return new Date().toISOString(); }

function getSession(db: AppDatabase, request: FastifyRequest): SessionUser | null {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return null;
  const row = db.prepare(`SELECT u.id, u.login, u.display_name, u.factorio_name, u.color, s.csrf_token
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>?`).get(tokenHash(token), timestamp()) as {
      id: string; login: string; display_name: string; factorio_name: string; color: string; csrf_token: string;
    } | undefined;
  return row ? { id: row.id, login: row.login, displayName: row.display_name, factorioName: row.factorio_name, color: row.color, csrfToken: row.csrf_token } : null;
}

function requireUser(db: AppDatabase, request: FastifyRequest, reply: FastifyReply): SessionUser | null {
  const user = getSession(db, request);
  if (!user) { void reply.code(401).send({ error: 'Authentication required.' }); return null; }
  return user;
}

function recordAudit(db: AppDatabase, userId: string | null, action: string, result: 'success' | 'failed', detail: object = {}) {
  db.prepare('INSERT INTO audit_actions(id,user_id,action,result,detail_json,created_at) VALUES(?,?,?,?,?,?)')
    .run(randomUUID(), userId, action, result, JSON.stringify(detail), timestamp());
}

function recordActivity(db: AppDatabase, eventType: string, actorUserId: string | null, payload: object) {
  const now = timestamp();
  db.prepare('INSERT INTO activity_events(id,source,event_type,actor_user_id,payload_json,occurred_at,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(randomUUID(), 'app', eventType, actorUserId, JSON.stringify(payload), now, now);
}

function listTasks(db: AppDatabase) {
  const tasks = db.prepare(`SELECT t.*, COALESCE((SELECT json_group_array(user_id) FROM task_assignees WHERE task_id=t.id), '[]') AS assignee_ids,
      COALESCE((SELECT json_group_array(tag) FROM task_tags WHERE task_id=t.id), '[]') AS tags
    FROM tasks t ORDER BY t.is_archived, t.is_pinned DESC, CASE t.status WHEN 'Now' THEN 1 WHEN 'Next' THEN 2 WHEN 'Later' THEN 3 ELSE 4 END, t.position, t.priority DESC, t.updated_at DESC`).all() as Array<Record<string, unknown> & { id: string; assignee_ids: string; tags: string; due_at: string | null; is_pinned: number; is_archived: number }>;
  const checklist = db.prepare('SELECT id, task_id, text, is_done, position FROM task_checklist_items ORDER BY position').all() as Array<{ task_id: string; id: string; text: string; is_done: number; position: number }>;
  const comments = db.prepare(`SELECT c.id,c.task_id,c.body,c.created_at,u.display_name,u.color
    FROM task_comments c JOIN users u ON u.id=c.user_id ORDER BY c.created_at`).all() as Array<{ task_id: string; id: string; body: string; created_at: string; display_name: string; color: string }>;
  return tasks.map(({ assignee_ids, due_at, is_pinned, is_archived, ...task }) => ({
    ...task,
    assigneeIds: JSON.parse(assignee_ids),
    tags: JSON.parse(task.tags),
    dueAt: due_at,
    isPinned: Boolean(is_pinned),
    isArchived: Boolean(is_archived),
    checklist: checklist.filter((item) => item.task_id === task.id).map(({ task_id: _taskId, ...item }) => ({ ...item, isDone: Boolean(item.is_done) })),
    comments: comments.filter((comment) => comment.task_id === task.id).map(({ task_id: _taskId, ...comment }) => comment)
  }));
}

function validateAssignees(db: AppDatabase, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return null;
  const valid = db.prepare(`SELECT count(*) AS count FROM users WHERE id IN (${unique.map(() => '?').join(',')})`).get(...unique) as { count: number };
  return valid.count === unique.length ? unique : null;
}

function listMessages(db: AppDatabase, currentUserId: string) {
  const messages = db.prepare(`SELECT m.id,m.body,m.created_at,m.updated_at,m.is_pinned,u.id AS user_id,u.display_name,u.color
    FROM messages m JOIN users u ON u.id=m.user_id ORDER BY m.is_pinned DESC,m.created_at DESC LIMIT 100`).all() as Array<Record<string, unknown> & { id: string; is_pinned: number }>;
  const reactions = db.prepare(`SELECT r.message_id,r.emoji,r.user_id,u.display_name
    FROM message_reactions r JOIN users u ON u.id=r.user_id`).all() as Array<{ message_id: string; emoji: string; user_id: string; display_name: string }>;
  const reads = db.prepare(`SELECT r.message_id,r.user_id,u.display_name
    FROM message_reads r JOIN users u ON u.id=r.user_id`).all() as Array<{ message_id: string; user_id: string; display_name: string }>;
  return messages.map(({ is_pinned, ...message }) => ({
    ...message,
    isPinned: Boolean(is_pinned),
    isOwn: message.user_id === currentUserId,
    reactions: Object.values(reactions.filter((reaction) => reaction.message_id === message.id).reduce<Record<string, { emoji: string; count: number; reactedByMe: boolean; users: string[] }>>((groups, reaction) => {
      const group = groups[reaction.emoji] ??= { emoji: reaction.emoji, count: 0, reactedByMe: false, users: [] };
      group.count += 1; group.users.push(reaction.display_name); if (reaction.user_id === currentUserId) group.reactedByMe = true;
      return groups;
    }, {})),
    readBy: reads.filter((read) => read.message_id === message.id && read.user_id !== message.user_id).map((read) => read.display_name)
  }));
}

function storedSnapshot(db: AppDatabase): FactorySnapshot | null {
  const row = db.prepare("SELECT payload FROM telemetry_snapshots WHERE scope_type='shared' AND scope_key='main' AND contract_version=2 ORDER BY collected_at DESC LIMIT 1").get() as { payload: Buffer } | undefined;
  if (!row) return null;
  try {
    const snapshot = JSON.parse(gunzipSync(row.payload).toString('utf8')) as FactorySnapshot;
    return snapshot.contractVersion === 2 && Array.isArray(snapshot.players) && Array.isArray(snapshot.sharedFactory) ? snapshot : null;
  } catch { return null; }
}

function unavailableSnapshot(): FactorySnapshot {
  return {
    contractVersion: 2,
    generatedAt: timestamp(),
    server: { online: false, version: null, gameState: 'unknown', uptimeSeconds: null, lastSaveAt: null },
    players: [],
    sharedFactory: [],
    events: []
  };
}

class TelemetryPoller {
  private timer: NodeJS.Timeout | undefined;
  private busy = false;
  private latestSnapshot: FactorySnapshot | null;
  constructor(private readonly db: AppDatabase, private readonly adapter: FactoryAdapter) {
    this.latestSnapshot = storedSnapshot(db);
  }

  async start() { await this.poll(); this.timer = setInterval(() => void this.poll(), 60_000); }
  stop() { if (this.timer) clearInterval(this.timer); }
  latest() { return structuredClone(this.latestSnapshot ?? unavailableSnapshot()); }
  async poll() {
    if (this.busy) return;
    this.busy = true;
    try {
      const previousCursor = this.db.prepare('SELECT cursor FROM telemetry_cursors WHERE source=?').get('hal-telemetry') as { cursor: string } | undefined;
      const snapshot = await this.adapter.getSnapshot(previousCursor?.cursor);
      this.latestSnapshot = snapshot;
      const collectedAt = timestamp();
      this.db.prepare('INSERT INTO telemetry_snapshots(id,scope_type,scope_key,contract_version,collected_at,payload) VALUES(?,?,?,?,?,?)')
        .run(randomUUID(), 'shared', 'main', snapshot.contractVersion, collectedAt, gzipSync(JSON.stringify(snapshot)));
      const insertEvent = this.db.prepare(`INSERT OR IGNORE INTO activity_events(id,source,event_type,external_event_id,payload_json,occurred_at,created_at)
        VALUES(?,?,?,?,?,?,?)`);
      const transaction = this.db.transaction(() => {
        for (const event of snapshot.events) insertEvent.run(randomUUID(), 'telemetry', event.type, event.id, JSON.stringify(event), event.occurredAt, collectedAt);
        if (snapshot.eventCursor) this.db.prepare(`INSERT INTO telemetry_cursors(source,cursor,updated_at) VALUES(?,?,?) ON CONFLICT(source) DO UPDATE SET cursor=excluded.cursor,updated_at=excluded.updated_at`)
          .run('hal-telemetry', snapshot.eventCursor, collectedAt);
      });
      transaction();
      // Retention: raw per-minute samples for 48 hours. Downsampling is added before longer retention is enabled.
      this.db.prepare("DELETE FROM telemetry_snapshots WHERE collected_at < datetime('now', '-48 hours')").run();
    } catch (error) {
      requestLog('telemetry poll failed', error);
    } finally { this.busy = false; }
  }
}

function requestLog(message: string, error: unknown) {
  // Never emit request configuration or RCON credentials.
  console.warn(message, error instanceof Error ? error.message : 'unknown error');
}

export function buildApp(options: { db?: AppDatabase; adapter?: FactoryAdapter } = {}) {
  const db = options.db ?? openDatabase(config.DATABASE_PATH);
  const adapter = options.adapter ?? (config.FACTORY_MODE === 'mock' ? new MockFactoryAdapter() : new FactorioRconAdapter(config));
  const app = Fastify({ logger: false, trustProxy: config.NODE_ENV === 'production' });
  const poller = new TelemetryPoller(db, adapter);
  const logTailer = new FactorioLogTailer(db, config.FACTORIO_LOG_PATH);

  void app.register(cookie);
  void app.register(rateLimit, { global: false });
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/') || request.url.startsWith('/api/auth/login')) return;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      const session = getSession(db, request);
      if (!session || request.headers['x-csrf-token'] !== session.csrfToken) {
        return reply.code(403).send({ error: 'Invalid CSRF token.' });
      }
    }
  });

  app.get('/health', async () => ({ status: 'ok', mode: config.FACTORY_MODE }));

  app.post('/api/auth/login', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const body = z.object({ login: z.string().trim().min(1).max(80), password: z.string().min(1).max(1024) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid login request.' });
    const user = db.prepare('SELECT * FROM users WHERE login=?').get(body.data.login) as { id: string; password_hash: string } | undefined;
    if (!user || !(await argon2.verify(user.password_hash, body.data.password))) {
      recordAudit(db, user?.id ?? null, 'auth.login', 'failed');
      return reply.code(401).send({ error: 'Invalid credentials.' });
    }
    const rawToken = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + sessionLifetimeMs).toISOString();
    db.prepare('INSERT INTO sessions(id,token_hash,user_id,csrf_token,expires_at,created_at) VALUES(?,?,?,?,?,?)')
      .run(randomUUID(), tokenHash(rawToken), user.id, csrfToken, expiresAt, timestamp());
    recordAudit(db, user.id, 'auth.login', 'success');
    reply.setCookie(SESSION_COOKIE, rawToken, { httpOnly: true, secure: config.SESSION_COOKIE_SECURE, sameSite: 'lax', path: '/', expires: new Date(expiresAt) });
    return { csrfToken };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const user = requireUser(db, request, reply); if (!user) return;
    const token = request.cookies[SESSION_COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(token));
    recordAudit(db, user.id, 'auth.logout', 'success');
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.code(204).send();
  });

  app.get('/api/auth/session', async (request, reply) => {
    const user = requireUser(db, request, reply); if (!user) return;
    return { user: { id: user.id, displayName: user.displayName, factorioName: user.factorioName, color: user.color }, csrfToken: user.csrfToken };
  });

  app.get('/api/dashboard', async (request, reply) => {
    if (!requireUser(db, request, reply)) return;
    const snapshot = poller.latest();
    const lastSave = db.prepare("SELECT occurred_at FROM activity_events WHERE event_type='save.completed' ORDER BY occurred_at DESC LIMIT 1").get() as { occurred_at: string } | undefined;
    if (lastSave) snapshot.server.lastSaveAt = lastSave.occurred_at;
    const tasks = db.prepare("SELECT id,title,status,priority,location FROM tasks WHERE status != 'Done' ORDER BY priority DESC, updated_at DESC LIMIT 5").all();
    const activity = db.prepare('SELECT event_type,payload_json,occurred_at FROM activity_events ORDER BY occurred_at DESC LIMIT 12').all();
    return { snapshot, tasks, activity, appUptimeSeconds: Math.floor(process.uptime()) };
  });

  app.get('/api/tasks', async (request, reply) => {
    if (!requireUser(db, request, reply)) return;
    return listTasks(db);
  });

  app.post('/api/tasks', async (request, reply) => {
    const user = requireUser(db, request, reply); if (!user) return;
    const parsed = taskInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid task.', fields: parsed.error.flatten() });
    const uniqueAssignees = validateAssignees(db, parsed.data.assigneeIds);
    if (!uniqueAssignees) return reply.code(400).send({ error: 'Unknown assignee.' });
    const id = randomUUID(); const now = timestamp();
    db.transaction(() => {
      db.prepare('INSERT INTO tasks(id,title,description,status,priority,location,blueprint_string,due_at,is_pinned,is_archived,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(id, parsed.data.title, parsed.data.description, parsed.data.status, parsed.data.priority, parsed.data.location ?? null, parsed.data.blueprintString ?? null, parsed.data.dueAt ?? null, parsed.data.isPinned ? 1 : 0, parsed.data.isArchived ? 1 : 0, user.id, now, now);
      const assign = db.prepare('INSERT INTO task_assignees(task_id,user_id) VALUES(?,?)'); uniqueAssignees.forEach((assignee) => assign.run(id, assignee));
      const tag = db.prepare('INSERT INTO task_tags(task_id,tag) VALUES(?,?)'); [...new Set(parsed.data.tags.map((value) => value.toLowerCase()))].forEach((value) => tag.run(id, value));
      db.prepare('INSERT INTO task_history(id,task_id,user_id,action,detail_json,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(), id, user.id, 'created', '{}', now);
    })();
    recordActivity(db, 'task.created', user.id, { taskId: id, title: parsed.data.title });
    return reply.code(201).send({ id });
  });

  app.patch('/api/tasks/:id', async (request, reply) => {
    const user = requireUser(db, request, reply); if (!user) return;
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = taskUpdateInput.safeParse(request.body);
    if (!params.success || !body.success || Object.keys(body.data).length === 0) return reply.code(400).send({ error: 'Invalid task update.' });
    const current = db.prepare('SELECT * FROM tasks WHERE id=?').get(params.data.id) as { id: string; title: string; description: string; status: string; priority: number; location: string | null; blueprint_string: string | null; due_at: string | null; is_pinned: number; is_archived: number } | undefined;
    if (!current) return reply.code(404).send({ error: 'Task not found.' });
    const assignees = body.data.assigneeIds ? validateAssignees(db, body.data.assigneeIds) : undefined;
    if (body.data.assigneeIds && !assignees) return reply.code(400).send({ error: 'Unknown assignee.' });
    const now = timestamp();
    const next = {
      title: body.data.title ?? String(current.title), description: body.data.description ?? String(current.description),
      status: body.data.status ?? String(current.status), priority: body.data.priority ?? Number(current.priority),
      location: body.data.location === undefined ? current.location : body.data.location,
      blueprintString: body.data.blueprintString === undefined ? current.blueprint_string : body.data.blueprintString,
      dueAt: body.data.dueAt === undefined ? current.due_at : body.data.dueAt,
      isPinned: body.data.isPinned ?? Boolean(current.is_pinned), isArchived: body.data.isArchived ?? Boolean(current.is_archived)
    };
    db.transaction(() => {
      db.prepare(`UPDATE tasks SET title=?,description=?,status=?,priority=?,location=?,blueprint_string=?,due_at=?,is_pinned=?,is_archived=?,updated_at=? WHERE id=?`)
        .run(next.title, next.description, next.status, next.priority, next.location, next.blueprintString, next.dueAt, next.isPinned ? 1 : 0, next.isArchived ? 1 : 0, now, params.data.id);
      if (assignees) {
        db.prepare('DELETE FROM task_assignees WHERE task_id=?').run(params.data.id);
        const assign = db.prepare('INSERT INTO task_assignees(task_id,user_id) VALUES(?,?)'); assignees.forEach((assignee) => assign.run(params.data.id, assignee));
      }
      if (body.data.tags) {
        db.prepare('DELETE FROM task_tags WHERE task_id=?').run(params.data.id);
        const tag = db.prepare('INSERT INTO task_tags(task_id,tag) VALUES(?,?)'); [...new Set(body.data.tags.map((value) => value.toLowerCase()))].forEach((value) => tag.run(params.data.id, value));
      }
      db.prepare('INSERT INTO task_history(id,task_id,user_id,action,detail_json,created_at) VALUES(?,?,?,?,?,?)')
        .run(randomUUID(), params.data.id, user.id, 'task.updated', JSON.stringify(body.data), now);
    })();
    recordActivity(db, 'task.updated', user.id, { taskId: params.data.id, title: next.title });
    return { ok: true };
  });

  app.delete('/api/tasks/:id', async (request, reply) => {
    const user = requireUser(db, request, reply); if (!user) return;
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid task id.' });
    const task = db.prepare('SELECT title FROM tasks WHERE id=?').get(params.data.id) as { title: string } | undefined;
    if (!task) return reply.code(404).send({ error: 'Task not found.' });
    db.prepare('DELETE FROM tasks WHERE id=?').run(params.data.id);
    recordActivity(db, 'task.deleted', user.id, { taskId: params.data.id, title: task.title });
    return reply.code(204).send();
  });

  app.patch('/api/tasks/:id/status', async (request, reply) => {
    const user = requireUser(db, request, reply); if (!user) return;
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ status: z.enum(['Now', 'Next', 'Later', 'Done']) }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Invalid task update.' });
    const task = db.prepare('SELECT id,title,status FROM tasks WHERE id=?').get(params.data.id) as { id: string; title: string; status: string } | undefined;
    if (!task) return reply.code(404).send({ error: 'Task not found.' });
    if (task.status !== body.data.status) {
      const now = timestamp();
      db.transaction(() => {
        db.prepare('UPDATE tasks SET status=?,updated_at=? WHERE id=?').run(body.data.status, now, task.id);
        db.prepare('INSERT INTO task_history(id,task_id,user_id,action,detail_json,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(), task.id, user.id, 'status.changed', JSON.stringify({ from: task.status, to: body.data.status }), now);
      })();
      recordActivity(db, body.data.status === 'Done' ? 'task.completed' : 'task.status.changed', user.id, { taskId: task.id, title: task.title, from: task.status, to: body.data.status });
    }
    return { ok: true };
  });

  app.post('/api/tasks/:id/comments', async (request, reply) => {
    const user = requireUser(db, request, reply); if (!user) return;
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ body: z.string().trim().min(1).max(5_000) }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Invalid comment.' });
    const exists = db.prepare('SELECT id FROM tasks WHERE id=?').get(params.data.id);
    if (!exists) return reply.code(404).send({ error: 'Task not found.' });
    db.prepare('INSERT INTO task_comments(id,task_id,user_id,body,created_at) VALUES(?,?,?,?,?)').run(randomUUID(), params.data.id, user.id, body.data.body, timestamp());
    recordActivity(db, 'task.commented', user.id, { taskId: params.data.id });
    return reply.code(201).send({ ok: true });
  });

  app.get('/api/tasks/:id', async (request, reply) => {
    if (!requireUser(db, request, reply)) return;
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid task id.' });
    const task = listTasks(db).find((item) => item.id === params.data.id);
    if (!task) return reply.code(404).send({ error: 'Task not found.' });
    const history = db.prepare(`SELECT h.id,h.action,h.detail_json,h.created_at,u.display_name FROM task_history h JOIN users u ON u.id=h.user_id WHERE h.task_id=? ORDER BY h.created_at DESC`).all(params.data.id) as Array<{ id: string; action: string; detail_json: string; created_at: string; display_name: string }>;
    return { ...task, history: history.map((entry) => ({ ...entry, detail: JSON.parse(entry.detail_json) })) };
  });

  app.post('/api/tasks/:id/checklist', async (request, reply) => {
    const user = requireUser(db, request, reply); if (!user) return;
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ text: z.string().trim().min(1).max(500) }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Invalid checklist item.' });
    const task = db.prepare('SELECT title FROM tasks WHERE id=?').get(params.data.id) as { title: string } | undefined;
    if (!task) return reply.code(404).send({ error: 'Task not found.' });
    const id = randomUUID(); const now = timestamp();
    const position = (db.prepare('SELECT COALESCE(max(position), -1) + 1 AS position FROM task_checklist_items WHERE task_id=?').get(params.data.id) as { position: number }).position;
    db.transaction(() => {
      db.prepare('INSERT INTO task_checklist_items(id,task_id,text,is_done,position) VALUES(?,?,?,?,?)').run(id, params.data.id, body.data.text, 0, position);
      db.prepare('INSERT INTO task_history(id,task_id,user_id,action,detail_json,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(), params.data.id, user.id, 'checklist.added', JSON.stringify({ text: body.data.text }), now);
    })();
    recordActivity(db, 'task.checklist.added', user.id, { taskId: params.data.id, title: task.title });
    return reply.code(201).send({ id });
  });

  app.patch('/api/tasks/:taskId/checklist/:itemId', async (request, reply) => {
    const user = requireUser(db, request, reply); if (!user) return;
    const params = z.object({ taskId: z.string().uuid(), itemId: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ isDone: z.boolean() }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Invalid checklist update.' });
    const item = db.prepare('SELECT text FROM task_checklist_items WHERE id=? AND task_id=?').get(params.data.itemId, params.data.taskId) as { text: string } | undefined;
    if (!item) return reply.code(404).send({ error: 'Checklist item not found.' });
    const now = timestamp();
    db.transaction(() => {
      db.prepare('UPDATE task_checklist_items SET is_done=? WHERE id=?').run(body.data.isDone ? 1 : 0, params.data.itemId);
      db.prepare('INSERT INTO task_history(id,task_id,user_id,action,detail_json,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(), params.data.taskId, user.id, 'checklist.toggled', JSON.stringify({ text: item.text, isDone: body.data.isDone }), now);
    })();
    return { ok: true };
  });

  app.get('/api/messages', async (request, reply) => {
    const user = requireUser(db, request, reply); if (!user) return;
    return listMessages(db, user.id);
  });

  app.post('/api/messages', async (request, reply) => {
    const user = requireUser(db, request, reply); if (!user) return;
    const body = z.object({ body: z.string().trim().min(1).max(2_000) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid message.' });
    const id = randomUUID();
    const createdAt = timestamp();
    db.prepare('INSERT INTO messages(id,user_id,body,created_at,updated_at,is_pinned) VALUES(?,?,?,?,?,0)').run(id, user.id, body.data.body, createdAt, createdAt);
    recordActivity(db, 'message.created', user.id, { messageId: id });
    return reply.code(201).send({ id, createdAt });
  });

  app.patch('/api/messages/:id', async (request, reply) => {
    const user = requireUser(db, request, reply); if (!user) return;
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ body: z.string().trim().min(1).max(2_000).optional(), isPinned: z.boolean().optional() }).refine((value) => value.body !== undefined || value.isPinned !== undefined).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Invalid message update.' });
    const message = db.prepare('SELECT user_id FROM messages WHERE id=?').get(params.data.id) as { user_id: string } | undefined;
    if (!message) return reply.code(404).send({ error: 'Message not found.' });
    if (body.data.body !== undefined && message.user_id !== user.id) return reply.code(403).send({ error: 'Only the author can edit this message.' });
    const updates: string[] = []; const values: unknown[] = [];
    if (body.data.body !== undefined) { updates.push('body=?', 'updated_at=?'); values.push(body.data.body, timestamp()); }
    if (body.data.isPinned !== undefined) { updates.push('is_pinned=?'); values.push(body.data.isPinned ? 1 : 0); }
    db.prepare(`UPDATE messages SET ${updates.join(',')} WHERE id=?`).run(...values, params.data.id);
    recordActivity(db, body.data.isPinned !== undefined ? 'message.pinned' : 'message.updated', user.id, { messageId: params.data.id });
    return { ok: true };
  });

  app.delete('/api/messages/:id', async (request, reply) => {
    const user = requireUser(db, request, reply); if (!user) return;
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid message id.' });
    const message = db.prepare('SELECT user_id FROM messages WHERE id=?').get(params.data.id) as { user_id: string } | undefined;
    if (!message) return reply.code(404).send({ error: 'Message not found.' });
    if (message.user_id !== user.id) return reply.code(403).send({ error: 'Only the author can delete this message.' });
    db.prepare('DELETE FROM messages WHERE id=?').run(params.data.id);
    recordActivity(db, 'message.deleted', user.id, { messageId: params.data.id });
    return reply.code(204).send();
  });

  app.post('/api/messages/:id/reactions', async (request, reply) => {
    const user = requireUser(db, request, reply); if (!user) return;
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ emoji: z.enum(['👍', '❤️', '😂', '🔥', '⚙️']) }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Invalid reaction.' });
    if (!db.prepare('SELECT 1 FROM messages WHERE id=?').get(params.data.id)) return reply.code(404).send({ error: 'Message not found.' });
    const existing = db.prepare('SELECT 1 FROM message_reactions WHERE message_id=? AND user_id=? AND emoji=?').get(params.data.id, user.id, body.data.emoji);
    if (existing) db.prepare('DELETE FROM message_reactions WHERE message_id=? AND user_id=? AND emoji=?').run(params.data.id, user.id, body.data.emoji);
    else db.prepare('INSERT INTO message_reactions(message_id,user_id,emoji,created_at) VALUES(?,?,?,?)').run(params.data.id, user.id, body.data.emoji, timestamp());
    return { active: !existing };
  });

  app.post('/api/messages/read', async (request, reply) => {
    const user = requireUser(db, request, reply); if (!user) return;
    const body = z.object({ messageIds: z.array(z.string().uuid()).max(100) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid read receipt.' });
    const mark = db.prepare('INSERT INTO message_reads(message_id,user_id,read_at) SELECT id,?,? FROM messages WHERE id=? ON CONFLICT(message_id,user_id) DO UPDATE SET read_at=excluded.read_at');
    const now = timestamp(); db.transaction(() => body.data.messageIds.forEach((id) => mark.run(user.id, now, id)))();
    return { ok: true };
  });

  app.get('/api/profiles', async (request, reply) => {
    if (!requireUser(db, request, reply)) return;
    const snapshot = poller.latest();
    const users = db.prepare('SELECT id,login,display_name,factorio_name,color,last_online_at FROM users ORDER BY display_name').all() as Array<{ id: string; login: string; display_name: string; factorio_name: string; color: string; last_online_at: string | null }>;
    const completed = db.prepare(`SELECT ta.user_id, count(*) AS count FROM task_assignees ta JOIN tasks t ON t.id=ta.task_id WHERE t.status='Done' GROUP BY ta.user_id`).all() as Array<{ user_id: string; count: number }>;
    return users.map((entry) => {
      const live = snapshot.players.find((player) => player.factorioName === entry.factorio_name);
      return { id: entry.id, displayName: entry.display_name, factorioName: entry.factorio_name, color: entry.color, online: live?.online ?? false, lastOnlineAt: live?.lastOnlineAt ?? entry.last_online_at, playtimeSeconds: live?.playtimeSeconds ?? 0, completedTasks: completed.find((item) => item.user_id === entry.id)?.count ?? 0, personalActivity: live?.personalActivity ?? { handCrafted: 0, mined: 0, built: 0, deaths: 0 } };
    });
  });

  app.get('/api/activity', async (request, reply) => {
    if (!requireUser(db, request, reply)) return;
    const rows = db.prepare(`SELECT e.id,e.source,e.event_type,e.payload_json,e.occurred_at,u.display_name AS actor_name
      FROM activity_events e LEFT JOIN users u ON u.id=e.actor_user_id ORDER BY e.occurred_at DESC LIMIT 100`).all() as Array<{ id: string; source: string; event_type: string; payload_json: string; occurred_at: string; actor_name: string | null }>;
    return rows.map((row) => ({ ...row, payload: JSON.parse(row.payload_json) }));
  });

  app.get('/api/reports/shift', async (request, reply) => {
    if (!requireUser(db, request, reply)) return;
    const query = z.object({ hours: z.coerce.number().int().refine((value) => [4, 8, 12, 24].includes(value)).default(8) }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Invalid shift length.' });
    const since = new Date(Date.now() - query.data.hours * 3_600_000).toISOString();
    const rows = db.prepare("SELECT collected_at,payload FROM telemetry_snapshots WHERE scope_type='shared' AND scope_key='main' AND contract_version=2 AND collected_at>=? ORDER BY collected_at").all(since) as Array<{ collected_at: string; payload: Buffer }>;
    const snapshots = rows.flatMap((row) => {
      try {
        const snapshot = JSON.parse(gunzipSync(row.payload).toString('utf8')) as FactorySnapshot;
        return [{ collectedAt: row.collected_at, sharedFactory: snapshot.sharedFactory }];
      } catch { return []; }
    });
    const production = config.FACTORY_MODE === 'mock'
      ? summarizeProduction([{ collectedAt: timestamp(), sharedFactory: (await adapter.getSnapshot()).sharedFactory }])
      : summarizeProduction(snapshots);
    const snapshot = poller.latest();
    const completedTasks = db.prepare("SELECT count(*) AS count FROM tasks WHERE status='Done' AND updated_at>=?").get(since) as { count: number };
    const createdTasks = db.prepare('SELECT count(*) AS count FROM tasks WHERE created_at>=?').get(since) as { count: number };
    const messageCount = db.prepare('SELECT count(*) AS count FROM messages WHERE created_at>=?').get(since) as { count: number };
    const events = db.prepare(`SELECT e.event_type,e.payload_json,e.occurred_at,u.display_name AS actor_name
      FROM activity_events e LEFT JOIN users u ON u.id=e.actor_user_id WHERE e.occurred_at>=? ORDER BY e.occurred_at DESC LIMIT 12`).all(since) as Array<{ event_type: string; payload_json: string; occurred_at: string; actor_name: string | null }>;
    return {
      generatedAt: timestamp(), since, hours: query.data.hours,
      server: snapshot.server,
      players: snapshot.players.map((player) => ({ factorioName: player.factorioName, online: player.online, playtimeSeconds: player.playtimeSeconds })),
      production: { topProduced: production.topProduced.slice(0, 5), topConsumed: production.topConsumed.slice(0, 5), sampleCount: production.sampleCount, basis: production.basis },
      collaboration: { completedTasks: completedTasks.count, createdTasks: createdTasks.count, messages: messageCount.count },
      events: events.map((event) => ({ ...event, payload: JSON.parse(event.payload_json), payload_json: undefined }))
    };
  });

  app.get('/api/production', async (request, reply) => {
    if (!requireUser(db, request, reply)) return;
    const query = z.object({
      range: z.enum(['15m', '1h', '6h', '24h']).default('1h'),
      item: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/).optional(),
      items: z.string().max(320).optional()
    }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Invalid production range.' });
    const comparisonItems = [...new Set((query.data.items?.split(',') ?? (query.data.item ? [query.data.item] : [])).filter((item) => /^[a-z0-9][a-z0-9_-]*$/.test(item)))].slice(0, 4);
    const minutesByRange = { '15m': 15, '1h': 60, '6h': 360, '24h': 1440 } as const;
    const minutes = minutesByRange[query.data.range];
    if (config.FACTORY_MODE === 'mock') {
      const snapshot = await adapter.getSnapshot();
      const pointCount = query.data.range === '24h' ? 24 : query.data.range === '6h' ? 36 : 30;
      const stepMinutes = minutes / pointCount;
      const buildMockPoints = (selectedItem?: string) => Array.from({ length: pointCount }, (_, index) => {
        const wave = 0.83 + Math.sin(index / 3.2) * 0.13 + Math.cos(index / 7) * 0.04;
        const selectedCounter = selectedItem ? snapshot.sharedFactory.find((entry) => entry.item === selectedItem) : undefined;
        const productionRate = selectedItem ? selectedCounter?.productionRate ?? 0 : snapshot.sharedFactory.reduce((sum, item) => sum + item.productionRate, 0);
        const consumptionRate = selectedItem ? selectedCounter?.consumptionRate ?? 0 : snapshot.sharedFactory.reduce((sum, item) => sum + item.consumptionRate, 0);
        return { at: new Date(Date.now() - (pointCount - index - 1) * stepMinutes * 60_000).toISOString(), productionRate: Math.round(productionRate * wave), consumptionRate: Math.round(consumptionRate * wave) };
      });
      const points = buildMockPoints(comparisonItems.length === 1 ? comparisonItems[0] : undefined);
      const topProduced = [...snapshot.sharedFactory].sort((a, b) => b.productionRate - a.productionRate).slice(0, 10).map((item) => ({ item: item.item, amount: item.productionRate, rate: item.productionRate }));
      const topConsumed = [...snapshot.sharedFactory].sort((a, b) => b.consumptionRate - a.consumptionRate).slice(0, 10).map((item) => ({ item: item.item, amount: item.consumptionRate, rate: item.consumptionRate }));
      const availableItems = [...snapshot.sharedFactory].sort((a, b) => Math.max(b.productionRate, b.consumptionRate) - Math.max(a.productionRate, a.consumptionRate)).map((item) => item.item);
      const comparison = comparisonItems.map((item) => ({ item, points: buildMockPoints(item) }));
      return { range: query.data.range, points, comparison, topProduced, topConsumed, availableItems, selectedItems: comparisonItems, selectedItem: comparisonItems[0] ?? null, sampleCount: pointCount, basis: 'current', lastUpdatedAt: snapshot.generatedAt };
    }
    const cutoff = new Date(Date.now() - minutes * 60_000).toISOString();
    const rows = db.prepare("SELECT collected_at,payload FROM telemetry_snapshots WHERE scope_type='shared' AND scope_key='main' AND contract_version=2 AND collected_at>=? ORDER BY collected_at").all(cutoff) as Array<{ collected_at: string; payload: Buffer }>;
    const snapshots = rows.flatMap((row) => {
      try {
        const snapshot = JSON.parse(gunzipSync(row.payload).toString('utf8')) as { sharedFactory: import('./factory-adapter.js').ProductionCounter[] };
        return [{ collectedAt: row.collected_at, sharedFactory: snapshot.sharedFactory }];
      }
      catch { return []; }
    });
    const summary = summarizeProduction(snapshots);
    const latest = snapshots.at(-1);
    const availableItems = [...(latest?.sharedFactory ?? [])]
      .sort((a, b) => Math.max(b.productionRate, b.consumptionRate) - Math.max(a.productionRate, a.consumptionRate))
      .map((item) => item.item);
    const points = comparisonItems.length === 1
      ? summarizeProduction(snapshots.map((snapshot) => ({ ...snapshot, sharedFactory: snapshot.sharedFactory.filter((item) => item.item === comparisonItems[0]) }))).points
      : summary.points;
    const comparison = comparisonItems.map((selectedItem) => ({
      item: selectedItem,
      points: summarizeProduction(snapshots.map((snapshot) => ({ ...snapshot, sharedFactory: snapshot.sharedFactory.filter((item) => item.item === selectedItem) }))).points
    }));
    return { range: query.data.range, ...summary, points, comparison, availableItems, selectedItems: comparisonItems, selectedItem: comparisonItems[0] ?? null };
  });

  app.get('/api/icons/:prototype', async (request, reply) => {
    if (!requireUser(db, request, reply)) return;
    const params = z.object({ prototype: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid prototype name.' });
    const customIconPath = resolve(config.FACTORIO_ICON_DIR, `${params.data.prototype}.png`);
    const bundledIconPath = resolve(bundledIconDirectory, `${params.data.prototype}.png`);
    const iconPath = existsSync(customIconPath) ? customIconPath : bundledIconPath;
    // The strict prototype allow-list above keeps this endpoint inside the configured directory.
    if (!existsSync(iconPath)) return reply.code(404).send({ error: 'Icon is not installed.' });
    return reply.header('cache-control', 'private, max-age=604800, immutable').type('image/png').send(await readFile(iconPath));
  });

  app.get('/api/prototypes', async (request, reply) => {
    if (!requireUser(db, request, reply)) return;
    const query = z.object({ locale: z.enum(['cs', 'en']).default('cs') }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Invalid locale.' });
    for (const directory of [config.FACTORIO_ICON_DIR, bundledIconDirectory]) {
      const labelsPath = resolve(directory, `labels.${query.data.locale}.json`);
      try {
        const labels = JSON.parse(await readFile(labelsPath, 'utf8')) as Record<string, string>;
        return reply.header('cache-control', 'private, max-age=3600').send({ locale: query.data.locale, labels });
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      }
    }
    return { locale: query.data.locale, labels: {} };
  });

  app.get('/api/downloads/hal-telemetry/info', async (request, reply) => {
    if (!requireUser(db, request, reply)) return;
    try {
      const manifest = JSON.parse(await readFile(resolve(config.TELEMETRY_DOWNLOAD_DIR, 'hal-telemetry-manifest.json'), 'utf8')) as { name: string; version: string; fileName: string; size: number };
      return reply.header('cache-control', 'private, no-store').send(manifest);
    } catch {
      return reply.code(404).send({ error: 'Telemetry download is not available.' });
    }
  });

  app.get('/api/downloads/hal-telemetry', async (request, reply) => {
    if (!requireUser(db, request, reply)) return;
    try {
      const manifest = JSON.parse(await readFile(resolve(config.TELEMETRY_DOWNLOAD_DIR, 'hal-telemetry-manifest.json'), 'utf8')) as { fileName: string };
      if (!/^hal-telemetry_[0-9]+(?:\.[0-9]+)*\.zip$/.test(manifest.fileName)) throw new Error('Invalid telemetry manifest.');
      const archive = await readFile(resolve(config.TELEMETRY_DOWNLOAD_DIR, manifest.fileName));
      return reply
        .header('cache-control', 'private, no-store')
        .header('content-disposition', `attachment; filename="${manifest.fileName}"`)
        .type('application/zip')
        .send(archive);
    } catch {
      return reply.code(404).send({ error: 'Telemetry download is not available.' });
    }
  });

  app.post('/api/server/telemetry-refresh', async (request, reply) => {
    const user = requireUser(db, request, reply); if (!user) return;
    await poller.poll();
    recordAudit(db, user.id, 'telemetry.refresh', 'success');
    recordActivity(db, 'telemetry.refreshed', user.id, {});
    return { ok: true };
  });

  app.post('/api/server/save', async (request, reply) => {
    const user = requireUser(db, request, reply); if (!user) return;
    try { await adapter.save(); recordAudit(db, user.id, 'rcon.save', 'success'); return { ok: true }; }
    catch { recordAudit(db, user.id, 'rcon.save', 'failed'); return reply.code(502).send({ error: 'Save failed.' }); }
  });

  app.post('/api/server/message', async (request, reply) => {
    const user = requireUser(db, request, reply); if (!user) return;
    const body = z.object({ message: z.string().trim().min(1).max(250) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid message.' });
    try { await adapter.sendMessage(body.data.message); recordAudit(db, user.id, 'rcon.message', 'success'); return { ok: true }; }
    catch { recordAudit(db, user.id, 'rcon.message', 'failed'); return reply.code(502).send({ error: 'Message failed.' }); }
  });

  const webRoot = resolve(import.meta.dirname, '../../web/dist');
  if (existsSync(webRoot)) {
    void app.register(fastifyStatic, { root: webRoot, wildcard: false });
    app.setNotFoundHandler((request, reply) => request.url.startsWith('/api/') ? reply.code(404).send({ error: 'Not found.' }) : reply.sendFile('index.html'));
  }
  app.addHook('onReady', async () => { await poller.start(); logTailer.start(); });
  app.addHook('onClose', () => { poller.stop(); logTailer.stop(); db.close(); });
  return app;
}

const app = buildApp();
app.listen({ host: '0.0.0.0', port: config.APP_PORT }).catch((error) => { requestLog('startup failed', error); process.exit(1); });
