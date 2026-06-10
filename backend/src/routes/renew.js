import { Router } from 'express';
import * as sonarr from '../services/sonarr.js';
import * as radarr from '../services/radarr.js';
import * as qbit from '../services/qbittorrent.js';

const router = Router();

// POST /api/renew/episode/:id — search indexers for one missing episode.
router.post('/episode/:id', async (req, res) => {
  try {
    await sonarr.searchEpisodes([Number(req.params.id)]);
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/renew/season — search a whole season (season packs included),
// far lighter on indexers than one search per episode.
router.post('/season', async (req, res) => {
  const { seriesId, seasonNumber } = req.body || {};
  if (seriesId == null || seasonNumber == null) {
    return res.status(400).json({ error: 'seriesId and seasonNumber are required' });
  }
  try {
    await sonarr.searchSeason(Number(seriesId), Number(seasonNumber));
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/renew/movie/:id — search indexers for one missing movie.
router.post('/movie/:id', async (req, res) => {
  try {
    await radarr.searchMovies([Number(req.params.id)]);
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/renew/queue/:service/:id  body: { downloadId? }
//
// Force-renew a stuck download: remove the *arr queue item with blocklist=true
// (so the same release is never grabbed again) and skipRedownload=false (so a
// search for an alternative release fires immediately). removeFromClient=true
// also deletes the torrent and its partial files from qBittorrent; we verify
// that and force-remove the torrent ourselves if the client got out of sync.
router.post('/queue/:service/:id', async (req, res) => {
  const { service, id } = req.params;
  const svc = service === 'sonarr' ? sonarr : service === 'radarr' ? radarr : null;
  if (!svc) return res.status(400).json({ error: `Unknown service "${service}"` });

  try {
    await svc.removeQueueItem(id);
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }

  // Best-effort cleanup check against qBittorrent.
  let clientCleaned = true;
  const hash = req.body?.downloadId ? String(req.body.downloadId).toLowerCase() : null;
  if (hash) {
    try {
      const torrents = await qbit.listTorrents();
      const leftover = (torrents || []).find((t) => String(t.hash).toLowerCase() === hash);
      if (leftover) await qbit.remove(leftover.hash, true);
    } catch (err) {
      clientCleaned = false;
      console.error(`[renew] qBittorrent cleanup check failed for ${hash}:`, err.message);
    }
  }

  res.json({ ok: true, clientCleaned });
});

export default router;
