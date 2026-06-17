import { Router } from 'express';
import * as portugas from '../services/portugas.js';

const router = Router();

// GET /api/portugas/status — is the Portugas indexer tagged (and thus scoped to
// tagged media only) in Radarr and Sonarr? Reports per service.
router.get('/status', async (_req, res) => {
  try {
    res.json(await portugas.status());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/portugas/setup — idempotently create the Portugas tag and apply it
// to the Portugas indexer in Radarr and Sonarr. Returns the resulting status so
// the UI can confirm the tag actually stuck (Prowlarr full-sync can strip it).
router.post('/setup', async (_req, res) => {
  try {
    res.json(await portugas.setup());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
