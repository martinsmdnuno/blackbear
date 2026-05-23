import { Router } from 'express';
import * as sonarr from '../services/sonarr.js';
import * as radarr from '../services/radarr.js';
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

// GET /api/search?type=movie|series&term=...
router.get('/', async (req, res) => {
  const { type, term } = req.query;
  if (!term || !term.trim()) return res.status(400).json({ error: 'Missing search term' });
  if (type !== 'movie' && type !== 'series') {
    return res.status(400).json({ error: 'type must be "movie" or "series"' });
  }
  try {
    const results = type === 'movie' ? await radarr.lookup(term) : await sonarr.lookup(term);
    res.json(Array.isArray(results) ? results : []);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
