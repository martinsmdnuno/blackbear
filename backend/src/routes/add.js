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
// monitored), wait for its discography to land, then monitor just the album
// asked for. The artist is left monitored on purpose — Lidarr's wanted/missing
// skips albums whose artist isn't, which would make the album invisible.
async function addAlbum(item, options, tags, rootFolderPath) {
  const mbid = item?.artist?.foreignArtistId;
  if (!mbid || !item?.foreignAlbumId) {
    throw new Error('That album lookup result carries no MusicBrainz ids');
  }

  const existing = (await lidarr.allArtists()) || [];
  let artist = existing.find((a) => a.foreignArtistId === mbid);

  if (!artist) {
    const payload = {
      ...item.artist,
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

  const album = await waitForAlbum(artist.id, item.foreignAlbumId);
  const settled = await settleMonitoring(artist.id, album.id);
  if (options.searchOnAdd === true) await lidarr.searchAlbums([album.id]);
  return { ...settled, artist: { id: artist.id, artistName: artist.artistName } };
}

// Block while Lidarr is refreshing artist metadata.
async function waitForRefresh(timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const active = ((await lidarr.commands()) || []).filter(
      (c) => /^(RefreshArtist|RescanFolders)$/i.test(c.name) && ['queued', 'started'].includes(c.status)
    );
    if (!active.length) return;
    await new Promise((r) => setTimeout(r, 1500));
  }
}

// Marking the album monitored once is not enough. Adding an artist queues a
// metadata refresh that runs in the background and rewrites every album's
// monitored flag from the artist's add options — so a flag set while that is
// still running is silently reverted, and the API answers "monitored: true"
// for something Lidarr will unmonitor a second later. Write it, read it back,
// and keep writing until it holds.
async function settleMonitoring(artistId, albumId, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let album = null;
  while (Date.now() < deadline) {
    const artist = await lidarr.artist(artistId);
    if (!artist?.monitored) await lidarr.updateArtist({ ...artist, monitored: true });
    await lidarr.setAlbumsMonitored([albumId], true);

    await new Promise((r) => setTimeout(r, 2000));

    const [freshArtist, freshAlbum] = await Promise.all([
      lidarr.artist(artistId),
      lidarr.album(albumId)
    ]);
    album = freshAlbum;
    if (freshArtist?.monitored && freshAlbum?.monitored) return freshAlbum;
  }
  throw new Error(
    'Lidarr kept resetting the monitoring for this album — its metadata refresh may still be running. Try again in a minute.'
  );
}

// A freshly added artist has no albums until Lidarr finishes pulling its
// metadata, which takes a few seconds.
async function waitForAlbum(artistId, foreignAlbumId, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  let albums = [];
  while (Date.now() < deadline) {
    albums = (await lidarr.albums(artistId)) || [];
    const hit = albums.find((a) => a.foreignAlbumId === foreignAlbumId);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 1500));
  }
  // The usual cause isn't slowness: the metadata profile filters the album out
  // (compilations and live records are excluded by Standard), so Lidarr never
  // creates it. Say that, rather than "timed out".
  throw new Error(
    albums.length
      ? 'Lidarr never listed that album for the artist — the metadata profile probably excludes it (compilations, live and singles are filtered out by Standard). Pick a wider profile and try again.'
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
    res.json((folders || []).map((f) => ({ path: f.path, freeSpace: f.freeSpace })));
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
      const added = await addAlbum(item, options, tags, rootFolderPath);
      return res.status(201).json(added);
    }

    if (type === 'artist') {
      if (!options.metadataProfileId) {
        return res.status(400).json({ error: 'metadataProfileId is required for artists' });
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

    const payload = {
      ...item,
      qualityProfileId: options.qualityProfileId,
      rootFolderPath,
      monitored: options.monitor !== 'none',
      seasonFolder: options.seasonFolder !== false,
      seriesType: options.seriesType || 'standard',
      tags,
      addOptions: {
        monitor: options.monitor || 'all',
        searchForMissingEpisodes: options.searchOnAdd === true,
        searchForCutoffUnmetEpisodes: false
      }
    };
    delete payload.id;
    const added = await sonarr.addSeries(payload);
    return res.status(201).json(added);
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
