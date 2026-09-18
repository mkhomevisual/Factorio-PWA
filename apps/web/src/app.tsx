import { createContext, Fragment, useContext, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Theme = 'light' | 'dark';
type Locale = 'cs' | 'en';
type View = 'Dashboard' | 'Tasks' | 'Messages' | 'Production' | 'Goals' | 'Achievements' | 'Report' | 'Activity' | 'Profiles' | 'Server';
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
type Profile = {
  id: string; displayName: string; factorioName: string; color: string; online: boolean; lastOnlineAt: string | null; playtimeSeconds: number; completedTasks: number;
  personalActivity: { handCrafted: number; mined: number; built: number; deaths: number };
  rates: { builtPerHour: number; minedPerHour: number; craftedPerHour: number };
  collaboration: { openTasks: number; createdTasks: number; messages: number; comments: number; reactions: number; completedGoals: number; achievements: number };
};
type TaskStatus = 'Now' | 'Next' | 'Later' | 'Done';
type TaskChecklistItem = { id: string; text: string; isDone: boolean };
type TaskComment = { id: string; body: string; created_at: string; display_name: string; color: string };
type Task = { id: string; title: string; description: string; status: TaskStatus; priority: number; location: string | null; tags: string[]; assigneeIds: string[]; checklist: TaskChecklistItem[]; comments: TaskComment[]; dueAt: string | null; isPinned: boolean; isArchived: boolean };
type TaskDetail = Task & { blueprint_string: string | null; history: Array<{ id: string; action: string; created_at: string; display_name: string }> };
type Activity = { id: string; source: string; event_type: string; occurred_at: string; actor_name: string | null; payload: { message?: string; title?: string; from?: string; to?: string } };
type MessageReaction = { emoji: string; count: number; reactedByMe: boolean; users: string[] };
type SharedMessage = { id: string; body: string; created_at: string; updated_at: string | null; user_id: string; display_name: string; color: string; isPinned: boolean; isOwn: boolean; reactions: MessageReaction[]; readBy: string[] };
type ProductionItem = { item: string; amount: number; rate: number };
type ProductionPoint = { at: string; productionRate: number; consumptionRate: number };
type Production = { range: string; points: ProductionPoint[]; comparison: Array<{ item: string; points: ProductionPoint[] }>; topProduced: ProductionItem[]; topConsumed: ProductionItem[]; availableItems: string[]; catalog: FactoryItem[]; selectedItems: string[]; sampleCount: number; basis: 'empty' | 'current' | 'interval'; lastUpdatedAt: string | null };
type ShiftReport = { generatedAt: string; since: string; hours: number; server: Dashboard['snapshot']['server']; players: Array<{ factorioName: string; online: boolean; playtimeSeconds: number }>; production: { topProduced: ProductionItem[]; topConsumed: ProductionItem[]; sampleCount: number; basis: Production['basis'] }; collaboration: { completedTasks: number; createdTasks: number; messages: number }; events: Array<{ event_type: string; occurred_at: string; actor_name: string | null; payload: { message?: string; title?: string } }> };
type ProductionGoal = { id: string; item: string; targetAmount: number; progressAmount: number; progress: number; productionRate: number; etaSeconds: number | null; status: 'active' | 'completed'; createdAt: string; completedAt: string | null; announcedInGame: boolean; linkedTaskId: string | null; linkedTaskTitle: string | null; createdByName: string };
type Achievement = { key: string; audience: 'player' | 'factory'; category: string; title: string; description: string; icon: string; target: number; scopeKey: string; scopeName: string; value: number; progress: number; unlockedAt: string | null };

let csrfToken = '';
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.method && init.method !== 'GET' ? { 'x-csrf-token': csrfToken } : {}),
      ...init.headers
    }
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({ error: 'Požadavek se nezdařil.' }))).error);
  return response.status === 204 ? undefined as T : response.json();
}

const labelsContext = createContext<{ locale: Locale; labels: Record<string, string> }>({ locale: 'cs', labels: {} });
const uiCs = {
  navDashboard: 'Přehled', navTasks: 'Úkoly', navMessages: 'Vzkazy', navProduction: 'Výroba', navGoals: 'Výrobní cíle',
  navAchievements: 'Úspěchy', navReport: 'Report směny', navActivity: 'Události', navProfiles: 'Hráči', navServer: 'Server',
  mainNavigation: 'Hlavní navigace', itemLanguage: 'Jazyk aplikace a položek', openMenu: 'Otevřít menu', closeMenu: 'Zavřít menu', logout: 'Odhlásit',
  refresh: 'Obnovit', refreshing: 'Obnovuji…', cancel: 'Zrušit', delete: 'Smazat', deleting: 'Mažu…',
  dashboardEyebrow: 'ŽIVÝ PŘEHLED', dashboardTitle: 'Dobré směny.', dashboardOnline: 'Továrna naposledy odpověděla', dashboardOffline: 'Čekám na živou odpověď Factorio telemetry.',
  tasksEyebrow: 'SPOLEČNÁ PRÁCE', tasksTitle: 'Úkoly', tasksArchive: 'Archiv úkolů', tasksDescription: 'Přetáhněte kartu mezi sloupci, nebo otevřete detail pro kompletní úpravu.', activeTasks: 'Aktivní úkoly', archive: 'Archiv',
  messagesEyebrow: 'MEZI OPERÁTORY', messagesTitle: 'Vzkazy', messagesDescription: 'Krátké poznámky, které uvidíte oba. Bez stavů, priorit a zbytečné administrativy.',
  productionEyebrow: 'SPOLEČNÁ TOVÁRNA', productionTitle: 'Výroba', productionDescription: 'Vyberte až čtyři položky a porovnejte jejich výrobu i spotřebu v jednom grafu.',
  goalsEyebrow: 'VÝROBNÍ PLÁN', goalsTitle: 'Výrobní cíle', goalsDescription: 'Sledujte přírůstek výroby od založení cíle. Splnění se připíše do Vzkazů a ohlásí přímo ve hře.', refreshGoals: 'Zjistit nynější stav',
  achievementsEyebrow: 'TOVÁRNÍ TROFEJE', achievementsTitle: 'Úspěchy', achievementsDescription: 'různých výzev pro hráče i společnou továrnu.',
  reportEyebrow: 'AUTOMATICKÉ PŘEDÁNÍ', reportTitle: 'Report směny', reportDescription: 'Živý souhrn výroby, lidí a společné práce. Obnovuje se každou minutu.',
  activityEyebrow: 'ČASOVÁ OSA', activityTitle: 'Události', activityDescription: 'Posledních 100 změn z Factorio serveru a aplikace.',
  profilesEyebrow: 'OPERÁTOŘI', profilesTitle: 'Hráči', profilesDescription: 'Všechny dostupné osobní statistiky z telemetry a společné práce ve webu.',
  serverEyebrow: 'BEZPEČNÉ OVLÁDÁNÍ', serverTitle: 'Server', serverDescription: 'Pouze pevně povolené informační RCON dotazy a zprávy do hry. Žádná raw konzole.',
  catalogTitle: 'Katalog položek', catalogOpen: 'Otevřít katalog', catalogClose: 'Zavřít katalog', allFactory: 'Celá továrna',
  both: 'Obojí', production: 'Výroba', consumption: 'Spotřeba', productionPerMinute: 'Výroba/min', consumptionPerMinute: 'Spotřeba/min', timeRange: 'Časový rozsah',
  comparisonTitle: 'Porovnání položek', factoryFlowTitle: 'Tok celé továrny', comparisonSubtitle: 'Jednotlivé položky ve stejném měřítku', factoryFlowSubtitle: 'Součet výroby a spotřeby za minutu', loadingProduction: 'Načítám výrobní statistiky…',
  deleteTaskTitle: 'Smazat úkol?', deleteTaskDescription: 'Tento úkol, jeho checklist, komentáře a historie budou trvale odstraněny.',
  deleteMessageTitle: 'Smazat vzkaz?', deleteMessageDescription: 'Vzkaz i všechny jeho reakce budou trvale odstraněny.',
  deleteGoalTitle: 'Smazat výrobní cíl?', deleteGoalDescription: 'Dosavadní průběh tohoto cíle bude trvale odstraněn.'
} as const;
type UiKey = keyof typeof uiCs;
const uiEn: Record<UiKey, string> = {
  navDashboard: 'Overview', navTasks: 'Tasks', navMessages: 'Messages', navProduction: 'Production', navGoals: 'Production goals',
  navAchievements: 'Achievements', navReport: 'Shift report', navActivity: 'Activity', navProfiles: 'Players', navServer: 'Server',
  mainNavigation: 'Main navigation', itemLanguage: 'Application and item language', openMenu: 'Open menu', closeMenu: 'Close menu', logout: 'Log out',
  refresh: 'Refresh', refreshing: 'Refreshing…', cancel: 'Cancel', delete: 'Delete', deleting: 'Deleting…',
  dashboardEyebrow: 'LIVE OVERVIEW', dashboardTitle: 'Good shift.', dashboardOnline: 'The factory last responded', dashboardOffline: 'Waiting for a live Factorio telemetry response.',
  tasksEyebrow: 'SHARED WORK', tasksTitle: 'Tasks', tasksArchive: 'Task archive', tasksDescription: 'Drag a card between columns, or open its detail for full editing.', activeTasks: 'Active tasks', archive: 'Archive',
  messagesEyebrow: 'BETWEEN OPERATORS', messagesTitle: 'Messages', messagesDescription: 'Short notes visible to both of you, without statuses, priorities, or extra administration.',
  productionEyebrow: 'SHARED FACTORY', productionTitle: 'Production', productionDescription: 'Select up to four items and compare both their production and consumption in one chart.',
  goalsEyebrow: 'PRODUCTION PLAN', goalsTitle: 'Production goals', goalsDescription: 'Track production added since a goal was created. Completion is posted to Messages and announced in game.', refreshGoals: 'Check current progress',
  achievementsEyebrow: 'FACTORY TROPHIES', achievementsTitle: 'Achievements', achievementsDescription: 'different challenges for players and the shared factory.',
  reportEyebrow: 'AUTOMATIC HANDOVER', reportTitle: 'Shift report', reportDescription: 'A live summary of production, players, and shared work. Refreshes every minute.',
  activityEyebrow: 'TIMELINE', activityTitle: 'Activity', activityDescription: 'The latest 100 changes from the Factorio server and this application.',
  profilesEyebrow: 'OPERATORS', profilesTitle: 'Players', profilesDescription: 'All available personal statistics from telemetry and shared work in the application.',
  serverEyebrow: 'SAFE CONTROL', serverTitle: 'Server', serverDescription: 'Only allow-listed informational RCON queries and in-game messages. No raw console.',
  catalogTitle: 'Item catalog', catalogOpen: 'Open catalog', catalogClose: 'Close catalog', allFactory: 'Whole factory',
  both: 'Both', production: 'Production', consumption: 'Consumption', productionPerMinute: 'Production/min', consumptionPerMinute: 'Consumption/min', timeRange: 'Time range',
  comparisonTitle: 'Item comparison', factoryFlowTitle: 'Whole-factory flow', comparisonSubtitle: 'Individual items on the same scale', factoryFlowSubtitle: 'Total production and consumption per minute', loadingProduction: 'Loading production statistics…',
  deleteTaskTitle: 'Delete task?', deleteTaskDescription: 'This task, its checklist, comments, and history will be permanently deleted.',
  deleteMessageTitle: 'Delete message?', deleteMessageDescription: 'The message and all of its reactions will be permanently deleted.',
  deleteGoalTitle: 'Delete production goal?', deleteGoalDescription: 'The progress recorded for this goal will be permanently deleted.'
};
const textFor = (locale: Locale, key: UiKey) => (locale === 'cs' ? uiCs : uiEn)[key];
const taskStatusLabels: Record<Locale, Record<TaskStatus, string>> = {
  cs: { Now: 'Priorita', Next: 'Non-Priority', Later: 'Idea', Done: 'Hotovo' },
  en: { Now: 'Priority', Next: 'Non-Priority', Later: 'Idea', Done: 'Done' }
};
const presetTaskTags = ['server', 'výroba', 'logistika', 'obrana', 'nápad'];
const compactNumber = new Intl.NumberFormat('cs-CZ', { notation: 'compact', maximumFractionDigits: 1 });
const preciseNumber = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 });
const wholeNumber = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 });
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
  const { labels } = useContext(labelsContext);
  return labelFor(labels, prototype);
}

type GlyphName = View | 'sun' | 'moon' | 'refresh' | 'logout' | 'close' | 'send' | 'download' | 'menu' | 'pin' | 'edit' | 'trash' | 'archive' | 'copy';
function Glyph({ name }: { name: GlyphName }) {
  const paths: Record<GlyphName, ReactNode> = {
    Dashboard: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="4" rx="2"/><rect x="14" y="11" width="7" height="10" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/></>,
    Tasks: <><path d="M9 6h11M9 12h11M9 18h11"/><path d="m3 6 1.5 1.5L7 4.5M3 12l1.5 1.5L7 10.5M3 18l1.5 1.5L7 16.5"/></>,
    Messages: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8M8 13h5"/></>,
    Production: <><path d="M4 19V9l5 3V7l5 3V4h6v15z"/><path d="M7 19v-3h3v3M14 19v-4h3v4"/></>,
    Goals: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/><path d="m19 5 2-2M17 7l4-4"/></>,
    Achievements: <><path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4M12 13v4M8 21h8M9 17h6"/></>,
    Activity: <><path d="M3 12h4l2-6 4 12 2-6h6"/></>,
    Profiles: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-4 2.5-6 6-6s6 2 6 6M14 15c3.8-.8 7 1 7 5"/></>,
    Server: <><rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01M11 7h7M11 17h7"/></>,
    Report: <><path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5"/><path d="m15 16 1.5 1.5L20 14"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
    moon: <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>,
    refresh: <><path d="M20 7v5h-5"/><path d="M19 12a7 7 0 1 0-2 5"/></>,
    logout: <><path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    send: <path d="m3 11 18-8-8 18-2-8zM11 13l5-5"/>,
    download: <><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/></>,
    menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
    pin: <><path d="m9 3 6 6M10 8l-5 5 6 1 1 6 5-5M4 20l5-5"/></>,
    edit: <><path d="m4 20 4.5-1L19 8.5 15.5 5 5 15.5zM13.5 7l3.5 3.5"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></>,
    archive: <><path d="M4 7h16v13H4zM3 3h18v4H3zM9 11h6"/></>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>
  };
  return <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function LanguageToggle({ locale, setLocale }: { locale: Locale; setLocale: (locale: Locale) => void }) {
  return <div className="language-toggle" role="group" aria-label={textFor(locale, 'itemLanguage')}><button type="button" className={locale === 'cs' ? 'active' : ''} onClick={() => setLocale('cs')}>CZ</button><button type="button" className={locale === 'en' ? 'active' : ''} onClick={() => setLocale('en')}>EN</button></div>;
}

function ThemeToggle({ theme, setTheme }: { theme: Theme; setTheme: (theme: Theme) => void }) {
  const { locale } = useContext(labelsContext);
  const next = theme === 'dark' ? 'light' : 'dark';
  const title = locale === 'cs' ? `Zapnout ${next === 'dark' ? 'tmavý' : 'světlý'} režim` : `Switch to ${next} mode`;
  return <button className="icon-button" type="button" onClick={() => setTheme(next)} aria-label={title} title={title}><Glyph name={theme === 'dark' ? 'sun' : 'moon'} /></button>;
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

const navigation: Array<{ id: View; labelKey: UiKey }> = [
  { id: 'Dashboard', labelKey: 'navDashboard' }, { id: 'Tasks', labelKey: 'navTasks' }, { id: 'Messages', labelKey: 'navMessages' }, { id: 'Production', labelKey: 'navProduction' },
  { id: 'Goals', labelKey: 'navGoals' }, { id: 'Achievements', labelKey: 'navAchievements' }, { id: 'Report', labelKey: 'navReport' }, { id: 'Activity', labelKey: 'navActivity' }, { id: 'Profiles', labelKey: 'navProfiles' }, { id: 'Server', labelKey: 'navServer' }
];

function Navigation({ active, setActive, onNavigate }: { active: View; setActive: (view: View) => void; onNavigate?: () => void }) {
  const { locale } = useContext(labelsContext);
  return <nav className="navigation" aria-label={textFor(locale, 'mainNavigation')}>{navigation.map((item) => <button type="button" key={item.id} className={active === item.id ? 'active' : ''} onClick={() => { setActive(item.id); onNavigate?.(); }} aria-current={active === item.id ? 'page' : undefined}><Glyph name={item.id} /><span>{textFor(locale, item.labelKey)}</span></button>)}</nav>;
}

function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description?: string; actions?: ReactNode }) {
  const { locale } = useContext(labelsContext);
  const englishHeaders: Record<string, string> = {
    'TOVÁRNÍ TROFEJE': uiEn.achievementsEyebrow, 'Úspěchy': uiEn.achievementsTitle,
    'AUTOMATICKÉ PŘEDÁNÍ': uiEn.reportEyebrow, 'Report směny': uiEn.reportTitle, 'Živý souhrn výroby, lidí a společné práce. Obnovuje se každou minutu.': uiEn.reportDescription,
    'ČASOVÁ OSA': uiEn.activityEyebrow, 'Události': uiEn.activityTitle, 'Posledních 100 změn z Factorio serveru a aplikace.': uiEn.activityDescription,
    'OPERÁTOŘI': uiEn.profilesEyebrow, 'Hráči': uiEn.profilesTitle, 'Všechny dostupné osobní statistiky z telemetry a společné práce ve webu.': uiEn.profilesDescription,
    'BEZPEČNÉ OVLÁDÁNÍ': uiEn.serverEyebrow, 'Server': uiEn.serverTitle, 'Pouze pevně povolené informační RCON dotazy a zprávy do hry. Žádná raw konzole.': uiEn.serverDescription
  };
  const localize = (value: string) => locale === 'en' ? englishHeaders[value] ?? value.replace(/^(\d+) různých výzev pro hráče i společnou továrnu\.$/, `$1 ${uiEn.achievementsDescription}`) : value;
  return <header className="page-header"><div><p className="eyebrow">{localize(eyebrow)}</p><h1>{localize(title)}</h1>{description && <p className="page-description">{localize(description)}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</header>;
}

function ConfirmDialog({ title, description, busy = false, onCancel, onConfirm }: { title: string; description: string; busy?: boolean; onCancel: () => void; onConfirm: () => void }) {
  const { locale } = useContext(labelsContext);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [busy, onCancel]);
  return <div className="confirm-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onCancel()}>
    <article className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description">
      <span className="confirm-icon"><Glyph name="trash" /></span>
      <div><p className="eyebrow">{locale === 'cs' ? 'POTVRZENÍ AKCE' : 'CONFIRM ACTION'}</p><h2 id="confirm-title">{title}</h2><p id="confirm-description">{description}</p></div>
      <footer><button type="button" className="secondary" disabled={busy} onClick={onCancel}>{textFor(locale, 'cancel')}</button><button type="button" className="danger-confirm" disabled={busy} onClick={onConfirm}>{textFor(locale, busy ? 'deleting' : 'delete')}</button></footer>
    </article>
  </div>;
}

function Panel({ title, subtitle, action, className = '', children }: { title: string; subtitle?: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return <article className={`panel ${className}`}><header className="panel-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</header>{children}</article>;
}

function Metric({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'production' | 'consumption' }) {
  return <article className={`metric ${tone ?? ''}`}><small>{label}</small><strong>{value}</strong>{note && <span>{note}</span>}</article>;
}

function EmptyState({ children }: { children: ReactNode }) { return <div className="empty-state"><span>···</span><p>{children}</p></div>; }

function ItemFlowList({ items, metric, limit = 6 }: { items: FactoryItem[]; metric: 'productionRate' | 'consumptionRate'; limit?: number }) {
  const { labels } = useContext(labelsContext);
  const visible = [...items].filter((item) => item[metric] > 0).sort((left, right) => right[metric] - left[metric]).slice(0, limit);
  const maximum = visible[0]?.[metric] ?? 1;
  if (!visible.length) return <EmptyState>Factorio za poslední minutu nezaznamenalo žádný tok položek.</EmptyState>;
  return <ul className="flow-list">{visible.map((item) => <li key={item.item}>
    <ItemIcon prototype={item.item} />
    <div className="flow-copy"><div><strong>{labelFor(labels, item.item)}</strong><span>{preciseNumber.format(item[metric])} / min</span></div><div className="flow-track"><span style={{ width: `${Math.max(3, item[metric] / maximum * 100)}%` }} /></div></div>
  </li>)}</ul>;
}

function DashboardView({ data, refresh, refreshing }: { data: Dashboard; refresh: () => void; refreshing: boolean }) {
  const { locale } = useContext(labelsContext);
  const server = data.snapshot.server;
  const productionRate = data.snapshot.sharedFactory.reduce((sum, item) => sum + Math.max(0, item.productionRate), 0);
  const consumptionRate = data.snapshot.sharedFactory.reduce((sum, item) => sum + Math.max(0, item.consumptionRate), 0);
  return <section className="content">
    <PageHeader eyebrow={textFor(locale, 'dashboardEyebrow')} title={textFor(locale, 'dashboardTitle')} description={server.online ? `${textFor(locale, 'dashboardOnline')} ${timeAgo(data.snapshot.generatedAt)}.` : textFor(locale, 'dashboardOffline')} actions={<button className="secondary with-icon" onClick={refresh} disabled={refreshing}><Glyph name="refresh" />{textFor(locale, refreshing ? 'refreshing' : 'refresh')}</button>} />
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
        {data.tasks.length ? <ul className="task-summary">{data.tasks.map((task) => <li key={task.id}><b className={`priority p${task.priority}`}>P{task.priority}</b><div><strong>{task.title}</strong><small>{taskStatusLabels[locale][task.status as TaskStatus] ?? task.status}{task.location ? ` · ${task.location}` : ''}</small></div></li>)}</ul> : <EmptyState>Zatím nejsou žádné otevřené úkoly.</EmptyState>}
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

function parseTags(value: string) { return [...new Set(value.split(/[\s,#]+/u).map((tag) => tag.trim().replace(/^#+/, '').toLocaleLowerCase('cs')).filter(Boolean))].slice(0, 10); }
function localDateTime(value: string | null) { if (!value) return ''; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }

function TasksView({ onChanged }: { onChanged: () => void }) {
  const { locale } = useContext(labelsContext);
  const statusLabels = taskStatusLabels[locale];
  const [tasks, setTasks] = useState<Task[]>([]); const [profiles, setProfiles] = useState<Profile[]>([]);
  const [title, setTitle] = useState(''); const [status, setStatus] = useState<TaskStatus>('Next'); const [priority, setPriority] = useState(2);
  const [dueAt, setDueAt] = useState(''); const [assignees, setAssignees] = useState<string[]>([]); const [tagsInput, setTagsInput] = useState(''); const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [search, setSearch] = useState(''); const [assigneeFilter, setAssigneeFilter] = useState(''); const [tagFilter, setTagFilter] = useState(''); const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState(''); const [selected, setSelected] = useState<string | null>(null); const [dragging, setDragging] = useState<string | null>(null);
  const load = () => Promise.all([api<Task[]>('/api/tasks'), api<Profile[]>('/api/profiles')]).then(([loadedTasks, loadedProfiles]) => { setTasks(loadedTasks); setProfiles(loadedProfiles); setAssignees((current) => current.length ? current : loadedProfiles.map((profile) => profile.id)); });
  useEffect(() => { void load().catch((reason) => setError(reason.message)); }, []);
  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const tags = useMemo(() => [...new Set(tasks.flatMap((task) => task.tags))].sort(), [tasks]);
  const visibleTasks = useMemo(() => tasks.filter((task) => task.isArchived === showArchived && (!search || `${task.title} ${task.description} ${task.tags.join(' ')}`.toLocaleLowerCase('cs').includes(search.toLocaleLowerCase('cs'))) && (!assigneeFilter || task.assigneeIds.includes(assigneeFilter)) && (!tagFilter || task.tags.includes(tagFilter))), [tasks, showArchived, search, assigneeFilter, tagFilter]);
  async function create(event: React.FormEvent) {
    event.preventDefault(); setError('');
    try { await api('/api/tasks', { method: 'POST', body: JSON.stringify({ title, status, priority, dueAt: dueAt ? new Date(dueAt).toISOString() : null, assigneeIds: assignees, tags: [...new Set([...selectedTags, ...parseTags(tagsInput)])] }) }); setTitle(''); setDueAt(''); setTagsInput(''); setSelectedTags([]); await load(); onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Úkol se nepodařilo vytvořit.'); }
  }
  async function update(id: string, body: object) { try { await api(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }); await load(); onChanged(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Změna se nezdařila.'); } }
  async function move(id: string, next: TaskStatus) { try { await api(`/api/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next }) }); await load(); onChanged(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Změna se nezdařila.'); } }
  async function toggleChecklist(taskId: string, itemId: string, isDone: boolean) { try { await api(`/api/tasks/${taskId}/checklist/${itemId}`, { method: 'PATCH', body: JSON.stringify({ isDone }) }); await load(); onChanged(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Checklist se nepodařilo změnit.'); } }
  return <section className="content">
    <PageHeader eyebrow={textFor(locale, 'tasksEyebrow')} title={textFor(locale, showArchived ? 'tasksArchive' : 'tasksTitle')} description={textFor(locale, 'tasksDescription')} actions={<button className="secondary with-icon" onClick={() => setShowArchived((value) => !value)}><Glyph name="archive" />{textFor(locale, showArchived ? 'activeTasks' : 'archive')}</button>} />
    {error && <p className="error banner" role="alert">{error}</p>}
    {!showArchived && <Panel title="Přidat úkol" subtitle="Rychlé založení; popis, lokaci a blueprint doplníte v detailu.">
      <form className="task-form" onSubmit={create}>
        <input className="task-title-input" placeholder="Co je potřeba udělat?" value={title} onChange={(event) => setTitle(event.target.value)} required />
        <select aria-label="Skupina" value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select aria-label="Priorita" value={priority} onChange={(event) => setPriority(Number(event.target.value))}>{[1, 2, 3, 4].map((value) => <option key={value} value={value}>Priorita {value}</option>)}</select>
        <input type="datetime-local" aria-label="Termín" title="Termín" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
        <div className="task-tags-field"><input aria-label="Hashtagy" placeholder="Hashtagy: server, výroba…" value={tagsInput} onChange={(event) => setTagsInput(event.target.value)} /><div className="tag-presets">{presetTaskTags.map((tag) => <button type="button" className={selectedTags.includes(tag) ? 'active' : ''} key={tag} onClick={() => setSelectedTags((current) => current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag])}>#{tag}</button>)}</div></div>
        <div className="assignees">{profiles.map((profile) => <label key={profile.id}><input type="checkbox" checked={assignees.includes(profile.id)} onChange={() => setAssignees((current) => current.includes(profile.id) ? current.filter((value) => value !== profile.id) : [...current, profile.id])} />{profile.displayName}</label>)}</div>
        <button className="primary">Vytvořit</button>
      </form>
    </Panel>}
    <div className="task-filters"><label><span>Hledat</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Název, popis nebo hashtag…" /></label><label><span>Řešitel</span><select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}><option value="">Všichni</option>{profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.displayName}</option>)}</select></label><label><span>Hashtag</span><select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="">Všechny</option>{tags.map((tag) => <option value={tag} key={tag}>#{tag}</option>)}</select></label></div>
    <div className="board">{(Object.keys(statusLabels) as TaskStatus[]).map((column) => {
      const columnTasks = visibleTasks.filter((task) => task.status === column);
      return <article className={`board-column status-${column.toLocaleLowerCase()} ${dragging ? 'drop-ready' : ''}`} key={column} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragging) void move(dragging, column); setDragging(null); }}><header><h2>{statusLabels[column]}</h2><span>{columnTasks.length}</span></header><div className="board-stack">{columnTasks.map((task) => {
        const doneCount = task.checklist.filter((item) => item.isDone).length;
        return <article className={`task-card ${task.isPinned ? 'pinned' : ''}`} draggable={!showArchived} role="button" tabIndex={0} onDragStart={() => setDragging(task.id)} onDragEnd={() => setDragging(null)} onClick={() => setSelected(task.id)} onKeyDown={(event) => event.key === 'Enter' && setSelected(task.id)} key={task.id}>
          <div><span className="task-badges"><b className={`priority p${task.priority}`}>P{task.priority}</b>{task.isPinned && <b className="pin-badge"><Glyph name="pin" /></b>}</span>{task.location && <small>{task.location}</small>}</div>
          <strong>{task.title}</strong>{task.description && <p>{task.description}</p>}
          <div className="task-meta">{task.dueAt && <span className={new Date(task.dueAt) < new Date() && task.status !== 'Done' ? 'overdue' : ''}>Termín {new Date(task.dueAt).toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' })}</span>}<span className="task-assignee-list">{task.assigneeIds.map((id) => { const profile = profileMap.get(id); return profile && <i title={profile.displayName} style={{ '--avatar-color': profile.color } as CSSProperties} key={id}>{profile.displayName.slice(0, 1)}</i>; })}</span></div>
          {task.tags.length > 0 && <div className="task-card-tags">{task.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
          {task.checklist.length > 0 && <section className="task-card-checklist" onClick={(event) => event.stopPropagation()}><header><span>Checklist</span><small>{doneCount}/{task.checklist.length}</small></header><ul>{task.checklist.slice(0, 3).map((item) => <li key={item.id}><label><input type="checkbox" checked={item.isDone} onChange={(event) => void toggleChecklist(task.id, item.id, event.target.checked)} /><span>{item.text}</span></label></li>)}</ul>{task.checklist.length > 3 && <small>+ {task.checklist.length - 3} další</small>}</section>}
          {task.comments.length > 0 && <section className="task-card-comments">{task.comments.slice(-2).map((comment) => <div key={comment.id}><span className="comment-avatar" style={{ '--avatar-color': comment.color } as CSSProperties}>{comment.display_name.slice(0, 1)}</span><p><strong>{comment.display_name}</strong><span>{comment.body}</span></p></div>)}</section>}
          {!showArchived && <select aria-label={`Skupina úkolu ${task.title}`} value={task.status} onClick={(event) => event.stopPropagation()} onChange={(event) => void move(task.id, event.target.value as TaskStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}
        </article>;
      })}{!columnTasks.length && <p className="column-empty">Sem můžete úkol přetáhnout</p>}</div></article>;
    })}</div>
    {selected && <TaskDetailView id={selected} profiles={profiles} onClose={() => setSelected(null)} onChanged={() => { void load(); onChanged(); }} onDeleted={() => { setSelected(null); void load(); onChanged(); }} />}
  </section>;
}

function TaskDetailView({ id, profiles, onClose, onChanged, onDeleted }: { id: string; profiles: Profile[]; onClose: () => void; onChanged: () => void; onDeleted: () => void }) {
  const { locale } = useContext(labelsContext);
  const statusLabels = taskStatusLabels[locale];
  const [task, setTask] = useState<TaskDetail | null>(null); const [editing, setEditing] = useState(false); const [draft, setDraft] = useState({ title: '', description: '', status: 'Next' as TaskStatus, priority: 2, location: '', blueprintString: '', dueAt: '', tags: '', assigneeIds: [] as string[] });
  const [checkText, setCheckText] = useState(''); const [comment, setComment] = useState(''); const [error, setError] = useState(''); const [confirmDelete, setConfirmDelete] = useState(false); const [deleting, setDeleting] = useState(false);
  const load = () => api<TaskDetail>(`/api/tasks/${id}`).then((value) => { setTask(value); setDraft({ title: value.title, description: value.description, status: value.status, priority: value.priority, location: value.location ?? '', blueprintString: value.blueprint_string ?? '', dueAt: localDateTime(value.dueAt), tags: value.tags.join(' '), assigneeIds: value.assigneeIds }); });
  useEffect(() => { void load().catch((reason) => setError(reason.message)); }, [id]);
  useEffect(() => { const close = (event: KeyboardEvent) => event.key === 'Escape' && !confirmDelete && onClose(); window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [confirmDelete, onClose]);
  async function save(event: React.FormEvent) { event.preventDefault(); try { await api(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ ...draft, location: draft.location || null, blueprintString: draft.blueprintString || null, dueAt: draft.dueAt ? new Date(draft.dueAt).toISOString() : null, tags: parseTags(draft.tags) }) }); setEditing(false); await load(); onChanged(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Úkol se nepodařilo uložit.'); } }
  async function patch(body: object) { try { await api(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }); await load(); onChanged(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Změna se nezdařila.'); } }
  async function remove() { setDeleting(true); try { await api(`/api/tasks/${id}`, { method: 'DELETE' }); onDeleted(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Úkol se nepodařilo smazat.'); setConfirmDelete(false); } finally { setDeleting(false); } }
  async function addChecklist(event: React.FormEvent) { event.preventDefault(); try { await api(`/api/tasks/${id}/checklist`, { method: 'POST', body: JSON.stringify({ text: checkText }) }); setCheckText(''); await load(); onChanged(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Položku se nepodařilo přidat.'); } }
  async function toggle(itemId: string, isDone: boolean) { try { await api(`/api/tasks/${id}/checklist/${itemId}`, { method: 'PATCH', body: JSON.stringify({ isDone }) }); await load(); onChanged(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Změna se nezdařila.'); } }
  async function addComment(event: React.FormEvent) { event.preventDefault(); try { await api(`/api/tasks/${id}/comments`, { method: 'POST', body: JSON.stringify({ body: comment }) }); setComment(''); await load(); onChanged(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Komentář se nepodařilo přidat.'); } }
  return <div className="task-detail-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><article className="task-detail" role="dialog" aria-modal="true" aria-labelledby="task-detail-title"><button className="icon-button detail-close" onClick={onClose} aria-label="Zavřít detail"><Glyph name="close" /></button>{error && <p className="error">{error}</p>}{!task ? <div className="loading-inline">Načítám úkol…</div> : editing ? <form className="task-edit-form" onSubmit={save}><p className="eyebrow">UPRAVIT ÚKOL</p><label>Název<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required /></label><label>Popis<textarea rows={4} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label><div className="form-row"><label>Skupina<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as TaskStatus })}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Priorita<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value) })}>{[1, 2, 3, 4].map((value) => <option value={value} key={value}>P{value}</option>)}</select></label></div><div className="form-row"><label>Lokace<input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} /></label><label>Termín<input type="datetime-local" value={draft.dueAt} onChange={(event) => setDraft({ ...draft, dueAt: event.target.value })} /></label></div><label>Hashtagy<input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} /></label><label>Blueprint string<textarea rows={3} value={draft.blueprintString} onChange={(event) => setDraft({ ...draft, blueprintString: event.target.value })} /></label><fieldset><legend>Řešitelé</legend><div className="assignees">{profiles.map((profile) => <label key={profile.id}><input type="checkbox" checked={draft.assigneeIds.includes(profile.id)} onChange={() => setDraft({ ...draft, assigneeIds: draft.assigneeIds.includes(profile.id) ? draft.assigneeIds.filter((value) => value !== profile.id) : [...draft.assigneeIds, profile.id] })} />{profile.displayName}</label>)}</div></fieldset><div className="detail-actions"><button type="button" className="secondary" onClick={() => setEditing(false)}>Zrušit</button><button>Uložit změny</button></div></form> : <><div className="detail-toolbar"><button className="secondary with-icon" onClick={() => setEditing(true)}><Glyph name="edit" />Upravit</button><button className="secondary with-icon" onClick={() => void patch({ isPinned: !task.isPinned })}><Glyph name="pin" />{task.isPinned ? 'Odepnout' : 'Připnout'}</button><button className="secondary with-icon" onClick={() => void patch({ isArchived: !task.isArchived })}><Glyph name="archive" />{task.isArchived ? 'Obnovit' : 'Archivovat'}</button><button className="danger-button icon-button" onClick={() => setConfirmDelete(true)} aria-label="Smazat úkol"><Glyph name="trash" /></button></div><p className="eyebrow">{statusLabels[task.status]} · PRIORITA {task.priority}</p><h2 id="task-detail-title">{task.title}</h2><p className="task-description">{task.description || 'Bez popisu.'}</p><div className="detail-meta">{task.dueAt && <span>Termín {new Date(task.dueAt).toLocaleString('cs-CZ')}</span>}{task.location && <span>Lokace {task.location}</span>}<span>{task.assigneeIds.map((id) => profiles.find((profile) => profile.id === id)?.displayName).filter(Boolean).join(', ')}</span></div>{task.blueprint_string && <section><h3>Blueprint</h3><button className="secondary with-icon" onClick={() => void navigator.clipboard.writeText(task.blueprint_string!)}><Glyph name="copy" />Kopírovat blueprint string</button></section>}<section><h3>Checklist</h3><ul className="checklist">{task.checklist.map((item) => <li key={item.id}><label><input type="checkbox" checked={item.isDone} onChange={(event) => void toggle(item.id, event.target.checked)} /><span>{item.text}</span></label></li>)}</ul><form className="inline-form" onSubmit={addChecklist}><input value={checkText} onChange={(event) => setCheckText(event.target.value)} placeholder="Nová položka" required /><button>Přidat</button></form></section><section><h3>Komentáře</h3>{task.comments.map((entry) => <p className="comment" key={entry.id}><strong>{entry.display_name}</strong><span>{entry.body}</span></p>)}<form className="inline-form" onSubmit={addComment}><input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Napsat komentář" required /><button>Odeslat</button></form></section><section><h3>Historie</h3><ul className="history">{task.history.map((entry) => <li key={entry.id}>{entry.display_name} · {entry.action} · {timeAgo(entry.created_at)}</li>)}</ul></section></>}</article>{confirmDelete && <ConfirmDialog title={textFor(locale, 'deleteTaskTitle')} description={textFor(locale, 'deleteTaskDescription')} busy={deleting} onCancel={() => setConfirmDelete(false)} onConfirm={() => void remove()} />}</div>;
}

function MessagesView() {
  const { locale } = useContext(labelsContext);
  const [messages, setMessages] = useState<SharedMessage[]>([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState<string | null>(null); const [editBody, setEditBody] = useState(''); const [pendingDelete, setPendingDelete] = useState<string | null>(null); const [deleting, setDeleting] = useState(false);
  const load = () => api<SharedMessage[]>('/api/messages').then((value) => { setMessages(value); setError(''); const unread = value.filter((message) => !message.isOwn).map((message) => message.id); if (unread.length) void api('/api/messages/read', { method: 'POST', body: JSON.stringify({ messageIds: unread }) }); });
  useEffect(() => { void load().catch((reason) => setError(reason.message)); const timer = window.setInterval(() => void load(), 30_000); return () => window.clearInterval(timer); }, []);
  async function send(event: React.FormEvent) {
    event.preventDefault(); setSending(true); setError('');
    try { await api('/api/messages', { method: 'POST', body: JSON.stringify({ body }) }); setBody(''); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Vzkaz se nepodařilo odeslat.'); }
    finally { setSending(false); }
  }
  async function react(id: string, emoji: string) { try { await api(`/api/messages/${id}/reactions`, { method: 'POST', body: JSON.stringify({ emoji }) }); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Reakci se nepodařilo uložit.'); } }
  async function pin(message: SharedMessage) { try { await api(`/api/messages/${message.id}`, { method: 'PATCH', body: JSON.stringify({ isPinned: !message.isPinned }) }); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Vzkaz se nepodařilo připnout.'); } }
  async function saveEdit(event: React.FormEvent, id: string) { event.preventDefault(); try { await api(`/api/messages/${id}`, { method: 'PATCH', body: JSON.stringify({ body: editBody }) }); setEditing(null); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Vzkaz se nepodařilo upravit.'); } }
  async function remove(id: string) { setDeleting(true); try { await api(`/api/messages/${id}`, { method: 'DELETE' }); setPendingDelete(null); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Vzkaz se nepodařilo smazat.'); } finally { setDeleting(false); } }
  return <section className="content messages-view">
    <PageHeader eyebrow={textFor(locale, 'messagesEyebrow')} title={textFor(locale, 'messagesTitle')} description={textFor(locale, 'messagesDescription')} />
    {error && <p className="error banner" role="alert">{error}</p>}
    <Panel title="Nový vzkaz" subtitle="Až 2 000 znaků, vhodné pro předání směny nebo rychlou poznámku.">
      <form className="message-composer" onSubmit={send}><textarea autoFocus placeholder="Co má druhý operátor vědět?" maxLength={2000} rows={3} value={body} onChange={(event) => setBody(event.target.value)} required /><footer><small>{body.length}/2 000</small><button className="primary with-icon" disabled={sending}><Glyph name="send" />{sending ? 'Odesílám…' : 'Přidat vzkaz'}</button></footer></form>
    </Panel>
    <Panel title="Nástěnka" subtitle={`${messages.length} ${messages.length === 1 ? 'vzkaz' : messages.length >= 2 && messages.length <= 4 ? 'vzkazy' : 'vzkazů'}`}>
      {messages.length ? <div className="messages-feed">{messages.map((message) => <article className={`message-note ${message.isPinned ? 'pinned' : ''}`} key={message.id}><span className="message-avatar" style={{ '--avatar-color': message.color } as CSSProperties}>{message.display_name.slice(0, 1)}</span><div><header><div><strong>{message.display_name}</strong>{message.isPinned && <span className="message-pin"><Glyph name="pin" />Připnuto</span>}</div><time>{timeAgo(message.created_at)}{message.updated_at && message.updated_at !== message.created_at ? ' · upraveno' : ''}</time></header>{editing === message.id ? <form className="message-edit" onSubmit={(event) => void saveEdit(event, message.id)}><textarea rows={3} value={editBody} onChange={(event) => setEditBody(event.target.value)} autoFocus required /><div><button type="button" className="secondary" onClick={() => setEditing(null)}>Zrušit</button><button>Uložit</button></div></form> : <p>{message.body}</p>}<footer className="message-footer"><div className="message-reactions">{['👍', '❤️', '😂', '🔥', '⚙️'].map((emoji) => { const reaction = message.reactions.find((item) => item.emoji === emoji); return <button type="button" className={reaction?.reactedByMe ? 'active' : ''} title={reaction?.users.join(', ')} onClick={() => void react(message.id, emoji)} key={emoji}>{emoji}{reaction ? <span>{reaction.count}</span> : null}</button>; })}</div><div className="message-tools"><button type="button" className="icon-button" onClick={() => void pin(message)} aria-label={message.isPinned ? 'Odepnout vzkaz' : 'Připnout vzkaz'}><Glyph name="pin" /></button>{message.isOwn && <><button type="button" className="icon-button" onClick={() => { setEditing(message.id); setEditBody(message.body); }} aria-label="Upravit vzkaz"><Glyph name="edit" /></button><button type="button" className="icon-button danger-button" onClick={() => setPendingDelete(message.id)} aria-label="Smazat vzkaz"><Glyph name="trash" /></button></>}</div></footer>{message.isOwn && <small className="read-receipt">{message.readBy.length ? `Přečetl: ${message.readBy.join(', ')}` : 'Zatím nepřečteno'}</small>}</div></article>)}</div> : <EmptyState>Na nástěnce zatím nic není. První vzkaz může být úplně krátký.</EmptyState>}
    </Panel>
    {pendingDelete && <ConfirmDialog title={textFor(locale, 'deleteMessageTitle')} description={textFor(locale, 'deleteMessageDescription')} busy={deleting} onCancel={() => setPendingDelete(null)} onConfirm={() => void remove(pendingDelete)} />}
  </section>;
}

function GoalsView() {
  const { labels, locale } = useContext(labelsContext);
  const [goals, setGoals] = useState<ProductionGoal[]>([]); const [production, setProduction] = useState<Production | null>(null); const [tasks, setTasks] = useState<Task[]>([]);
  const [item, setItem] = useState(''); const [amount, setAmount] = useState('10000'); const [taskId, setTaskId] = useState(''); const [search, setSearch] = useState('');
  const [showPicker, setShowPicker] = useState(false); const [showCompleted, setShowCompleted] = useState(true); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [refreshing, setRefreshing] = useState(false); const [pendingDelete, setPendingDelete] = useState<ProductionGoal | null>(null); const [deleting, setDeleting] = useState(false);
  const load = () => Promise.all([api<ProductionGoal[]>('/api/goals'), api<Production>('/api/production?range=1h'), api<Task[]>('/api/tasks')]).then(([goalRows, productionData, taskRows]) => { setGoals(goalRows); setProduction(productionData); setTasks(taskRows.filter((task) => !task.isArchived)); setError(''); });
  useEffect(() => { let active = true; const refresh = () => load().catch((reason) => active && setError(reason.message)); void refresh(); const timer = window.setInterval(() => void refresh(), 30_000); return () => { active = false; window.clearInterval(timer); }; }, []);
  const choices = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase(locale);
    return (production?.catalog ?? []).filter((entry) => !needle || entry.item.includes(needle) || labelFor(labels, entry.item).toLocaleLowerCase(locale).includes(needle)).slice(0, 80);
  }, [production, labels, locale, search]);
  async function create(event: React.FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try { await api('/api/goals', { method: 'POST', body: JSON.stringify({ item, targetAmount: Number(amount), linkedTaskId: taskId || null }) }); setItem(''); setAmount('10000'); setTaskId(''); setShowPicker(false); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Výrobní cíl se nepodařilo vytvořit.'); }
    finally { setBusy(false); }
  }
  async function refreshNow() { setRefreshing(true); setError(''); try { await api('/api/server/telemetry-refresh', { method: 'POST' }); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Aktuální stav se nepodařilo načíst.'); } finally { setRefreshing(false); } }
  async function remove(goal: ProductionGoal) { setDeleting(true); try { await api(`/api/goals/${goal.id}`, { method: 'DELETE' }); setPendingDelete(null); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Cíl se nepodařilo smazat.'); } finally { setDeleting(false); } }
  const visible = goals.filter((goal) => showCompleted || goal.status === 'active');
  const activeCount = goals.filter((goal) => goal.status === 'active').length;
  const completedCount = goals.length - activeCount;
  return <section className="content goals-view">
    <PageHeader eyebrow={textFor(locale, 'goalsEyebrow')} title={textFor(locale, 'goalsTitle')} description={textFor(locale, 'goalsDescription')} actions={<button type="button" className="secondary with-icon" onClick={() => void refreshNow()} disabled={refreshing}><Glyph name="refresh" />{refreshing ? textFor(locale, 'refreshing') : textFor(locale, 'refreshGoals')}</button>} />
    {error && <p className="error banner" role="alert">{error}</p>}
    <div className="goal-summary"><Metric label="Aktivní cíle" value={String(activeCount)} note="právě se sledují" tone="production" /><Metric label="Splněno" value={String(completedCount)} note="historicky" /><Metric label="Sledované tempo" value={`${compactNumber.format(goals.filter((goal) => goal.status === 'active').reduce((sum, goal) => sum + goal.productionRate, 0))} / min`} note="součet aktivních položek" /></div>
    <Panel title="Nový výrobní cíl" subtitle="Počítá se pouze nová výroba od okamžiku založení.">
      <form className="goal-form" onSubmit={create}>
        <label><span>Položka</span><button className="item-picker-button" type="button" onClick={() => setShowPicker((value) => !value)}>{item ? <><ItemIcon prototype={item} /><span><strong>{labelFor(labels, item)}</strong><small>{item}</small></span></> : <span><strong>Vybrat položku</strong><small>Otevřít katalog výroby</small></span>}<Glyph name={showPicker ? 'close' : 'Production'} /></button></label>
        <label><span>Počet kusů</span><input type="number" min="1" max="1000000000000" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
        <label><span>Propojený úkol · volitelné</span><select value={taskId} onChange={(event) => setTaskId(event.target.value)}><option value="">Bez propojení</option>{tasks.map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}</select></label>
        <button className="primary" disabled={busy || !item}>{busy ? 'Zakládám…' : 'Spustit cíl'}</button>
      </form>
      {showPicker && <div className="goal-item-picker"><input type="search" placeholder="Hledat český nebo anglický název…" value={search} onChange={(event) => setSearch(event.target.value)} autoFocus /><div className="catalog-grid compact">{choices.map((entry) => <button type="button" className={item === entry.item ? 'selected' : ''} onClick={() => { setItem(entry.item); setShowPicker(false); }} key={entry.item}><ItemIcon prototype={entry.item} /><span><strong>{labelFor(labels, entry.item)}</strong><small>{preciseNumber.format(entry.productionRate)} / min</small></span></button>)}</div></div>}
    </Panel>
    <div className="goal-list-toolbar"><div><h2>Průběh cílů</h2><p>Aktualizace probíhá s každým minutovým telemetry vzorkem.</p></div><label><input type="checkbox" checked={showCompleted} onChange={(event) => setShowCompleted(event.target.checked)} /> Zobrazit splněné</label></div>
    <div className="goal-grid">{visible.map((goal) => <article className={`goal-card ${goal.status}`} key={goal.id}><header><ItemIcon prototype={goal.item} size="large" /><div><span>{goal.status === 'completed' ? 'SPLNĚNO' : 'AKTIVNÍ CÍL'}</span><h2>{labelFor(labels, goal.item)}</h2><small>{goal.item}</small></div><button className="icon-button danger-button" onClick={() => setPendingDelete(goal)} aria-label="Smazat cíl"><Glyph name="trash" /></button></header><div className="goal-progress-copy"><strong>{wholeNumber.format(goal.progressAmount)} <small>/ {wholeNumber.format(goal.targetAmount)}</small></strong><span>{wholeNumber.format(goal.progress * 100)} %</span></div><div className="goal-track"><i style={{ width: `${goal.progress * 100}%` }} /></div><div className="goal-details"><div><small>Aktuální tempo</small><strong>{preciseNumber.format(goal.productionRate)} / min</strong></div><div><small>Odhad dokončení</small><strong>{goal.status === 'completed' ? timeAgo(goal.completedAt) : goal.etaSeconds ? duration(goal.etaSeconds) : 'čeká na výrobu'}</strong></div></div><footer><span>Založil {goal.createdByName}</span>{goal.linkedTaskTitle && <span>Úkol: {goal.linkedTaskTitle}</span>}{goal.status === 'completed' && <span className={goal.announcedInGame ? 'announced' : ''}>{goal.announcedInGame ? 'Ohlášeno ve hře' : 'Čeká na RCON'}</span>}</footer></article>)}{!visible.length && <div className="goal-empty"><span>🎯</span><h2>První cíl čeká</h2><p>Vyberte vyráběnou položku a množství, kterého chcete společně dosáhnout.</p></div>}</div>
    {pendingDelete && <ConfirmDialog title={textFor(locale, 'deleteGoalTitle')} description={`${labelFor(labels, pendingDelete.item)} — ${textFor(locale, 'deleteGoalDescription')}`} busy={deleting} onCancel={() => setPendingDelete(null)} onConfirm={() => void remove(pendingDelete)} />}
  </section>;
}

function playGoalFanfare() {
  try {
    const audio = new AudioContext();
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
      const oscillator = audio.createOscillator(); const gain = audio.createGain(); const start = audio.currentTime + index * 0.13;
      oscillator.type = 'triangle'; oscillator.frequency.value = frequency; gain.gain.setValueAtTime(0.0001, start); gain.gain.exponentialRampToValueAtTime(0.12, start + 0.025); gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
      oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(start); oscillator.stop(start + 0.3);
    });
    window.setTimeout(() => void audio.close(), 1_200);
  } catch { /* Visual celebration remains available when autoplay is blocked. */ }
}

function GoalCelebrationLayer() {
  const { labels } = useContext(labelsContext); const [goal, setGoal] = useState<ProductionGoal | null>(null);
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const goals = await api<ProductionGoal[]>('/api/goals');
        const seen = new Set(JSON.parse(window.localStorage.getItem('hal-celebrated-goals') ?? '[]') as string[]);
        const recent = goals.find((entry) => entry.status === 'completed' && entry.completedAt && Date.now() - new Date(entry.completedAt).getTime() < 10 * 60_000 && !seen.has(entry.id));
        if (!active || !recent) return;
        seen.add(recent.id); window.localStorage.setItem('hal-celebrated-goals', JSON.stringify([...seen].slice(-100))); setGoal(recent); playGoalFanfare();
        window.setTimeout(() => active && setGoal(null), 9_000);
      } catch { /* Dashboard errors already report connectivity failures. */ }
    };
    void check(); const timer = window.setInterval(() => void check(), 30_000); return () => { active = false; window.clearInterval(timer); };
  }, []);
  if (!goal) return null;
  return <div className="goal-celebration" role="status" aria-live="assertive"><div className="confetti" aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <i style={{ '--i': index } as CSSProperties} key={index} />)}</div><button className="icon-button" onClick={() => setGoal(null)} aria-label="Zavřít oslavu"><Glyph name="close" /></button><span className="celebration-trophy">🏆</span><p>VÝROBNÍ CÍL SPLNĚN</p><h2>{wholeNumber.format(goal.targetAmount)}× {labelFor(labels, goal.item)}</h2><span>Zapsáno do Vzkazů · {goal.announcedInGame ? 'ohlášeno ve hře' : 'RCON oznámení čeká na doručení'}</span></div>;
}

function AchievementsView() {
  const [entries, setEntries] = useState<Achievement[]>([]); const [definitionCount, setDefinitionCount] = useState(0); const [scope, setScope] = useState('factory'); const [category, setCategory] = useState(''); const [hideLocked, setHideLocked] = useState(false); const [error, setError] = useState('');
  useEffect(() => { let active = true; const load = () => api<{ definitions: number; achievements: Achievement[] }>('/api/achievements').then((value) => { if (active) { setEntries(value.achievements); setDefinitionCount(value.definitions); setError(''); } }).catch((reason) => active && setError(reason.message)); void load(); const timer = window.setInterval(() => void load(), 60_000); return () => { active = false; window.clearInterval(timer); }; }, []);
  const scopes = useMemo(() => [...new Map(entries.map((entry) => [entry.scopeKey, entry.scopeName])).entries()], [entries]);
  const categories = useMemo(() => [...new Set(entries.map((entry) => entry.category))], [entries]);
  const visible = entries.filter((entry) => entry.scopeKey === scope && (!category || entry.category === category) && (!hideLocked || entry.unlockedAt));
  const scopeEntries = entries.filter((entry) => entry.scopeKey === scope); const unlocked = scopeEntries.filter((entry) => entry.unlockedAt).length;
  return <section className="content achievements-view"><PageHeader eyebrow="TOVÁRNÍ TROFEJE" title="Úspěchy" description={`${definitionCount} různých výzev pro hráče i společnou továrnu.`} />{error && <p className="error banner">{error}</p>}<div className="achievement-toolbar"><div className="scope-tabs">{scopes.map(([key, name]) => <button className={scope === key ? 'active' : ''} onClick={() => setScope(key)} key={key}>{name}</button>)}</div><div className="achievement-filters"><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Všechny kategorie</option>{categories.map((value) => <option key={value}>{value}</option>)}</select><label><input type="checkbox" checked={hideLocked} onChange={(event) => setHideLocked(event.target.checked)} /> Jen odemčené</label></div></div><div className="achievement-overview"><div><strong>{unlocked}/{scopeEntries.length}</strong><span>odemčeno</span></div><div className="achievement-total-track"><i style={{ width: `${scopeEntries.length ? unlocked / scopeEntries.length * 100 : 0}%` }} /></div></div><div className="achievement-grid">{visible.map((entry) => <article className={`achievement-card ${entry.unlockedAt ? 'unlocked' : 'locked'}`} key={`${entry.key}-${entry.scopeKey}`}><span className="achievement-icon">{entry.icon}</span><div><small>{entry.category}</small><h2>{entry.title}</h2><p>{entry.description}</p><div className="achievement-progress"><i style={{ width: `${entry.progress * 100}%` }} /></div><footer><span>{wholeNumber.format(Math.min(entry.value, entry.target))} / {wholeNumber.format(entry.target)}</span><strong>{entry.unlockedAt ? `Odemčeno ${timeAgo(entry.unlockedAt)}` : `${wholeNumber.format(entry.progress * 100)} %`}</strong></footer></div></article>)}</div></section>;
}

function ProfilesView() {
  const [profiles, setProfiles] = useState<Profile[]>([]); const [error, setError] = useState('');
  useEffect(() => { let active = true; const load = () => api<Profile[]>('/api/profiles').then((value) => active && setProfiles(value)).catch((reason) => active && setError(reason.message)); void load(); const timer = window.setInterval(() => void load(), 60_000); return () => { active = false; window.clearInterval(timer); }; }, []);
  return <section className="content"><PageHeader eyebrow="OPERÁTOŘI" title="Hráči" description="Všechny dostupné osobní statistiky z telemetry a společné práce ve webu." />{error && <p className="error banner">{error}</p>}<div className="profile-grid expanded">{profiles.map((profile) => <article className="profile-card expanded" key={profile.id}><header><span className="profile-avatar" style={{ '--avatar-color': profile.color } as CSSProperties}>{profile.displayName.slice(0, 1)}</span><div><h2>{profile.displayName}</h2><p>{profile.factorioName} · {profile.online ? 'právě ve hře' : `naposledy ${timeAgo(profile.lastOnlineAt)}`}</p></div><span className={`presence ${profile.online ? 'online' : ''}`}>{profile.online ? 'Online' : 'Offline'}</span></header><section className="profile-section"><h3>Osobní aktivita ve hře</h3><div className="profile-stats"><Metric label="Herní čas" value={duration(profile.playtimeSeconds)} /><Metric label="Ručně vyrobeno" value={wholeNumber.format(profile.personalActivity.handCrafted)} note={`${preciseNumber.format(profile.rates.craftedPerHour)} / h`} /><Metric label="Ručně vytěženo" value={wholeNumber.format(profile.personalActivity.mined)} note={`${preciseNumber.format(profile.rates.minedPerHour)} / h`} /><Metric label="Postaveno" value={wholeNumber.format(profile.personalActivity.built)} note={`${preciseNumber.format(profile.rates.builtPerHour)} / h`} /><Metric label="Úmrtí" value={wholeNumber.format(profile.personalActivity.deaths)} /></div></section><section className="profile-section"><h3>Společná práce</h3><div className="collaboration-stats"><span><strong>{profile.completedTasks}</strong> hotových úkolů</span><span><strong>{profile.collaboration.openTasks}</strong> otevřených úkolů</span><span><strong>{profile.collaboration.createdTasks}</strong> založených úkolů</span><span><strong>{profile.collaboration.messages}</strong> vzkazů</span><span><strong>{profile.collaboration.comments}</strong> komentářů</span><span><strong>{profile.collaboration.reactions}</strong> reakcí</span><span><strong>{profile.collaboration.completedGoals}</strong> splněných cílů</span><span><strong>{profile.collaboration.achievements}</strong> úspěchů</span></div></section></article>)}</div><p className="footnote">Strojovou výrobu nelze poctivě rozdělit mezi hráče, protože oba pracují ve společné force. Zobrazené osobní údaje pocházejí pouze z jednoznačně přiřaditelných herních událostí.</p></section>;
}

function ActivityView() {
  const [events, setEvents] = useState<Activity[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { void api<Activity[]>('/api/activity').then(setEvents).catch((reason) => setError(reason.message)); }, []);
  return <section className="content"><PageHeader eyebrow="ČASOVÁ OSA" title="Události" description="Posledních 100 změn z Factorio serveru a aplikace." />{error && <p className="error banner">{error}</p>}<Panel title="Historie provozu">{events.length ? <ul className="activity-list">{events.map((event) => <li key={event.id}><time>{timeAgo(event.occurred_at)}</time><span className="timeline-dot" /><div><strong>{event.payload.message ?? event.payload.title ?? event.event_type}</strong><small>{event.actor_name ? `${event.actor_name} · ` : ''}{event.source === 'telemetry' ? 'Factorio' : event.source}{event.payload.from ? ` · ${event.payload.from} → ${event.payload.to}` : ''}</small></div></li>)}</ul> : <EmptyState>Zatím nejsou žádné události.</EmptyState>}</Panel></section>;
}

function TopItems({ items, basis, selectedItems, onToggle }: { items: ProductionItem[]; basis: Production['basis']; selectedItems: string[]; onToggle: (item: string) => void }) {
  const { labels } = useContext(labelsContext);
  const maximum = items[0]?.amount ?? 1;
  if (!items.length) return <EmptyState>V tomto období zatím není zaznamenaný žádný tok.</EmptyState>;
  return <ul className="top-items">{items.slice(0, 8).map((item, index) => <li key={item.item}><button type="button" className={selectedItems.includes(item.item) ? 'top-item-button selected' : 'top-item-button'} onClick={() => onToggle(item.item)} aria-pressed={selectedItems.includes(item.item)}><span className="rank">{index + 1}</span><ItemIcon prototype={item.item} /><div><strong>{labelFor(labels, item.item)}</strong><span className="mini-track"><i style={{ width: `${Math.max(4, item.amount / maximum * 100)}%` }} /></span></div><p><strong>{preciseNumber.format(item.amount)}</strong><small>{basis === 'current' ? '/ min' : `za období · ${preciseNumber.format(item.rate)}/min`}</small></p></button></li>)}</ul>;
}

function ProductionView() {
  const { labels, locale } = useContext(labelsContext);
  const [range, setRange] = useState('1h');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [comparisonMetric, setComparisonMetric] = useState<'both' | 'productionRate' | 'consumptionRate'>('both');
  const [itemSearch, setItemSearch] = useState('');
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [flowFilter, setFlowFilter] = useState<'all' | 'producing' | 'consuming' | 'idle'>('all');
  const [catalogSort, setCatalogSort] = useState<'activity' | 'name' | 'production' | 'consumption'>('activity');
  const [production, setProduction] = useState<Production | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = () => { setLoading(true); return api<Production>(`/api/production?range=${range}${selectedItems.length ? `&items=${encodeURIComponent(selectedItems.join(','))}` : ''}`).then((value) => { if (active) { setProduction(value); setError(''); } }).catch((reason) => active && setError(reason.message)).finally(() => active && setLoading(false)); };
    void load(); const timer = window.setInterval(() => void load(), 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [range, selectedItems.join(',')]);
  function toggleItem(item: string) { if (!selectedItems.includes(item)) setComparisonMetric('both'); setSelectedItems((current) => current.includes(item) ? current.filter((value) => value !== item) : current.length < 4 ? [...current, item] : [...current.slice(1), item]); }
  useEffect(() => { if (!selectedItems.length) setComparisonMetric('both'); }, [selectedItems.length]);
  const comparisonData = useMemo(() => {
    if (!production?.comparison.length) return production?.points ?? [];
    const rows = new Map<string, Record<string, string | number>>();
    production.comparison.forEach((series, index) => series.points.forEach((point) => { const row = rows.get(point.at) ?? { at: point.at }; row[`item${index}Production`] = point.productionRate; row[`item${index}Consumption`] = point.consumptionRate; rows.set(point.at, row); }));
    return [...rows.values()].sort((left, right) => String(left.at).localeCompare(String(right.at)));
  }, [production]);
  const current = selectedItems.length ? {
    productionRate: production?.comparison.reduce((sum, series) => sum + (series.points.at(-1)?.productionRate ?? 0), 0) ?? 0,
    consumptionRate: production?.comparison.reduce((sum, series) => sum + (series.points.at(-1)?.consumptionRate ?? 0), 0) ?? 0
  } : production?.points.at(-1);
  const visibleCatalog = useMemo(() => {
    const needle = itemSearch.trim().toLocaleLowerCase(locale);
    const entries = (production?.catalog ?? []).filter((entry) => (!needle || entry.item.includes(needle) || labelFor(labels, entry.item).toLocaleLowerCase(locale).includes(needle)) && (flowFilter === 'all' || flowFilter === 'producing' && entry.productionRate > 0 || flowFilter === 'consuming' && entry.consumptionRate > 0 || flowFilter === 'idle' && entry.productionRate <= 0 && entry.consumptionRate <= 0));
    return [...entries].sort((left, right) => catalogSort === 'name' ? labelFor(labels, left.item).localeCompare(labelFor(labels, right.item), locale) : catalogSort === 'production' ? right.productionRate - left.productionRate : catalogSort === 'consumption' ? right.consumptionRate - left.consumptionRate : Math.max(right.productionRate, right.consumptionRate) - Math.max(left.productionRate, left.consumptionRate)).slice(0, 120);
  }, [itemSearch, labels, production?.catalog, locale, flowFilter, catalogSort]);
  const colors = ['#f29b38', '#5db5a4', '#a984dc', '#63a9df'];
  return <section className="content">
    <PageHeader eyebrow={textFor(locale, 'productionEyebrow')} title={textFor(locale, 'productionTitle')} description={textFor(locale, 'productionDescription')} actions={<div className="range-picker" aria-label={textFor(locale, 'timeRange')}>{['1m', '15m', '1h', '6h', '24h'].map((value) => <button type="button" className={range === value ? 'active' : ''} key={value} onClick={() => setRange(value)}>{value}</button>)}</div>} />
    {error && <p className="error banner">{error}</p>}
    <Panel title={textFor(locale, 'catalogTitle')} subtitle={`${selectedItems.length}/4 ${locale === 'cs' ? 'vybráno k porovnání · data společné hráčské force' : 'selected for comparison · shared player-force data'}`} className="item-filter-panel" action={<button type="button" className="secondary with-icon" onClick={() => setCatalogOpen((value) => !value)}><Glyph name={catalogOpen ? 'close' : 'Production'} />{textFor(locale, catalogOpen ? 'catalogClose' : 'catalogOpen')}</button>}>
      <div className="catalog-selection"><button type="button" className={!selectedItems.length ? 'filter-all active' : 'filter-all'} onClick={() => setSelectedItems([])} aria-pressed={!selectedItems.length}>{textFor(locale, 'allFactory')}</button>{selectedItems.map((selected, index) => <button type="button" className="selected-item-chip" onClick={() => toggleItem(selected)} key={selected}><ItemIcon prototype={selected} /><span><strong>{index + 1}. {labelFor(labels, selected)}</strong><small>{locale === 'cs' ? 'Kliknutím odebrat' : 'Click to remove'}</small></span><Glyph name="close" /></button>)}{!selectedItems.length && <p>{locale === 'cs' ? 'Graf nyní zobrazuje součet všech vyráběných a spotřebovávaných položek.' : 'The chart now shows total production and consumption for the whole factory.'}</p>}</div>
      {catalogOpen && <div className="catalog-drawer"><div className="catalog-toolbar"><label><span>Hledat položku</span><input type="search" placeholder="Český název nebo prototype…" value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} autoFocus /></label><label><span>Tok</span><select value={flowFilter} onChange={(event) => setFlowFilter(event.target.value as typeof flowFilter)}><option value="all">Všechny položky</option><option value="producing">Právě vyráběné</option><option value="consuming">Právě spotřebovávané</option><option value="idle">Nyní bez toku</option></select></label><label><span>Řazení</span><select value={catalogSort} onChange={(event) => setCatalogSort(event.target.value as typeof catalogSort)}><option value="activity">Nejvyšší aktivita</option><option value="production">Nejvyšší výroba</option><option value="consumption">Nejvyšší spotřeba</option><option value="name">Podle názvu</option></select></label></div><div className="catalog-result-meta"><span>{visibleCatalog.length} položek</span><span>Vybrat lze maximálně čtyři</span></div><div className="catalog-grid">{visibleCatalog.map((entry) => <button type="button" className={selectedItems.includes(entry.item) ? 'selected' : ''} key={entry.item} onClick={() => toggleItem(entry.item)} aria-pressed={selectedItems.includes(entry.item)}><ItemIcon prototype={entry.item} /><span><strong>{labelFor(labels, entry.item)}</strong><small>{entry.item}</small></span><span className="catalog-rates"><b className="produced">+{preciseNumber.format(entry.productionRate)}</b><b className="consumed">−{preciseNumber.format(entry.consumptionRate)}</b></span>{selectedItems.includes(entry.item) && <i>{selectedItems.indexOf(entry.item) + 1}</i>}</button>)}{production && !visibleCatalog.length && <div className="catalog-empty">Žádná položka neodpovídá zvoleným filtrům.</div>}</div></div>}
    </Panel>
    <div className="production-metrics"><Metric label={selectedItems.length ? 'Vybrané položky · výroba' : 'Nyní se vyrábí'} value={`${compactNumber.format(current?.productionRate ?? 0)} / min`} tone="production" note="klouzavý průměr 1 min" /><Metric label={selectedItems.length ? 'Vybrané položky · spotřeba' : 'Nyní se spotřebovává'} value={`${compactNumber.format(current?.consumptionRate ?? 0)} / min`} tone="consumption" note="klouzavý průměr 1 min" /><Metric label="Poslední vzorek" value={timeAgo(production?.lastUpdatedAt ?? null)} note={`${production?.sampleCount ?? 0} vzorků v grafu`} /></div>
    <Panel title={textFor(locale, selectedItems.length ? 'comparisonTitle' : 'factoryFlowTitle')} subtitle={textFor(locale, selectedItems.length ? 'comparisonSubtitle' : 'factoryFlowSubtitle')} action={<div className="chart-mode" role="group" aria-label={locale === 'cs' ? 'Zobrazený tok' : 'Displayed flow'}><button type="button" className={comparisonMetric === 'both' ? 'active' : ''} onClick={() => setComparisonMetric('both')}>{textFor(locale, 'both')}</button><button type="button" className={comparisonMetric === 'productionRate' ? 'active' : ''} onClick={() => setComparisonMetric('productionRate')}>{textFor(locale, 'production')}</button><button type="button" className={comparisonMetric === 'consumptionRate' ? 'active' : ''} onClick={() => setComparisonMetric('consumptionRate')}>{textFor(locale, 'consumption')}</button></div>} className={`chart-panel ${loading ? 'is-refreshing' : ''}`}>
      {loading && production && <span className="chart-refresh-indicator"><Glyph name="refresh" />{textFor(locale, 'refreshing')}</span>}
      {!production ? <div className="loading-inline production-loading">{textFor(locale, 'loadingProduction')}</div> : comparisonData.length ? <div className="production-chart" aria-busy={loading}><ResponsiveContainer width="100%" height="100%"><LineChart data={comparisonData} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--chart-grid)" /><XAxis dataKey="at" tickFormatter={(value) => new Date(value).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: range === '1m' ? '2-digit' : undefined })} minTickGap={35} stroke="var(--text-tertiary)" tickLine={false} axisLine={false} /><YAxis stroke="var(--text-tertiary)" tickLine={false} axisLine={false} tickFormatter={(value) => compactNumber.format(value)} /><Tooltip labelFormatter={(value) => new Date(String(value)).toLocaleString(locale)} contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--border-strong)', borderRadius: 12, boxShadow: 'var(--shadow-lg)' }} />{selectedItems.length ? selectedItems.map((item, index) => <Fragment key={item}>{comparisonMetric !== 'consumptionRate' && <Line type="monotone" dataKey={`item${index}Production`} name={`${labelFor(labels, item)} · ${textFor(locale, 'production')}`} stroke={colors[index]} strokeWidth={3} dot={range === '1m'} activeDot={{ r: 5 }} />}{comparisonMetric !== 'productionRate' && <Line type="monotone" dataKey={`item${index}Consumption`} name={`${labelFor(labels, item)} · ${textFor(locale, 'consumption')}`} stroke={colors[index]} strokeWidth={2.5} strokeDasharray="7 5" strokeOpacity={0.82} dot={range === '1m'} activeDot={{ r: 5 }} />}</Fragment>) : <>{comparisonMetric !== 'consumptionRate' && <Line type="monotone" dataKey="productionRate" name={textFor(locale, 'productionPerMinute')} stroke="var(--production)" strokeWidth={3} dot={range === '1m'} activeDot={{ r: 5 }} />}{comparisonMetric !== 'productionRate' && <Line type="monotone" dataKey="consumptionRate" name={textFor(locale, 'consumptionPerMinute')} stroke="var(--consumption)" strokeWidth={3} dot={range === '1m'} activeDot={{ r: 5 }} />}</>}</LineChart></ResponsiveContainer></div> : <EmptyState>{locale === 'cs' ? 'Čekám na první telemetry vzorek verze 2.' : 'Waiting for the first telemetry version 2 sample.'}</EmptyState>}
      <div className="chart-legend">{selectedItems.length ? selectedItems.flatMap((item, index) => [comparisonMetric !== 'consumptionRate' && <span key={`${item}-production`}><i style={{ background: colors[index] }} />{labelFor(labels, item)} · {textFor(locale, 'production')}</span>, comparisonMetric !== 'productionRate' && <span key={`${item}-consumption`}><i className="dashed" style={{ '--line-color': colors[index] } as CSSProperties} />{labelFor(labels, item)} · {textFor(locale, 'consumption')}</span>]) : <>{comparisonMetric !== 'consumptionRate' && <span><i className="production" />{textFor(locale, 'production')}</span>}{comparisonMetric !== 'productionRate' && <span><i className="consumption" />{textFor(locale, 'consumption')}</span>}</>}</div>
    </Panel>
    <div className="two-columns"><Panel title="Nejvíce vyráběné" subtitle="Kliknutím přidáte položku do porovnání"><TopItems items={production?.topProduced ?? []} basis={production?.basis ?? 'empty'} selectedItems={selectedItems} onToggle={toggleItem} /></Panel><Panel title="Nejvíce spotřebovávané" subtitle="Kliknutím přidáte položku do porovnání"><TopItems items={production?.topConsumed ?? []} basis={production?.basis ?? 'empty'} selectedItems={selectedItems} onToggle={toggleItem} /></Panel></div>
    <p className="footnote">Strojová výroba je společná pro hráčskou force; osobní ruční výrobu najdete u hráčů.</p>
  </section>;
}

function ReportView() {
  const { labels } = useContext(labelsContext); const [hours, setHours] = useState(8); const [report, setReport] = useState<ShiftReport | null>(null); const [error, setError] = useState(''); const [copied, setCopied] = useState(false);
  useEffect(() => { let active = true; const load = () => api<ShiftReport>(`/api/reports/shift?hours=${hours}`).then((value) => { if (active) { setReport(value); setError(''); } }).catch((reason) => active && setError(reason.message)); setReport(null); void load(); const timer = window.setInterval(() => void load(), 60_000); return () => { active = false; window.clearInterval(timer); }; }, [hours]);
  function reportText() {
    if (!report) return '';
    const produced = report.production.topProduced.map((item) => `${labelFor(labels, item.item)}: ${preciseNumber.format(item.amount)}`).join(', ') || 'bez dat';
    const consumed = report.production.topConsumed.map((item) => `${labelFor(labels, item.item)}: ${preciseNumber.format(item.amount)}`).join(', ') || 'bez dat';
    return `HAL Factory · report směny (${report.hours} h)\nVygenerováno: ${new Date(report.generatedAt).toLocaleString('cs-CZ')}\nServer: ${report.server.online ? 'online' : 'offline'}\nHráči online: ${report.players.filter((player) => player.online).map((player) => player.factorioName).join(', ') || 'nikdo'}\nTop výroba: ${produced}\nTop spotřeba: ${consumed}\nÚkoly: ${report.collaboration.createdTasks} nových, ${report.collaboration.completedTasks} hotových\nVzkazy: ${report.collaboration.messages}`;
  }
  async function copy() { await navigator.clipboard.writeText(reportText()); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
  return <section className="content"><PageHeader eyebrow="AUTOMATICKÉ PŘEDÁNÍ" title="Report směny" description="Živý souhrn výroby, lidí a společné práce. Obnovuje se každou minutu." actions={<div className="range-picker">{[4, 8, 12, 24].map((value) => <button className={hours === value ? 'active' : ''} onClick={() => setHours(value)} key={value}>{value} h</button>)}</div>} />{error && <p className="error banner">{error}</p>}{!report ? <div className="page-loading"><p>Sestavuji report…</p></div> : <><div className="report-hero"><div><span className={`lamp ${report.server.online ? 'online' : ''}`} /><div><small>Stav na konci směny</small><strong>{report.server.online ? 'Továrna běží' : 'Továrna neodpovídá'}</strong><span>{report.players.filter((player) => player.online).length} hráčů online · {report.production.sampleCount} vzorků</span></div></div><button className="secondary with-icon" onClick={() => void copy()}><Glyph name="copy" />{copied ? 'Zkopírováno' : 'Kopírovat report'}</button></div><div className="report-metrics"><Metric label="Nové úkoly" value={String(report.collaboration.createdTasks)} note={`za posledních ${hours} hodin`} /><Metric label="Dokončeno" value={String(report.collaboration.completedTasks)} note="hotové úkoly" tone="production" /><Metric label="Vzkazy" value={String(report.collaboration.messages)} note="předání mezi hráči" /></div><div className="two-columns"><Panel title="Top výroba" subtitle={report.production.basis === 'interval' ? `Kumulativně za ${hours} hodin` : 'Aktuální rychlost'}><ReportItems items={report.production.topProduced} labels={labels} /></Panel><Panel title="Top spotřeba" subtitle={report.production.basis === 'interval' ? `Kumulativně za ${hours} hodin` : 'Aktuální rychlost'}><ReportItems items={report.production.topConsumed} labels={labels} /></Panel></div><Panel title="Důležité události" subtitle="Poslední změny v tomto okně">{report.events.length ? <ul className="activity-list compact">{report.events.map((event, index) => <li key={`${event.occurred_at}-${index}`}><time>{timeAgo(event.occurred_at)}</time><div><strong>{event.payload.message ?? event.payload.title ?? event.event_type}</strong><small>{event.actor_name ?? 'Factorio'}</small></div></li>)}</ul> : <EmptyState>Směna proběhla bez zaznamenaných událostí.</EmptyState>}</Panel><p className="footnote">Report byl automaticky sestaven {timeAgo(report.generatedAt)} a při otevřené stránce se průběžně obnovuje.</p></>}</section>;
}

function ReportItems({ items, labels }: { items: ProductionItem[]; labels: Record<string, string> }) {
  if (!items.length) return <EmptyState>Pro toto období nejsou data.</EmptyState>;
  return <ul className="report-items">{items.map((item) => <li key={item.item}><ItemIcon prototype={item.item} /><div><strong>{labelFor(labels, item.item)}</strong><small>{preciseNumber.format(item.rate)} / min</small></div><b>{compactNumber.format(item.amount)}</b></li>)}</ul>;
}

function ServerView() {
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [queryResult, setQueryResult] = useState<{ action: string; output: string; at: string } | null>(null);
  const [querying, setQuerying] = useState('');
  const [download, setDownload] = useState<{ name: string; version: string; fileName: string; size: number } | null>(null);
  useEffect(() => { void api<{ name: string; version: string; fileName: string; size: number }>('/api/downloads/hal-telemetry/info').then(setDownload).catch(() => setDownload(null)); }, []);
  async function send(event: React.FormEvent) { event.preventDefault(); try { await api('/api/server/message', { method: 'POST', body: JSON.stringify({ message }) }); setMessage(''); setNotice('Zpráva byla doručena do hry.'); } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Zpráva se nezdařila.'); } }
  async function query(action: string) { setQuerying(action); setNotice(''); try { setQueryResult(await api('/api/server/query', { method: 'POST', body: JSON.stringify({ action }) })); } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Dotaz se nezdařil.'); } finally { setQuerying(''); } }
  const safeQueries = [{ id: 'players', label: 'Online hráči', icon: '👥' }, { id: 'time', label: 'Stáří mapy', icon: '🕐' }, { id: 'version', label: 'Verze hry', icon: '🏷️' }, { id: 'evolution', label: 'Evoluce nepřátel', icon: '🪲' }, { id: 'admins', label: 'Administrátoři', icon: '🛡️' }, { id: 'whitelist', label: 'Whitelist', icon: '📋' }];
  return <section className="content"><PageHeader eyebrow="BEZPEČNÉ OVLÁDÁNÍ" title="Server" description="Pouze pevně povolené informační RCON dotazy a zprávy do hry. Žádná raw konzole." /><div className="server-layout"><Panel title="Telemetry mod" subtitle="Stejná verze, jaká patří k tomuto nasazení."><div className="telemetry-download"><div><span className="download-icon"><Glyph name="download" /></span><div><strong>{download?.fileName ?? 'hal-telemetry'}</strong><small>{download ? `Verze ${download.version} · ${Math.ceil(download.size / 1024)} kB` : 'Balíček v tomto prostředí není dostupný.'}</small></div></div>{download && <a className="primary with-icon button-link" href="/api/downloads/hal-telemetry" download={download.fileName}><Glyph name="download" />Stáhnout mod</a>}</div></Panel><Panel title="Zpráva do hry" subtitle="Zobrazí se všem právě připojeným hráčům."><form className="message-form" onSubmit={send}><input placeholder="Napište krátkou zprávu…" maxLength={250} value={message} onChange={(event) => setMessage(event.target.value)} required /><button className="primary icon-button" aria-label="Odeslat zprávu"><Glyph name="send" /></button></form></Panel></div><Panel title="Informační RCON nástroje" subtitle="Příkazy pouze čtou stav hry; nemění mapu, hráče ani nastavení."><div className="safe-rcon-grid">{safeQueries.map((entry) => <button className="safe-rcon-button" type="button" disabled={Boolean(querying)} onClick={() => void query(entry.id)} key={entry.id}><span>{entry.icon}</span><strong>{querying === entry.id ? 'Načítám…' : entry.label}</strong></button>)}</div>{queryResult && <div className="rcon-output"><header><span>FACTORIO · {queryResult.action.toLocaleUpperCase('cs')}</span><time>{new Date(queryResult.at).toLocaleTimeString('cs-CZ')}</time></header><pre>{queryResult.output}</pre></div>}</Panel>{notice && <div className="notice" role="status">{notice}</div>}</section>;
}

function initialTheme(): Theme {
  const stored = window.localStorage.getItem('hal-theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function initialLocale(): Locale { return window.localStorage.getItem('hal-locale') === 'en' ? 'en' : 'cs'; }

export function App() {
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [user, setUser] = useState<User | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [data, setData] = useState<Dashboard | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [active, setActive] = useState<View>('Dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const setTheme = (value: Theme) => { setThemeState(value); window.localStorage.setItem('hal-theme', value); };
  const setLocale = (value: Locale) => { setLocaleState(value); window.localStorage.setItem('hal-locale', value); };
  useEffect(() => { document.documentElement.dataset.theme = theme; document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111614' : '#f4f3ee'); }, [theme]);
  useEffect(() => { api<{ user: User; csrfToken: string }>('/api/auth/session').then((session) => { csrfToken = session.csrfToken; setUser(session.user); }).catch(() => undefined).finally(() => setSessionChecked(true)); }, []);
  const load = async (showBusy = false) => { if (showBusy) setRefreshing(true); try { setData(await api<Dashboard>('/api/dashboard')); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Data nejsou dostupná.'); } finally { setRefreshing(false); } };
  useEffect(() => {
    if (!user) return;
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [user]);
  useEffect(() => { if (user) void api<{ labels: Record<string, string> }>(`/api/prototypes?locale=${locale}`).then((result) => setLabels(result.labels)).catch(() => setLabels({})); }, [user, locale]);
  useEffect(() => { setMenuOpen(false); }, [active]);
  const content = useMemo(() => {
    if (!data) return <div className="page-loading"><span className="brand-mark">H</span><p>Navazuji spojení s továrnou…</p></div>;
    if (active === 'Dashboard') return <DashboardView data={data} refresh={() => void load(true)} refreshing={refreshing} />;
    if (active === 'Tasks') return <TasksView onChanged={() => void load()} />;
    if (active === 'Messages') return <MessagesView />;
    if (active === 'Production') return <ProductionView />;
    if (active === 'Goals') return <GoalsView />;
    if (active === 'Achievements') return <AchievementsView />;
    if (active === 'Report') return <ReportView />;
    if (active === 'Activity') return <ActivityView />;
    if (active === 'Profiles') return <ProfilesView />;
    return <ServerView />;
  }, [active, data, refreshing]);
  if (!sessionChecked) return <div className="page-loading full"><span className="brand-mark">H</span></div>;
  if (!user) return <Login onLogin={setUser} theme={theme} setTheme={setTheme} />;
  async function logout() { try { await api('/api/auth/logout', { method: 'POST' }); } finally { csrfToken = ''; setUser(null); setData(null); } }
  return <labelsContext.Provider value={{ labels, locale }}><GoalCelebrationLayer /><main className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark">H</span><div><strong>HAL Factory</strong><small>factorio.mkdevs.cz</small></div></div><Navigation active={active} setActive={setActive} /><footer><div className="operator"><span style={{ '--avatar-color': user.color } as CSSProperties}>{user.displayName.slice(0, 1)}</span><div><strong>{user.displayName}</strong><small>{user.factorioName}</small></div></div><div className="sidebar-controls"><LanguageToggle locale={locale} setLocale={setLocale} /><div className="sidebar-actions"><ThemeToggle theme={theme} setTheme={setTheme} /><button className="icon-button" onClick={() => void logout()} aria-label={textFor(locale, 'logout')} title={textFor(locale, 'logout')}><Glyph name="logout" /></button></div></div></footer></aside><div className="app-main"><header className="mobile-header"><div className="brand"><span className="brand-mark">H</span><div><strong>HAL Factory</strong><small>{textFor(locale, navigation.find((item) => item.id === active)?.labelKey ?? 'navDashboard')}</small></div></div><button className="icon-button menu-button" onClick={() => setMenuOpen(true)} aria-label={textFor(locale, 'openMenu')} aria-expanded={menuOpen}><Glyph name="menu" /></button></header>{menuOpen && <div className="mobile-menu-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setMenuOpen(false)}><aside className="mobile-menu"><header><div className="operator"><span style={{ '--avatar-color': user.color } as CSSProperties}>{user.displayName.slice(0, 1)}</span><div><strong>{user.displayName}</strong><small>{user.factorioName}</small></div></div><button className="icon-button" onClick={() => setMenuOpen(false)} aria-label={textFor(locale, 'closeMenu')}><Glyph name="close" /></button></header><Navigation active={active} setActive={setActive} onNavigate={() => setMenuOpen(false)} /><footer><div><small>{textFor(locale, 'itemLanguage')}</small><LanguageToggle locale={locale} setLocale={setLocale} /></div><ThemeToggle theme={theme} setTheme={setTheme} /><button className="secondary with-icon" onClick={() => void logout()}><Glyph name="logout" />{textFor(locale, 'logout')}</button></footer></aside></div>}{error && <div className="error banner global" role="alert">{error}</div>}{content}</div></main></labelsContext.Provider>;
}
