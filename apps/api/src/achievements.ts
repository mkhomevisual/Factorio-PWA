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

// 150 web-only achievements. They read telemetry already available to the app and
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
  factory('two-online', 'Spolupráce', 'Ve dvou se to lépe táhne', 'Oba operátoři jsou současně online.', '👥', 'onlinePlayers', 2),

  // Extended player progression: approachable first steps, serious commitments,
  // and intentionally ridiculous long-tail milestones for a persistent world.
  player('time-2h', 'Čas', 'Ještě jednu hodinku', 'Odehrajte dvě hodiny.', '🫖', 'playtime', 7_200),
  player('time-5h', 'Čas', 'Kde je večeře?', 'Odehrajte pět hodin.', '🍽️', 'playtime', 18_000),
  player('time-500h', 'Čas', 'Půl tisíciletí směn', 'Nasbírejte 500 hodin herního času.', '🗓️', 'playtime', 1_800_000),
  player('time-1k', 'Čas', 'Čtyři číslice', 'Nasbírejte 1 000 hodin herního času.', '⌛', 'playtime', 3_600_000),
  player('time-2500h', 'Čas', 'Továrna je domov', 'Nasbírejte 2 500 hodin herního času.', '🏠', 'playtime', 9_000_000),
  player('time-5k', 'Čas', 'Nesměnný směnový mistr', 'Nasbírejte 5 000 hodin herního času.', '🧭', 'playtime', 18_000_000),
  player('time-10k', 'Čas', 'Dotkl se trávy jen ve Factorio', 'Nasbírejte 10 000 hodin herního času.', '🌱', 'playtime', 36_000_000),

  player('craft-1', 'Výroba', 'Vlastníma rukama', 'Ručně vyrobte první předmět.', '👐', 'handCrafted', 1),
  player('craft-10', 'Výroba', 'Kapesní manufaktura', 'Ručně vyrobte deset předmětů.', '🪛', 'handCrafted', 10),
  player('craft-50', 'Výroba', 'Bez montovny', 'Ručně vyrobte 50 předmětů.', '🧤', 'handCrafted', 50),
  player('craft-500', 'Výroba', 'Mozoly automatizace', 'Ručně vyrobte 500 předmětů.', '🩼', 'handCrafted', 500),
  player('craft-5k', 'Výroba', 'Assembler? Neznám', 'Ručně vyrobte 5 000 předmětů.', '🙌', 'handCrafted', 5_000),
  player('craft-100k', 'Výroba', 'Lidský assembler', 'Ručně vyrobte 100 000 předmětů.', '🤖', 'handCrafted', 100_000),
  player('craft-1m', 'Výroba', 'Zakázaná ruční výroba', 'Ručně vyrobte milion předmětů.', '🚫', 'handCrafted', 1_000_000),

  player('mine-1', 'Dobrodružství', 'První šutr', 'Ručně vytěžte první kus.', '🪨', 'mined', 1),
  player('mine-100', 'Dobrodružství', 'Kapesní lom', 'Ručně vytěžte 100 kusů.', '⛏️', 'mined', 100),
  player('mine-500', 'Dobrodružství', 'Geolog amatér', 'Ručně vytěžte 500 kusů.', '🧱', 'mined', 500),
  player('mine-5k', 'Dobrodružství', 'Vrták má dovolenou', 'Ručně vytěžte 5 000 kusů.', '🛠️', 'mined', 5_000),
  player('mine-50k', 'Dobrodružství', 'Posun tektonických desek', 'Ručně vytěžte 50 000 kusů.', '🌋', 'mined', 50_000),
  player('mine-500k', 'Dobrodružství', 'Nauvis bez kopců', 'Ručně vytěžte 500 000 kusů.', '🗺️', 'mined', 500_000),
  player('mine-1m', 'Dobrodružství', 'Planeta v kapse', 'Ručně vytěžte milion kusů.', '🌍', 'mined', 1_000_000),

  player('build-1', 'Stavba', 'Položení základů', 'Postavte první entitu.', '🧱', 'built', 1),
  player('build-10', 'Stavba', 'Malé staveniště', 'Postavte deset entit.', '🚧', 'built', 10),
  player('build-50', 'Stavba', 'Roste to', 'Postavte 50 entit.', '🏗️', 'built', 50),
  player('build-500', 'Stavba', 'Průmyslová čtvrť', 'Postavte 500 entit.', '🏘️', 'built', 500),
  player('build-5k', 'Stavba', 'Urbanista Nauvisu', 'Postavte 5 000 entit.', '🏙️', 'built', 5_000),
  player('build-100k', 'Stavba', 'Kontinent z oceli', 'Postavte 100 000 entit.', '🗼', 'built', 100_000),
  player('build-1m', 'Stavba', 'Jeden milion kliknutí', 'Postavte milion entit.', '🖱️', 'built', 1_000_000),

  player('death-2', 'Dobrodružství', 'Déjà vu', 'Zemřete podruhé.', '😵', 'deaths', 2),
  player('death-3', 'Dobrodružství', 'Do třetice všeho zlého', 'Zemřete třikrát.', '🪦', 'deaths', 3),
  player('death-10', 'Dobrodružství', 'Respawn specialista', 'Zemřete desetkrát.', '🔁', 'deaths', 10),
  player('death-50', 'Dobrodružství', 'Smrt je jen teleport', 'Zemřete padesátkrát.', '✨', 'deaths', 50),
  player('death-100', 'Dobrodružství', 'Sto životů', 'Zemřete stokrát.', '🐈', 'deaths', 100),
  player('death-250', 'Dobrodružství', 'Pojišťovna pláče', 'Zemřete 250krát.', '📉', 'deaths', 250),
  player('death-1k', 'Dobrodružství', 'Nesmrtelnost statisticky', 'Zemřete tisíckrát.', '♾️', 'deaths', 1_000),

  player('tasks-2', 'Spolupráce', 'Dvakrát měřeno', 'Dokončete dva úkoly.', '☑️', 'completedTasks', 2),
  player('tasks-5', 'Spolupráce', 'Rytmus směny', 'Dokončete pět úkolů.', '🎵', 'completedTasks', 5),
  player('tasks-25', 'Spolupráce', 'Čistý sloupec', 'Dokončete 25 úkolů.', '🧹', 'completedTasks', 25),
  player('tasks-100', 'Spolupráce', 'Operátor spolehlivosti', 'Dokončete 100 úkolů.', '🎖️', 'completedTasks', 100),
  player('tasks-250', 'Spolupráce', 'Backlog nemá šanci', 'Dokončete 250 úkolů.', '⚔️', 'completedTasks', 250),
  player('tasks-500', 'Spolupráce', 'Půltisícová směna', 'Dokončete 500 úkolů.', '🛡️', 'completedTasks', 500),
  player('tasks-1k', 'Spolupráce', 'Tisíc hotových věcí', 'Dokončete 1 000 úkolů.', '🏆', 'completedTasks', 1_000),

  player('created-1', 'Spolupráce', 'Máme plán', 'Založte první úkol.', '🗒️', 'createdTasks', 1),
  player('created-5', 'Spolupráce', 'Malý backlog', 'Založte pět úkolů.', '📌', 'createdTasks', 5),
  player('created-25', 'Spolupráce', 'Směnový dispečer', 'Založte 25 úkolů.', '🎛️', 'createdTasks', 25),
  player('created-50', 'Spolupráce', 'Manažer bez porady', 'Založte 50 úkolů.', '📊', 'createdTasks', 50),
  player('created-100', 'Spolupráce', 'Sto plánů dopředu', 'Založte 100 úkolů.', '🔭', 'createdTasks', 100),
  player('created-250', 'Spolupráce', 'Generátor práce', 'Založte 250 úkolů.', '🏭', 'createdTasks', 250),
  player('created-1k', 'Spolupráce', 'Backlog bez horizontu', 'Založte 1 000 úkolů.', '🌌', 'createdTasks', 1_000),

  player('messages-5', 'Spolupráce', 'Krátké spojení', 'Napište pět vzkazů.', '📨', 'messages', 5),
  player('messages-10', 'Spolupráce', 'Deset čárek', 'Napište deset vzkazů.', '✉️', 'messages', 10),
  player('messages-50', 'Spolupráce', 'Směnový telegraf', 'Napište 50 vzkazů.', '📟', 'messages', 50),
  player('messages-100', 'Spolupráce', 'Sto hlášení', 'Napište 100 vzkazů.', '📻', 'messages', 100),
  player('messages-250', 'Spolupráce', 'Komunikační uzel', 'Napište 250 vzkazů.', '🛰️', 'messages', 250),
  player('messages-500', 'Spolupráce', 'Tovární redaktor', 'Napište 500 vzkazů.', '📰', 'messages', 500),
  player('messages-1k', 'Spolupráce', 'Román z výrobní haly', 'Napište 1 000 vzkazů.', '📖', 'messages', 1_000),

  player('comments-1', 'Spolupráce', 'Poznámka pod čarou', 'Přidejte první komentář k úkolu.', '✏️', 'comments', 1),
  player('comments-5', 'Spolupráce', 'Kontext je všechno', 'Přidejte pět komentářů k úkolům.', '🔎', 'comments', 5),
  player('comments-25', 'Spolupráce', 'Technická dokumentace', 'Přidejte 25 komentářů k úkolům.', '📐', 'comments', 25),
  player('comments-50', 'Spolupráce', 'Revizní technik', 'Přidejte 50 komentářů k úkolům.', '🧐', 'comments', 50),
  player('comments-100', 'Spolupráce', 'Sto dodatků', 'Přidejte 100 komentářů k úkolům.', '📚', 'comments', 100),
  player('comments-250', 'Spolupráce', 'Komentářový procesor', 'Přidejte 250 komentářů k úkolům.', '🧠', 'comments', 250),
  player('comments-1k', 'Spolupráce', 'Dokumentace delší než pás', 'Přidejte 1 000 komentářů k úkolům.', '📜', 'comments', 1_000),

  player('reactions-1', 'Spolupráce', 'První emoce', 'Rozdejte první reakci.', '👍', 'reactions', 1),
  player('reactions-5', 'Spolupráce', 'Morální podpora', 'Rozdejte pět reakcí.', '👏', 'reactions', 5),
  player('reactions-25', 'Spolupráce', 'Palec automatizován', 'Rozdejte 25 reakcí.', '🦾', 'reactions', 25),
  player('reactions-50', 'Spolupráce', 'Sociální mazivo', 'Rozdejte 50 reakcí.', '🛢️', 'reactions', 50),
  player('reactions-100', 'Spolupráce', 'Emoji operátor', 'Rozdejte 100 reakcí.', '😀', 'reactions', 100),
  player('reactions-250', 'Spolupráce', 'Náladový combinator', 'Rozdejte 250 reakcí.', '🎚️', 'reactions', 250),
  player('reactions-1k', 'Spolupráce', 'Tisíc signálů uznání', 'Rozdejte 1 000 reakcí.', '💛', 'reactions', 1_000),

  // Extended shared-factory progression.
  factory('produced-1', 'Výroba', 'Továrna dýchá', 'Továrna vyrobila první předmět.', '⚡', 'totalProduced', 1),
  factory('produced-1k', 'Výroba', 'První paleta', 'Továrna vyrobila 1 000 předmětů.', '🪵', 'totalProduced', 1_000),
  factory('produced-500k', 'Výroba', 'Půlmilionová série', 'Továrna vyrobila 500 000 předmětů.', '🏷️', 'totalProduced', 500_000),
  factory('produced-100m', 'Výroba', 'Megabáze potvrzena', 'Továrna vyrobila 100 milionů předmětů.', '🏭', 'totalProduced', 100_000_000),
  factory('produced-1b', 'Výroba', 'Průmyslová singularita', 'Továrna vyrobila miliardu předmětů.', '🕳️', 'totalProduced', 1_000_000_000),
  factory('produced-10b', 'Výroba', 'Deset miliard důvodů pokračovat', 'Továrna vyrobila deset miliard předmětů.', '🌌', 'totalProduced', 10_000_000_000),

  factory('consumed-1k', 'Výroba', 'Materiál v pohybu', 'Továrna spotřebovala 1 000 předmětů.', '➡️', 'totalConsumed', 1_000),
  factory('consumed-10k', 'Výroba', 'Hlad linky', 'Továrna spotřebovala 10 000 předmětů.', '🍴', 'totalConsumed', 10_000),
  factory('consumed-10m', 'Výroba', 'Požírač kontinentů', 'Továrna spotřebovala deset milionů předmětů.', '🌍', 'totalConsumed', 10_000_000),
  factory('consumed-100m', 'Výroba', 'Černá díra zásobování', 'Továrna spotřebovala 100 milionů předmětů.', '⚫', 'totalConsumed', 100_000_000),
  factory('consumed-1b', 'Výroba', 'Miliarda dovnitř', 'Továrna spotřebovala miliardu předmětů.', '🌀', 'totalConsumed', 1_000_000_000),

  factory('items-1', 'Výroba', 'První proud', 'Alespoň jeden druh předmětu právě proudí továrnou.', '➰', 'activeItems', 1),
  factory('items-10', 'Výroba', 'Deset proudů', 'Deset druhů předmětů právě proudí továrnou.', '🔟', 'activeItems', 10),
  factory('items-20', 'Výroba', 'Pásová symfonie', 'Dvacet druhů předmětů právě proudí továrnou.', '🎼', 'activeItems', 20),
  factory('items-50', 'Výroba', 'Logistický orchestr', 'Padesát druhů předmětů právě proudí továrnou.', '🎻', 'activeItems', 50),
  factory('items-100', 'Výroba', 'Všechno teče', 'Sto druhů předmětů právě proudí továrnou.', '🌊', 'activeItems', 100),

  factory('goals-2', 'Spolupráce', 'Potvrzený trend', 'Dokončete dva výrobní cíle.', '📈', 'completedGoals', 2),
  factory('goals-10', 'Spolupráce', 'Deset zásahů', 'Dokončete deset výrobních cílů.', '🎯', 'completedGoals', 10),
  factory('goals-50', 'Spolupráce', 'Výrobní sniper', 'Dokončete 50 výrobních cílů.', '🏹', 'completedGoals', 50),
  factory('goals-100', 'Spolupráce', 'Sto procent ze sta', 'Dokončete 100 výrobních cílů.', '💯', 'completedGoals', 100),

  factory('factory-tasks-1', 'Spolupráce', 'První společná tečka', 'Společně dokončete první úkol.', '🤝', 'factoryTasks', 1),
  factory('factory-tasks-100', 'Spolupráce', 'Dobře namazaný tým', 'Společně dokončete 100 úkolů.', '⚙️', 'factoryTasks', 100),
  factory('factory-tasks-500', 'Spolupráce', 'Dvojčlenná korporace', 'Společně dokončete 500 úkolů.', '🏢', 'factoryTasks', 500),

  factory('factory-messages-1', 'Spolupráce', 'Zápis do kroniky', 'Napište společně první vzkaz.', '📓', 'factoryMessages', 1),
  factory('factory-messages-100', 'Spolupráce', 'Komunikační páteř', 'Napište dohromady 100 vzkazů.', '🦴', 'factoryMessages', 100),
  factory('factory-messages-500', 'Spolupráce', 'Archiv směn', 'Napište dohromady 500 vzkazů.', '🗄️', 'factoryMessages', 500),

  factory('factory-reactions-1', 'Spolupráce', 'Továrna souhlasí', 'Nasbírejte první společnou reakci.', '✅', 'factoryReactions', 1),
  factory('factory-reactions-100', 'Spolupráce', 'Pozitivní zpětná vazba', 'Nasbírejte 100 reakcí.', '💬', 'factoryReactions', 100),
  factory('factory-reactions-500', 'Spolupráce', 'Emocionálně stabilní provoz', 'Nasbírejte 500 reakcí.', '🧘', 'factoryReactions', 500),

  factory('uptime-1h', 'Čas', 'Motor zahřátý', 'Mapa běží alespoň jednu hodinu.', '🌡️', 'serverUptime', 3_600),
  factory('uptime-12h', 'Čas', 'Půlden bez brzdy', 'Mapa běží alespoň dvanáct hodin.', '🌓', 'serverUptime', 43_200),
  factory('uptime-3d', 'Čas', 'Dlouhý víkend', 'Mapa běží alespoň tři dny.', '🏕️', 'serverUptime', 259_200),
  factory('uptime-30d', 'Čas', 'Průmyslový měsíc', 'Mapa běží alespoň třicet dní.', '🌕', 'serverUptime', 2_592_000),
  factory('uptime-365d', 'Čas', 'Rok bez vypínače', 'Mapa běží alespoň 365 dní.', '🎂', 'serverUptime', 31_536_000),
  factory('uptime-1000d', 'Čas', 'Tisíc dní oceli', 'Mapa běží alespoň 1 000 dní.', '🗿', 'serverUptime', 86_400_000),
  factory('one-online', 'Spolupráce', 'Někdo drží směnu', 'Alespoň jeden operátor je online.', '👤', 'onlinePlayers', 1)
];
