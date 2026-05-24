import { Router } from 'express';
import * as jellyfin from '../services/jellyfin.js';

const router = Router();

// GET /api/jellyfin — continue watching + recently added for the user
router.get('/', async (_req, res) => {
  try {
    const continueWatching = await jellyfin.resume();
    const recentlyAdded = await jellyfin.latest().catch(() => []);
    res.json({ continueWatching, recentlyAdded });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/jellyfin/image/:id — poster proxy (Jellyfin is LAN-only, so we stream
// it through the backend to make it reachable remotely).
router.get('/image/:id', async (req, res) => {
  try {
    const img = await jellyfin.image(req.params.id);
    res.set('Content-Type', img.contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(img.buffer);
  } catch {
    res.status(404).end();
  }
});

export default router;
