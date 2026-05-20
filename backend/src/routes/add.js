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
    res.status(502).json({ error: err.message });
  }
});

export default router;
