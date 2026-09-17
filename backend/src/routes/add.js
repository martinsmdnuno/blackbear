import { Router } from 'express';
import * as sonarr from '../services/sonarr.js';
import * as radarr from '../services/radarr.js';
import * as lidarr from '../services/lidarr.js';
import { tagIdFor } from '../services/portugas.js';

const router = Router();

const ARR_BY_TYPE = { movie: 'radarr', series: 'sonarr', artist: 'lidarr', album: 'lidarr' };
const TYPES = Object.keys(ARR_BY_TYPE).join('", "');

function serviceFor(type) {
  if (type === 'movie') return radarr;
  if (type === 'series') return sonarr;
  if (type === 'artist' || type === 'album') return lidarr;
  return null;
}

// Adding one album is three steps, not one: Lidarr only knows albums that hang
// off an artist it already tracks. So make sure the artist exists (with nothing
// monitored), wait for its discography to land, then monitor just the albums
// asked for. The artist is left monitored on purpose — Lidarr's wanted/missing
// skips albums whose artist isn't, which would make the albums invisible.
async function addAlbums(artistItem, foreignAlbumIds, options, tags, rootFolderPath) {
  const mbid = artistItem?.foreignArtistId;
  if (!mbid || !foreignAlbumIds.length) {
    throw new Error('That lookup result carries no MusicBrainz ids');
  }

  const existing = (await lidarr.allArtists()) || [];
  let artist = existing.find((a) => a.foreignArtistId === mbid);

  if (!artist) {
    const payload = {
      ...artistItem,
      qualityProfileId: options.qualityProfileId,
      metadataProfileId: options.metadataProfileId,
      rootFolderPath,
      monitored: true,
      tags,
      addOptions: { monitor: 'none', searchForMissingAlbums: false }
    };
    delete payload.id;
    artist = await lidarr.addArtist(payload);
  } else if (!artist.monitored) {
    await lidarr.updateArtist({ ...artist, monitored: true });
  }

  // Let the metadata refresh finish first. It runs for a few seconds after an
  // artist is added and rewrites every album's monitored flag when it lands, so
  // anything set before it completes is thrown away.
  await waitForRefresh();

  const { found, missing } = await waitForAlbums(artist.id, foreignAlbumIds);
  const ids = found.map((a) => a.id);
  const settled = await settleMonitoring(artist.id, ids);
  if (options.searchOnAdd === true) await lidarr.searchAlbums(ids);
  return {
    albums: settled,
    // Albums the metadata profile kept Lidarr from creating. Reported, not
    // thrown: the rest were added and are worth keeping.
    skipped: missing,
    artist: { id: artist.id, artistName: artist.artistName }
  };
}

// Monitor exactly these seasons and nothing else. Adding a series queues a
// RefreshSeries that rewrites season monitoring when it finishes, so this waits
// it out and then reads the result back — the same trap Lidarr's artists set,
// where the API happily reports a flag that is about to be reverted.
async function monitorSeasons(seriesId, seasonNumbers, timeoutMs = 90000) {
  const wanted = new Set(seasonNumbers);
  const deadline = Date.now() + timeoutMs;

  await waitForCommands(sonarr, /^(RefreshSeries|RescanSeries)$/i);

  while (Date.now() < deadline) {
    const series = await sonarr.series(seriesId);
    for (const s of series.seasons || []) s.monitored = wanted.has(s.seasonNumber);
    series.monitored = true;
    await sonarr.updateSeries(series);

    await new Promise((r) => setTimeout(r, 2000));

    const fresh = await sonarr.series(seriesId);
    const ok = (fresh.seasons || []).every((s) => s.monitored === wanted.has(s.seasonNumber));
    if (ok) return fresh;
  }
  throw new Error(
    'Sonarr kept resetting the season monitoring — its refresh may still be running. Check the series and try again.'
  );
}

// Block while the service is busy with a command whose name matches.
async function waitForCommands(svc, pattern, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const active = ((await svc.commands()) || []).filter(
      (c) => pattern.test(c.name) && ['queued', 'started'].includes(c.status)
    );
    if (!active.length) return;
    await new Promise((r) => setTimeout(r, 1500));
  }
}

// Block while Lidarr is refreshing artist metadata.
const waitForRefresh = () => waitForCommands(lidarr, /^(RefreshArtist|RescanFolders)$/i);

// Marking an album monitored once is not enough. Adding an artist queues a
// metadata refresh that runs in the background and rewrites every album's
// monitored flag from the artist's add options — so a flag set while that is
// still running is silently reverted, and the API answers "monitored: true"
// for something Lidarr will unmonitor a second later. Write it, read it back,
// and keep writing until it holds.
async function settleMonitoring(artistId, albumIds, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const artist = await lidarr.artist(artistId);
    if (!artist?.monitored) await lidarr.updateArtist({ ...artist, monitored: true });
    await lidarr.setAlbumsMonitored(albumIds, true);

    await new Promise((r) => setTimeout(r, 2000));

    const [freshArtist, freshAlbums] = await Promise.all([
      lidarr.artist(artistId),
      Promise.all(albumIds.map((id) => lidarr.album(id)))
    ]);
    if (freshArtist?.monitored && freshAlbums.every((a) => a?.monitored)) return freshAlbums;
  }
  throw new Error(
    'Lidarr kept resetting the monitoring for these albums — its metadata refresh may still be running. Try again in a minute.'
  );
}

// A freshly added artist has no albums until Lidarr finishes pulling its
// metadata, which takes a few seconds. Returns as soon as every album asked for
// is there; after that, whatever is still absent once the list has stopped
// growing for a few polls is not coming.
async function waitForAlbums(artistId, foreignAlbumIds, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  let albums = [];
  let lastCount = -1;
  let stablePolls = 0;
  while (Date.now() < deadline) {
    albums = (await lidarr.albums(artistId)) || [];
    const byId = new Map(albums.map((a) => [a.foreignAlbumId, a]));
    const found = foreignAlbumIds.map((id) => byId.get(id)).filter(Boolean);
    if (found.length === foreignAlbumIds.length) return { found, missing: [] };

    stablePolls = albums.length > 0 && albums.length === lastCount ? stablePolls + 1 : 0;
    lastCount = albums.length;
    if (found.length && stablePolls >= 3) {
      return { found, missing: foreignAlbumIds.filter((id) => !byId.has(id)) };
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  // The usual cause isn't slowness: the metadata profile filters the album out
  // (compilations and live records are excluded by Standard), so Lidarr never
  // creates it. Say that, rather than "timed out".
  throw new Error(
    albums.length
      ? `Lidarr never listed ${foreignAlbumIds.length > 1 ? 'those albums' : 'that album'} for the artist — the metadata profile probably excludes ${foreignAlbumIds.length > 1 ? 'them' : 'it'} (compilations, live and singles are filtered out by Standard). Pick a wider profile and try again.`
      : 'Lidarr is still pulling this artist\'s discography — try again in a moment.'
  );
}

// GET /api/add/quality-profiles?type=movie|series|artist
router.get('/quality-profiles', async (req, res) => {
  const svc = serviceFor(req.query.type);
  if (!svc) return res.status(400).json({ error: `type must be one of "${TYPES}"` });
  try {
    const profiles = await svc.qualityProfiles();
    res.json((profiles || []).map((p) => ({ id: p.id, name: p.name })));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/add/root-folders?type=movie|series|artist
router.get('/root-folders', async (req, res) => {
  const svc = serviceFor(req.query.type);
  if (!svc) return res.status(400).json({ error: `type must be one of "${TYPES}"` });
  try {
    const folders = await svc.rootFolders();
    // Lidarr stores per-root-folder defaults (the FLAC profile, the metadata
    // profile). Passing them on lets the add sheet start from what the server
    // was actually configured for, instead of whatever sorts first — the
    // difference between grabbing FLAC and grabbing MP3-192 by accident.
    res.json(
      (folders || []).map((f) => ({
        path: f.path,
        freeSpace: f.freeSpace,
        defaultQualityProfileId: f.defaultQualityProfileId ?? null,
        defaultMetadataProfileId: f.defaultMetadataProfileId ?? null
      }))
    );
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/add/metadata-profiles — Lidarr only. This is the setting that decides
// whether adding an artist brings in their albums or their albums plus every
// single, live bootleg and remix compilation, so the add flow has to show it.
router.get('/metadata-profiles', async (_req, res) => {
  try {
    const profiles = await lidarr.metadataProfiles();
    res.json((profiles || []).map((p) => ({ id: p.id, name: p.name })));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

async function defaultRootFolder(svc) {
  const folders = await svc.rootFolders();
  if (!folders?.length) throw new Error('No root folder configured in the target service');
  return folders[0].path;
}

// POST /api/add  { type, item, options }
router.post('/', async (req, res) => {
  const { type, item, options = {} } = req.body || {};
  const svc = serviceFor(type);
  if (!svc) return res.status(400).json({ error: `type must be one of "${TYPES}"` });
  if (!item) return res.status(400).json({ error: 'Missing lookup item' });
  if (!options.qualityProfileId) return res.status(400).json({ error: 'qualityProfileId is required' });

  try {
    const rootFolderPath = options.rootFolderPath || (await defaultRootFolder(svc));

    // Opting in routes this title to Portugas: tag it so the (tag-scoped)
    // Portugas indexer becomes eligible for it. Untagged titles never touch
    // Portugas — that's the default-off Hit & Run protection. See
    // services/portugas.js.
    const tags = options.usePortugas === true ? [await tagIdFor(ARR_BY_TYPE[type])] : [];

    if (type === 'movie') {
      const payload = {
        ...item,
        qualityProfileId: options.qualityProfileId,
        rootFolderPath,
        monitored: options.monitored !== false,
        minimumAvailability: options.minimumAvailability || 'inCinemas',
        tags,
        addOptions: { searchForMovie: options.searchOnAdd === true }
      };
      delete payload.id;
      const added = await radarr.addMovie(payload);
      return res.status(201).json(added);
    }

    if (type === 'album') {
      if (!options.metadataProfileId) {
        return res.status(400).json({ error: 'metadataProfileId is required for albums' });
      }
      const { albums, skipped, artist } = await addAlbums(
        item.artist,
        [item.foreignAlbumId].filter(Boolean),
        options,
        tags,
        rootFolderPath
      );
      return res.status(201).json({ ...albums[0], skipped, artist });
    }

    if (type === 'artist') {
      if (!options.metadataProfileId) {
        return res.status(400).json({ error: 'metadataProfileId is required for artists' });
      }
      // Picked from the artist's discography: add the artist with nothing
      // monitored, then just these albums — the same path as a single album.
      if (Array.isArray(options.albums) && options.albums.length) {
        const added = await addAlbums(item, options.albums.map(String), options, tags, rootFolderPath);
        return res.status(201).json(added);
      }
      const payload = {
        ...item,
        qualityProfileId: options.qualityProfileId,
        metadataProfileId: options.metadataProfileId,
        rootFolderPath,
        monitored: options.monitor !== 'none',
        tags,
        addOptions: {
          monitor: options.monitor || 'all',
          searchForMissingAlbums: options.searchOnAdd === true
        }
      };
      delete payload.id;
      const added = await lidarr.addArtist(payload);
      return res.status(201).json(added);
    }

    // Picking specific seasons is not something Sonarr's add options can
    // express, so the series goes in with nothing monitored and the seasons are
    // set afterwards — once its refresh has stopped rewriting them.
    const wantedSeasons = Array.isArray(options.seasons)
      ? options.seasons.map(Number).filter(Number.isInteger)
      : null;
    const pickSeasons = wantedSeasons && wantedSeasons.length > 0;

    const payload = {
      ...item,
      qualityProfileId: options.qualityProfileId,
      rootFolderPath,
      monitored: pickSeasons ? true : options.monitor !== 'none',
      seasonFolder: options.seasonFolder !== false,
      seriesType: options.seriesType || 'standard',
      tags,
      addOptions: {
        monitor: pickSeasons ? 'none' : options.monitor || 'all',
        searchForMissingEpisodes: pickSeasons ? false : options.searchOnAdd === true,
        searchForCutoffUnmetEpisodes: false
      }
    };
    delete payload.id;
    const added = await sonarr.addSeries(payload);
    if (!pickSeasons) return res.status(201).json(added);

    const withSeasons = await monitorSeasons(added.id, wantedSeasons);
    if (options.searchOnAdd === true) {
      for (const n of wantedSeasons) await sonarr.searchSeason(added.id, n);
    }
    return res.status(201).json(withSeasons);
  } catch (err) {
    const { status, error } = await humanizeAddError(type, item, err.message || '');
    res.status(status).json({ error });
  }
});

// Translate the raw *arr validation errors into something a human can act on,
// and — for the common "folder already in use" case — name the existing title.
async function humanizeAddError(type, item, message) {
  const kind = { movie: 'Radarr', series: 'Sonarr', artist: 'Lidarr', album: 'Lidarr' }[type];
  const lib = { movie: 'Movies', series: 'Series', artist: 'Artists', album: 'Artists' }[type];
  const title = item?.title || item?.artistName || 'This title';

  if (/already configured for another (series|movie|artist)/i.test(message)) {
    const path = (message.match(/Path ['"]?(.+?)['"]? is already/i) || [])[1];
    try {
      const existing =
        type === 'movie'
          ? await radarr.allMovies()
          : type === 'series'
            ? await sonarr.allSeries()
            : await lidarr.allArtists();
      const hit = path ? (existing || []).find((x) => x.path === path) : null;
      if (hit) {
        const mon = hit.monitored === false ? ', not monitored' : '';
        return {
          status: 409,
          error: `Already in ${kind} as “${hit.title || hit.artistName}”${mon}. The folder ${path} is taken, so it can't be added twice — open ${kind} → ${lib} to manage it.`
        };
      }
    } catch {
      // couldn't look it up — fall back to the generic message below
    }
    return {
      status: 409,
      error: `That folder${path ? ` (${path})` : ''} is already used by another title in ${kind}, so ${title} can't be added again. Open ${kind} → ${lib} to find it.`
    };
  }

  if (/already been added|already exists/i.test(message)) {
    return { status: 409, error: `${title} is already in ${kind}.` };
  }

  return { status: 502, error: `${kind} couldn't add ${title} — ${message}` };
}

export default router;
