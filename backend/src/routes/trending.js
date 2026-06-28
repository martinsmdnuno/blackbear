import { Router } from 'express';
import * as tmdb from '../services/tmdb.js';
import * as recommend from '../services/recommend.js';
import * as jellyfin from '../services/jellyfin.js';

const router = Router();

// Hide anything already watched in Jellyfin from the discovery lists.
async function filterWatched(data) {
  let jf = { movie: new Set(), series: new Set() };
  try {
    jf = await jellyfin.watchedTmdb();
  } catch {
    // Jellyfin not configured / unreachable — show everything.
  }
  return {
    movies: (data.movies || []).filter((m) => !jf.movie.has(m.tmdbId)),
    series: (data.series || []).filter((s) => !jf.series.has(s.tmdbId))
  };
}

// GET /api/trending?mode=trending|recent|popular
router.get('/', async (req, res) => {
  const mode = ['popular', 'recent'].includes(req.query.mode) ? req.query.mode : 'trending';
  try {
    const data = await tmdb.discover(mode);
    res.json({ mode, ...(await filterWatched(data)) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/trending/recommended  — "For You", from library history
router.get('/recommended', async (req, res) => {
  try {
    const data = await recommend.recommend({ refresh: req.query.refresh === '1' });
    res.json({ mode: 'recommended', ...(await filterWatched(data)), basedOn: data.basedOn });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
