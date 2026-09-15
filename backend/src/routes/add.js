import { Router } from 'express';
import * as sonarr from '../services/sonarr.js';
import * as radarr from '../services/radarr.js';
import * as lidarr from '../services/lidarr.js';
import { tagIdFor } from '../services/portugas.js';

const router = Router();

const ARR_BY_TYPE = { movie: 'radarr', series: 'sonarr', artist: 'lidarr' };
const TYPES = Object.keys(ARR_BY_TYPE).join('", "');

function serviceFor(type) {
  if (type === 'movie') return radarr;
  if (type === 'series') return sonarr;
  if (type === 'artist') return lidarr;
  return null;
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
  const kind = { movie: 'Radarr', series: 'Sonarr', artist: 'Lidarr' }[type];
  const lib = { movie: 'Movies', series: 'Series', artist: 'Artists' }[type];
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
