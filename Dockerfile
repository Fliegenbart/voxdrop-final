# VoxDrop - Multi-stage build for Railway
# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    # Puppeteer/Chromium deps for prerendering
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libxkbcommon0 \
    libxshmfence1 \
    libxss1 \
    libxtst6 \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Optional: allow skipping prerender in constrained build environments
ARG SKIP_PRERENDER=0
ENV SKIP_PRERENDER=${SKIP_PRERENDER}

# Build the application
RUN npm run build

# Stage 2: Production (Security Hardened)
FROM node:20-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    make \
    g++ \
    # Security: Install dumb-init for proper signal handling
    dumb-init \
    && rm -rf /var/lib/apt/lists/* \
    # Security: Remove unnecessary packages after build
    && apt-get purge -y --auto-remove

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && rm -rf /root/.npm

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Security: Create non-root user
RUN groupadd --gid 1001 voxdrop \
    && useradd --uid 1001 --gid voxdrop --shell /bin/bash --create-home voxdrop

# Create directories for uploads and data with correct ownership
RUN mkdir -p uploads data \
    && chown -R voxdrop:voxdrop /app

# Environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Security: Switch to non-root user
USER voxdrop

EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:5000/api/health').then(r => process.exit(r.ok ? 0 : 1))" || exit 1

# Security: Use dumb-init as PID 1 for proper signal handling
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/index.js"]
