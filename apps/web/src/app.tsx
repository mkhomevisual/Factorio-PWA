import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Theme = 'light' | 'dark';
type View = 'Dashboard' | 'Tasks' | 'Messages' | 'Production' | 'Activity' | 'Profiles' | 'Server';
type User = { id: string; displayName: string; factorioName: string; color: string };
type FactoryItem = { item: string; produced: number; consumed: number; productionRate: number; consumptionRate: number };
type Dashboard = {
  appUptimeSeconds: number;
  snapshot: {
    generatedAt: string;
    server: { online: boolean; version: string | null; gameState: string; uptimeSeconds: number | null; lastSaveAt: string | null };
    players: Array<{ factorioName: string; online: boolean; lastOnlineAt: string | null; playtimeSeconds: number; personalActivity: { handCrafted: number; mined: number; built: number; deaths: number } }>;
    sharedFactory: FactoryItem[];
    events: Array<{ id: string; type: string; occurredAt: string; message: string }>;
  };
  tasks: Array<{ id: string; title: string; status: string; priority: number; location: string | null }>;
};
type Profile = { id: string; displayName: string; factorioName: string; color: string; online: boolean; lastOnlineAt: string | null; playtimeSeconds: number; completedTasks: number; personalActivity: { handCrafted: number; mined: number; built: number; deaths: number } };
type TaskStatus = 'Now' | 'Next' | 'Later' | 'Done';
type TaskChecklistItem = { id: string; text: string; isDone: boolean };
type TaskComment = { id: string; body: string; created_at: string; display_name: string; color: string };
type Task = { id: string; title: string; description: string; status: TaskStatus; priority: number; location: string | null; tags: string[]; assigneeIds: string[]; checklist: TaskChecklistItem[]; comments: TaskComment[] };
type TaskDetail = Task & { blueprint_string: string | null; history: Array<{ id: string; action: string; created_at: string; display_name: string }> };
type Activity = { id: string; source: string; event_type: string; occurred_at: string; actor_name: string | null; payload: { message?: string; title?: string; from?: string; to?: string } };
type SharedMessage = { id: string; body: string; created_at: string; user_id: string; display_name: string; color: string };
type ProductionItem = { item: string; amount: number; rate: number };
type Production = { range: string; points: Array<{ at: string; productionRate: number; consumptionRate: number }>; topProduced: ProductionItem[]; topConsumed: ProductionItem[]; availableItems: string[]; selectedItem: string | null; sampleCount: number; basis: 'empty' | 'current' | 'interval'; lastUpdatedAt: string | null };

let csrfToken = '';
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.method && init.method !== 'GET' ? { 'x-csrf-token': csrfToken } : {}),
      ...init.headers
    }
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({ error: 'Požadavek se nezdařil.' }))).error);
  return response.status === 204 ? undefined as T : response.json();
}

const labelsContext = createContext<Record<string, string>>({});
const statusLabels: Record<TaskStatus, string> = { Now: 'Priorita', Next: 'Non-Priority', Later: 'Idea', Done: 'Hotovo' };
const presetTaskTags = ['server', 'výroba', 'logistika', 'obrana', 'nápad'];
const compactNumber = new Intl.NumberFormat('cs-CZ', { notation: 'compact', maximumFractionDigits: 1 });
const preciseNumber = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 });
const duration = (seconds: number | null) => seconds === null ? '—' : seconds < 3600 ? `${Math.floor(seconds / 60)} min` : `${Math.floor(seconds / 3600)} h ${Math.floor(seconds / 60) % 60} min`;
const timeAgo = (value: string | null) => {
  if (!value) return 'zatím neznámé';
  const minutes = Math.round((new Date(value).getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return new Intl.RelativeTimeFormat('cs', { numeric: 'auto' }).format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return new Intl.RelativeTimeFormat('cs', { numeric: 'auto' }).format(hours, 'hour');
  return new Intl.RelativeTimeFormat('cs', { numeric: 'auto' }).format(Math.round(hours / 24), 'day');
};
const technicalLabel = (prototype: string) => prototype.split('-').map((part) => part.charAt(0).toLocaleUpperCase('cs') + part.slice(1)).join(' ');
const labelFor = (labels: Record<string, string>, prototype: string) => labels[prototype] ?? technicalLabel(prototype);

function usePrototypeLabel(prototype: string) {
  const labels = useContext(labelsContext);
  return labelFor(labels, prototype);
}

type GlyphName = View | 'sun' | 'moon' | 'refresh' | 'logout' | 'close' | 'send' | 'download';
function Glyph({ name }: { name: GlyphName }) {
  const paths: Record<GlyphName, ReactNode> = {
    Dashboard: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="4" rx="2"/><rect x="14" y="11" width="7" height="10" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/></>,
    Tasks: <><path d="M9 6h11M9 12h11M9 18h11"/><path d="m3 6 1.5 1.5L7 4.5M3 12l1.5 1.5L7 10.5M3 18l1.5 1.5L7 16.5"/></>,
    Messages: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8M8 13h5"/></>,
    Production: <><path d="M4 19V9l5 3V7l5 3V4h6v15z"/><path d="M7 19v-3h3v3M14 19v-4h3v4"/></>,
    Activity: <><path d="M3 12h4l2-6 4 12 2-6h6"/></>,
    Profiles: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-4 2.5-6 6-6s6 2 6 6M14 15c3.8-.8 7 1 7 5"/></>,
    Server: <><rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01M11 7h7M11 17h7"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
    moon: <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>,
    refresh: <><path d="M20 7v5h-5"/><path d="M19 12a7 7 0 1 0-2 5"/></>,
    logout: <><path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    send: <path d="m3 11 18-8-8 18-2-8zM11 13l5-5"/>,
    download: <><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/></>
  };
  return <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function ThemeToggle({ theme, setTheme }: { theme: Theme; setTheme: (theme: Theme) => void }) {
  const next = theme === 'dark' ? 'light' : 'dark';
  return <button className="icon-button" type="button" onClick={() => setTheme(next)} aria-label={`Zapnout ${next === 'dark' ? 'tmavý' : 'světlý'} režim`} title={`Zapnout ${next === 'dark' ? 'tmavý' : 'světlý'} režim`}><Glyph name={theme === 'dark' ? 'sun' : 'moon'} /></button>;
}

function ItemIcon({ prototype, size = 'normal' }: { prototype: string; size?: 'normal' | 'large' }) {
  const label = usePrototypeLabel(prototype);
  const [missing, setMissing] = useState(false);
  useEffect(() => setMissing(false), [prototype]);
  return missing
    ? <span className={`item-icon fallback ${size}`} aria-label={`${label} – ikona zatím není importována`}>{prototype.slice(0, 1).toLocaleUpperCase('cs')}</span>
    : <img className={`item-icon ${size}`} src={`/api/icons/${encodeURIComponent(prototype)}`} alt={label} title={label} onError={() => setMissing(true)} />;
}

function Login({ onLogin, theme, setTheme }: { onLogin: (user: User) => void; theme: Theme; setTheme: (theme: Theme) => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const result = await api<{ csrfToken: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ login, password }) });
      csrfToken = result.csrfToken;
      const session = await api<{ user: User }>('/api/auth/session');
      onLogin(session.user);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Přihlášení se nezdařilo.'); }
    finally { setBusy(false); }
  }
  return <main className="login-shell">
    <ThemeToggle theme={theme} setTheme={setTheme} />
    <section className="login-intro"><div className="brand-mark">H</div><p className="eyebrow">HAL1000 · SOUKROMÁ SÍŤ</p><h1>Továrna pod kontrolou.</h1><p>Živá výroba, společné úkoly a bezpečné ovládání serveru na jednom místě.</p></section>
    <form className="login-card" onSubmit={submit}>
      <div><p className="eyebrow">PŘIHLÁŠENÍ OPERÁTORA</p><h2>Vítejte zpět</h2><p>Použijte svůj soukromý účet.</p></div>
      <label>Uživatelské jméno<input autoFocus autoComplete="username" value={login} onChange={(event) => setLogin(event.target.value)} /></label>
      <label>Heslo<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary wide" disabled={busy}>{busy ? 'Přihlašuji…' : 'Přihlásit se'}</button>
    </form>
  </main>;
}

const navigation: Array<{ id: View; label: string }> = [
  { id: 'Dashboard', label: 'Přehled' }, { id: 'Tasks', label: 'Úkoly' }, { id: 'Messages', label: 'Vzkazy' }, { id: 'Production', label: 'Výroba' },
  { id: 'Activity', label: 'Události' }, { id: 'Profiles', label: 'Hráči' }, { id: 'Server', label: 'Server' }
];

function Navigation({ active, setActive }: { active: View; setActive: (view: View) => void }) {
  return <nav className="navigation" aria-label="Hlavní navigace">{navigation.map((item) => <button type="button" key={item.id} className={active === item.id ? 'active' : ''} onClick={() => setActive(item.id)} aria-current={active === item.id ? 'page' : undefined}><Glyph name={item.id} /><span>{item.label}</span></button>)}</nav>;
}

function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description?: string; actions?: ReactNode }) {
  return <header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</header>;
}

function Panel({ title, subtitle, action, className = '', children }: { title: string; subtitle?: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return <article className={`panel ${className}`}><header className="panel-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</header>{children}</article>;
}

function Metric({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'production' | 'consumption' }) {
  return <article className={`metric ${tone ?? ''}`}><small>{label}</small><strong>{value}</strong>{note && <span>{note}</span>}</article>;
}

function EmptyState({ children }: { children: ReactNode }) { return <div className="empty-state"><span>···</span><p>{children}</p></div>; }

function ItemFlowList({ items, metric, limit = 6 }: { items: FactoryItem[]; metric: 'productionRate' | 'consumptionRate'; limit?: number }) {
  const labels = useContext(labelsContext);
  const visible = [...items].filter((item) => item[metric] > 0).sort((left, right) => right[metric] - left[metric]).slice(0, limit);
  const maximum = visible[0]?.[metric] ?? 1;
  if (!visible.length) return <EmptyState>Factorio za poslední minutu nezaznamenalo žádný tok položek.</EmptyState>;
  return <ul className="flow-list">{visible.map((item) => <li key={item.item}>
    <ItemIcon prototype={item.item} />
    <div className="flow-copy"><div><strong>{labelFor(labels, item.item)}</strong><span>{preciseNumber.format(item[metric])} / min</span></div><div className="flow-track"><span style={{ width: `${Math.max(3, item[metric] / maximum * 100)}%` }} /></div></div>
  </li>)}</ul>;
}

function DashboardView({ data, refresh, refreshing }: { data: Dashboard; refresh: () => void; refreshing: boolean }) {
  const server = data.snapshot.server;
  const productionRate = data.snapshot.sharedFactory.reduce((sum, item) => sum + Math.max(0, item.productionRate), 0);
  const consumptionRate = data.snapshot.sharedFactory.reduce((sum, item) => sum + Math.max(0, item.consumptionRate), 0);
  return <section className="content">
    <PageHeader eyebrow="ŽIVÝ PŘEHLED" title="Dobré směny." description={server.online ? `Továrna naposledy odpověděla ${timeAgo(data.snapshot.generatedAt)}.` : 'Čekám na živou odpověď Factorio telemetry.'} actions={<button className="secondary with-icon" onClick={refresh} disabled={refreshing}><Glyph name="refresh" />{refreshing ? 'Obnovuji…' : 'Obnovit'}</button>} />
    <div className="status-grid">
      <article className="server-state"><span className={`lamp ${server.online ? 'online' : ''}`} /><div><small>Factorio server</small><strong>{server.online ? 'Online' : 'Offline'}</strong><span>{server.version ?? 'Verze neznámá'} · {server.gameState === 'running' ? 'hra běží' : server.gameState}</span></div></article>
      <Metric label="Aktuální výroba" value={`${compactNumber.format(productionRate)} / min`} note="všechny povrchy" tone="production" />
      <Metric label="Aktuální spotřeba" value={`${compactNumber.format(consumptionRate)} / min`} note="všechny povrchy" tone="consumption" />
      <Metric label="Herní čas" value={duration(server.uptimeSeconds)} note={`Poslední save ${timeAgo(server.lastSaveAt)}`} />
    </div>
    <div className="two-columns dashboard-columns">
      <Panel title="Hráči" subtitle="Stav připojení a celkový herní čas">
        <div className="players">{data.snapshot.players.map((player) => <div className="player" key={player.factorioName}><span className={`avatar-small ${player.online ? 'online' : ''}`}>{player.factorioName.slice(0, 1)}</span><div><strong>{player.factorioName}</strong><small>{player.online ? 'Právě ve hře' : `Naposledy ${timeAgo(player.lastOnlineAt)}`}</small></div><span>{duration(player.playtimeSeconds)}</span></div>)}</div>
      </Panel>
      <Panel title="Prioritní úkoly" subtitle="Nejdůležitější práce pro další směnu">
        {data.tasks.length ? <ul className="task-summary">{data.tasks.map((task) => <li key={task.id}><b className={`priority p${task.priority}`}>P{task.priority}</b><div><strong>{task.title}</strong><small>{statusLabels[task.status as TaskStatus] ?? task.status}{task.location ? ` · ${task.location}` : ''}</small></div></li>)}</ul> : <EmptyState>Zatím nejsou žádné otevřené úkoly.</EmptyState>}
      </Panel>
    </div>
    <Panel title="Co továrna právě dělá" subtitle="Klouzavý průměr za poslední herní minutu" className="live-production">
      <div className="production-columns"><section><h3><span className="legend-dot production" />Výroba</h3><ItemFlowList items={data.snapshot.sharedFactory} metric="productionRate" /></section><section><h3><span className="legend-dot consumption" />Spotřeba</h3><ItemFlowList items={data.snapshot.sharedFactory} metric="consumptionRate" /></section></div>
    </Panel>
    <Panel title="Poslední události" subtitle="Hra a společné změny">
      {data.snapshot.events.length ? <ul className="activity-list compact">{data.snapshot.events.slice(-6).reverse().map((event) => <li key={event.id}><time>{timeAgo(event.occurredAt)}</time><div><strong>{event.message}</strong><small>Factorio telemetry</small></div></li>)}</ul> : <EmptyState>Zatím nejsou žádné nové události.</EmptyState>}
    </Panel>
  </section>;
}

function TasksView({ onChanged }: { onChanged: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<TaskStatus>('Next');
  const [priority, setPriority] = useState(2);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [tagsInput, setTagsInput] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const load = () => Promise.all([api<Task[]>('/api/tasks'), api<Profile[]>('/api/profiles')]).then(([loadedTasks, loadedProfiles]) => { setTasks(loadedTasks); setProfiles(loadedProfiles); setAssignees((current) => current.length ? current : loadedProfiles.map((profile) => profile.id)); });
  useEffect(() => { void load().catch((reason) => setError(reason.message)); }, []);
  async function create(event: React.FormEvent) {
    event.preventDefault(); setError('');
    const typedTags = tagsInput.split(/[\s,#]+/u).map((tag) => tag.trim().replace(/^#+/, '').toLocaleLowerCase('cs')).filter(Boolean);
    const tags = [...new Set([...selectedTags, ...typedTags])].slice(0, 10);
    try { await api('/api/tasks', { method: 'POST', body: JSON.stringify({ title, status, priority, assigneeIds: assignees, tags }) }); setTitle(''); setTagsInput(''); setSelectedTags([]); await load(); onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Úkol se nepodařilo vytvořit.'); }
  }
  async function move(id: string, next: TaskStatus) {
    try { await api(`/api/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next }) }); await load(); onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Změna se nezdařila.'); }
  }
  async function toggleChecklist(taskId: string, itemId: string, isDone: boolean) {
    try { await api(`/api/tasks/${taskId}/checklist/${itemId}`, { method: 'PATCH', body: JSON.stringify({ isDone }) }); await load(); onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Checklist se nepodařilo změnit.'); }
  }
  return <section className="content">
    <PageHeader eyebrow="SPOLEČNÁ PRÁCE" title="Úkoly" description="Jedna fronta práce pro oba operátory." />
    {error && <p className="error banner" role="alert">{error}</p>}
    <Panel title="Přidat úkol" subtitle="Krátký název stačí, detail lze doplnit později.">
      <form className="task-form" onSubmit={create}>
        <input className="task-title-input" placeholder="Co je potřeba udělat?" value={title} onChange={(event) => setTitle(event.target.value)} required />
        <select aria-label="Skupina" value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select aria-label="Priorita" value={priority} onChange={(event) => setPriority(Number(event.target.value))}>{[1, 2, 3, 4].map((value) => <option key={value} value={value}>Priorita {value}</option>)}</select>
        <div className="task-tags-field"><input aria-label="Hashtagy" placeholder="Hashtagy: server, výroba…" value={tagsInput} onChange={(event) => setTagsInput(event.target.value)} /><div className="tag-presets" aria-label="Předvolené hashtagy">{presetTaskTags.map((tag) => <button type="button" className={selectedTags.includes(tag) ? 'active' : ''} key={tag} onClick={() => setSelectedTags((current) => current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag])}>#{tag}</button>)}</div></div>
        <div className="assignees">{profiles.map((profile) => <label key={profile.id}><input type="checkbox" checked={assignees.includes(profile.id)} onChange={() => setAssignees((current) => current.includes(profile.id) ? current.filter((value) => value !== profile.id) : [...current, profile.id])} />{profile.displayName}</label>)}</div>
        <button className="primary">Vytvořit</button>
      </form>
    </Panel>
    <div className="board">{(Object.keys(statusLabels) as TaskStatus[]).map((column) => <article className={`board-column status-${column.toLocaleLowerCase()}`} key={column}><header><h2>{statusLabels[column]}</h2><span>{tasks.filter((task) => task.status === column).length}</span></header><div className="board-stack">{tasks.filter((task) => task.status === column).map((task) => {
      const doneCount = task.checklist.filter((item) => item.isDone).length;
      return <article className="task-card" role="button" tabIndex={0} onClick={() => setSelected(task.id)} onKeyDown={(event) => event.key === 'Enter' && setSelected(task.id)} key={task.id}>
        <div><b className={`priority p${task.priority}`}>P{task.priority}</b>{task.location && <small>{task.location}</small>}</div>
        <strong>{task.title}</strong>
        {task.description && <p>{task.description}</p>}
        {task.tags.length > 0 && <div className="task-card-tags">{task.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
        {task.checklist.length > 0 && <section className="task-card-checklist" onClick={(event) => event.stopPropagation()}><header><span>Checklist</span><small>{doneCount}/{task.checklist.length}</small></header><ul>{task.checklist.slice(0, 3).map((item) => <li key={item.id}><label><input type="checkbox" checked={item.isDone} onChange={(event) => void toggleChecklist(task.id, item.id, event.target.checked)} /><span>{item.text}</span></label></li>)}</ul>{task.checklist.length > 3 && <small>+ {task.checklist.length - 3} další</small>}</section>}
        {task.comments.length > 0 && <section className="task-card-comments">{task.comments.slice(-2).map((comment) => <div key={comment.id}><span className="comment-avatar" style={{ '--avatar-color': comment.color } as CSSProperties}>{comment.display_name.slice(0, 1)}</span><p><strong>{comment.display_name}</strong><span>{comment.body}</span></p></div>)}</section>}
        <select aria-label={`Skupina úkolu ${task.title}`} value={task.status} onClick={(event) => event.stopPropagation()} onChange={(event) => void move(task.id, event.target.value as TaskStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      </article>;
    })}{!tasks.some((task) => task.status === column) && <p className="column-empty">Prázdné</p>}</div></article>)}</div>
    {selected && <TaskDetailView id={selected} onClose={() => setSelected(null)} onChanged={() => { void load(); onChanged(); }} />}
  </section>;
}

function TaskDetailView({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [checkText, setCheckText] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const load = () => api<TaskDetail>(`/api/tasks/${id}`).then(setTask);
  useEffect(() => { void load().catch((reason) => setError(reason.message)); }, [id]);
  useEffect(() => { const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose(); window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [onClose]);
  async function addChecklist(event: React.FormEvent) { event.preventDefault(); try { await api(`/api/tasks/${id}/checklist`, { method: 'POST', body: JSON.stringify({ text: checkText }) }); setCheckText(''); await load(); onChanged(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Položku se nepodařilo přidat.'); } }
  async function toggle(itemId: string, isDone: boolean) { try { await api(`/api/tasks/${id}/checklist/${itemId}`, { method: 'PATCH', body: JSON.stringify({ isDone }) }); await load(); onChanged(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Změna se nezdařila.'); } }
  async function addComment(event: React.FormEvent) { event.preventDefault(); try { await api(`/api/tasks/${id}/comments`, { method: 'POST', body: JSON.stringify({ body: comment }) }); setComment(''); await load(); onChanged(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Komentář se nepodařilo přidat.'); } }
  return <div className="task-detail-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><article className="task-detail" role="dialog" aria-modal="true" aria-labelledby="task-detail-title"><button className="icon-button detail-close" onClick={onClose} aria-label="Zavřít detail"><Glyph name="close" /></button>{error && <p className="error">{error}</p>}{!task ? <div className="loading-inline">Načítám úkol…</div> : <><p className="eyebrow">{statusLabels[task.status]} · PRIORITA {task.priority}</p><h2 id="task-detail-title">{task.title}</h2><p className="task-description">{task.description || 'Bez popisu.'}</p>{task.blueprint_string && <section><h3>Blueprint</h3><button className="secondary" onClick={() => void navigator.clipboard.writeText(task.blueprint_string!)}>Kopírovat blueprint string</button></section>}<section><h3>Checklist</h3><ul className="checklist">{task.checklist.map((item) => <li key={item.id}><label><input type="checkbox" checked={item.isDone} onChange={(event) => void toggle(item.id, event.target.checked)} /><span>{item.text}</span></label></li>)}</ul><form className="inline-form" onSubmit={addChecklist}><input value={checkText} onChange={(event) => setCheckText(event.target.value)} placeholder="Nová položka" required /><button>Přidat</button></form></section><section><h3>Komentáře</h3>{task.comments.map((entry) => <p className="comment" key={entry.id}><strong>{entry.display_name}</strong><span>{entry.body}</span></p>)}<form className="inline-form" onSubmit={addComment}><input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Napsat komentář" required /><button>Odeslat</button></form></section><section><h3>Historie</h3><ul className="history">{task.history.map((entry) => <li key={entry.id}>{entry.display_name} · {entry.action} · {timeAgo(entry.created_at)}</li>)}</ul></section></>}</article></div>;
}

function MessagesView() {
  const [messages, setMessages] = useState<SharedMessage[]>([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const load = () => api<SharedMessage[]>('/api/messages').then((value) => { setMessages(value); setError(''); });
  useEffect(() => { void load().catch((reason) => setError(reason.message)); const timer = window.setInterval(() => void load(), 30_000); return () => window.clearInterval(timer); }, []);
  async function send(event: React.FormEvent) {
    event.preventDefault(); setSending(true); setError('');
    try { await api('/api/messages', { method: 'POST', body: JSON.stringify({ body }) }); setBody(''); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Vzkaz se nepodařilo odeslat.'); }
    finally { setSending(false); }
  }
  return <section className="content messages-view">
    <PageHeader eyebrow="MEZI OPERÁTORY" title="Vzkazy" description="Krátké poznámky, které uvidíte oba. Bez stavů, priorit a zbytečné administrativy." />
    {error && <p className="error banner" role="alert">{error}</p>}
    <Panel title="Nový vzkaz" subtitle="Až 2 000 znaků, vhodné pro předání směny nebo rychlou poznámku.">
      <form className="message-composer" onSubmit={send}><textarea autoFocus placeholder="Co má druhý operátor vědět?" maxLength={2000} rows={3} value={body} onChange={(event) => setBody(event.target.value)} required /><footer><small>{body.length}/2 000</small><button className="primary with-icon" disabled={sending}><Glyph name="send" />{sending ? 'Odesílám…' : 'Přidat vzkaz'}</button></footer></form>
    </Panel>
    <Panel title="Nástěnka" subtitle={`${messages.length} ${messages.length === 1 ? 'vzkaz' : messages.length >= 2 && messages.length <= 4 ? 'vzkazy' : 'vzkazů'}`}>
      {messages.length ? <div className="messages-feed">{messages.map((message) => <article className="message-note" key={message.id}><span className="message-avatar" style={{ '--avatar-color': message.color } as CSSProperties}>{message.display_name.slice(0, 1)}</span><div><header><strong>{message.display_name}</strong><time>{timeAgo(message.created_at)}</time></header><p>{message.body}</p></div></article>)}</div> : <EmptyState>Na nástěnce zatím nic není. První vzkaz může být úplně krátký.</EmptyState>}
    </Panel>
  </section>;
}

function ProfilesView() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { void api<Profile[]>('/api/profiles').then(setProfiles).catch((reason) => setError(reason.message)); }, []);
  return <section className="content"><PageHeader eyebrow="OPERÁTOŘI" title="Hráči" description="Herní čas a osobní aktivita obou členů továrny." />{error && <p className="error banner">{error}</p>}<div className="profile-grid">{profiles.map((profile) => <article className="profile-card" key={profile.id}><header><span className="profile-avatar" style={{ '--avatar-color': profile.color } as CSSProperties}>{profile.displayName.slice(0, 1)}</span><div><h2>{profile.displayName}</h2><p>{profile.factorioName}</p></div><span className={`presence ${profile.online ? 'online' : ''}`}>{profile.online ? 'Online' : 'Offline'}</span></header><div className="profile-stats"><Metric label="Herní čas" value={duration(profile.playtimeSeconds)} /><Metric label="Hotové úkoly" value={String(profile.completedTasks)} /><Metric label="Ručně vyrobeno" value={compactNumber.format(profile.personalActivity.handCrafted)} /><Metric label="Postaveno" value={compactNumber.format(profile.personalActivity.built)} /></div></article>)}</div></section>;
}

function ActivityView() {
  const [events, setEvents] = useState<Activity[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { void api<Activity[]>('/api/activity').then(setEvents).catch((reason) => setError(reason.message)); }, []);
  return <section className="content"><PageHeader eyebrow="ČASOVÁ OSA" title="Události" description="Posledních 100 změn z Factorio serveru a aplikace." />{error && <p className="error banner">{error}</p>}<Panel title="Historie provozu">{events.length ? <ul className="activity-list">{events.map((event) => <li key={event.id}><time>{timeAgo(event.occurred_at)}</time><span className="timeline-dot" /><div><strong>{event.payload.message ?? event.payload.title ?? event.event_type}</strong><small>{event.actor_name ? `${event.actor_name} · ` : ''}{event.source === 'telemetry' ? 'Factorio' : event.source}{event.payload.from ? ` · ${event.payload.from} → ${event.payload.to}` : ''}</small></div></li>)}</ul> : <EmptyState>Zatím nejsou žádné události.</EmptyState>}</Panel></section>;
}

function TopItems({ items, basis, selectedItem, onSelect }: { items: ProductionItem[]; basis: Production['basis']; selectedItem: string | null; onSelect: (item: string) => void }) {
  const labels = useContext(labelsContext);
  const maximum = items[0]?.amount ?? 1;
  if (!items.length) return <EmptyState>V tomto období zatím není zaznamenaný žádný tok.</EmptyState>;
  return <ul className="top-items">{items.slice(0, 8).map((item, index) => <li key={item.item}><button type="button" className={selectedItem === item.item ? 'top-item-button selected' : 'top-item-button'} onClick={() => onSelect(item.item)} aria-pressed={selectedItem === item.item}><span className="rank">{index + 1}</span><ItemIcon prototype={item.item} /><div><strong>{labelFor(labels, item.item)}</strong><span className="mini-track"><i style={{ width: `${Math.max(4, item.amount / maximum * 100)}%` }} /></span></div><p><strong>{preciseNumber.format(item.amount)}</strong><small>{basis === 'current' ? '/ min' : `za období · ${preciseNumber.format(item.rate)}/min`}</small></p></button></li>)}</ul>;
}

function ProductionView() {
  const labels = useContext(labelsContext);
  const [range, setRange] = useState('1h');
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [itemSearch, setItemSearch] = useState('');
  const [production, setProduction] = useState<Production | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = () => api<Production>(`/api/production?range=${range}${selectedItem ? `&item=${encodeURIComponent(selectedItem)}` : ''}`).then((value) => { if (active) { setProduction(value); setError(''); } }).catch((reason) => active && setError(reason.message));
    setProduction(null); void load(); const timer = window.setInterval(() => void load(), 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [range, selectedItem]);
  const current = production?.points.at(-1);
  const visibleItems = useMemo(() => {
    const needle = itemSearch.trim().toLocaleLowerCase('cs');
    return (production?.availableItems ?? []).filter((item) => !needle || item.includes(needle) || labelFor(labels, item).toLocaleLowerCase('cs').includes(needle)).slice(0, needle ? 30 : 14);
  }, [itemSearch, labels, production?.availableItems]);
  const selectedLabel = selectedItem ? labelFor(labels, selectedItem) : null;
  return <section className="content">
    <PageHeader eyebrow="SPOLEČNÁ TOVÁRNA" title="Výroba" description="Skutečné item statistiky ze všech povrchů hráčské force." actions={<div className="range-picker" aria-label="Časový rozsah">{['15m', '1h', '6h', '24h'].map((value) => <button className={range === value ? 'active' : ''} key={value} onClick={() => setRange(value)}>{value}</button>)}</div>} />
    {error && <p className="error banner">{error}</p>}
    <Panel title="Filtr položek" subtitle="Vyberte konkrétní item pro samostatný graf, nebo nechte celou továrnu." className="item-filter-panel">
      <div className="item-filter-toolbar"><label><span>Hledat item</span><input type="search" placeholder="Např. železný plát…" value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} /></label><button type="button" className={!selectedItem ? 'filter-all active' : 'filter-all'} onClick={() => setSelectedItem(null)} aria-pressed={!selectedItem}>Celá továrna</button></div>
      <div className="item-filter-options">{visibleItems.map((item) => <button type="button" className={selectedItem === item ? 'selected' : ''} key={item} onClick={() => setSelectedItem(item)} aria-pressed={selectedItem === item}><ItemIcon prototype={item} /><span>{labelFor(labels, item)}</span></button>)}{production && !visibleItems.length && <p>Žádná položka neodpovídá hledání.</p>}</div>
    </Panel>
    <div className="production-metrics"><Metric label={selectedLabel ? `${selectedLabel} · výroba` : 'Nyní se vyrábí'} value={`${compactNumber.format(current?.productionRate ?? 0)} / min`} tone="production" note="klouzavý průměr 1 min" /><Metric label={selectedLabel ? `${selectedLabel} · spotřeba` : 'Nyní se spotřebovává'} value={`${compactNumber.format(current?.consumptionRate ?? 0)} / min`} tone="consumption" note="klouzavý průměr 1 min" /><Metric label="Poslední vzorek" value={timeAgo(production?.lastUpdatedAt ?? null)} note={`${production?.sampleCount ?? 0} vzorků v grafu`} /></div>
    <Panel title={selectedLabel ? `Tok položky · ${selectedLabel}` : 'Tok celé továrny'} subtitle={selectedLabel ? 'Samostatná výroba a spotřeba za minutu' : 'Součet výroby a spotřeby za minutu'} className="chart-panel">
      {!production ? <div className="loading-inline">Načítám výrobní statistiky…</div> : production.points.length ? <div className="production-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={production.points} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--chart-grid)" /><XAxis dataKey="at" tickFormatter={(value) => new Date(value).toLocaleTimeString('cs', { hour: '2-digit', minute: '2-digit' })} minTickGap={35} stroke="var(--text-tertiary)" tickLine={false} axisLine={false} /><YAxis stroke="var(--text-tertiary)" tickLine={false} axisLine={false} tickFormatter={(value) => compactNumber.format(value)} /><Tooltip labelFormatter={(value) => new Date(String(value)).toLocaleString('cs')} contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--border-strong)', borderRadius: 12, boxShadow: 'var(--shadow-lg)' }} /><Line type="monotone" dataKey="productionRate" name="Výroba/min" stroke="var(--production)" strokeWidth={3} dot={production.points.length === 1} activeDot={{ r: 5 }} /><Line type="monotone" dataKey="consumptionRate" name="Spotřeba/min" stroke="var(--consumption)" strokeWidth={3} dot={production.points.length === 1} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer></div> : <EmptyState>Čekám na první telemetry vzorek verze 2.</EmptyState>}
      <div className="chart-legend"><span><i className="production" />Výroba</span><span><i className="consumption" />Spotřeba</span></div>
    </Panel>
    <div className="two-columns"><Panel title="Nejvíce vyráběné" subtitle="Kliknutím otevřete samostatný graf"><TopItems items={production?.topProduced ?? []} basis={production?.basis ?? 'empty'} selectedItem={selectedItem} onSelect={setSelectedItem} /></Panel><Panel title="Nejvíce spotřebovávané" subtitle="Kliknutím otevřete samostatný graf"><TopItems items={production?.topConsumed ?? []} basis={production?.basis ?? 'empty'} selectedItem={selectedItem} onSelect={setSelectedItem} /></Panel></div>
    <p className="footnote">Strojová výroba je společná pro hráčskou force; osobní ruční výrobu najdete u hráčů.</p>
  </section>;
}

function ServerView() {
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [download, setDownload] = useState<{ name: string; version: string; fileName: string; size: number } | null>(null);
  useEffect(() => { void api<{ name: string; version: string; fileName: string; size: number }>('/api/downloads/hal-telemetry/info').then(setDownload).catch(() => setDownload(null)); }, []);
  async function send(event: React.FormEvent) { event.preventDefault(); try { await api('/api/server/message', { method: 'POST', body: JSON.stringify({ message }) }); setMessage(''); setNotice('Zpráva byla doručena do hry.'); } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Zpráva se nezdařila.'); } }
  return <section className="content"><PageHeader eyebrow="BEZPEČNÉ OVLÁDÁNÍ" title="Server" description="Praktické nástroje pro oba správce továrny." /><div className="server-layout"><Panel title="Telemetry mod" subtitle="Stejná verze, jaká patří k tomuto nasazení."><div className="telemetry-download"><div><span className="download-icon"><Glyph name="download" /></span><div><strong>{download?.fileName ?? 'hal-telemetry'}</strong><small>{download ? `Verze ${download.version} · ${Math.ceil(download.size / 1024)} kB` : 'Balíček v tomto prostředí není dostupný.'}</small></div></div>{download && <a className="primary with-icon button-link" href="/api/downloads/hal-telemetry" download={download.fileName}><Glyph name="download" />Stáhnout mod</a>}</div></Panel><Panel title="Zpráva do hry" subtitle="Zobrazí se všem právě připojeným hráčům."><form className="message-form" onSubmit={send}><input placeholder="Napište krátkou zprávu…" maxLength={250} value={message} onChange={(event) => setMessage(event.target.value)} required /><button className="primary icon-button" aria-label="Odeslat zprávu"><Glyph name="send" /></button></form></Panel></div>{notice && <div className="notice" role="status">{notice}</div>}</section>;
}

function initialTheme(): Theme {
  const stored = window.localStorage.getItem('hal-theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function App() {
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const [user, setUser] = useState<User | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [data, setData] = useState<Dashboard | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [active, setActive] = useState<View>('Dashboard');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const setTheme = (value: Theme) => { setThemeState(value); window.localStorage.setItem('hal-theme', value); };
  useEffect(() => { document.documentElement.dataset.theme = theme; document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111614' : '#f4f3ee'); }, [theme]);
  useEffect(() => { api<{ user: User; csrfToken: string }>('/api/auth/session').then((session) => { csrfToken = session.csrfToken; setUser(session.user); }).catch(() => undefined).finally(() => setSessionChecked(true)); }, []);
  const load = async (showBusy = false) => { if (showBusy) setRefreshing(true); try { setData(await api<Dashboard>('/api/dashboard')); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Data nejsou dostupná.'); } finally { setRefreshing(false); } };
  useEffect(() => {
    if (!user) return;
    void load();
    void api<{ labels: Record<string, string> }>('/api/prototypes').then((result) => setLabels(result.labels)).catch(() => setLabels({}));
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [user]);
  const content = useMemo(() => {
    if (!data) return <div className="page-loading"><span className="brand-mark">H</span><p>Navazuji spojení s továrnou…</p></div>;
    if (active === 'Dashboard') return <DashboardView data={data} refresh={() => void load(true)} refreshing={refreshing} />;
    if (active === 'Tasks') return <TasksView onChanged={() => void load()} />;
    if (active === 'Messages') return <MessagesView />;
    if (active === 'Production') return <ProductionView />;
    if (active === 'Activity') return <ActivityView />;
    if (active === 'Profiles') return <ProfilesView />;
    return <ServerView />;
  }, [active, data, refreshing]);
  if (!sessionChecked) return <div className="page-loading full"><span className="brand-mark">H</span></div>;
  if (!user) return <Login onLogin={setUser} theme={theme} setTheme={setTheme} />;
  async function logout() { try { await api('/api/auth/logout', { method: 'POST' }); } finally { csrfToken = ''; setUser(null); setData(null); } }
  return <labelsContext.Provider value={labels}><main className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark">H</span><div><strong>HAL Factory</strong><small>factorio.mkdevs.cz</small></div></div><Navigation active={active} setActive={setActive} /><footer><div className="operator"><span style={{ '--avatar-color': user.color } as CSSProperties}>{user.displayName.slice(0, 1)}</span><div><strong>{user.displayName}</strong><small>{user.factorioName}</small></div></div><div className="sidebar-actions"><ThemeToggle theme={theme} setTheme={setTheme} /><button className="icon-button" onClick={() => void logout()} aria-label="Odhlásit se" title="Odhlásit se"><Glyph name="logout" /></button></div></footer></aside><div className="app-main"><header className="mobile-header"><div className="brand"><span className="brand-mark">H</span><div><strong>HAL Factory</strong><small>{user.displayName}</small></div></div><div className="mobile-actions"><ThemeToggle theme={theme} setTheme={setTheme} /><button className="icon-button" onClick={() => void logout()} aria-label="Odhlásit se"><Glyph name="logout" /></button></div></header>{error && <div className="error banner global" role="alert">{error}</div>}{content}<Navigation active={active} setActive={setActive} /></div></main></labelsContext.Provider>;
}
