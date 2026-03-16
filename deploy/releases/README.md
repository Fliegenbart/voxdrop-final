# Release Manifeste

Diese Dateien definieren, welcher Commit oder Tag fuer Produktion oder Staging freigegeben ist.

- `production.env.example`: Vorlage fuer den produktiven Release-Ref
- `staging.env.example`: Vorlage fuer Staging
- `runtime/`: Deploy-Spuren und Status-Snapshots, absichtlich nicht versioniert

Empfehlung:

1. Auf dem Zielsystem `*.env.example` nach `*.env` kopieren.
2. `RELEASE_REF` auf den freigegebenen Commit oder Tag setzen.
3. Erst dann `./deploy/update.sh` oder `./deploy/staging-up.sh` ausfuehren.
