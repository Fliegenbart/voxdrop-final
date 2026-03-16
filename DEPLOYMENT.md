# VoxDrop Deployment Guide

## Kontrollierter Release-Workflow

Produktions- und Staging-Deploys sollen aus einem expliziten Release-Ref laufen, nicht aus einem schmutzigen Checkout.

Vorbereitung:

```bash
cp deploy/releases/production.env.example deploy/releases/production.env
cp deploy/releases/staging.env.example deploy/releases/staging.env
```

Vor jedem freizugebenden Stand:

```bash
npm run release:verify
```

Produktion:

```bash
./deploy/update.sh
```

Staging:

```bash
./deploy/staging-up.sh
```

Die Deploy-Skripte blockieren Dirty-Worktrees, holen den freigegebenen `RELEASE_REF`, starten die Compose-Stacks reproduzierbar und schreiben eine knappe Laufzeitspur unter `deploy/releases/runtime/`.

## Quick Reference - Deployment Command

**Wichtig:** Immer alle vier Compose-Dateien verwenden:

```bash
# Deployment-Befehl (mit PDF/UA + PPTX Service)
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.pdfua.yml -f docker-compose.pptx.yml up -d

# Oder einfacher: Update-Script verwenden
./deploy/update.sh
```

Ohne alle vier Dateien funktioniert das Networking zwischen den Containern nicht korrekt.

---

## Dots OCR On-Demand (VRAM-schonend)

Für das Minimal-Profil bleibt `qwen` + `faster-whisper` dauerhaft aktiv und `vllm-dots` läuft nur bei Bedarf.

### Komfort-Skripte

```bash
# Start (inkl. Health-Wait)
./deploy/dots-on-demand.sh

# Stop (VRAM freigeben)
./deploy/dots-off.sh
```

### Dots starten (nur für Tests)

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.pdfua.yml -f docker-compose.pptx.yml --profile dots up -d vllm-dots
```

### Health prüfen

```bash
# Dots-Modell antwortet
docker exec voxdrop-vllm-dots sh -lc "curl -fsS http://localhost:8000/v1/models"

# PDF/UA-Service sieht Dots als verfügbar
curl -sS https://www.voxdrop.live/api/pptx-summary-pdf/health | jq '.service.dots'
```

### Dots wieder stoppen

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.pdfua.yml -f docker-compose.pptx.yml stop vllm-dots
```

Nach dem Stop gilt erwartbar:
- `service.dots.available=false`
- `POST /api/pptx-summary-pdf/convert-dots` liefert `503` (fail-closed Beta-Preflight)

---

## Staging/Dev Auf Dem Gleichen Hetzner (On-Demand)

Wenn `voxdrop.live` bereits genutzt wird, solltest du **Staging/Dev getrennt von Prod** betreiben.
Das geht auf derselben Hetzner-Maschine, ohne dauerhaft doppelte Kosten: Staging wird nur bei Bedarf gestartet.

### Grundprinzip

- **2 Checkouts auf dem Server**: z.B. `/opt/voxdrop-prod` und `/opt/voxdrop-staging`
- **2 getrennte Datenverzeichnisse**:
  - Prod: `/opt/voxdrop-data/...`
  - Staging: `/opt/voxdrop-staging-data/...`
- Staging bindet nur auf `127.0.0.1` (kein öffentliches Internet), Zugriff per SSH-Tunnel.

### Staging Setup (Server)

1) Repo 2x klonen (oder 2. Checkout anlegen) und je Checkout eine eigene `.env` pflegen:
- Prod-Checkout: `.env` mit Prod-Secrets
- Staging-Checkout: `.env` mit **anderen** `JWT_SECRET`/`IP_HASH_SALT` und ohne Prod-Billing/Webhooks

2) Staging Datenordner anlegen:
```bash
mkdir -p /opt/voxdrop-staging-data/{db,uploads,podcast,qwen-tts-cache,avatar/outputs}
```

### Staging Start/Stop

Im Staging-Checkout:
```bash
./deploy/staging-up.sh
```

Optional (PPTX + PDF/UA Services in Staging):
```bash
STAGING_EXTRAS=true ./deploy/staging-up.sh
```

Staging läuft dann auf `http://127.0.0.1:5001`.
Tunnel von deinem Rechner:
```bash
ssh -L 5001:127.0.0.1:5001 root@<server-ip>
```

Stoppen:
```bash
./deploy/staging-down.sh
```

### Hinweis zu GPU-lastigen Services

`./deploy/staging-up.sh` startet standardmäßig mit `FORCE_CPU=true`, um Prod nicht durch GPU-Contention auszubremsen.
Wenn du bewusst GPU in Staging nutzen willst: `FORCE_CPU=false ./deploy/staging-up.sh` (nur machen, wenn du die Last auf Prod einschätzen kannst).

---

## GDPR-Compliant Self-Hosted Deployment

VoxDrop uses **local Whisper AI** for transcription - no data leaves your server. This ensures full GDPR compliance for processing audio containing personal data.

---

## Hetzner GPU Server Deployment (Recommended)

### 1. Server Requirements

**Recommended Hetzner Server:**
- **GX11** or higher (NVIDIA RTX/A-series GPU)
- Ubuntu 22.04
- Minimum 16GB RAM
- 100GB SSD

**Approximate Cost:** ~€1.50-2.00/hour (GPU server)

### 2. Server Setup

SSH into your Hetzner server:

```bash
ssh root@your-server-ip
```

Install Docker and NVIDIA Container Toolkit:

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install NVIDIA drivers (if not pre-installed)
apt install -y nvidia-driver-535

# Install NVIDIA Container Toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/libnvidia-container/gpgkey | apt-key add -
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
apt update
apt install -y nvidia-container-toolkit
systemctl restart docker

# Verify GPU is accessible
nvidia-smi
docker run --rm --gpus all nvidia/cuda:12.1-base nvidia-smi
```

### 3. Deploy VoxDrop

```bash
# Clone the repository
git clone https://github.com/Fliegenbart/voxdrop.git
cd voxdrop

# Build the application first
npm install
npm run build

# Start with Docker Compose (GPU mode)
docker compose up -d --build

# View logs
docker compose logs -f
```

### 4. Verify Deployment

```bash
# Check services are running
docker compose ps

# Test health endpoint
curl http://localhost/api/health

# Expected response:
# {"status":"ok","whisper":{"status":"ok","model":"large-v3","device":"auto"}}
```

### 5. Configure Domain & SSL (Optional)

For production, use a reverse proxy like Caddy or Nginx with SSL:

```bash
# Install Caddy
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install caddy

# Configure Caddy
cat > /etc/caddy/Caddyfile << EOF
your-domain.com {
    reverse_proxy localhost:80
}
EOF

# Restart Caddy (auto SSL)
systemctl restart caddy
```

---

## CPU-Only Deployment (Testing/Budget)

For servers without GPU (slower, but works):

```bash
# Use CPU compose file
docker compose -f docker-compose.cpu.yml up -d --build
```

**Note:** CPU mode uses the `base` model by default. Transcription will be 5-10x slower than GPU.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WHISPER_MODEL` | `large-v3` | Whisper model size (tiny, base, small, medium, large-v2, large-v3) |
| `WHISPER_DEVICE` | `auto` | Device for inference (auto, cuda, cpu) |
| `WHISPER_COMPUTE_TYPE` | `auto` | Compute precision (auto, float16, int8) |
| `ALLOW_OPENAI_WHISPER` | `false` | Enable OpenAI Whisper cloud mode (non-GDPR) |
| `AUDIT_LOG_RETENTION_DAYS` | `90` | Audit log retention in days |
| `CORS_ORIGINS` | _(empty)_ | Comma-separated allowed origins for microservices |
| `PORT` | `5000` | Web application port |
| `AVATAR_SERVICE_URL` | `http://avatar-service:8005` | Speaking avatar service base URL |

---

## Avatar Service (optional)

The `/avatar` UI expects a separate avatar generation service exposing the following endpoints:

- `GET /api/avatars`
- `GET /api/voices`
- `POST /api/generate`
- `GET /api/status/{job_id}`
- `GET /api/video/{job_id}`
- `GET /api/avatar-preview/{avatar_id}`

Point `AVATAR_SERVICE_URL` to that service. If you deploy it as a container on the same Docker network, name it `avatar-service` and expose port `8005`.

For the bundled Docker service, ensure these host paths exist on the server:

- `/opt/SadTalker` (SadTalker checkout with models)
- `/opt/voxdrop-data/avatar/avatars` (avatar PNGs; provide at least `default.png`)
- `/opt/voxdrop-data/avatar/outputs` (generated videos)

---

## Model Size Comparison

| Model | Size | VRAM | Speed (GPU) | Accuracy |
|-------|------|------|-------------|----------|
| tiny | 39M | ~1GB | ~32x realtime | Low |
| base | 74M | ~1GB | ~16x realtime | Medium |
| small | 244M | ~2GB | ~6x realtime | Good |
| medium | 769M | ~5GB | ~2x realtime | Very Good |
| large-v3 | 1550M | ~10GB | ~1x realtime | Best |

For GDPR-sensitive data, use `large-v3` for best accuracy.

---

## Troubleshooting

### GPU not detected
```bash
# Check NVIDIA driver
nvidia-smi

# Check Docker GPU access
docker run --rm --gpus all nvidia/cuda:12.1-base nvidia-smi
```

### Whisper service not starting
```bash
# Check logs
docker compose logs whisper

# Model download may take time on first start
# Wait for "Whisper model loaded successfully" in logs
```

### Out of GPU memory
```bash
# Use smaller model
WHISPER_MODEL=medium docker compose up -d
```

---

## Security Notes

- **No external API calls**: All AI processing happens locally
- **No data storage**: Audio files are processed in memory and immediately deleted
- **GDPR compliant**: Data never leaves your server
- **Firewall**: Only expose port 80/443 publicly

---

## Backup & Maintenance

```bash
# Backup model cache (avoids re-downloading)
docker run --rm -v voxdrop-whisper-models:/models -v $(pwd):/backup alpine tar cvf /backup/models.tar /models

# Update VoxDrop (empfohlen: Update-Script verwenden)
./deploy/update.sh

# Oder manuell:
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.pdfua.yml up -d --build
```
