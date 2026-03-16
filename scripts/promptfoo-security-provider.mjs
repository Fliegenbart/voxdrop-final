import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const prompt = process.argv[2] || '';
const options = parseJson(process.argv[3], {});
const context = parseJson(process.argv[4], {});
const vars = context.vars || {};

const baseUrl = (process.env.PROMPTFOO_BASE_URL || vars.base_url || options.config?.baseUrl || 'http://127.0.0.1:5001').replace(/\/$/, '');
const email = process.env.PROMPTFOO_TEST_EMAIL || vars.test_email || options.config?.email || 'test@voxdrop.live';
const password = process.env.PROMPTFOO_TEST_PASSWORD || vars.test_password || options.config?.password || 'VoxDrop2026!Test';
const requestOrigin = new URL(baseUrl).origin;
const requestReferer = `${requestOrigin}/`;
const sessionCachePath = path.join(
  os.tmpdir(),
  `voxdrop-promptfoo-session-${crypto.createHash('sha256').update(`${baseUrl}|${email}`).digest('hex')}.json`,
);

function parseJson(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cookiesFromResponse(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }

  const header = response.headers.get('set-cookie');
  return header ? [header] : [];
}

function normalizeCookies(setCookieHeaders) {
  return setCookieHeaders
    .flatMap((header) => header.split(/,(?=[^;]+=[^;]+)/g))
    .map((header) => header.split(';', 1)[0].trim())
    .filter(Boolean);
}

function buildBrowserLikeHeaders(cookieHeader = '') {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    origin: requestOrigin,
    referer: requestReferer,
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent': 'voxdrop-promptfoo-security-smoke/1.0',
    ...(cookieHeader ? { cookie: cookieHeader } : {}),
  };
}

function readCachedCookieHeader() {
  try {
    const cache = parseJson(fs.readFileSync(sessionCachePath, 'utf8'), null);
    if (!cache || typeof cache.cookieHeader !== 'string' || !cache.cookieHeader.trim()) {
      return '';
    }

    const expiresAt = Number(cache.expiresAt || 0);
    if (expiresAt > 0 && Date.now() > expiresAt) {
      fs.rmSync(sessionCachePath, { force: true });
      return '';
    }

    return cache.cookieHeader.trim();
  } catch {
    return '';
  }
}

function writeCachedCookieHeader(cookieHeader) {
  if (!cookieHeader) return;

  const payload = JSON.stringify({
    cookieHeader,
    // Keep the session short-lived to avoid reusing stale cookies for too long.
    expiresAt: Date.now() + (30 * 60 * 1000),
  });

  fs.writeFileSync(sessionCachePath, payload, 'utf8');
}

function clearCachedCookieHeader() {
  fs.rmSync(sessionCachePath, { force: true });
}

async function login() {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: buildBrowserLikeHeaders(),
    body: JSON.stringify({ email, password }),
  });

  const rawText = await response.text();
  const payload = parseJson(rawText, { rawText });

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      payload,
      cookieHeader: '',
    };
  }

  return {
    ok: true,
    status: response.status,
    payload,
    cookieHeader: normalizeCookies(cookiesFromResponse(response)).join('; '),
  };
}

function buildRequest() {
  const endpoint = String(vars.endpoint || 'chat');

  if (endpoint === 'chat') {
    return {
      path: '/api/video-ai/chat',
      body: {
        messages: [{ role: 'user', content: prompt }],
        projectContext: {
          hasFiles: true,
          selectedFileName: vars.selected_file_name || 'behoerdenvideo.mp4',
          duration: Number(vars.duration_seconds || 42),
          currentTime: Number(vars.current_time_seconds || 42),
          mode: vars.mode || 'voxcut',
          transcript: vars.transcript || '',
        },
      },
    };
  }

  if (endpoint === 'commands') {
    return {
      path: '/api/video-ai/interpret-command',
      body: {
        prompt,
        durationSeconds: Number(vars.duration_seconds || 42),
        currentTimeSeconds: Number(vars.current_time_seconds || 42),
        mode: vars.mode || 'voxcut',
        trimStartSeconds: Number(vars.trim_start_seconds || 0),
        trimEndSeconds: Number(vars.trim_end_seconds || 0),
        transcript: vars.transcript || '',
      },
    };
  }

  if (endpoint === 'simplify') {
    return {
      path: '/api/simplify-text',
      body: {
        text: prompt,
        mode: vars.simplify_mode || 'both',
      },
    };
  }

  throw new Error(`Unsupported endpoint: ${endpoint}`);
}

function buildSummary(payload) {
  if (payload?.reply?.text) return String(payload.reply.text);
  if (payload?.message) return String(payload.message);
  if (payload?.error) return String(payload.error);
  if (payload?.command) return JSON.stringify(payload.command);
  if (payload?.simplified) return String(payload.simplified);
  if (payload?.rawText) return String(payload.rawText);
  return JSON.stringify(payload);
}

async function callEndpoint(cookieHeader) {
  const request = buildRequest();
  const response = await fetch(`${baseUrl}${request.path}`, {
    method: 'POST',
    headers: buildBrowserLikeHeaders(cookieHeader),
    body: JSON.stringify(request.body),
  });

  const rawText = await response.text();
  const payload = parseJson(rawText, { rawText });
  const normalized = {
    _http_status: response.status,
    endpoint: request.path,
    summary: buildSummary(payload),
    payload,
  };

  return `HTTP ${response.status}\n${normalized.summary}\nRAW_JSON:${JSON.stringify(normalized)}`;
}

async function callEndpointRaw(cookieHeader) {
  const request = buildRequest();
  const response = await fetch(`${baseUrl}${request.path}`, {
    method: 'POST',
    headers: buildBrowserLikeHeaders(cookieHeader),
    body: JSON.stringify(request.body),
  });

  const rawText = await response.text();
  const payload = parseJson(rawText, { rawText });

  return {
    status: response.status,
    requestPath: request.path,
    payload,
  };
}

function formatEndpointResponse(response) {
  const normalized = {
    _http_status: response.status,
    endpoint: response.requestPath,
    summary: buildSummary(response.payload),
    payload: response.payload,
  };

  return `HTTP ${response.status}\n${normalized.summary}\nRAW_JSON:${JSON.stringify(normalized)}`;
}

try {
  let cookieHeader = readCachedCookieHeader();
  let endpointResponse = null;

  if (cookieHeader) {
    endpointResponse = await callEndpointRaw(cookieHeader);
    if (endpointResponse.status !== 401 && endpointResponse.status !== 403) {
      process.stdout.write(formatEndpointResponse(endpointResponse));
      process.exit(0);
    }

    clearCachedCookieHeader();
    cookieHeader = '';
  }

  const loginResult = await login();
  if (!loginResult.ok) {
    clearCachedCookieHeader();
    process.stdout.write(`HTTP ${loginResult.status}\nLogin failed\nRAW_JSON:${JSON.stringify(loginResult)}`);
    process.exit(0);
  }

  writeCachedCookieHeader(loginResult.cookieHeader);
  process.stdout.write(await callEndpoint(loginResult.cookieHeader));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const safeMessage = message.replace(new RegExp(escapeRegex(password), 'g'), '***');
  process.stdout.write(`HTTP 599\nProvider error\nRAW_JSON:${JSON.stringify({ _http_status: 599, error: safeMessage })}`);
  process.exit(0);
}
