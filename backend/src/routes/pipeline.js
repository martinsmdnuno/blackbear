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

function poster(item) {
  return item.images?.find((i) => i.coverType === 'poster')?.remoteUrl || null;
}

// Pick the soonest *future* release date for a movie, preferring the dates that
// actually make it downloadable (digital/physical) over the cinema date.
function movieRelease(m, now) {
  const candidates = [
    { type: 'digital', d: m.digitalRelease },
    { type: 'physical', d: m.physicalRelease },
    { type: 'cinema', d: m.inCinemas }
  ]
    .filter((c) => c.d)
    .map((c) => ({ type: c.type, iso: c.d, ms: new Date(c.d).getTime() }));
  if (!candidates.length) return null;
  const future = candidates.filter((c) => c.ms > now).sort((a, b) => a.ms - b.ms);
  const pick = future[0] || candidates.sort((a, b) => a.ms - b.ms)[0];
  return { date: pick.iso, type: pick.type };
}

// GET /api/pipeline?movieDays=365&episodeDays=90
router.get('/', async (req, res) => {
  const now = Date.now();
  const movieDays = Math.min(Number(req.query.movieDays) || 365, 1000);
  const episodeDays = Math.min(Number(req.query.episodeDays) || 90, 365);
  const start = new Date(now).toISOString();
  const movieEnd = new Date(now + movieDays * 86400000).toISOString();
  const episodeEnd = new Date(now + episodeDays * 86400000).toISOString();

  const [movies, episodes] = await Promise.all([
    settle(() => radarr.calendar(start, movieEnd), []),
    settle(() => sonarr.calendar(start, episodeEnd), [])
  ]);

  const movieItems = (movies.data || [])
    .filter((m) => !m.hasFile)
    .map((m) => {
      const rel = movieRelease(m, now);
      return {
        id: m.id,
        tmdbId: m.tmdbId,
        title: m.title,
        year: m.year,
        poster: poster(m),
        monitored: m.monitored,
        date: rel?.date || null,
        dateType: rel?.type || null
      };
    })
    .filter((m) => m.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const episodeItems = (episodes.data || [])
    .filter((e) => !e.hasFile && e.airDateUtc)
    .map((e) => ({
      id: e.id,
      seriesId: e.seriesId,
      series: e.series?.title || 'Unknown series',
      poster: e.series ? poster(e.series) : null,
      season: e.seasonNumber,
      episode: e.episodeNumber,
      title: e.title,
      monitored: e.monitored,
      date: e.airDateUtc
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  res.json({
    movies: { items: movieItems, error: movies.error || null },
    episodes: { items: episodeItems, error: episodes.error || null }
  });
});

export default router;
