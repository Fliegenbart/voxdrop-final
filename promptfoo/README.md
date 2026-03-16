# Promptfoo in VoxDrop

Dieser Ordner beschreibt die festen Security-Smokes fuer die produktionsnahen LLM-Endpunkte.

Enthaltene Suites:

- `promptfooconfig.security.chat.yaml` fuer `/api/video-ai/chat`
- `promptfooconfig.security.commands.yaml` fuer `/api/video-ai/interpret-command`
- `promptfooconfig.security.simplify.yaml` fuer `/api/simplify-text`

Validierung:

```bash
npm run promptfoo:security:validate
```

Lokaler oder stagingnaher Smoke:

```bash
PROMPTFOO_BASE_URL=http://127.0.0.1:5001 npm run promptfoo:security:local
```

Produktions-Smoke aus dem Web-Container:

```bash
PROMPTFOO_BASE_URL=https://voxdrop.live npm run promptfoo:security:server
```

Hinweise:

- Die Security-Smokes nutzen den Testaccount `test@voxdrop.live`.
- Falls noetig, Zugangsdaten ueber `PROMPTFOO_TEST_EMAIL` und `PROMPTFOO_TEST_PASSWORD` setzen.
- Der Provider ist absichtlich ein kleines Node-Skript (`scripts/promptfoo-security-provider.mjs`), damit dieselben Configs lokal, in CI und im Container laufen.
