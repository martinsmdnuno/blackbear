import { getAppConfig } from '../config.js';
import * as qbit from './qbittorrent.js';
import * as sonarr from './sonarr.js';
import * as radarr from './radarr.js';

let timer = null;
let lastRun = null;

// Hit-and-Run floors (Portugas rule 4.2.1): a torrent must reach ratio 1 OR seed
// for at least 168h (7 days) before it may be removed. We clamp the configured
// values to these minimums so a misconfig (UI bypass, hand-edited config.json)
// can never make the cleanup delete a torrent early and earn an HnR strike.
const MIN_RATIO = 1.0;
const MIN_SEED_HOURS = 168;

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

  // Clamp to the HnR floors — never trust the stored value to be safe.
  const minRatio = Math.max(MIN_RATIO, typeof cfg.ratio === 'number' ? cfg.ratio : MIN_RATIO);
  const seedHours = Math.max(MIN_SEED_HOURS, typeof cfg.seedHours === 'number' ? cfg.seedHours : MIN_SEED_HOURS);
  const maxSeedSeconds = seedHours * 3600;
  const deleteFiles = cfg.deleteFiles !== false;
  if ((typeof cfg.ratio === 'number' && cfg.ratio < MIN_RATIO) ||
      (typeof cfg.seedHours === 'number' && cfg.seedHours < MIN_SEED_HOURS)) {
    console.warn(`[cleanup] config below HnR floor (ratio=${cfg.ratio}, seedHours=${cfg.seedHours}) — clamped to ratio>=${MIN_RATIO}, seedHours>=${MIN_SEED_HOURS}`);
  }
  const nowSec = Date.now() / 1000;

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
    // if queues are unreachable, fall through with an empty busy set
  }

  const removed = [];
  for (const t of torrents || []) {
    const hash = String(t.hash || '').toLowerCase();
    if (!isComplete(t)) continue;
    if (busy.has(hash)) continue;

    // Remove once it has paid its dues: hit the ratio, OR seeded long enough
    // (so a torrent with no peers can't sit there forever).
    const ratioOk = (t.ratio ?? 0) >= minRatio;
    const seededSec = t.completion_on > 0 ? nowSec - t.completion_on : 0;
    const timeOk = maxSeedSeconds > 0 && seededSec >= maxSeedSeconds;
    if (!ratioOk && !timeOk) continue;

    try {
      await qbit.remove(t.hash, deleteFiles);
      removed.push({ name: t.name, ratio: t.ratio, reason: ratioOk ? 'ratio' : 'time' });
    } catch (err) {
      console.error(`[cleanup] failed to remove ${t.name}:`, err.message);
    }
  }

  // Re-grab any torrents that have been stalled too long — delete the arr queue
  // item with blocklist=true so Sonarr/Radarr search for a different release.
  const regrabbed = [];
  if (cfg.reGrabStalled) {
    const stalledMin = Math.max(10, Number(cfg.stalledMinutes) || 60);
    const stalledSec = stalledMin * 60;
    const stuckHashes = new Set();
    for (const t of torrents || []) {
      const isStalled = t.state === 'stalledDL' || t.state === 'metaDL';
      const age = nowSec - (t.added_on || 0);
      if (isStalled && age >= stalledSec && (t.progress || 0) < 1) {
        stuckHashes.add(String(t.hash || '').toLowerCase());
      }
    }
    if (stuckHashes.size) {
      const [sq, rq] = await Promise.allSettled([sonarr.queue(), radarr.queue()]);
      const buckets = [
        ['sonarr', sq, sonarr.removeQueueItem],
        ['radarr', rq, radarr.removeQueueItem]
      ];
      for (const [svc, q, remove] of buckets) {
        if (q.status !== 'fulfilled') continue;
        for (const r of q.value?.records || []) {
          const id = r.downloadId && String(r.downloadId).toLowerCase();
          if (!id || !stuckHashes.has(id)) continue;
          try {
            await remove(r.id);
            regrabbed.push({ svc, name: r.title });
          } catch (err) {
            console.error(`[stalled] ${svc} failed to re-grab ${r.id}:`, err.message);
          }
        }
      }
      if (regrabbed.length) {
        console.log(`[stalled] re-grabbing ${regrabbed.length} stalled torrent(s) past ${stalledMin}m`);
      }
    }
  }

  lastRun = {
    at: new Date().toISOString(),
    removed: removed.length,
    regrabbed: regrabbed.length,
    ratio: minRatio,
    seedHours: maxSeedSeconds / 3600
  };
  if (removed.length) {
    console.log(`[cleanup] removed ${removed.length} torrent(s) at ratio >= ${minRatio}`);
  }
  return { removed, regrabbed, ...lastRun };
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
