import { Router } from 'express';
import * as portugas from '../services/portugas.js';
import * as radarr from '../services/radarr.js';
import * as sonarr from '../services/sonarr.js';

const router = Router();

const LINK_RE = /^(magnet:|https?:\/\/)/i;

// Radarr/Sonarr reject a rejected release with a list of reasons; flatten them
// (they arrive as strings or { reason } objects depending on version) so we can
// tell the user *why* the push didn't grab.
function rejectionReasons(rel) {
  return (rel?.rejections || [])
    .map((r) => (typeof r === 'string' ? r : r.reason))
    .filter(Boolean);
}

// POST /api/portugas/grab  body: { url, type, title }
// Push a specific torrent link (magnet or .torrent URL, typically from Portugas)
// through Radarr (movie) or Sonarr (series) so the *arr grabs it, sends it to the
// download client, and tracks it in the queue for import — i.e. it ends up synced
// in Radarr/Sonarr, not orphaned in qBittorrent. `title` is the release name the
// *arr parses to identify the library title, so it must match something you own.
router.post('/grab', async (req, res) => {
  const url = (req.body?.url || '').trim();
  const type = req.body?.type;
  const title = (req.body?.title || '').trim();

  if (!url) return res.status(400).json({ error: 'A torrent link is required' });
  if (!LINK_RE.test(url)) {
    return res.status(400).json({ error: 'Link must be a magnet: or http(s):// .torrent URL' });
  }
  if (type !== 'movie' && type !== 'series') {
    return res.status(400).json({ error: 'type must be "movie" or "series"' });
  }
  if (!title) {
    return res.status(400).json({ error: 'A release title is required so Radarr/Sonarr can match it' });
  }

  const svc = type === 'movie' ? radarr : sonarr;
  const label = type === 'movie' ? 'Radarr' : 'Sonarr';
  const isMagnet = /^magnet:/i.test(url);
  const release = {
    title,
    protocol: 'torrent',
    publishDate: new Date().toISOString(),
    guid: url,
    ...(isMagnet ? { magnetUrl: url } : { downloadUrl: url })
  };

  try {
    const result = await svc.pushRelease(release);
    const rel = Array.isArray(result) ? result[0] : result;
    if (rel && (rel.rejected || rejectionReasons(rel).length)) {
      const reasons = rejectionReasons(rel);
      return res.status(422).json({
        error: reasons.length
          ? `${label} recusou: ${reasons.join('; ')}`
          : `${label} não conseguiu associar "${title}" a nada na biblioteca`
      });
    }
    res.json({ ok: true, service: type });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

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
