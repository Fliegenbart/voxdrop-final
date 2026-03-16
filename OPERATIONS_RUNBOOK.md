# VoxDrop Operations Runbook

Stand: 2026-03-11

## Zielbild

VoxDrop soll aus einem festen Git-Release deployt, mit klaren Gates geprueft und im Notfall reproduzierbar wiederhergestellt werden.

## Release-Quellen

- Produktive Vorlage: `deploy/releases/production.env.example`
- Staging-Vorlage: `deploy/releases/staging.env.example`
- Laufzeitspuren: `deploy/releases/runtime/`

## Standard-Release

1. `production.env.example` oder `staging.env.example` auf das Zielsystem als `.env` kopieren.
2. `RELEASE_REF` auf den freigegebenen Commit oder Tag setzen.
3. `npm run release:verify`
4. Produktion: `./deploy/update.sh`
5. Staging: `./deploy/staging-up.sh`

## Was `release:verify` abdeckt

- `npm run verify:routes`
- `npm run db:verify`
- `npm run check`
- `npm run build`
- `npm run promptfoo:security:validate`

## Staging-Check

`./deploy/staging-up.sh` fuehrt nach dem Healthcheck standardmaessig aus:

- Login-Smoke ueber `scripts/login-smoke.sh`
- Promptfoo-Security-Smokes im Web-Container

## Produktions-Smoke

Nach dem Produktionsdeploy fuehrt `./deploy/update.sh` standardmaessig die festen Promptfoo-Security-Smokes im Web-Container aus.

Von einem Entwicklerrechner aus bleibt moeglich:

```bash
PROMPTFOO_BASE_URL=https://voxdrop.live npm run promptfoo:security:server
```

## Backup und Restore

Backup:

```bash
npm run db:backup
```

Restore:

```bash
DB_RESTORE_CONFIRMED=yes npm run db:restore -- /absolute/path/to/voxdrop-backup.sqlite
```

## Live-Zustand sichern

```bash
npm run ops:capture:prod-state
```

Die Ausgabe landet in `deploy/releases/runtime/production-state/`.
