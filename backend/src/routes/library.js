import { Router } from 'express';
import * as radarr from '../services/radarr.js';
import * as sonarr from '../services/sonarr.js';
import * as jellyfin from '../services/jellyfin.js';
import { invalidate } from '../services/recommend.js';

const router = Router();

async function settle(fn, fallback) {
  try {
    return { data: await fn() };
  } catch (err) {
    return { data: fallback, error: err.message };
  }
}

const poster = (images) => images?.find((i) => i.coverType === 'poster')?.remoteUrl || null;
const byTitle = (a, b) => (a.title || '').localeCompare(b.title || '');

// GET /api/library — everything currently in Radarr (movies) and Sonarr (series),
// flagged with whether it's been watched in Jellyfin (best-effort).
router.get('/', async (_req, res) => {
  const [movies, series, watched] = await Promise.all([
    settle(radarr.allMovies, []),
    settle(sonarr.allSeries, []),
    jellyfin.watchedTmdb().catch(() => ({ movie: new Set(), series: new Set() }))
  ]);
  res.json({
    movies: {
      items: (movies.data || [])
        .map((m) => ({
          id: m.id,
          tmdbId: m.tmdbId || null,
          title: m.title,
          year: m.year,
          poster: poster(m.images),
          sizeOnDisk: m.sizeOnDisk || 0,
          hasFile: m.hasFile,
          monitored: m.monitored,
          watched: m.tmdbId ? watched.movie.has(m.tmdbId) : false
        }))
        .sort(byTitle),
      error: movies.error || null
    },
    series: {
      items: (series.data || [])
        .map((s) => ({
          id: s.id,
          tmdbId: s.tmdbId || null,
          title: s.title,
          year: s.year,
          poster: poster(s.images),
          sizeOnDisk: s.statistics?.sizeOnDisk || 0,
          episodes: s.statistics?.episodeFileCount || 0,
          monitored: s.monitored,
          watched: s.tmdbId ? watched.series.has(s.tmdbId) : false
        }))
        .sort(byTitle),
      error: series.error || null
    }
  });
});

// GET /api/library/ids — owned TMDb ids, to flag "already in library" elsewhere
router.get('/ids', async (_req, res) => {
  const [movies, series] = await Promise.all([
    settle(radarr.allMovies, []),
    settle(sonarr.allSeries, [])
  ]);
  res.json({
    movie: (movies.data || []).map((m) => m.tmdbId).filter(Boolean),
    series: (series.data || []).map((s) => s.tmdbId).filter(Boolean)
  });
});

// DELETE /api/library/movie/:id?deleteFiles=true
router.delete('/movie/:id', async (req, res) => {
  try {
    await radarr.deleteMovie(req.params.id, req.query.deleteFiles === 'true');
    invalidate();
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// DELETE /api/library/series/:id?deleteFiles=true
router.delete('/series/:id', async (req, res) => {
  try {
    await sonarr.deleteSeries(req.params.id, req.query.deleteFiles === 'true');
    invalidate();
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
