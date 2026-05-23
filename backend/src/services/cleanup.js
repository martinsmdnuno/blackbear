import { getAppConfig } from '../config.js';
import * as qbit from './qbittorrent.js';
import * as sonarr from './sonarr.js';
import * as radarr from './radarr.js';

let timer = null;
let lastRun = null;

function isComplete(t) {
  return t.progress >= 1 || (t.completed > 0 && t.completed >= t.size);
}

// Hashes still being handled by Sonarr/Radarr (downloading or importing) — never
// remove those, or we'd delete a torrent mid-import.
async function busyHashes() {
  const set = new Set();
  const collect = (q) => {
    for (const r of q?.records || []) {
      if (r.downloadId) set.add(String(r.downloadId).toLowerCase());
    }
  };
  const [s, r] = await Promise.allSettled([sonarr.queue(), radarr.queue()]);
  if (s.status === 'fulfilled') collect(s.value);
  if (r.status === 'fulfilled') collect(r.value);
  return set;
}

// Remove completed torrents that have seeded to the configured ratio. Opt-in;
// skips anything the *arr stack is still importing.
export async function runCleanup() {
  const cfg = getAppConfig().cleanup || {};
  if (!cfg.enabled) return { skipped: 'disabled' };

  const minRatio = typeof cfg.ratio === 'number' ? cfg.ratio : 1.0;
  const deleteFiles = cfg.deleteFiles !== false;

  let torrents;
  try {
    torrents = await qbit.listTorrents();
  } catch (err) {
    return { error: err.message };
  }

  let busy = new Set();
  try {
    busy = await busyHashes();
  } catch {
    // if queues are unreachable, fall through with an empty busy set but still
    // require ratio >= threshold, which already implies the download finished
  }

  const removed = [];
  for (const t of torrents || []) {
    const hash = String(t.hash || '').toLowerCase();
    if (!isComplete(t)) continue;
    if ((t.ratio ?? 0) < minRatio) continue;
    if (busy.has(hash)) continue;
    try {
      await qbit.remove(t.hash, deleteFiles);
      removed.push({ name: t.name, ratio: t.ratio });
    } catch (err) {
      console.error(`[cleanup] failed to remove ${t.name}:`, err.message);
    }
  }

  lastRun = { at: new Date().toISOString(), removed: removed.length, ratio: minRatio };
  if (removed.length) {
    console.log(`[cleanup] removed ${removed.length} torrent(s) at ratio >= ${minRatio}`);
  }
  return { removed, ...lastRun };
}

export function getLastRun() {
  return lastRun;
}

// (Re)start the periodic loop based on current config.
export function startCleanupLoop() {
  if (timer) clearInterval(timer);
  const cfg = getAppConfig().cleanup || {};
  const seconds = Math.max(30, Number(cfg.intervalSeconds) || 120);
  timer = setInterval(() => {
    runCleanup().catch((err) => console.error('[cleanup] loop error:', err.message));
  }, seconds * 1000);
  // run once shortly after boot
  setTimeout(() => runCleanup().catch(() => {}), 10000);
}
