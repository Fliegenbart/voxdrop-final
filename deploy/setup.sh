#!/bin/bash
set -e

# VoxDrop Hetzner GPU Server Setup Script
# Tested on Ubuntu 22.04 LTS with GEX44

echo "=== VoxDrop Server Setup ==="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root: sudo ./setup.sh"
    exit 1
fi

# Domain configuration
DOMAIN="voxdrop.live"
echo "Domain: $DOMAIN"

read -p "Enter your email for SSL certificates: " EMAIL
if [ -z "$EMAIL" ]; then
    echo "Email is required!"
    exit 1
fi

echo ""
echo "=== Step 1: System Update ==="
apt-get update && apt-get upgrade -y

echo ""
echo "=== Step 2: Install Docker ==="
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
else
    echo "Docker already installed"
fi

echo ""
echo "=== Step 3: Install NVIDIA Container Toolkit ==="
if ! command -v nvidia-smi &> /dev/null; then
    echo "ERROR: NVIDIA drivers not found. Please install them first."
    echo "Run: apt install nvidia-driver-535"
    exit 1
fi

if ! dpkg -l | grep -q nvidia-container-toolkit; then
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
    curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
        sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
        tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
    apt-get update
    apt-get install -y nvidia-container-toolkit
    nvidia-ctk runtime configure --runtime=docker
    systemctl restart docker
else
    echo "NVIDIA Container Toolkit already installed"
fi

echo ""
echo "=== Step 4: Create SSL directory ==="
mkdir -p deploy/ssl

echo ""
echo "=== Step 5: Initial SSL Certificate (temp) ==="
# First, start nginx with a temporary self-signed cert for the ACME challenge
mkdir -p deploy/ssl/live/$DOMAIN
openssl req -x509 -nodes -newkey rsa:4096 -days 1 \
    -keyout deploy/ssl/live/$DOMAIN/privkey.pem \
    -out deploy/ssl/live/$DOMAIN/fullchain.pem \
    -subj "/CN=$DOMAIN"

echo ""
echo "=== Step 6: Build and start services ==="
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d nginx

echo ""
echo "=== Step 7: Get real SSL certificate ==="
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    -d $DOMAIN

echo ""
echo "=== Step 8: Restart with real certificate ==="
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d

echo ""
echo "=== Setup Complete! ==="
echo ""
echo "Your VoxDrop instance is now running at: https://$DOMAIN"
echo ""
echo "Useful commands:"
echo "  View logs:     docker compose -f docker-compose.prod.yml logs -f"
echo "  Stop:          docker compose -f docker-compose.prod.yml down"
echo "  Start:         docker compose -f docker-compose.prod.yml up -d"
echo "  GPU status:    nvidia-smi"
echo ""
echo "Note: The Whisper model will be downloaded on first transcription (~3GB for large-v3)"
