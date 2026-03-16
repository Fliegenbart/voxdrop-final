FROM node:20-bookworm-slim

# Chromium for Puppeteer + Java runtime for veraPDF
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    default-jre-headless \
    wget unzip ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

# Use system chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install veraPDF (greenfield installer zip + automated install)
RUN wget -q https://software.verapdf.org/releases/verapdf-installer.zip -O /tmp/verapdf.zip \
  && cd /tmp \
  && unzip -q /tmp/verapdf.zip -d /tmp/verapdf-installer \
  && printf '%s\n' \
    '<AutomatedInstallation langpack="eng">' \
    '  <com.izforge.izpack.panels.target.TargetPanel id="install_dir">' \
    '    <installpath>/opt/verapdf</installpath>' \
    '  </com.izforge.izpack.panels.target.TargetPanel>' \
    '  <com.izforge.izpack.panels.packs.PacksPanel id="sdk_pack_select">' \
    '    <pack index="0" name="veraPDF GUI" selected="true"/>' \
    '    <pack index="1" name="veraPDF Mac and *nix Scripts" selected="true"/>' \
    '    <pack index="2" name="veraPDF Validation model" selected="true"/>' \
    '    <pack index="3" name="veraPDF Documentation" selected="false"/>' \
    '    <pack index="4" name="veraPDF Sample Plugins" selected="false"/>' \
    '  </com.izforge.izpack.panels.packs.PacksPanel>' \
    '</AutomatedInstallation>' \
    > /tmp/auto-install.xml \
  && INSTALLER="$(find /tmp/verapdf-installer -type f -name 'verapdf-install' -o -type f -name 'vera-install' | head -n 1)" \
  && test -n "$INSTALLER" \
  && chmod +x "$INSTALLER" \
  && "$INSTALLER" /tmp/auto-install.xml \
  && VERAPDF_BIN="$(find /opt/verapdf -type f -name 'verapdf' -o -type f -name 'verapdf.sh' | head -n 1)" \
  && if [ -n "$VERAPDF_BIN" ]; then chmod +x "$VERAPDF_BIN" && ln -sf "$VERAPDF_BIN" /usr/local/bin/verapdf; \
     else VERAPDF_JAR="$(find /opt/verapdf -type f -name 'verapdf*.jar' | head -n 1)"; \
          test -n "$VERAPDF_JAR"; \
          printf '#!/bin/sh\\nexec java -jar %s \"$@\"\\n' "$VERAPDF_JAR" > /usr/local/bin/verapdf; \
          chmod +x /usr/local/bin/verapdf; \
     fi \
  && rm -rf /tmp/verapdf-installer /tmp/verapdf.zip /tmp/auto-install.xml

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src

EXPOSE 3001
CMD ["node", "src/index.js"]
