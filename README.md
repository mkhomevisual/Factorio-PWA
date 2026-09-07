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

Na Hal1000 bude aplikace samostatným Compose projektem. Produkční override připojuje aplikaci pouze do existujících sítí `factorio_default` a `nginx-network`; RCON není publikován do hostu ani internetu. Heslo se načítá ze souboru `/srv/factorio/data/config/rconpw` jako Compose secret. Log Factorio se připojuje výhradně read-only.

Použití produkčního override vyžaduje vytvořit neveřejný `.env.production` s `FACTORY_MODE=factorio-rcon`. Před nasazením je nutné na reálném serveru ověřit přesný název log souboru a umístit mod z `mods/hal-telemetry` do `/srv/factorio/data/mods` podle standardního Factorio formátu zip balíčku.

Nikdy do aplikace nemontujte Docker socket.

## Factorio ikony

Názvy itemů v aplikaci používají přímo názvy Factorio prototype, například `iron-plate`. Pro přesné herní ikony aplikace očekává licencované PNG soubory v persistentním adresáři `/app/data/factorio-icons`; tento obsah není součástí Git repozitáře ani Docker image.

Po získání base assetů z vlastní instalace Factorio je lze importovat jednorázově do volume například takto (cesta `/local/path/icons` musí být adresář s PNG ikonami):

```bash
docker compose run --rm -v /local/path/icons:/input:ro app npm run icons:import --workspace=@hal/api -- --source=/input
```

Rozhraní pak automaticky použije `/api/icons/<prototype>`. Dokud ikona není lokálně importována, zobrazí se neutrální fallback — aplikace nikdy nestahuje ani neukládá cizí herní grafiku z internetu.

## Stav implementace

Hotovo: Docker multi-stage build, non-root runtime, healthcheck, persistentní volume, PWA shell, bezpečné sessions/CSRF/login rate-limit, dvouúčtové založení, mock adaptér, bezpečný RCON adapter, základ dashboardu, SQLite základ tasků a návrh telemetry modu.

Následují: plné editace task boardu, historické production grafy a downsampling, activity/log tailer, profilové obrazovky a integrační test s Factorio 2.0.77.
