import { getService } from '../config.js';
import { trimUrl } from './http.js';

const TIMEOUT = 12000;

// qBittorrent authenticates with a session cookie (SID) rather than an API key.
// We log in lazily, cache the cookie, and transparently re-login on a 403.
// When "Bypass authentication for whitelisted subnets/localhost" is enabled the
// login can succeed with no cookie (e.g. an empty 204), so we also track that.
let sidCookie = null;
let bypassAuth = false;

function base() {
  const cfg = getService('qbittorrent');
  if (!cfg?.url) throw new Error('qBittorrent URL not configured');
  return { url: trimUrl(cfg.url), username: cfg.username || '', password: cfg.password || '' };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`qBittorrent timed out after ${TIMEOUT}ms`);
    throw new Error(`qBittorrent unreachable: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

async function login() {
  const { url, username, password } = base();
  const res = await fetchWithTimeout(`${url}/api/v2/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: url },
    body: new URLSearchParams({ username, password }).toString()
  });
  const text = (await res.text()).trim();
  // 403 = IP temporarily banned after too many failed attempts.
  if (res.status === 403) {
    sidCookie = null;
    bypassAuth = false;
    throw new Error('qBittorrent login failed (403): IP banned — wait or restart qBittorrent');
  }
  // "Fails." is qBittorrent's explicit wrong-credentials marker.
  if (!res.ok || text === 'Fails.') {
    sidCookie = null;
    bypassAuth = false;
    throw new Error(`qBittorrent login failed (${res.status}): check username/password`);
  }
  // Success. Capture whatever session cookie was issued. The name varies by
  // build — plain `SID`, `QBT_SID`, or port-suffixed `QBT_SID_8080` — so keep
  // every name=value pair rather than matching one name. If none came back,
  // auth is being bypassed for our IP, so proceed without a cookie.
  const cookies = res.headers.getSetCookie?.() || [];
  const pairs = cookies.map((c) => c.split(';')[0].trim()).filter(Boolean);
  sidCookie = pairs.length ? pairs.join('; ') : null;
  bypassAuth = !sidCookie;
  return sidCookie;
}

async function ensureSession() {
  if (!sidCookie && !bypassAuth) await login();
  return sidCookie;
}

// Make an authenticated call, re-logging in once if the session expired.
async function call(path, { method = 'GET', form } = {}, retry = true) {
  const { url } = base();
  await ensureSession();
  const headers = { Referer: url };
  if (sidCookie) headers.Cookie = sidCookie;
  let body;
  if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(form).toString();
  }
  const res = await fetchWithTimeout(`${url}${path}`, { method, headers, body });
  if (res.status === 403 && retry) {
    sidCookie = null;
    bypassAuth = false;
    return call(path, { method, form }, false);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`qBittorrent responded ${res.status}${text ? `: ${text.slice(0, 120)}` : ''}`);
  }
  return res;
}

async function callJson(path, options) {
  const res = await call(path, options);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Some endpoints were renamed in qBittorrent 5.0 (pause→stop, resume→start).
// Try the modern name first, fall back to the legacy one on 404/405.
async function actionWithFallback(primary, fallback, form) {
  try {
    await call(primary, { method: 'POST', form });
  } catch (err) {
    if (/responded 40[45]/.test(err.message)) {
      await call(fallback, { method: 'POST', form });
    } else {
      throw err;
    }
  }
}

export const version = () => call('/api/v2/app/version').then((r) => r.text());

export const listTorrents = () => callJson('/api/v2/torrents/info');

export const pause = (hashes) =>
  actionWithFallback('/api/v2/torrents/stop', '/api/v2/torrents/pause', { hashes });

export const resume = (hashes) =>
  actionWithFallback('/api/v2/torrents/start', '/api/v2/torrents/resume', { hashes });

export const remove = (hashes, deleteFiles = false) =>
  call('/api/v2/torrents/delete', {
    method: 'POST',
    form: { hashes, deleteFiles: deleteFiles ? 'true' : 'false' }
  });

export const trackers = (hash) => callJson(`/api/v2/torrents/trackers?hash=${hash}`);

export default { version, listTorrents, pause, resume, remove, trackers };
