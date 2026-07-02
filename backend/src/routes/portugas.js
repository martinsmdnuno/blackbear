import { Router } from 'express';
import * as portugas from '../services/portugas.js';
import { tagIdFor } from '../services/portugas.js';
import { resolveReleaseName } from '../services/torrent.js';
import * as radarr from '../services/radarr.js';
import * as sonarr from '../services/sonarr.js';

const router = Router();

const LINK_RE = /^(magnet:|https?:\/\/)/i;

// Radarr/Sonarr report a refused release with a list of reasons; flatten them
// (they arrive as strings or { reason } objects depending on version) so we can
// tell the user *why* the push didn't grab.
function rejectionReasons(rel) {
  return (rel?.rejections || [])
    .map((r) => (typeof r === 'string' ? r : r.reason))
    .filter(Boolean);
}

// Add a looked-up movie/series to the library so a pushed release has something
// to attach to. Search is left OFF — we don't want the *arr auto-grabbing some
// other release before/alongside the specific torrent the user chose. Tagged for
// Portugas so the (tag-scoped) Portugas indexer stays eligible for it too.
async function ensureInLibrary(svc, serviceName, type, item) {
  // A lookup item already in the library carries its real (non-zero) id.
  if (item.id) return item;

  const [profiles, folders] = await Promise.all([svc.qualityProfiles(), svc.rootFolders()]);
  if (!profiles?.length) throw new Error(`No quality profile configured in ${serviceName}`);
  if (!folders?.length) throw new Error(`No root folder configured in ${serviceName}`);

  const tags = [await tagIdFor(serviceName)];
  const base = {
    ...item,
    qualityProfileId: profiles[0].id,
    rootFolderPath: folders[0].path,
    monitored: true,
    tags
  };
  delete base.id;

  if (type === 'movie') {
    return radarr.addMovie({
      ...base,
      minimumAvailability: 'released',
      addOptions: { searchForMovie: false }
    });
  }
  return sonarr.addSeries({
    ...base,
    seasonFolder: true,
    seriesType: 'standard',
    addOptions: { monitor: 'all', searchForMissingEpisodes: false, searchForCutoffUnmetEpisodes: false }
  });
}

// POST /api/portugas/name  body: { url }
// Resolve the real release name behind a torrent link (the .torrent's info.name
// or a magnet's dn) so the UI can seed the release-title field with something the
// *arr can parse a quality out of — a bare "Enola Holmes 3 2026" parses as
// Unknown quality and gets refused by the profile.
router.post('/name', async (req, res) => {
  const url = (req.body?.url || '').trim();
  if (!url) return res.status(400).json({ error: 'A torrent link is required' });
  if (!LINK_RE.test(url)) {
    return res.status(400).json({ error: 'Link must be a magnet: or http(s):// .torrent URL' });
  }
  try {
    const name = await resolveReleaseName(url);
    res.json({ name });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/portugas/grab  body: { url, type, item, title }
// Grab a specific torrent link (a direct .torrent URL or magnet, typically from
// Portugas) and get it synced in Radarr/Sonarr rather than orphaned in the
// download client. Flow: make sure `item` (a Radarr/Sonarr lookup result) is in
// the library — adding it if needed — then push the release so the *arr grabs it,
// sends it to the download client, and imports it. `title` is the release name
// the *arr parses to match the library title (and read quality from).
router.post('/grab', async (req, res) => {
  const url = (req.body?.url || '').trim();
  const type = req.body?.type;
  const item = req.body?.item;
  const title = (req.body?.title || '').trim();

  if (!url) return res.status(400).json({ error: 'A torrent link is required' });
  if (!LINK_RE.test(url)) {
    return res.status(400).json({ error: 'Link must be a magnet: or http(s):// .torrent URL' });
  }
  if (type !== 'movie' && type !== 'series') {
    return res.status(400).json({ error: 'type must be "movie" or "series"' });
  }
  if (!item?.tmdbId) return res.status(400).json({ error: 'Pick a title to attach the torrent to' });
  if (!title) return res.status(400).json({ error: 'A release title is required' });

  const svc = type === 'movie' ? radarr : sonarr;
  const serviceName = type === 'movie' ? 'radarr' : 'sonarr';
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
    const added = await ensureInLibrary(svc, serviceName, type, item);
    const result = await svc.pushRelease(release);
    const rel = Array.isArray(result) ? result[0] : result;
    if (rel && (rel.rejected || rejectionReasons(rel).length)) {
      const reasons = rejectionReasons(rel);
      return res.status(422).json({
        error: reasons.length
          ? `${label} recusou: ${reasons.join('; ')}`
          : `${label} não conseguiu associar "${title}" ao título`
      });
    }
    res.json({ ok: true, service: type, added: !item.id, title: added?.title || item.title });
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
