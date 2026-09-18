export type AchievementMetric =
  | 'playtime' | 'handCrafted' | 'mined' | 'built' | 'deaths'
  | 'completedTasks' | 'createdTasks' | 'messages' | 'comments' | 'reactions'
  | 'totalProduced' | 'totalConsumed' | 'activeItems' | 'completedGoals'
  | 'factoryTasks' | 'factoryMessages' | 'factoryReactions' | 'serverUptime' | 'onlinePlayers'
  | 'itemProduced' | 'fluidProduced' | 'surfaceCount' | 'planetCount' | 'platformCount'
  | 'logisticItems' | 'logisticRobots' | 'constructionRobots' | 'powerProductionMW'
  | 'probeCount' | 'researchQueue';

export type AchievementDefinition = {
  key: string;
  audience: 'player' | 'factory';
  category: 'Čas' | 'Výroba' | 'Stavba' | 'Spolupráce' | 'Dobrodružství' | 'Věda' | 'Logistika' | 'Vesmír' | 'Energie';
  title: string;
  description: string;
  icon: string;
  metric: AchievementMetric;
  target: number;
  subject?: string;
};

const player = (key: string, category: AchievementDefinition['category'], title: string, description: string, icon: string, metric: AchievementMetric, target: number): AchievementDefinition => ({ key, audience: 'player', category, title, description, icon, metric, target });
const factory = (key: string, category: AchievementDefinition['category'], title: string, description: string, icon: string, metric: AchievementMetric, target: number, subject?: string): AchievementDefinition => ({ key, audience: 'factory', category, title, description, icon, metric, target, ...(subject ? { subject } : {}) });

type ProductSpec = [key: string, prototype: string, label: string, title: string, icon: string, target: number, category?: AchievementDefinition['category']];

const productAchievement = ([key, prototype, label, title, icon, target, category = 'Výroba']: ProductSpec) =>
  factory(key, category, title, `Vyrobte ${target.toLocaleString('cs-CZ')} kusů: ${label}.`, icon, 'itemProduced', target, prototype);

const fluidAchievement = ([key, prototype, label, title, icon, target]: ProductSpec) =>
  factory(key, 'Výroba', title, `Vyrobte ${target.toLocaleString('cs-CZ')} jednotek kapaliny: ${label}.`, icon, 'fluidProduced', target, prototype);

const itemChallenges: ProductSpec[] = [
  ['item-iron-plate', 'iron-plate', 'železné pláty', 'Doba železná', '🪨', 100_000],
  ['item-copper-plate', 'copper-plate', 'měděné pláty', 'Měděná horečka', '🟠', 100_000],
  ['item-steel-plate', 'steel-plate', 'ocelové pláty', 'Ocelové nervy', '🩶', 50_000],
  ['item-stone-brick', 'stone-brick', 'kamenné cihly', 'Cihla k cihle', '🧱', 25_000],
  ['item-plastic-bar', 'plastic-bar', 'plast', 'Polymerní údolí', '⬜', 25_000],
  ['item-sulfur', 'sulfur', 'síru', 'Žlutá linka', '🟡', 10_000],
  ['item-battery', 'battery', 'baterie', 'Nabito na sto procent', '🔋', 10_000],
  ['item-electronic-circuit', 'electronic-circuit', 'elektronické obvody', 'Zelené moře', '🟢', 100_000],
  ['item-advanced-circuit', 'advanced-circuit', 'pokročilé obvody', 'Rudá deska', '🔴', 50_000],
  ['item-processing-unit', 'processing-unit', 'procesorové jednotky', 'Modrý mozek', '🔵', 10_000],
  ['item-engine-unit', 'engine-unit', 'motory', 'Motorárna', '⚙️', 10_000],
  ['item-electric-engine-unit', 'electric-engine-unit', 'elektromotory', 'Tichý tah', '🔌', 5_000],
  ['item-flying-robot-frame', 'flying-robot-frame', 'rámy létajících robotů', 'Křídla automatizace', '🪽', 2_000, 'Logistika'],
  ['item-low-density-structure', 'low-density-structure', 'nízkohustotní konstrukce', 'Lehčí než raketa', '🛰️', 10_000, 'Vesmír'],
  ['item-rocket-fuel', 'rocket-fuel', 'raketové palivo', 'Plná nádrž ke hvězdám', '🚀', 10_000, 'Vesmír'],
  ['item-uranium-fuel-cell', 'uranium-fuel-cell', 'uranové palivové články', 'Zelená záře', '☢️', 1_000, 'Energie'],
  ['item-nuclear-fuel', 'nuclear-fuel', 'jaderné palivo', 'Atomový sprint', '⚛️', 250, 'Energie'],
  ['item-transport-belt', 'transport-belt', 'přepravní pásy', 'Žlutá řeka', '➡️', 10_000, 'Logistika'],
  ['item-fast-transport-belt', 'fast-transport-belt', 'rychlé pásy', 'Modrá? Ještě ne', '⏩', 5_000, 'Logistika'],
  ['item-express-transport-belt', 'express-transport-belt', 'expresní pásy', 'Modrá dálnice', '💨', 5_000, 'Logistika'],
  ['item-turbo-transport-belt', 'turbo-transport-belt', 'turbo pásy', 'Pásové nadsvětlo', '⚡', 2_000, 'Logistika'],
  ['item-inserter', 'inserter', 'podavače', 'Tisíc mechanických rukou', '🦾', 1_000, 'Logistika'],
  ['item-bulk-inserter', 'bulk-inserter', 'hromadné podavače', 'Pořádná hrst', '🤜', 1_000, 'Logistika'],
  ['item-stack-inserter', 'stack-inserter', 'zásobníkové podavače', 'Všechno najednou', '✊', 500, 'Logistika'],
  ['item-rail', 'rail', 'koleje', 'Koleje k horizontu', '🛤️', 10_000, 'Logistika'],
  ['item-locomotive', 'locomotive', 'lokomotivy', 'Lokomotivní depo', '🚂', 100, 'Logistika'],
  ['item-cargo-wagon', 'cargo-wagon', 'nákladní vagóny', 'Nekonečný náklad', '🚃', 250, 'Logistika'],
  ['item-construction-robot', 'construction-robot', 'stavební roboty', 'Oranžová letka', '🤖', 1_000, 'Logistika'],
  ['item-logistic-robot', 'logistic-robot', 'logistické roboty', 'Roj doručovatelů', '🐝', 1_000, 'Logistika'],
  ['item-artillery-shell', 'artillery-shell', 'dělostřelecké granáty', 'Diplomacie na dálku', '💥', 1_000, 'Dobrodružství'],
  ['item-atomic-bomb', 'atomic-bomb', 'atomové bomby', 'Teď už je to osobní', '☄️', 10, 'Dobrodružství'],
  ['science-automation', 'automation-science-pack', 'automatizační science packy', 'Červený diplom', '🧪', 10_000, 'Věda'],
  ['science-logistic', 'logistic-science-pack', 'logistické science packy', 'Zelený diplom', '🧪', 10_000, 'Věda'],
  ['science-military', 'military-science-pack', 'vojenské science packy', 'Šedý diplom', '🧪', 10_000, 'Věda'],
  ['science-chemical', 'chemical-science-pack', 'chemické science packy', 'Modrý diplom', '🧪', 10_000, 'Věda'],
  ['science-production', 'production-science-pack', 'výrobní science packy', 'Fialový diplom', '🧪', 10_000, 'Věda'],
  ['science-utility', 'utility-science-pack', 'užitkové science packy', 'Žlutý diplom', '🧪', 10_000, 'Věda'],
  ['science-space', 'space-science-pack', 'vesmírné science packy', 'Bílý diplom', '🔬', 10_000, 'Věda'],
  ['science-metallurgic', 'metallurgic-science-pack', 'metalurgické science packy', 'Vulkanický diplom', '🌋', 5_000, 'Věda'],
  ['science-electromagnetic', 'electromagnetic-science-pack', 'elektromagnetické science packy', 'Bleskový diplom', '⚡', 5_000, 'Věda'],
  ['science-agricultural', 'agricultural-science-pack', 'zemědělské science packy', 'Organický diplom', '🌱', 5_000, 'Věda'],
  ['science-cryogenic', 'cryogenic-science-pack', 'kryogenní science packy', 'Ledový diplom', '❄️', 5_000, 'Věda'],
  ['science-promethium', 'promethium-science-pack', 'promethiové science packy', 'Diplom za hranou soustavy', '🌌', 1_000, 'Věda'],
  ['item-tungsten-plate', 'tungsten-plate', 'wolframové pláty', 'Vulcanus kalený', '🔥', 5_000, 'Vesmír'],
  ['item-carbon-fiber', 'carbon-fiber', 'uhlíková vlákna', 'Pevnost stonku', '🌿', 5_000, 'Vesmír']
];

const spaceAgeChallenges: ProductSpec[] = [
  ['space-superconductor', 'superconductor', 'supravodiče', 'Proud bez odporu', '🧲', 2_000, 'Vesmír'],
  ['space-supercapacitor', 'supercapacitor', 'superkondenzátory', 'Blesk v krabičce', '⚡', 2_000, 'Vesmír'],
  ['space-holmium', 'holmium-plate', 'holmiové pláty', 'Holmium v kapse', '🟣', 2_000, 'Vesmír'],
  ['space-bioflux', 'bioflux', 'bioflux', 'Pentapodí smoothie', '🧬', 5_000, 'Vesmír'],
  ['space-biter-egg', 'biter-egg', 'vajíčka kousačů', 'Nesahej na skořápku', '🥚', 1_000, 'Dobrodružství'],
  ['space-lithium', 'lithium-plate', 'lithiové pláty', 'Kryogenní kovárna', '🧊', 2_000, 'Vesmír'],
  ['space-quantum', 'quantum-processor', 'kvantové procesory', 'Schrödingerův assembler', '⚛️', 500, 'Vesmír'],
  ['space-fusion-cell', 'fusion-power-cell', 'fúzní palivové články', 'Malé slunce', '☀️', 500, 'Energie'],
  ['space-foundation', 'foundation', 'základy', 'Pevná půda pod lávou', '⬛', 1_000, 'Stavba'],
  ['space-calcite', 'calcite', 'kalcit', 'Bílá žíla Vulcanu', '🤍', 10_000, 'Vesmír'],
  ['space-tungsten-carbide', 'tungsten-carbide', 'karbid wolframu', 'Tvrdší než pondělí', '🔩', 5_000, 'Vesmír'],
  ['space-asteroid-collector', 'asteroid-collector', 'sběrače asteroidů', 'Vesmírná sklizeň', '🛰️', 50, 'Vesmír']
];

const fluidChallenges: ProductSpec[] = [
  ['fluid-water', 'water', 'vodu', 'Oceán v potrubí', '💧', 10_000_000],
  ['fluid-crude-oil', 'crude-oil', 'surovou ropu', 'Černé zlato', '🛢️', 1_000_000],
  ['fluid-petroleum', 'petroleum-gas', 'ropný plyn', 'Plynárenský gigant', '☁️', 1_000_000],
  ['fluid-sulfuric-acid', 'sulfuric-acid', 'kyselinu sírovou', 'Kyselá směna', '🧪', 250_000],
  ['fluid-lubricant', 'lubricant', 'mazivo', 'Dobře namazáno', '🟢', 250_000],
  ['fluid-light-oil', 'light-oil', 'lehký olej', 'Lehká frakce', '🟠', 500_000],
  ['fluid-heavy-oil', 'heavy-oil', 'těžký olej', 'Těžká frakce', '🟤', 250_000],
  ['fluid-molten-iron', 'molten-iron', 'roztavené železo', 'Železná řeka', '🌋', 1_000_000],
  ['fluid-molten-copper', 'molten-copper', 'roztavenou měď', 'Měděná řeka', '🔥', 1_000_000],
  ['fluid-ammonia', 'ammonia', 'amoniak', 'Mráz štípe v nose', '❄️', 250_000]
];

// 150 app-side achievements. 136 are driven directly by Factorio telemetry;
// the small collaboration set is intentionally retained as a secondary bonus.
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

  // PWA collaboration extras — useful, but deliberately a minority of the set.
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

  // More personal Factorio milestones.
  player('time-2h', 'Čas', 'Ještě jednu hodinku', 'Odehrajte dvě hodiny.', '🫖', 'playtime', 7_200),
  player('time-5h', 'Čas', 'Kde je večeře?', 'Odehrajte pět hodin.', '🍽️', 'playtime', 18_000),
  player('time-500h', 'Čas', 'Půl tisíciletí směn', 'Nasbírejte 500 hodin herního času.', '🗓️', 'playtime', 1_800_000),
  player('time-1k', 'Čas', 'Čtyři číslice', 'Nasbírejte 1 000 hodin herního času.', '⌛', 'playtime', 3_600_000),
  player('craft-1', 'Výroba', 'Vlastníma rukama', 'Ručně vyrobte první předmět.', '👐', 'handCrafted', 1),
  player('craft-10', 'Výroba', 'Kapesní manufaktura', 'Ručně vyrobte deset předmětů.', '🪛', 'handCrafted', 10),
  player('craft-5k', 'Výroba', 'Assembler? Neznám', 'Ručně vyrobte 5 000 předmětů.', '🙌', 'handCrafted', 5_000),
  player('craft-100k', 'Výroba', 'Lidský assembler', 'Ručně vyrobte 100 000 předmětů.', '🤖', 'handCrafted', 100_000),
  player('mine-1', 'Dobrodružství', 'První šutr', 'Ručně vytěžte první kus.', '🪨', 'mined', 1),
  player('mine-100', 'Dobrodružství', 'Kapesní lom', 'Ručně vytěžte 100 kusů.', '⛏️', 'mined', 100),
  player('mine-50k', 'Dobrodružství', 'Posun tektonických desek', 'Ručně vytěžte 50 000 kusů.', '🌋', 'mined', 50_000),
  player('mine-1m', 'Dobrodružství', 'Planeta v kapse', 'Ručně vytěžte milion kusů.', '🌍', 'mined', 1_000_000),
  player('build-1', 'Stavba', 'Položení základů', 'Postavte první entitu.', '🧱', 'built', 1),
  player('build-10', 'Stavba', 'Malé staveniště', 'Postavte deset entit.', '🚧', 'built', 10),
  player('build-5k', 'Stavba', 'Urbanista Nauvisu', 'Postavte 5 000 entit.', '🏙️', 'built', 5_000),
  player('build-100k', 'Stavba', 'Kontinent z oceli', 'Postavte 100 000 entit.', '🗼', 'built', 100_000),
  player('death-2', 'Dobrodružství', 'Déjà vu', 'Zemřete podruhé.', '😵', 'deaths', 2),
  player('death-10', 'Dobrodružství', 'Respawn specialista', 'Zemřete desetkrát.', '🔁', 'deaths', 10),
  player('death-50', 'Dobrodružství', 'Smrt je jen teleport', 'Zemřete padesátkrát.', '✨', 'deaths', 50),
  player('death-100', 'Dobrodružství', 'Sto životů', 'Zemřete stokrát.', '🐈', 'deaths', 100),

  ...itemChallenges.map(productAchievement),
  ...spaceAgeChallenges.map(productAchievement),
  ...fluidChallenges.map(fluidAchievement),

  // World-scale achievements from V3 telemetry.
  factory('surfaces-2', 'Vesmír', 'Dvě výrobní fronty', 'Provozujte výrobu alespoň na dvou površích.', '🪐', 'surfaceCount', 2),
  factory('surfaces-4', 'Vesmír', 'Meziplanetární holding', 'Provozujte výrobu alespoň na čtyřech površích.', '🌐', 'surfaceCount', 4),
  factory('planets-2', 'Vesmír', 'Dvojplanetární druh', 'Zpřístupněte telemetry ze dvou planet.', '🌍', 'planetCount', 2),
  factory('planets-4', 'Vesmír', 'Soustava pod kontrolou', 'Zpřístupněte telemetry ze čtyř planet.', '🪐', 'planetCount', 4),
  factory('platforms-1', 'Vesmír', 'Nahoře je továrna', 'Postavte první sledovanou vesmírnou platformu.', '🛰️', 'platformCount', 1),
  factory('platforms-3', 'Vesmír', 'Orbitální flotila', 'Provozujte tři vesmírné platformy.', '🚀', 'platformCount', 3),
  factory('platforms-5', 'Vesmír', 'Dopravní podnik galaxie', 'Provozujte pět vesmírných platforem.', '🌌', 'platformCount', 5),
  factory('logistic-items-10k', 'Logistika', 'Sklady se plní', 'Mějte v logistických sítích 10 000 položek.', '📦', 'logisticItems', 10_000),
  factory('logistic-items-1m', 'Logistika', 'Milion pod střechou', 'Mějte v logistických sítích milion položek.', '🏬', 'logisticItems', 1_000_000),
  factory('logistic-robots-100', 'Logistika', 'První roj', 'Provozujte 100 logistických robotů.', '🐝', 'logisticRobots', 100),
  factory('logistic-robots-1k', 'Logistika', 'Obloha plná beden', 'Provozujte 1 000 logistických robotů.', '📦', 'logisticRobots', 1_000),
  factory('construction-robots-100', 'Stavba', 'Automatická četa', 'Provozujte 100 stavebních robotů.', '🤖', 'constructionRobots', 100),
  factory('construction-robots-1k', 'Stavba', 'Staví se to samo', 'Provozujte 1 000 stavebních robotů.', '🏗️', 'constructionRobots', 1_000),
  factory('power-100mw', 'Energie', 'Sto megawattů', 'Dosáhněte 100 MW okamžité výroby elektřiny.', '⚡', 'powerProductionMW', 100),
  factory('power-1gw', 'Energie', 'První gigawatt', 'Dosáhněte 1 GW okamžité výroby elektřiny.', '🔌', 'powerProductionMW', 1_000),
  factory('power-10gw', 'Energie', 'Hvězda v rozvodně', 'Dosáhněte 10 GW okamžité výroby elektřiny.', '☀️', 'powerProductionMW', 10_000),
  factory('probes-1', 'Logistika', 'První senzor', 'Pojmenujte první telemetry sondu ve hře.', '📡', 'probeCount', 1),
  factory('probes-10', 'Logistika', 'Továrna má nervovou soustavu', 'Provozujte deset pojmenovaných telemetry sond.', '🧠', 'probeCount', 10),
  factory('research-queue-5', 'Věda', 'Výzkum na pět tahů', 'Zařaďte alespoň pět technologií do fronty.', '🔬', 'researchQueue', 5)
];
