import { Router } from 'express';
import * as sonarr from '../services/sonarr.js';
import * as radarr from '../services/radarr.js';

const router = Router();

// Trim an *arr release down to what the picker UI needs. guid+indexerId is the
// pair the grab endpoint requires; everything else is display data.
function mapRelease(r) {
  return {
    guid: r.guid,
    indexerId: r.indexerId,
    indexer: r.indexer,
    title: r.title,
    size: r.size,
    protocol: r.protocol,
    seeders: r.seeders ?? null,
    leechers: r.leechers ?? null,
    ageDays: r.age ?? null,
    quality: r.quality?.quality?.name || null,
    languages: (r.languages || []).map((l) => l.name),
    fullSeason: !!r.fullSeason,
    rejected: !!r.rejected,
    rejections: r.rejections || []
  };
}

// Approved releases first, then healthiest (most seeders; usenet has none and
// sorts among itself by age).
function sortReleases(a, b) {
  if (a.rejected !== b.rejected) return a.rejected ? 1 : -1;
  const seeds = (b.seeders ?? -1) - (a.seeders ?? -1);
  if (seeds !== 0) return seeds;
  return (a.ageDays ?? Infinity) - (b.ageDays ?? Infinity);
}

function send(res, releases) {
  res.json(releases.map(mapRelease).sort(sortReleases));
}

// GET /api/releases/movie/:id — candidate releases for one movie.
router.get('/movie/:id', async (req, res) => {
  try {
    send(res, await radarr.movieReleases(Number(req.params.id)));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/releases/episode/:id — candidate releases for one episode
// (season packs covering it show up too, flagged fullSeason).
router.get('/episode/:id', async (req, res) => {
  try {
    send(res, await sonarr.episodeReleases(Number(req.params.id)));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/releases/season?seriesId=&seasonNumber= — candidate season packs.
router.get('/season', async (req, res) => {
  const { seriesId, seasonNumber } = req.query;
  if (seriesId == null || seasonNumber == null) {
    return res.status(400).json({ error: 'seriesId and seasonNumber are required' });
  }
  try {
    send(res, await sonarr.seasonReleases(Number(seriesId), Number(seasonNumber)));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/releases/grab  body: { service, guid, indexerId }
// Sends the chosen release to the download client, bypassing the auto-pick
// logic (rejected releases can be grabbed too — that's the point).
router.post('/grab', async (req, res) => {
  const { service, guid, indexerId } = req.body || {};
  const svc = service === 'sonarr' ? sonarr : service === 'radarr' ? radarr : null;
  if (!svc) return res.status(400).json({ error: `Unknown service "${service}"` });
  if (!guid || indexerId == null) {
    return res.status(400).json({ error: 'guid and indexerId are required' });
  }
  try {
    await svc.grabRelease(guid, indexerId);
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
