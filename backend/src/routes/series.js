import { Router } from 'express';
import * as sonarr from '../services/sonarr.js';

const router = Router();

// A season as the UI needs it: how much of it is on disk, and whether Sonarr is
// watching for the rest.
function mapSeason(s) {
  const st = s.statistics || {};
  const total = st.totalEpisodeCount || 0;
  const have = st.episodeFileCount || 0;
  return {
    seasonNumber: s.seasonNumber,
    monitored: Boolean(s.monitored),
    episodeFileCount: have,
    totalEpisodeCount: total,
    sizeOnDisk: st.sizeOnDisk || 0,
    // Specials (season 0) are almost never wanted and skew "complete".
    specials: s.seasonNumber === 0,
    complete: total > 0 && have >= total,
    missingCount: Math.max(0, total - have)
  };
}

// GET /api/series/:id/seasons — the seasons of a series already in Sonarr.
router.get('/:id/seasons', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Bad series id' });
  try {
    const series = await sonarr.series(id);
    res.json({
      id: series.id,
      title: series.title,
      year: series.year || null,
      monitored: series.monitored,
      seasons: (series.seasons || []).map(mapSeason).sort((a, b) => a.seasonNumber - b.seasonNumber)
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/series/:id/seasons/:n  { monitored?, search? }
// Monitoring a season and searching for it are separate acts, and the UI does
// both at once when you ask for a season you don't have: Sonarr won't keep a
// grab for a season it isn't watching.
router.post('/:id/seasons/:n', async (req, res) => {
  const id = Number(req.params.id);
  const seasonNumber = Number(req.params.n);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(seasonNumber)) {
    return res.status(400).json({ error: 'Bad series id or season number' });
  }
  const { monitored, search } = req.body || {};

  try {
    if (typeof monitored === 'boolean') {
      const series = await sonarr.series(id);
      const season = (series.seasons || []).find((s) => s.seasonNumber === seasonNumber);
      if (!season) return res.status(404).json({ error: `No season ${seasonNumber} in that series` });
      season.monitored = monitored;
      // A series that isn't monitored itself ignores its seasons.
      if (monitored) series.monitored = true;
      await sonarr.updateSeries(series);
    }
    if (search === true) await sonarr.searchSeason(id, seasonNumber);
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
