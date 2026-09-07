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

Produkční override připojuje `factorio-current.log` pouze pro čtení. Backend sleduje offset a inode, tedy log ani při rotaci nepřepisuje. Z rozpoznaných řádků vytváří activity události pro připojení/odpojení, save a běžně logovaný research či rocket launch. Autoritativní telemetry pro přesné události zajišťuje mod.

## Production telemetry

Mod `hal-telemetry` 0.2.1 používá kontrakt V2. Z Factorio 2 čte správnou dvojici item flow statistik (`input` = výroba, `output` = spotřeba), kumulativní počitadla a přímo herní klouzavé rychlosti za jednu minutu. Automaticky agreguje unikátní force všech známých hráčů, takže funguje také se servery, kde mod rozdělí hráče do vlastních force. Aplikace ukládá minutové vzorky, staré V1 vzorky při výpočtu grafů záměrně ignoruje a samostatně řadí nejvíce vyráběné a spotřebovávané položky.

Každý Docker build zároveň vytvoří validní Factorio archiv `hal-telemetry_<verze>.zip` přímo z adresáře modu. Přihlášený uživatel si přesně tuto verzi stáhne v sekci **Server**, takže soubor není nutné ručně kopírovat přes SSH.

## Výrobní cíle, úspěchy a bezpečné RCON nástroje

Výrobní cíl ukládá počáteční kumulativní čítač položky a dále přičítá pouze kladné rozdíly mezi minutovými telemetry vzorky. Reset herního čítače proto cíl nesplní omylem. Po dokončení aplikace připne automatický vzkaz, zobrazí oslavu v PWA a přes stávající interní RCON spojení pošle oznámení do hry. Neúspěšné herní oznámení se opakuje při dalším vzorku; průběh cíle zůstává bezpečně uložený v SQLite.

Sekce **Úspěchy** obsahuje 44 perzistentních výzev pro oba hráče a společnou továrnu. Vyhodnocují se pouze z již dostupných telemetry a databázových údajů. Serverová obrazovka nabízí šest pevně whitelisted informačních RCON dotazů (`players`, `time`, `version`, `evolution`, `admins`, `whitelist`); klient nikdy neposílá vlastní raw příkaz.

## Stav implementace

Hotovo: jeden non-root Docker kontejner, healthcheck, persistentní SQLite/asset volume, PWA, sessions/CSRF/login rate-limit, přesný RCON klient, telemetry V2, minutové výrobní grafy a porovnání až čtyř položek, rozbalovací katalog výroby, výrobní cíle s herním oznámením, 44 úspěchů, skutečné Factorio ikony s CZ/EN názvy, automatický report směny, activity/log tailer, drag & drop úkoly s editací, termíny, filtry, připnutím a archivem, sdílené vzkazy s reakcemi a potvrzením přečtení, rozšířené profily, bezpečné informační RCON nástroje, stažení aktuálního modu, mobilní burger menu a responzivní světlé i tmavé UI.
