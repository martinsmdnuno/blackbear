import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { SEEN_PATH } from '../config.js';

// Trending items the user dismissed ("already seen"), per media type. Stored as
// objects { tmdbId, title, poster, year } so the "Watched" view can show them
// for un-hiding. Legacy entries (bare numbers) are normalised on load.
let cache = null;

function normalize(e) {
  if (typeof e === 'number') return { tmdbId: e, title: null, poster: null, year: null };
  if (e && typeof e === 'object' && e.tmdbId != null) {
    return {
      tmdbId: Number(e.tmdbId),
      title: e.title || null,
      poster: e.poster || null,
      year: e.year || null
    };
  }
  return null;
}

function load() {
  if (cache) return cache;
  let raw = { movie: [], series: [] };
  if (existsSync(SEEN_PATH)) {
    try {
      raw = JSON.parse(readFileSync(SEEN_PATH, 'utf8'));
    } catch {
      // ignore parse errors
    }
  }
  cache = {
    movie: (raw.movie || []).map(normalize).filter(Boolean),
    series: (raw.series || []).map(normalize).filter(Boolean)
  };
  return cache;
}

function persist() {
  try {
    writeFileSync(SEEN_PATH, JSON.stringify(cache));
  } catch (err) {
    console.error('[seen] failed to persist:', err.message);
  }
}

const bucket = (type) => (type === 'movie' ? 'movie' : 'series');

export function listSeen() {
  return load();
}

export function isSeen(type, tmdbId) {
  return load()[bucket(type)].some((e) => e.tmdbId === Number(tmdbId));
}

export function seenSet(type) {
  return new Set(load()[bucket(type)].map((e) => e.tmdbId));
}

export function markSeen(type, item) {
  load();
  const b = bucket(type);
  const id = Number(item.tmdbId);
  if (!cache[b].some((e) => e.tmdbId === id)) {
    cache[b].push({
      tmdbId: id,
      title: item.title || null,
      poster: item.poster || null,
      year: item.year || null
    });
    persist();
  }
  return cache;
}

export function unmarkSeen(type, tmdbId) {
  load();
  const b = bucket(type);
  cache[b] = cache[b].filter((e) => e.tmdbId !== Number(tmdbId));
  persist();
  return cache;
}

// Backfill title/poster/year for a legacy entry that only had an id.
export function enrichEntry(type, tmdbId, data) {
  load();
  const e = cache[bucket(type)].find((x) => x.tmdbId === Number(tmdbId));
  if (e) {
    Object.assign(e, data);
    persist();
  }
}
