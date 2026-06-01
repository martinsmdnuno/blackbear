import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const CONFIG_PATH = resolve(process.env.CONFIG_PATH || './config.json');

// Built-in defaults assume BlackBeard runs inside the `servarr_default` Docker
// network, so containers are reachable by name. Env vars override the seeds,
// and once the UI saves config.json that file becomes authoritative.
function defaultConfig() {
  return {
    services: {
      sonarr: {
        url: process.env.SONARR_URL || 'http://sonarr:8989',
        apiKey: process.env.SONARR_API_KEY || '',
        container: process.env.SONARR_CONTAINER || 'sonarr'
      },
      radarr: {
        url: process.env.RADARR_URL || 'http://radarr:7878',
        apiKey: process.env.RADARR_API_KEY || '',
        container: process.env.RADARR_CONTAINER || 'radarr'
      },
      prowlarr: {
        url: process.env.PROWLARR_URL || 'http://prowlarr:9696',
        apiKey: process.env.PROWLARR_API_KEY || '',
        container: process.env.PROWLARR_CONTAINER || 'prowlarr'
      },
      bazarr: {
        url: process.env.BAZARR_URL || 'http://bazarr:6767',
        apiKey: process.env.BAZARR_API_KEY || '',
        container: process.env.BAZARR_CONTAINER || 'bazarr'
      },
      qbittorrent: {
        url: process.env.QBITTORRENT_URL || 'http://qbittorrent:8080',
        username: process.env.QBITTORRENT_USERNAME || 'admin',
        password: process.env.QBITTORRENT_PASSWORD || '',
        container: process.env.QBITTORRENT_CONTAINER || 'qbittorrent'
      },
      // TMDb is a public cloud API (no container); used for the Trending tab.
      tmdb: {
        url: process.env.TMDB_URL || 'https://api.themoviedb.org/3',
        apiKey: process.env.TMDB_API_KEY || ''
      },
      // Jellyfin runs natively on the host (not in the Docker network), so reach
      // it via host.docker.internal (Docker Desktop) or the LAN IP. userId is
      // optional — the backend falls back to the first user.
      jellyfin: {
        url: process.env.JELLYFIN_URL || 'http://host.docker.internal:8096',
        apiKey: process.env.JELLYFIN_API_KEY || '',
        userId: process.env.JELLYFIN_USER_ID || ''
      }
    },
    // Non-secret app behaviour (editable in Settings, persisted in config.json).
    app: {
      cleanup: {
        enabled: false, // off by default — opt-in, never deletes silently
        ratio: 1.0, // remove a completed torrent once it has seeded to this ratio…
        seedHours: 12, // …OR after this many hours of seeding (so it can't seed forever)
        deleteFiles: true, // also delete the torrent's files (safe with hardlinks)
        reGrabStalled: false, // re-grab stalled torrents via Sonarr/Radarr (blocklist + re-search)
        stalledMinutes: 60, // a torrent stalled for at least this long is considered stuck
        intervalSeconds: 120
      }
    }
  };
}

// Where the mutable "seen" list (hidden Trending items) lives — next to
// config.json, in the same persisted volume, but separate so the secrets file
// isn't rewritten on every dismiss.
const SEEN_PATH = resolve(dirname(CONFIG_PATH), 'seen.json');

let cache = null;

function deepMerge(base, override) {
  const out = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = deepMerge(base[key] || {}, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function loadConfig() {
  const defaults = defaultConfig();
  if (existsSync(CONFIG_PATH)) {
    try {
      const onDisk = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
      cache = deepMerge(defaults, onDisk);
    } catch (err) {
      console.error(`[config] Failed to parse ${CONFIG_PATH}, using defaults:`, err.message);
      cache = defaults;
    }
  } else {
    cache = defaults;
    persist();
    console.log(`[config] Created ${CONFIG_PATH} from defaults/env`);
  }
  return cache;
}

export function getConfig() {
  if (!cache) loadConfig();
  return cache;
}

export function getService(name) {
  return getConfig().services[name];
}

export function getAppConfig() {
  return getConfig().app || {};
}

function persist() {
  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cache, null, 2));
}

// Merge an incoming partial update. Secret fields (apiKey/password) that arrive
// empty are preserved so the UI never has to re-enter them.
export function saveConfig(update) {
  const current = getConfig();
  const merged = deepMerge(current, update || {});
  const secretFields = ['apiKey', 'password'];
  for (const [svc, cfg] of Object.entries(update?.services || {})) {
    for (const field of secretFields) {
      if (field in cfg && (cfg[field] === '' || cfg[field] == null)) {
        merged.services[svc][field] = current.services[svc]?.[field] || '';
      }
    }
  }
  cache = merged;
  persist();
  return cache;
}

export { CONFIG_PATH, SEEN_PATH };
