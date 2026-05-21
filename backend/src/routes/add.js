import { Router } from 'express';
import * as sonarr from '../services/sonarr.js';
import * as radarr from '../services/radarr.js';

const router = Router();

function serviceFor(type) {
  if (type === 'movie') return radarr;
  if (type === 'series') return sonarr;
  return null;
}

// GET /api/add/quality-profiles?type=movie|series
router.get('/quality-profiles', async (req, res) => {
  const svc = serviceFor(req.query.type);
  if (!svc) return res.status(400).json({ error: 'type must be "movie" or "series"' });
  try {
    const profiles = await svc.qualityProfiles();
    res.json((profiles || []).map((p) => ({ id: p.id, name: p.name })));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/add/root-folders?type=movie|series
router.get('/root-folders', async (req, res) => {
  const svc = serviceFor(req.query.type);
  if (!svc) return res.status(400).json({ error: 'type must be "movie" or "series"' });
  try {
    const folders = await svc.rootFolders();
    res.json((folders || []).map((f) => ({ path: f.path, freeSpace: f.freeSpace })));
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
  if (!svc) return res.status(400).json({ error: 'type must be "movie" or "series"' });
  if (!item) return res.status(400).json({ error: 'Missing lookup item' });
  if (!options.qualityProfileId) return res.status(400).json({ error: 'qualityProfileId is required' });

  try {
    const rootFolderPath = options.rootFolderPath || (await defaultRootFolder(svc));

    if (type === 'movie') {
      const payload = {
        ...item,
        qualityProfileId: options.qualityProfileId,
        rootFolderPath,
        monitored: options.monitored !== false,
        minimumAvailability: options.minimumAvailability || 'released',
        addOptions: { searchForMovie: options.searchOnAdd === true }
      };
      delete payload.id;
      const added = await radarr.addMovie(payload);
      return res.status(201).json(added);
    }

    const payload = {
      ...item,
      qualityProfileId: options.qualityProfileId,
      rootFolderPath,
      monitored: options.monitor !== 'none',
      seasonFolder: options.seasonFolder !== false,
      seriesType: options.seriesType || 'standard',
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
  const kind = type === 'movie' ? 'Radarr' : 'Sonarr';
  const lib = type === 'movie' ? 'Movies' : 'Series';
  const title = item?.title || 'This title';

  if (/already configured for another (series|movie)/i.test(message)) {
    const path = (message.match(/Path ['"]?(.+?)['"]? is already/i) || [])[1];
    try {
      const existing = type === 'movie' ? await radarr.allMovies() : await sonarr.allSeries();
      const hit = path ? (existing || []).find((x) => x.path === path) : null;
      if (hit) {
        const mon = hit.monitored === false ? ', not monitored' : '';
        return {
          status: 409,
          error: `Already in ${kind} as “${hit.title}”${mon}. The folder ${path} is taken, so it can't be added twice — open ${kind} → ${lib} to manage it.`
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
