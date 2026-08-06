import { Router } from 'express';
import * as qbit from '../services/qbittorrent.js';
import * as radarr from '../services/radarr.js';
import * as sonarr from '../services/sonarr.js';
import * as jellyfin from '../services/jellyfin.js';
import { getAppConfig } from '../config.js';
import { MIN_RATIO, MIN_SEED_HOURS, isComplete, busyHashes } from '../services/cleanup.js';

const router = Router();

// Trackers whose torrents must never be offered for deletion here. Portugas is
// a private tracker (Hit & Run rules, seeding bonus) — its torrents are managed
// by the HnR-safe auto cleanup only, never from this screen.
const PROTECTED_TRACKERS = [/portugas/i];

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function magnetTrackerUrls(magnet) {
  const urls = [];
  for (const m of String(magnet || '').matchAll(/[?&]tr=([^&]+)/g)) {
    try {
      urls.push(decodeURIComponent(m[1]));
    } catch {
      // malformed component — skip
    }
  }
  return urls;
}

// Every announce URL we can find for a torrent. The info row and magnet URI are
// free; the trackers endpoint is only hit when both give nothing.
async function announceUrls(t) {
  const urls = [t.tracker, ...magnetTrackerUrls(t.magnet_uri)].filter(Boolean);
  if (!urls.length) {
    const list = await qbit.trackers(t.hash).catch(() => []);
    for (const tr of list || []) {
      if (/^(https?|udp):/i.test(tr.url || '')) urls.push(tr.url);
    }
  }
  return urls;
}

// The same floors the auto cleanup enforces (Portugas rule 4.2.1) — a torrent
// only shows up as deletable once it could not possibly earn an HnR strike.
function thresholds() {
  const cfg = getAppConfig().cleanup || {};
  return {
    ratio: Math.max(MIN_RATIO, typeof cfg.ratio === 'number' ? cfg.ratio : MIN_RATIO),
    seedHours: Math.max(
      MIN_SEED_HOURS,
      typeof cfg.seedHours === 'number' ? cfg.seedHours : MIN_SEED_HOURS
    )
  };
}

// One pass over every completed torrent: protected ones are dropped entirely
// (a torrent whose tracker can't be identified counts as protected — never
// guess), the rest are annotated with whether they may be deleted. Both the
// listing and the delete validation go through here, so the UI can never ask
// for something the rules don't allow.
async function survey() {
  const th = thresholds();
  const torrents = (await qbit.listTorrents()) || [];
  let busy = new Set();
  try {
    busy = await busyHashes();
  } catch {
    // queues unreachable — treat none as busy, same as the auto cleanup
  }
  const nowSec = Date.now() / 1000;
  const items = [];
  let protectedCount = 0;

  for (const t of torrents) {
    if (!isComplete(t)) continue;
    const urls = await announceUrls(t);
    const isProtected =
      !urls.length || urls.some((u) => PROTECTED_TRACKERS.some((re) => re.test(u)));
    if (isProtected) {
      protectedCount++;
      continue;
    }
    const hash = String(t.hash || '').toLowerCase();
    const seededSec = t.completion_on > 0 ? Math.max(0, nowSec - t.completion_on) : 0;
    const ratioOk = (t.ratio ?? 0) >= th.ratio;
    const timeOk = seededSec >= th.seedHours * 3600;
    const importing = busy.has(hash);
    items.push({
      hash,
      name: t.name,
      size: t.size,
      category: t.category || '',
      trackerHost: hostOf(urls[0]),
      ratio: Math.round((t.ratio ?? 0) * 100) / 100,
      seededHours: Math.round(seededSec / 3600),
      state: t.state,
      importing,
      eligible: (ratioOk || timeOk) && !importing,
      reason: ratioOk ? 'ratio' : timeOk ? 'time' : null
    });
  }

  items.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.seededHours - a.seededHours);
  return { thresholds: th, items, protectedCount };
}

// GET /api/seeding — completed torrents split into deletable / still seeding.
router.get('/', async (_req, res) => {
  try {
    res.json(await survey());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Remove the library side of a torrent: the Radarr movie, or the Sonarr episode
// files it was imported as. Because imports are hardlinks, the torrent's files
// and the library's files are the same data under two names — disk space is
// only freed once both are gone. Returns a description of what was removed, or
// null when the torrent was never imported (e.g. added by hand).
async function removeFromLibrary(hash) {
  const downloadId = hash.toUpperCase();

  try {
    const h = await radarr.historyForDownload(downloadId);
    const movieIds = [...new Set((h?.records || []).map((r) => r.movieId).filter(Boolean))];
    if (movieIds.length) {
      for (const id of movieIds) await radarr.deleteMovie(id, true);
      return `movie removed from Radarr (files included)`;
    }
  } catch {
    // Radarr unreachable or history gone — fall through to Sonarr
  }

  try {
    const h = await sonarr.historyForDownload(downloadId);
    const episodeIds = [...new Set((h?.records || []).map((r) => r.episodeId).filter(Boolean))];
    if (episodeIds.length) {
      // Unmonitor BEFORE deleting files, or Sonarr immediately re-grabs them.
      await sonarr.unmonitorEpisodes(episodeIds);
      const fileIds = new Set();
      for (const id of episodeIds) {
        const ep = await sonarr.episode(id).catch(() => null);
        if (ep?.episodeFileId) fileIds.add(ep.episodeFileId);
      }
      for (const f of fileIds) await sonarr.deleteEpisodeFile(f).catch(() => {});
      return `${episodeIds.length} episode(s) unmonitored, ${fileIds.size} file(s) removed from Sonarr`;
    }
  } catch {
    // Sonarr unreachable — nothing more we can map
  }

  return null;
}

// POST /api/seeding/delete  { hashes: [...] }
// Re-validates every hash against a fresh survey before touching anything, so
// a stale or hand-crafted request can never delete a protected torrent. Then
// deletes EVERYWHERE: the library entry and files (Radarr/Sonarr), the torrent
// and its files (qBittorrent), and finally kicks a Jellyfin library refresh.
router.post('/delete', async (req, res) => {
  const hashes = Array.isArray(req.body?.hashes)
    ? req.body.hashes.map((h) => String(h).toLowerCase())
    : [];
  if (!hashes.length) return res.status(400).json({ error: 'Expected { hashes: [...] }' });

  try {
    const { items } = await survey();
    const byHash = new Map(items.map((i) => [i.hash, i]));
    const deleted = [];
    const skipped = [];
    for (const h of hashes) {
      const item = byHash.get(h);
      if (!item) {
        skipped.push({ hash: h, reason: 'protected, incomplete or unknown torrent' });
        continue;
      }
      if (!item.eligible) {
        skipped.push({
          hash: h,
          name: item.name,
          reason: item.importing ? 'still importing' : 'seeding conditions not met yet'
        });
        continue;
      }
      try {
        const library = await removeFromLibrary(h);
        await qbit.remove(h, true);
        deleted.push({ hash: h, name: item.name, size: item.size, library });
      } catch (err) {
        skipped.push({ hash: h, name: item.name, reason: err.message });
      }
    }
    if (deleted.length) {
      // Best-effort: make the titles vanish from Jellyfin without waiting for
      // its scheduled scan.
      await jellyfin.refreshLibrary().catch(() => {});
    }
    res.json({ deleted, skipped });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
