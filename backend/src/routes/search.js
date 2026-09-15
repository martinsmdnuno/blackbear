import { Router } from 'express';
import * as sonarr from '../services/sonarr.js';
import * as radarr from '../services/radarr.js';
import * as lidarr from '../services/lidarr.js';
import * as tmdb from '../services/tmdb.js';

const router = Router();

// GET /api/search/person?q=...  — people (actors/directors) via TMDb
router.get('/person', async (req, res) => {
  const q = req.query.q;
  if (!q || !q.trim()) return res.status(400).json({ error: 'Missing search query' });
  try {
    res.json(await tmdb.searchPerson(q));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/search/person/:id  — that person's movies + series
router.get('/person/:id', async (req, res) => {
  try {
    res.json(await tmdb.personCredits(req.params.id));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/search?type=movie|series|artist&term=...
const LOOKUP = {
  movie: (term) => radarr.lookup(term),
  series: (term) => sonarr.lookup(term),
  artist: (term) => lidarr.lookupArtist(term)
};

router.get('/', async (req, res) => {
  const { type, term } = req.query;
  if (!term || !term.trim()) return res.status(400).json({ error: 'Missing search term' });
  const lookup = LOOKUP[type];
  if (!lookup) {
    return res.status(400).json({ error: `type must be one of: ${Object.keys(LOOKUP).join(', ')}` });
  }
  try {
    const results = await lookup(term);
    res.json(Array.isArray(results) ? results : []);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
