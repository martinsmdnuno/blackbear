import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { SEEN_PATH } from '../config.js';

// Tracks Trending items the user has dismissed ("already seen"), per media type,
// by TMDb id. Persisted as a small JSON file in the config volume.
let cache = null;

function load() {
  if (cache) return cache;
  if (existsSync(SEEN_PATH)) {
    try {
      const data = JSON.parse(readFileSync(SEEN_PATH, 'utf8'));
      cache = { movie: data.movie || [], series: data.series || [] };
    } catch {
      cache = { movie: [], series: [] };
    }
  } else {
    cache = { movie: [], series: [] };
  }
  return cache;
}

function persist() {
  try {
    writeFileSync(SEEN_PATH, JSON.stringify(cache));
  } catch (err) {
    console.error('[seen] failed to persist:', err.message);
  }
}

function bucket(type) {
  return type === 'movie' ? 'movie' : 'series';
}

export function listSeen() {
  return load();
}

export function isSeen(type, tmdbId) {
  return load()[bucket(type)].includes(Number(tmdbId));
}

export function markSeen(type, tmdbId) {
  load();
  const b = bucket(type);
  const id = Number(tmdbId);
  if (!cache[b].includes(id)) {
    cache[b].push(id);
    persist();
  }
  return cache;
}

export function unmarkSeen(type, tmdbId) {
  load();
  const b = bucket(type);
  const id = Number(tmdbId);
  cache[b] = cache[b].filter((x) => x !== id);
  persist();
  return cache;
}

// Returns a Set of seen ids for quick filtering.
export function seenSet(type) {
  return new Set(load()[bucket(type)]);
}
