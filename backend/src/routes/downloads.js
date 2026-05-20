import { Router } from 'express';
import * as qbit from '../services/qbittorrent.js';
import * as sonarr from '../services/sonarr.js';
import * as radarr from '../services/radarr.js';
import * as bazarr from '../services/bazarr.js';

const router = Router();

// Run a producer and return { data } on success or { error } on failure, so one
// offline service never breaks the whole downloads view.
async function settle(fn, fallback) {
  try {
    return { data: await fn() };
  } catch (err) {
    return { data: fallback, error: err.message };
  }
}

function mapTorrent(t) {
  return {
    hash: t.hash,
    name: t.name,
    category: t.category || '',
    progress: t.progress,
    dlspeed: t.dlspeed,
    upspeed: t.upspeed,
    eta: t.eta,
    state: t.state,
    size: t.size,
    completed: t.completed,
    numSeeds: t.num_seeds,
    numLeechs: t.num_leechs,
    ratio: t.ratio
  };
}

function mapQueueRecord(r) {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    trackedDownloadState: r.trackedDownloadState,
    trackedDownloadStatus: r.trackedDownloadStatus,
    size: r.size,
    sizeleft: r.sizeleft,
    timeleft: r.timeleft,
    errorMessage: r.errorMessage || (r.statusMessages || []).map((m) => m.title).join('; ')
  };
}

// GET /api/downloads
router.get('/', async (_req, res) => {
  const [torrents, sonarrQueue, radarrQueue, wantedMovies, wantedEpisodes] = await Promise.all([
    settle(qbit.listTorrents, []),
    settle(sonarr.queue, { records: [] }),
    settle(radarr.queue, { records: [] }),
    settle(bazarr.wantedMovies, { total: 0 }),
    settle(bazarr.wantedEpisodes, { total: 0 })
  ]);

  res.json({
    torrents: {
      items: (torrents.data || []).map(mapTorrent),
      error: torrents.error || null
    },
    sonarrQueue: {
      items: (sonarrQueue.data?.records || []).map(mapQueueRecord),
      error: sonarrQueue.error || null
    },
    radarrQueue: {
      items: (radarrQueue.data?.records || []).map(mapQueueRecord),
      error: radarrQueue.error || null
    },
    bazarr: {
      wantedMovies: wantedMovies.data?.total ?? 0,
      wantedEpisodes: wantedEpisodes.data?.total ?? 0,
      error: wantedMovies.error || wantedEpisodes.error || null
    }
  });
});

// POST /api/downloads/torrents/:hash/pause
router.post('/torrents/:hash/pause', async (req, res) => {
  try {
    await qbit.pause(req.params.hash);
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/downloads/torrents/:hash/resume
router.post('/torrents/:hash/resume', async (req, res) => {
  try {
    await qbit.resume(req.params.hash);
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// DELETE /api/downloads/torrents/:hash?deleteFiles=true
router.delete('/torrents/:hash', async (req, res) => {
  try {
    await qbit.remove(req.params.hash, req.query.deleteFiles === 'true');
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
