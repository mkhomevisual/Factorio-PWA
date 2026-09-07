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

## Factorio ikony a české názvy

Pro přesné herní ikony a české názvy aplikace očekává assety z vlastní instalace Factorio v persistentním adresáři `/app/data/factorio-icons`; tento obsah není součástí Git repozitáře ani Docker image. Importér čte pouze `graphics/icons` a `locale/cs`, nikoli velké herní textury.

Na Macu lze z vlastní instalace vytvořit malý přenosový balíček:

```bash
./scripts/package-factorio-assets.sh \
  "/Users/martinklima/Library/Application Support/Steam/steamapps/common/Factorio/factorio.app/Contents/data" \
  /tmp/hal-factorio-assets.tar.gz
```

Po rozbalení balíčku na serveru se assety jednorázově importují do persistentního volume:

```bash
docker compose run --rm -v /local/path/factorio-assets:/input:ro app npm run icons:import --workspace=@hal/api -- --source=/input
```

Rozhraní pak automaticky použije `/api/icons/<prototype>` a české názvy z `/api/prototypes`. Dokud assety nejsou lokálně importovány, zobrazí se neutrální fallback — aplikace nikdy nestahuje herní grafiku z internetu.

## Read-only Factorio log

Produkční override připojuje `factorio-current.log` pouze pro čtení. Backend sleduje offset a inode, tedy log ani při rotaci nepřepisuje. Z rozpoznaných řádků vytváří activity události pro připojení/odpojení, save a běžně logovaný research či rocket launch. Autoritativní telemetry pro přesné události zajišťuje mod.

## Production telemetry

Mod `hal-telemetry` 0.2.0 používá kontrakt V2. Z Factorio 2 čte správnou dvojici item flow statistik (`input` = výroba, `output` = spotřeba), kumulativní počitadla a přímo herní klouzavé rychlosti za jednu minutu. Aplikace ukládá minutové vzorky, staré V1 vzorky při výpočtu grafů záměrně ignoruje a samostatně řadí nejvíce vyráběné a spotřebovávané položky.

Každý Docker build zároveň vytvoří validní Factorio archiv `hal-telemetry_<verze>.zip` přímo z adresáře modu. Přihlášený uživatel si přesně tuto verzi stáhne v sekci **Server**, takže soubor není nutné ručně kopírovat přes SSH.

## Stav implementace

Hotovo: jeden non-root Docker kontejner, healthcheck, persistentní SQLite/asset volume, PWA, sessions/CSRF/login rate-limit, přesný RCON klient, telemetry V2, minutové výrobní grafy s filtrem konkrétního itemu, Factorio ikony a české názvy, activity/log tailer, barevně rozlišené společné úkoly s náhledy checklistů a komentářů, sdílené Vzkazy, profily, stažení aktuálního modu a responzivní světlé i tmavé UI.
