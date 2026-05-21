import { Router } from 'express';
import * as tmdb from '../services/tmdb.js';

const router = Router();

// GET /api/trending?mode=trending|popular
router.get('/', async (req, res) => {
  const mode = req.query.mode === 'popular' ? 'popular' : 'trending';
  try {
    const data = await tmdb.discover(mode);
    res.json({ mode, ...data });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
