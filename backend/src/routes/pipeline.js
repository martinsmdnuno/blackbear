import { Router } from 'express';
import * as radarr from '../services/radarr.js';
import * as sonarr from '../services/sonarr.js';
import * as qbit from '../services/qbittorrent.js';

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

// Pick the soonest *future* release date for an upcoming movie; for a missing
// (already released) movie, pick the most recent past downloadable date.
function movieReleaseFuture(m, now) {
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

function movieReleasePast(m) {
  const c = [
    { type: 'digital', d: m.digitalRelease },
    { type: 'physical', d: m.physicalRelease },
    { type: 'cinema', d: m.inCinemas }
  ].filter((x) => x.d);
  if (!c.length) return null;
  // Most recent past release; if none in past, take any (rare).
  c.sort((a, b) => new Date(b.d) - new Date(a.d));
  return { date: c[0].d, type: c[0].type };
}

// Classify a missing item's *arr queue record (if any) so the UI can tell
// "stalled download" apart from "no sources found". The qBittorrent state is
// the most reliable stalled signal; fall back to the queue record's own
// warning status when the torrent isn't visible.
function queueInfo(record, torrentStates) {
  if (!record) return null;
  const hash = record.downloadId ? String(record.downloadId).toLowerCase() : null;
  const tState = hash ? torrentStates.get(hash) : null;
  const messages = (record.statusMessages || [])
    .flatMap((m) => [m.title, ...(m.messages || [])])
    .join('; ');
  const stalled =
    tState === 'stalledDL' ||
    tState === 'metaDL' ||
    record.status === 'warning' ||
    record.trackedDownloadStatus === 'warning' ||
    /stall/i.test(record.errorMessage || messages);
  return {
    id: record.id,
    downloadId: record.downloadId || null,
    state: stalled ? 'stalled' : 'downloading'
  };
}

// GET /api/pipeline?movieDays=365&episodeDays=90
//
// Returns two arrays — movies and episodes — each combining:
//   - missing items (already released / aired but not yet downloaded), first
//   - upcoming items (future releases / airings), sorted by date asc
router.get('/', async (req, res) => {
  const now = Date.now();
  const movieDays = Math.min(Number(req.query.movieDays) || 365, 1000);
  const episodeDays = Math.min(Number(req.query.episodeDays) || 90, 365);
  const start = new Date(now).toISOString();
  const movieEnd = new Date(now + movieDays * 86400000).toISOString();
  const episodeEnd = new Date(now + episodeDays * 86400000).toISOString();

  const [calMovies, calEpisodes, allMovies, missingEps, sonarrQ, radarrQ, torrents] =
    await Promise.all([
      settle(() => radarr.calendar(start, movieEnd), []),
      settle(() => sonarr.calendar(start, episodeEnd), []),
      settle(radarr.allMovies, []),
      settle(sonarr.missing, { records: [] }),
      settle(sonarr.queue, { records: [] }),
      settle(radarr.queue, { records: [] }),
      settle(qbit.listTorrents, [])
    ]);

  // hash -> qBittorrent state, to spot stalled downloads behind queue items.
  const torrentStates = new Map(
    (torrents.data || []).map((t) => [String(t.hash || '').toLowerCase(), t.state])
  );
  const episodeQueue = new Map();
  for (const r of sonarrQ.data?.records || []) {
    if (r.episodeId != null) episodeQueue.set(r.episodeId, r);
  }
  const movieQueue = new Map();
  for (const r of radarrQ.data?.records || []) {
    if (r.movieId != null) movieQueue.set(r.movieId, r);
  }

  // Upcoming movies (calendar, future).
  const upcomingMovies = (calMovies.data || [])
    .filter((m) => !m.hasFile)
    .map((m) => {
      const rel = movieReleaseFuture(m, now);
      return rel
        ? {
            id: m.id,
            tmdbId: m.tmdbId,
            title: m.title,
            year: m.year,
            poster: poster(m),
            monitored: m.monitored,
            date: rel.date,
            dateType: rel.type,
            missing: false
          }
        : null;
    })
    .filter((x) => x && new Date(x.date).getTime() > now)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  // Missing movies (already released, monitored, no file). Most recent first.
  const upcomingIds = new Set(upcomingMovies.map((m) => m.id));
  const missingMovies = (allMovies.data || [])
    .filter((m) => m.monitored && !m.hasFile && m.isAvailable && !upcomingIds.has(m.id))
    .map((m) => {
      const rel = movieReleasePast(m);
      return rel
        ? {
            id: m.id,
            tmdbId: m.tmdbId,
            title: m.title,
            year: m.year,
            poster: poster(m),
            monitored: true,
            date: rel.date,
            dateType: rel.type,
            missing: true,
            queue: queueInfo(movieQueue.get(m.id), torrentStates)
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  // Upcoming episodes (calendar, future).
  const upcomingEpisodes = (calEpisodes.data || [])
    .filter((e) => !e.hasFile && e.airDateUtc && new Date(e.airDateUtc).getTime() > now)
    .map((e) => ({
      id: e.id,
      seriesId: e.seriesId,
      series: e.series?.title || 'Unknown series',
      poster: e.series ? poster(e.series) : null,
      season: e.seasonNumber,
      episode: e.episodeNumber,
      title: e.title,
      monitored: e.monitored,
      date: e.airDateUtc,
      missing: false
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  // Missing episodes (aired but not downloaded). Most recent first.
  const upcomingEpIds = new Set(upcomingEpisodes.map((e) => e.id));
  const missingEpisodes = (missingEps.data?.records || [])
    .filter((e) => e.airDateUtc && !upcomingEpIds.has(e.id))
    .map((e) => ({
      id: e.id,
      seriesId: e.seriesId,
      series: e.series?.title || 'Unknown series',
      poster: e.series ? poster(e.series) : null,
      season: e.seasonNumber,
      episode: e.episodeNumber,
      title: e.title,
      monitored: e.monitored,
      date: e.airDateUtc,
      missing: true,
      queue: queueInfo(episodeQueue.get(e.id), torrentStates)
    }));

  res.json({
    movies: {
      items: [...missingMovies, ...upcomingMovies],
      missingCount: missingMovies.length,
      upcomingCount: upcomingMovies.length,
      error: calMovies.error || allMovies.error || null
    },
    episodes: {
      items: [...missingEpisodes, ...upcomingEpisodes],
      missingCount: missingEpisodes.length,
      upcomingCount: upcomingEpisodes.length,
      error: calEpisodes.error || missingEps.error || null
    }
  });
});

export default router;
