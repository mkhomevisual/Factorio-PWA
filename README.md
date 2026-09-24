# HAL Factory Control

Soukromá PWA pro dva rovnoprávné hráče Factorio Space Age. Aplikace běží jako jeden Node.js kontejner, přičemž SQLite data zůstávají v persistentním Docker volume.

## Lokální mock režim

```bash
cp .env.example .env
docker compose up --build
```

Otevřete `http://localhost:3000`. Mock režim nevyžaduje Factorio server. Po prvním spuštění založte oba účty (pouze přes standardní vstup, aby heslo nebylo argumentem procesu):

```bash
read -s HAL_PASSWORD && printf '%s' "$HAL_PASSWORD" | docker compose exec -T app npm run users:create --workspace=@hal/api -- --login=martin --displayName=Martin --factorioName=MarkanMegaBuilder --color=#e69636
unset HAL_PASSWORD
```

Stejným příkazem založte druhý, a poslední, účet s později potvrzeným Factorio jménem Hajnému. Hesla ani RCON secret nepatří do `.env`, repozitáře nebo logů.

V mock režimu je pro snadné lokální prohlížení povoleno heslo dlouhé nejméně 6 znaků. Produkční režim vyžaduje nejméně 14 znaků; slabá vývojová hesla do něj nepřenášejte.

## Produkční zapojení — až po lokálním ověření

Na Hal1000 bude aplikace samostatným Compose projektem. Produkční override připojuje aplikaci pouze do existujících sítí `factorio_default` a `nginx-proxy`; RCON není publikován do hostu ani internetu. Heslo se načítá ze souboru `/srv/factorio/data/config/rconpw` jako Compose secret. Log Factorio se připojuje výhradně read-only. Pro `jwilder/nginx-proxy` a jeho Let's Encrypt companion nastavte `VIRTUAL_HOST` a `LETSENCRYPT_EMAIL` pouze v neveřejném `.env.production`.

Použití produkčního override vyžaduje vytvořit neveřejný `.env.production` s `FACTORY_MODE=factorio-rcon`. Před nasazením je nutné na reálném serveru ověřit přesný název log souboru a umístit mod z `mods/hal-telemetry` do `/srv/factorio/data/mods` podle standardního Factorio formátu zip balíčku.

Nikdy do aplikace nemontujte Docker socket.

## Factorio ikony a české/anglické názvy

Docker image obsahuje 1 128 skutečných herních ikon a české i anglické názvy získané z vlastní instalace Factorio. Přepínač **CZ / EN** mění jazyk názvů položek v celé aplikaci. Produkční nasazení proto už nevyžaduje ruční kopírování assetů na HAL1000; persistentní adresář `/app/data/factorio-icons` zůstává podporovaný jako volitelná přednostní aktualizace.

Balíček assetů pro budoucí aktualizaci hry lze na Macu vytvořit takto:

```bash
./scripts/package-factorio-assets.sh \
  "/Users/martinklima/Library/Application Support/Steam/steamapps/common/Factorio/factorio.app/Contents/data" \
  /tmp/hal-factorio-assets.tar.gz
```

Po rozbalení balíčku na serveru se assety jednorázově importují do persistentního volume:

```bash
docker compose run --rm -v /local/path/factorio-assets:/input:ro app npm run icons:import --workspace=@hal/api -- --source=/input
```

Importér čte pouze `graphics/icons`, `locale/cs` a `locale/en`, nikoli velké herní textury. Rozhraní používá `/api/icons/<prototype>` a `/api/prototypes?locale=cs|en`; pokud konkrétní modovaná položka ikonu nemá, zobrazí bezpečný textový fallback. Aplikace herní grafiku nestahuje z internetu.

## Read-only Factorio log

Produkční override připojuje `factorio-current.log` pouze pro čtení. Backend sleduje offset a inode a při explicitním telemetry refreshi čte nejvýše 256 KiB nových dat; při prvním čtení vezme pouze omezený tail. Nespouští vlastní desetisekundový polling a nikdy nenačítá celý log. Z rozpoznaných řádků vytváří activity události pro připojení/odpojení, save a běžně logovaný research či rocket launch. Autoritativní telemetry pro přesné události zajišťuje mod.

## Production telemetry V3

Mod `hal-telemetry` 0.6.0 používá kontrakt V3. Z Factorio 2 čte správnou dvojici flow statistik položek a kapalin (`input` = výroba, `output` = spotřeba), kumulativní počitadla a přímo herní klouzavé rychlosti za jednu minutu. Elektrická statistika má podle Factorio API opačnou orientaci (`input` = odběr, `output` = výroba). Data zachovávají rozměry force a surface, samostatně sledují položky, kapaliny a řídký rozpad nenormálních quality. Snapshot dále obsahuje research queue a progress, vesmírné platformy, znečištění, agregované elektrické a logistické sítě, pojmenované sondy a přesné herní ticky událostí. Verze 0.6.0 z běžného snapshotu odstranila plošné skenování elektrických sloupů a akumulátorů; přesný součet energie akumulátorů proto bezpečný snapshot neuvádí.

Backend během přechodu přijímá kontrakty V2 i V3. V2 dál poskytuje původní společnou výrobu; nové obrazovky Operations a kapaliny se aktivují po prvním V3 snapshotu. Event cursor obsahuje stabilní ID save, takže nový nebo vyměněný save nezačne omylem navazovat na číselnou řadu předchozí mapy.

Gzip snapshoty vytvořené úspěšným ručním nebo volitelným background refreshem se drží 48 hodin. Současně se inkrementálně vytvářejí hodinové a denní rollupy položek i kapalin. Výrobu lze proto zobrazit za 7 dní, 30 dní a jeden rok bez trvalého ukládání milionů detailních snapshotů. Reset kumulativních Factorio čítačů se do rollupů nikdy nezapočítá jako výroba.

## Bezpečný refresh a volitelný sampling

Výchozí režim neposílá po startu backendu ani po otevření PWA žádný RCON příkaz. GET endpointy vracejí poslední SQLite snapshot; nový sběr spouští pouze tlačítko **Aktualizovat data** přes `POST /api/server/telemetry-refresh`. Současné požadavky všech uživatelů sdílejí jeden job, platí globální cooldown nejméně 10 sekund a všechny telemetry, save, message i informační příkazy procházejí jednou frontou s concurrency 1. RCON klient drží jedno spojení a po chybě ho bezpečně obnoví při následujícím příkazu. Stav a čítače jsou po přihlášení na `GET /api/server/diagnostics`.

Volitelný globální sampler je ve výchozím stavu vypnutý:

```env
HAL_BACKGROUND_SAMPLING_ENABLED=false
HAL_BACKGROUND_SAMPLING_INTERVAL_MS=300000
HAL_LIVE_RCON_ON_PAGE_LOAD=false
HAL_REFRESH_COOLDOWN_MS=10000
```

Interval background režimu nemůže být kratší než pět minut, další běh čeká na dokončení předchozího a po chybách používá exponential backoff. `HAL_LIVE_RCON_ON_PAGE_LOAD=true` je kompatibilní opt-in pro jeden globální refresh při startu backendu; počet karet jej nenásobí.

Každý Docker build zároveň vytvoří validní Factorio archiv `hal-telemetry_<verze>.zip` přímo z adresáře modu. Přihlášený uživatel si přesně tuto verzi stáhne v sekci **Server**, takže soubor není nutné ručně kopírovat přes SSH.

## Operations, výrobní cíle, úspěchy a bezpečné RCON nástroje

Sekce **Operations** sdružuje planetární přehled, výzkum, vesmírné platformy, energetiku, logistické zásoby a sondy. U každého povrchu ukazuje aktivní hráče, item a fluid throughput, znečištění, evoluci a bezpečně dostupnou elektrickou bilanci. Research panel dopočítává tempo science a ETA z reálně spotřebovávaných science packů. Platformy zobrazují aktuální trasu, stav, rychlost, hmotnost, poškozené dlaždice a obsah hubu. Energetika používá agregované statistiky bez plošného skenování entit; přesný stav všech akumulátorů se v bezpečném režimu nezjišťuje. Logistika ukazuje obsah sítí, dostupnost obou typů robotů, nabíjení a uživatelská minima zásob. Pojmenovaná sonda umí sledovat vybranou truhlu, tank, roboport, elektrický sloup nebo combinator.

Sondy se spravují přímo ve hře nad vybranou entitou příkazy `/hal-probe Název` a `/hal-unprobe Název`. Úkol lze ze hry založit příkazem `/hal-task Popis úkolu`; mod k němu připojí aktuální povrch a GPS hráče. Aplikace vrátí krátký kód, kterým se úkol dokončí přes `/hal-done ABC123`. Příkazy se zpracovávají jako deduplikované telemetry události, takže opakované načtení snapshotu nevytvoří duplicitní úkol.

Blueprint string uložený u úkolu lze bezpečně dekódovat přímo v detailu: inspector ukáže štítek, verzi, rozměr, počty entit a dlaždic, ikony, agregovaný soupis umístěných prototypů a schematický náhled. Blueprint sám neobsahuje receptové suroviny ani spolehlivý úplný seznam modů, proto je aplikace nevydává za přesný material cost.

Přihlášené PWA drží jedno autentizované SSE spojení na `/api/events/stream`. Změny úkolů, vzkazů, cílů a cached telemetry se tak propíšou do otevřených klientů bez pravidelného aplikačního pollingu. Skrytá karta ani několik otevřených karet nespouští živý RCON sběr.

Výrobní cíl ukládá počáteční kumulativní čítač položky a dále přičítá pouze kladné rozdíly mezi telemetry snapshoty. Reset herního čítače proto cíl nesplní omylem; při načtení jiného save se baseline bezpečně založí znovu. Po dokončení aplikace připne automatický vzkaz, zobrazí oslavu v PWA a přes stávající interní RCON spojení pošle oznámení do hry. Neúspěšné herní oznámení se opakuje při dalším vzorku; průběh cíle zůstává bezpečně uložený v SQLite.

Sekce **Úspěchy** obsahuje 150 perzistentních výzev pro oba hráče a společnou továrnu. Většinu tvoří skutečné herní milníky z Factorio telemetry: konkrétní výrobky a kapaliny, science packy, Space Age materiály, planety, platformy, logistika a energie; webová spolupráce je jen doplňková sada. Serverová obrazovka nabízí šest pevně whitelisted informačních RCON dotazů (`players`, `time`, `version`, `evolution`, `admins`, `whitelist`); klient nikdy neposílá vlastní raw příkaz.

## Stav implementace

Hotovo: jeden non-root Docker kontejner, healthcheck, persistentní SQLite/asset volume, PWA, sessions/CSRF/login rate-limit, živé SSE aktualizace, přesný RCON klient, zpětně kompatibilní telemetry V3, minutové i dlouhodobé výrobní grafy položek a kapalin, planetární Operations, výzkum s ETA i živým science přehledem podle packů, planet a přiřazených operátorů, přehled platforem, energetiky, logistických sítí a pojmenovaných sond, porovnání až čtyř prototypů, výrobní cíle s herním oznámením, úkoly zakládané a dokončované přímo ve hře, blueprint inspector, 150 úspěchů, skutečné Factorio ikony s CZ/EN názvy, automatický report směny, activity/log tailer, drag & drop úkoly s editací, termíny, filtry, připnutím a archivem, sdílené vzkazy s reakcemi a potvrzením přečtení, rozšířené profily, bezpečné informační RCON nástroje, stažení aktuálního modu, mobilní burger menu a responzivní graphite UI.
