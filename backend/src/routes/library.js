import { Router } from 'express';
import { stat } from 'node:fs/promises';
import * as radarr from '../services/radarr.js';
import * as sonarr from '../services/sonarr.js';
import * as lidarr from '../services/lidarr.js';
import * as qbit from '../services/qbittorrent.js';
import * as jellyfin from '../services/jellyfin.js';
import { invalidate } from '../services/recommend.js';
import { busyHashes } from '../services/cleanup.js';
import { privateTrackerHosts } from '../config.js';
import { logDeletion } from '../services/deletionLog.js';
import {
  buildPlan,
  detectPrivacy,
  estimateFreed,
  executePlan,
  hashOwners,
  indexImports,
  linkStats,
  mapLimit,
  matchTorrents,
  normalizeHash,
  normalizeAlbum,
  normalizeMovie,
  normalizeSeries,
  parseDeleteOptions,
  summarizeTorrent,
  titleMatches,
  torrentIndex
} from '../services/library.js';

const router = Router();

async function settle(fn, fallback) {
  try {
    return { data: await fn() };
  } catch (err) {
    return { data: fallback, error: err.message };
  }
}

const NONE = { data: [] };

// Whether a torrent is private (and its tracker) never changes for a given
// hash, so remember confident answers. List-based guesses aren't cached — the
// PRIVATE_TRACKERS list can change.
const privacyCache = new Map();

async function privacyOf(t, privateHosts) {
  const hash = normalizeHash(t.hash);
  if (privacyCache.has(hash)) return privacyCache.get(hash);
  const privacy = await detectPrivacy(t, {
    properties: qbit.properties,
    trackers: qbit.trackers,
    privateHosts
  });
  if (privacy.source !== 'list' && privacy.trackerUrls.length) privacyCache.set(hash, privacy);
  return privacy;
}

// Hardlink count per library file. The media disk is mounted read-only at the
// same /data path Radarr/Sonarr use, so their paths resolve as-is here. A file
// we can't stat gets nlink null ("unknown"), never a guess.
function withLinks(files) {
  return mapLimit(files, 8, async (f) => {
    try {
      return { ...f, nlink: (await stat(f.path)).nlink };
    } catch {
      return { ...f, nlink: null };
    }
  });
}

// Albums with files, each paired with its track files. Lidarr won't serve an
// unfiltered /trackfile, so the sweep asks once per artist that actually has
// files — far fewer calls than one per album — and buckets the result by
// albumId. A single-album load (the delete path) asks for that album directly.
async function loadAlbums(albums, only) {
  const withFiles = albums.filter((a) => (a?.statistics?.trackFileCount || 0) > 0);
  if (!withFiles.length) return [];

  if (only) {
    const a = withFiles[0];
    try {
      return [normalizeAlbum(a, (await lidarr.trackFilesByAlbum(a.id)) || [])];
    } catch {
      // Track list unavailable: one pathless placeholder keeps the size and
      // makes the hardlink state "unknown" instead of a false "not linked".
      const item = normalizeAlbum(a, []);
      item.files = [{ path: null, size: item.sizeOnDisk }];
      return [item];
    }
  }

  const artistIds = [...new Set(withFiles.map((a) => a.artistId).filter(Boolean))];
  const byAlbum = new Map();
  const failedArtists = new Set();
  await mapLimit(artistIds, 4, async (artistId) => {
    try {
      for (const f of (await lidarr.trackFilesByArtist(artistId)) || []) {
        if (!byAlbum.has(f.albumId)) byAlbum.set(f.albumId, []);
        byAlbum.get(f.albumId).push(f);
      }
    } catch {
      failedArtists.add(artistId);
    }
  });

  return withFiles.map((a) => {
    const item = normalizeAlbum(a, byAlbum.get(a.id) || []);
    if (!item.files.length && failedArtists.has(a.artistId)) {
      item.files = [{ path: null, size: item.sizeOnDisk }];
    }
    return item;
  });
}

// Everything the Library needs, in one pass: items with files on disk, their
// hardlink counts, and the torrents the import history ties them to. `only`
// ({ type, id }) narrows it to a single item for the delete path — the import
// history is still read in full so shared torrents are detected.
async function loadLibrary(only = null) {
  const wantMovies = !only || only.type === 'movie';
  const wantSeries = !only || only.type === 'series';
  const wantAlbums = !only || only.type === 'album';

  const [movies, series, albums, movieImports, seriesImports, albumImports, torrents, busy] =
    await Promise.all([
      wantMovies
        ? settle(() => (only ? radarr.movie(only.id).then((m) => [m]) : radarr.allMovies()), [])
        : NONE,
      wantSeries
        ? settle(() => (only ? sonarr.series(only.id).then((s) => [s]) : sonarr.allSeries()), [])
        : NONE,
      wantAlbums
        ? settle(() => (only ? lidarr.album(only.id).then((a) => [a]) : lidarr.allAlbums()), [])
        : NONE,
      wantMovies ? settle(radarr.importHistory, []) : NONE,
      wantSeries ? settle(sonarr.importHistory, []) : NONE,
      wantAlbums ? settle(lidarr.importHistory, []) : NONE,
      settle(qbit.listTorrents, null),
      busyHashes().catch(() => new Set())
    ]);

  const movieItems = (movies.data || []).filter((m) => m?.hasFile).map(normalizeMovie);
  const seriesItems = await mapLimit(
    (series.data || []).filter((s) => (s?.statistics?.episodeFileCount || 0) > 0),
    4,
    async (s) => {
      try {
        return normalizeSeries(s, (await sonarr.episodeFiles(s.id)) || []);
      } catch {
        // Episode list unavailable: one pathless placeholder keeps the size and
        // makes the hardlink state "unknown" instead of a false "not linked".
        const item = normalizeSeries(s, []);
        item.files = [{ path: null, size: item.sizeOnDisk }];
        return item;
      }
    }
  );
  const albumItems = await loadAlbums(albums.data || [], only);
  const items = [...movieItems, ...seriesItems, ...albumItems];
  await mapLimit(items, 4, async (item) => {
    item.files = await withLinks(item.files);
  });

  const imports = {
    movie: { index: indexImports(movieImports.data, 'movieId'), error: movieImports.error },
    series: { index: indexImports(seriesImports.data, 'seriesId'), error: seriesImports.error },
    album: { index: indexImports(albumImports.data, 'albumId'), error: albumImports.error }
  };
  const owners = hashOwners([imports.movie.index, imports.series.index, imports.album.index]);
  const byHash = torrents.data ? torrentIndex(torrents.data) : null;
  const privateHosts = privateTrackerHosts();
  const nowSec = Date.now() / 1000;

  await mapLimit(items, 4, async (item) => {
    const { index, error } = imports[item.type];
    const hashes = index.get(item.id);
    item.hasImports = Boolean(error) || Boolean(hashes?.size);
    if (error || !byHash) {
      item.torrents = null;
      item.torrentsError = error
        ? `import history unavailable (${error})`
        : `qBittorrent unavailable (${torrents.error})`;
      return;
    }
    item.torrents = await Promise.all(
      matchTorrents(hashes, byHash).map(async (t) =>
        summarizeTorrent(t, await privacyOf(t, privateHosts), { busy, owners, nowSec })
      )
    );
  });

  return {
    items,
    errors: {
      radarr: movies.error || movieImports.error || null,
      sonarr: series.error || seriesImports.error || null,
      lidarr: albums.error || albumImports.error || null,
      qbittorrent: torrents.error || null
    }
  };
}

// The item as the frontend sees it: file paths stay server-side, hardlink and
// torrent facts are rolled up.
function publicItem(item) {
  // trackFileIds are internal handles for the delete path, like file paths.
  const { files, trackFileIds, ...rest } = item;
  const links = linkStats(files);
  return {
    ...rest,
    hardlinked: links.hardlinked,
    sharedBytes: links.sharedBytes,
    exclusiveBytes: links.exclusiveBytes,
    isPrivate: Boolean(item.torrents?.some((t) => t.isPrivate)),
    seeding: Boolean(item.torrents?.some((t) => t.seeding))
  };
}

// GET /api/library — every movie and series with files on disk, biggest first,
// each with its torrent(s), private-tracker flag and hardlink state.
router.get('/', async (_req, res) => {
  try {
    const { items, errors } = await loadLibrary();
    const list = items.map(publicItem).sort((a, b) => b.sizeOnDisk - a.sizeOnDisk);
    res.json({
      items: list,
      totals: {
        count: list.length,
        sizeOnDisk: list.reduce((s, i) => s + (i.sizeOnDisk || 0), 0)
      },
      errors,
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
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

// Deleting music is not the same shape as deleting a movie. An album record is
// metadata hanging off an artist — Lidarr re-creates it on the next refresh —
// so removing the record would be theatre. What we remove are the track files,
// and we unmonitor first or Lidarr grabs the album straight back (same reason
// Sonarr's delete unmonitors before removing episodes). The artist stays, with
// the rest of its discography untouched.
async function deleteAlbum(item, step) {
  await lidarr.setAlbumsMonitored([item.id], false);
  if (!step.deleteFiles) return;
  const ids = item.trackFileIds || [];
  if (!ids.length) {
    throw new Error('Lidarr lists no track files for this album — nothing to delete.');
  }
  await lidarr.deleteTrackFiles(ids);
}

// POST /api/library/:type/:id/delete
//   { deleteFiles, deleteTorrent, addExclusion, dryRun, confirmTitle }
// Everything is re-resolved from the services on every call — the client's view
// of torrents, ratios or trackers is never trusted. A dry run returns the plan;
// a real run executes it and reports every step individually.
router.post('/:type/:id/delete', async (req, res) => {
  const { type } = req.params;
  const id = Number(req.params.id);
  if (!['movie', 'series', 'album'].includes(type) || !Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Expected /api/library/movie|series|album/:id/delete' });
  }
  const opts = parseDeleteOptions(req.body);

  let loaded;
  try {
    loaded = await loadLibrary({ type, id });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
  const item = loaded.items[0];
  if (!item) {
    const err = loaded.errors[{ movie: 'radarr', series: 'sonarr', album: 'lidarr' }[type]];
    if (err && !/\b404\b/.test(err)) return res.status(502).json({ error: err });
    return res.status(404).json({ error: `No ${type} ${id} with files on disk` });
  }

  const plan = buildPlan(item, opts);
  if (opts.dryRun) {
    return res.json({ dryRun: true, item: publicItem(item), plan });
  }
  if (plan.blocked) {
    return res.status(409).json({ error: plan.blocked, plan });
  }
  if (plan.requiresTitle && !titleMatches(opts.confirmTitle, item.title)) {
    return res.status(409).json({
      error: 'Private torrent below ratio 1.0 — type the exact title to confirm.',
      plan
    });
  }

  const result = await executePlan(plan, {
    removeTorrent: (hash) => qbit.remove(hash, true),
    deleteItem: (step) => {
      if (type === 'movie') return radarr.deleteMovie(step.id, step.deleteFiles, step.addExclusion);
      if (type === 'series') return sonarr.deleteSeries(step.id, step.deleteFiles, step.addExclusion);
      return deleteAlbum(item, step);
    }
  });

  // What actually came back, given which steps went through.
  const removedHashes = new Set(
    result.steps.filter((s) => s.kind === 'torrent' && s.status === 'ok').map((s) => s.hash)
  );
  const arrOk = result.steps.some((s) => s.kind === 'arr' && s.status === 'ok');
  const freed = estimateFreed({
    files: item.files,
    torrents: (item.torrents || []).filter((t) => removedHashes.has(t.hash)),
    deleteFiles: arrOk && opts.deleteFiles,
    deleteTorrent: true
  });

  if (arrOk) {
    invalidate();
    // Best-effort: drop the title from Jellyfin without waiting for its scan.
    jellyfin.refreshLibrary().catch(() => {});
  }

  let logError = null;
  try {
    await logDeletion({
      timestamp: new Date().toISOString(),
      type,
      id,
      title: item.title,
      hashes: plan.steps.filter((s) => s.kind === 'torrent').map((s) => s.hash),
      options: {
        deleteFiles: opts.deleteFiles,
        deleteTorrent: opts.deleteTorrent,
        addExclusion: opts.addExclusion
      },
      freedBytes: freed.bytes,
      freedExact: freed.exact,
      ok: result.ok,
      steps: result.steps.map((s) => ({
        kind: s.kind,
        service: s.service,
        target: s.kind === 'torrent' ? s.hash : s.id,
        name: s.name || s.title,
        status: s.status,
        error: s.error
      }))
    });
  } catch (err) {
    console.error('[library] failed to write deletion log:', err.message);
    logError = err.message;
  }

  res.json({ dryRun: false, ok: result.ok, steps: result.steps, freed, logError });
});

export default router;
