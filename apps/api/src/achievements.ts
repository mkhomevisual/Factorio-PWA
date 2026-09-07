export type AchievementMetric =
  | 'playtime' | 'handCrafted' | 'mined' | 'built' | 'deaths'
  | 'completedTasks' | 'createdTasks' | 'messages' | 'comments' | 'reactions'
  | 'totalProduced' | 'totalConsumed' | 'activeItems' | 'completedGoals'
  | 'factoryTasks' | 'factoryMessages' | 'factoryReactions' | 'serverUptime' | 'onlinePlayers';

export type AchievementDefinition = {
  key: string;
  audience: 'player' | 'factory';
  category: 'Čas' | 'Výroba' | 'Stavba' | 'Spolupráce' | 'Dobrodružství';
  title: string;
  description: string;
  icon: string;
  metric: AchievementMetric;
  target: number;
};

const player = (key: string, category: AchievementDefinition['category'], title: string, description: string, icon: string, metric: AchievementMetric, target: number): AchievementDefinition => ({ key, audience: 'player', category, title, description, icon, metric, target });
const factory = (key: string, category: AchievementDefinition['category'], title: string, description: string, icon: string, metric: AchievementMetric, target: number): AchievementDefinition => ({ key, audience: 'factory', category, title, description, icon, metric, target });

// 44 web-only achievements. They read telemetry already available to the app and
// collaboration data from SQLite; they never alter the running save.
export const achievementDefinitions: AchievementDefinition[] = [
  player('time-1h', 'Čas', 'První směna', 'Odehrajte jednu hodinu.', '🕐', 'playtime', 3_600),
  player('time-10h', 'Čas', 'Zabydlený technik', 'Odehrajte deset hodin.', '🕙', 'playtime', 36_000),
  player('time-24h', 'Čas', 'Celý den v továrně', 'Nasbírejte 24 hodin herního času.', '🌗', 'playtime', 86_400),
  player('time-50h', 'Čas', 'Druhá směna nekončí', 'Nasbírejte 50 hodin herního času.', '⏱️', 'playtime', 180_000),
  player('time-100h', 'Čas', 'Stovka', 'Nasbírejte 100 hodin herního času.', '💯', 'playtime', 360_000),
  player('time-250h', 'Čas', 'Obyvatel Nauvisu', 'Nasbírejte 250 hodin herního času.', '🪐', 'playtime', 900_000),
  player('craft-100', 'Výroba', 'Ruční práce', 'Ručně vyrobte 100 předmětů.', '🔧', 'handCrafted', 100),
  player('craft-1k', 'Výroba', 'Malá dílna', 'Ručně vyrobte 1 000 předmětů.', '⚙️', 'handCrafted', 1_000),
  player('craft-10k', 'Výroba', 'Dvě ruce, velký výkon', 'Ručně vyrobte 10 000 předmětů.', '🦾', 'handCrafted', 10_000),
  player('mine-1k', 'Dobrodružství', 'Prospektor', 'Ručně vytěžte 1 000 kusů.', '⛏️', 'mined', 1_000),
  player('mine-10k', 'Dobrodružství', 'Hlubinný pracovník', 'Ručně vytěžte 10 000 kusů.', '🪨', 'mined', 10_000),
  player('mine-100k', 'Dobrodružství', 'Hora se pohnula', 'Ručně vytěžte 100 000 kusů.', '🏔️', 'mined', 100_000),
  player('build-100', 'Stavba', 'Stavitel', 'Postavte 100 entit.', '🏗️', 'built', 100),
  player('build-1k', 'Stavba', 'Architekt továrny', 'Postavte 1 000 entit.', '🏭', 'built', 1_000),
  player('build-10k', 'Stavba', 'Megabuilder', 'Postavte 10 000 entit.', '🌆', 'built', 10_000),
  player('death-1', 'Dobrodružství', 'To se rozchodí', 'Jednou zemřete.', '🩹', 'deaths', 1),
  player('death-5', 'Dobrodružství', 'Poučení opakováním', 'Zemřete pětkrát.', '💀', 'deaths', 5),
  player('death-20', 'Dobrodružství', 'Nesmrtelný duchem', 'Zemřete dvacetkrát.', '👻', 'deaths', 20),
  player('tasks-1', 'Spolupráce', 'Odškrtnuto', 'Dokončete první úkol.', '✅', 'completedTasks', 1),
  player('tasks-10', 'Spolupráce', 'Spolehlivý kolega', 'Dokončete deset úkolů.', '📋', 'completedTasks', 10),
  player('tasks-50', 'Spolupráce', 'Mistr backlogu', 'Dokončete padesát úkolů.', '🏅', 'completedTasks', 50),
  player('created-10', 'Spolupráce', 'Plánovač', 'Založte deset úkolů.', '🗺️', 'createdTasks', 10),
  player('messages-1', 'Spolupráce', 'Haló, továrno', 'Napište první vzkaz.', '💬', 'messages', 1),
  player('messages-25', 'Spolupráce', 'Spojení navázáno', 'Napište 25 vzkazů.', '📡', 'messages', 25),
  player('comments-10', 'Spolupráce', 'Detailista', 'Přidejte deset komentářů k úkolům.', '📝', 'comments', 10),
  player('reactions-10', 'Spolupráce', 'Reaktor nálad', 'Rozdejte deset reakcí.', '😂', 'reactions', 10),
  factory('produced-10k', 'Výroba', 'Rozjezd linky', 'Továrna vyrobila alespoň 10 000 předmětů.', '🔩', 'totalProduced', 10_000),
  factory('produced-100k', 'Výroba', 'Sériová výroba', 'Továrna vyrobila alespoň 100 000 předmětů.', '📦', 'totalProduced', 100_000),
  factory('produced-1m', 'Výroba', 'První milion', 'Továrna vyrobila milion předmětů.', '🥇', 'totalProduced', 1_000_000),
  factory('produced-10m', 'Výroba', 'Průmyslová velmoc', 'Továrna vyrobila deset milionů předmětů.', '🚀', 'totalProduced', 10_000_000),
  factory('consumed-100k', 'Výroba', 'Nic nepřijde nazmar', 'Továrna spotřebovala 100 000 předmětů.', '♻️', 'totalConsumed', 100_000),
  factory('consumed-1m', 'Výroba', 'Hladová továrna', 'Továrna spotřebovala milion předmětů.', '🔥', 'totalConsumed', 1_000_000),
  factory('items-5', 'Výroba', 'Pestrá nabídka', 'Pět druhů předmětů právě proudí továrnou.', '🧰', 'activeItems', 5),
  factory('items-15', 'Výroba', 'Průmyslový katalog', 'Patnáct druhů předmětů právě proudí továrnou.', '🏷️', 'activeItems', 15),
  factory('items-30', 'Výroba', 'Všechno souvisí se vším', 'Třicet druhů předmětů právě proudí továrnou.', '🕸️', 'activeItems', 30),
  factory('goals-1', 'Spolupráce', 'Cíl splněn', 'Dokončete první výrobní cíl.', '🎯', 'completedGoals', 1),
  factory('goals-5', 'Spolupráce', 'Na správné trajektorii', 'Dokončete pět výrobních cílů.', '🏆', 'completedGoals', 5),
  factory('goals-20', 'Spolupráce', 'Plán plníme na 120 %', 'Dokončete dvacet výrobních cílů.', '🌟', 'completedGoals', 20),
  factory('factory-tasks-25', 'Spolupráce', 'Sehraná dvojka', 'Společně dokončete 25 úkolů.', '🤝', 'factoryTasks', 25),
  factory('factory-messages-50', 'Spolupráce', 'Tovární kronika', 'Napište dohromady 50 vzkazů.', '📚', 'factoryMessages', 50),
  factory('factory-reactions-50', 'Spolupráce', 'Dobrá nálada na směně', 'Nasbírejte 50 reakcí.', '🎉', 'factoryReactions', 50),
  factory('uptime-24h', 'Čas', 'Stroj se nezastavuje', 'Mapa běží alespoň 24 hodin.', '🌞', 'serverUptime', 86_400),
  factory('uptime-7d', 'Čas', 'Týdenní tah', 'Mapa běží alespoň sedm dní.', '📅', 'serverUptime', 604_800),
  factory('two-online', 'Spolupráce', 'Ve dvou se to lépe táhne', 'Oba operátoři jsou současně online.', '👥', 'onlinePlayers', 2)
];
