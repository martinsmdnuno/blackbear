import { Router } from 'express';
import * as radarr from '../services/radarr.js';
import * as sonarr from '../services/sonarr.js';

const router = Router();

async function settle(fn, fallback) {
  try {
    return { data: await fn() };
  } catch (err) {
    return { data: fallback, error: err.message };
  }
}

const poster = (images) => images?.find((i) => i.coverType === 'poster')?.remoteUrl || null;
const state = (eventType) => (eventType === 'downloadFolderImported' ? 'imported' : 'grabbed');

// GET /api/novidades?days=30
//
// A "what just landed" feed built from Radarr + Sonarr history: titles that were
// recently grabbed (download started) or imported (now available to watch).
// One card per title/episode, keyed to its most recent event, newest first.
router.get('/', async (req, res) => {
  const days = Math.min(Number(req.query.days) || 30, 180);
  const cutoff = Date.now() - days * 86400000;

  const [movieHist, epHist, allMovies, allSeries] = await Promise.all([
    settle(radarr.history, { records: [] }),
    settle(sonarr.history, { records: [] }),
    settle(radarr.allMovies, []),
    settle(sonarr.allSeries, [])
  ]);

  const movieById = new Map((allMovies.data || []).map((m) => [m.id, m]));
  const seriesById = new Map((allSeries.data || []).map((s) => [s.id, s]));

  // Records arrive newest-first, so the first event we see per title is the most
  // recent; once we cross the cutoff every later record is older too.
  const movies = [];
  const seenMovie = new Set();
  for (const r of movieHist.data?.records || []) {
    if (new Date(r.date).getTime() < cutoff) break;
    if (r.movieId == null || seenMovie.has(r.movieId)) continue;
    seenMovie.add(r.movieId);
    const m = movieById.get(r.movieId);
    movies.push({
      id: r.movieId,
      tmdbId: m?.tmdbId || null,
      type: 'movie',
      title: m?.title || r.sourceTitle || 'Unknown',
      year: m?.year || null,
      poster: m ? poster(m.images) : null,
      state: state(r.eventType),
      quality: r.quality?.quality?.name || null,
      date: r.date
    });
  }

  const episodes = [];
  const seenEp = new Set();
  for (const r of epHist.data?.records || []) {
    if (new Date(r.date).getTime() < cutoff) break;
    if (r.episodeId == null || seenEp.has(r.episodeId)) continue;
    seenEp.add(r.episodeId);
    const s = seriesById.get(r.seriesId);
    const ep = r.episode || {};
    episodes.push({
      id: r.episodeId,
      seriesId: r.seriesId,
      tmdbId: s?.tmdbId || null,
      type: 'episode',
      series: s?.title || r.series?.title || 'Unknown series',
      season: ep.seasonNumber ?? null,
      episode: ep.episodeNumber ?? null,
      title: ep.title || null,
      poster: s ? poster(s.images) : r.series ? poster(r.series.images) : null,
      state: state(r.eventType),
      quality: r.quality?.quality?.name || null,
      date: r.date
    });
  }

  res.json({
    items: [...movies, ...episodes].sort((a, b) => new Date(b.date) - new Date(a.date)),
    error: movieHist.error || epHist.error || null
  });
});

export default router;
