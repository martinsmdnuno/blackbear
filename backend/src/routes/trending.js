import { Router } from 'express';
import * as tmdb from '../services/tmdb.js';
import * as recommend from '../services/recommend.js';
import { markSeen, unmarkSeen, seenSet, listSeen, enrichEntry } from '../services/seen.js';
import * as jellyfin from '../services/jellyfin.js';

const router = Router();

// Hide both manually-hidden items and anything already watched in Jellyfin.
async function filterSeen(data) {
  let jf = { movie: new Set(), series: new Set() };
  try {
    jf = await jellyfin.watchedTmdb();
  } catch {
    // Jellyfin not configured / unreachable — just use the manual seen list
  }
  const movies = new Set([...seenSet('movie'), ...jf.movie]);
  const series = new Set([...seenSet('series'), ...jf.series]);
  return {
    movies: (data.movies || []).filter((m) => !movies.has(m.tmdbId)),
    series: (data.series || []).filter((s) => !series.has(s.tmdbId))
  };
}

// GET /api/trending?mode=trending|recent|popular
router.get('/', async (req, res) => {
  const mode = ['popular', 'recent'].includes(req.query.mode) ? req.query.mode : 'trending';
  try {
    const data = await tmdb.discover(mode);
    res.json({ mode, ...(await filterSeen(data)) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/trending/recommended  — "For You", from download history
router.get('/recommended', async (req, res) => {
  try {
    const data = await recommend.recommend({ refresh: req.query.refresh === '1' });
    res.json({ mode: 'recommended', ...(await filterSeen(data)), basedOn: data.basedOn });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/trending/seen  { type, tmdbId, title?, poster?, year? } — hide an item
router.post('/seen', (req, res) => {
  const { type, tmdbId, title, poster, year } = req.body || {};
  if ((type !== 'movie' && type !== 'series') || !tmdbId) {
    return res.status(400).json({ error: 'type (movie|series) and tmdbId are required' });
  }
  markSeen(type, { tmdbId, title, poster, year });
  res.json({ ok: true });
});

// DELETE /api/trending/seen  { type, tmdbId } — un-hide
router.delete('/seen', (req, res) => {
  const { type, tmdbId } = req.body || {};
  if ((type !== 'movie' && type !== 'series') || !tmdbId) {
    return res.status(400).json({ error: 'type (movie|series) and tmdbId are required' });
  }
  unmarkSeen(type, tmdbId);
  res.json({ ok: true });
});

// GET /api/trending/seen — list hidden items (with title/poster), enriching any
// legacy id-only entries via TMDb so the "Watched" view can show them.
router.get('/seen', async (_req, res) => {
  const data = listSeen();
  const tasks = [];
  for (const [type, arr] of [['movie', data.movie], ['series', data.series]]) {
    for (const e of arr) {
      if (!e.title) {
        tasks.push(
          tmdb
            .details(type, e.tmdbId)
            .then((d) => d && enrichEntry(type, e.tmdbId, d))
            .catch(() => {})
        );
      }
    }
  }
  if (tasks.length) await Promise.all(tasks);
  res.json(listSeen());
});

export default router;
