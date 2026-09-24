# Continue here — nasazení HAL performance fixu

## Co je hotové

- HAL ve výchozím režimu po startu ani po otevření PWA automaticky nevolá RCON.
- Dashboard zobrazuje poslední SQLite cache a nový sběr spustí pouze tlačítko **Aktualizovat data**.
- Souběžné refresh požadavky se sloučí, platí 10s cooldown a všechny RCON operace používají jednu frontu s concurrency 1.
- RCON používá persistentní spojení s timeoutem a reconnectem.
- Factorio log nemá 10s polling; při refreshi se čte jen nový omezený úsek.
- Frontend nemá 30/60s aplikační polling a skrytá karta nerefreshuje data.
- `hal-telemetry` byl aktualizován na **0.6.0** a už neskenuje všechny elektrické sloupy a akumulátory.
- Poslední ověření: typecheck OK, 26/26 testů OK, build OK, Docker build a `/health` smoke test OK.

## Co poslat na HAL1000

Nejjednodušší a nejbezpečnější je poslat celý aktuální adresář projektu, ne pouze jednotlivé soubory. Adresář `node_modules` ani lokální buildy posílat není potřeba.

Zdrojový adresář na tomto počítači:

```text
/Users/martinklima/Downloads/Factorio-Hal-Control
```

Příklad přes `rsync` — upravte SSH host a cílovou cestu podle serveru:

```bash
rsync -av \
  --exclude node_modules \
  --exclude 'apps/*/dist' \
  --exclude 'packages/*/dist' \
  --exclude .env \
  --exclude .env.production \
  /Users/martinklima/Downloads/Factorio-Hal-Control/ \
  USER@HAL1000:/CESTA/K/Factorio-Hal-Control/
```

Záměrně zde není `--delete`, aby se nesmazal serverový `compose.production.yaml`, `.env.production` ani jiné neveřejné provozní soubory.

## Produkční konfigurace

Na HAL1000 doplňte do existujícího neveřejného `.env.production`:

```env
HAL_BACKGROUND_SAMPLING_ENABLED=false
HAL_BACKGROUND_SAMPLING_INTERVAL_MS=300000
HAL_LIVE_RCON_ON_PAGE_LOAD=false
HAL_REFRESH_COOLDOWN_MS=10000
```

Neměňte existující RCON secret, databázovou cestu ani Docker volume.

## Aktualizace Factorio modu

Na vývojovém počítači vytvořte ZIP:

```bash
cd /Users/martinklima/Downloads/Factorio-Hal-Control
node scripts/build-mod-zip.mjs mods/hal-telemetry /tmp/hal-telemetry-release
```

Na server přeneste:

```text
/tmp/hal-telemetry-release/hal-telemetry_0.6.0.zip
```

do:

```text
/srv/factorio/data/mods/
```

Starou verzi `hal-telemetry_0.5.2.zip` přesuňte mimo adresář `mods` jako zálohu. Potom v adresáři stávajícího Factorio Compose projektu restartujte Factorio, pravděpodobně:

```bash
docker compose restart server
```

Pokud se služba nejmenuje `server`, zjistěte název přes `docker compose ps` a restartujte odpovídající Factorio službu.

## Rebuild a restart HAL aplikace

V adresáři HAL projektu na serveru:

```bash
docker compose \
  -f compose.yaml \
  -f compose.production.yaml \
  --env-file .env.production \
  up -d --build app
```

Potom:

```bash
docker compose \
  -f compose.yaml \
  -f compose.production.yaml \
  --env-file .env.production \
  ps

docker compose \
  -f compose.yaml \
  -f compose.production.yaml \
  --env-file .env.production \
  logs --tail=100 app
```

Nepoužívejte `docker compose down -v`; smazalo by to persistentní data.

## Funkční kontrola

1. Přihlaste se do HAL PWA.
2. Dashboard musí bez RCON dotazu ukázat poslední uložená data nebo „Data zatím nebyla načtena“.
3. Klikněte jednou na **Aktualizovat data**.
4. UI musí zobrazit úspěch a čas aktualizace.
5. Otevřete několik karet — bez dalšího kliknutí nesmí vzniknout další RCON snapshot.
6. V sekci Server musí být ke stažení `hal-telemetry_0.6.0.zip`.

## Kontrola zátěže během hraní

Sledujte strukturované logy:

```bash
docker compose \
  -f compose.yaml \
  -f compose.production.yaml \
  --env-file .env.production \
  logs -f app | rg 'hal\.rcon\.operation|hal\.telemetry\.refresh'
```

Při vypnutém background samplingu a bez kliknutí na refresh nemají přibývat žádné RCON řádky. Jedno kliknutí má vytvořit jeden `telemetry.snapshot`; případný následný `server.message` je potvrzení herního úkolu nebo výrobního cíle.

Současně lze spustit:

```bash
docker stats
```

V přihlášeném browseru lze v DevTools konzoli načíst diagnostiku:

```js
await fetch('/api/server/diagnostics').then((response) => response.json())
```

Ověřte:

- `rconQueue.maxConcurrency` je `1`;
- `rconQueue.commands` se při pouhém otevření jedné ani pěti karet nezvyšuje;
- při souběžném kliknutí se `telemetry.metrics.started` zvýší jednou a `deduplicated` zachytí ostatní požadavky;
- Factorio během běžného hraní nemá pravidelné CPU/I/O špičky od HALu.

## Když bude potřeba návrat

- Zachovejte databázový Docker volume.
- Vraťte předchozí zdrojový adresář/image HALu.
- Přesuňte `hal-telemetry_0.6.0.zip` mimo `mods`, vraťte zálohu `0.5.2` a restartujte Factorio.
- Nevracejte automatický minutový telemetry polling, pokud není nutný pro diagnostiku.
