import { Router } from 'express';
import * as portugas from '../services/portugas.js';
import { tagIdFor } from '../services/portugas.js';
import * as radarr from '../services/radarr.js';
import * as sonarr from '../services/sonarr.js';

const router = Router();

// Radarr/Sonarr report a refused release with a list of reasons; flatten them
// (they arrive as strings or { reason } objects depending on version) so we can
// tell the user *why* the push didn't grab.
function rejectionReasons(rel) {
  return (rel?.rejections || [])
    .map((r) => (typeof r === 'string' ? r : r.reason))
    .filter(Boolean);
}

// Find the movie/series in the *arr for a resolved torrent, keyed by the id
// Portugas gave us (TMDb for movies, TVDb for series) and falling back to the
// release name. This is the library item the pushed release attaches to.
async function lookupItem(meta) {
  if (meta.isSeries) {
    const term = meta.tvdbId ? `tvdb:${meta.tvdbId}` : meta.name;
    return (await sonarr.lookup(term))?.[0] || null;
  }
  const term = meta.tmdbId ? `tmdb:${meta.tmdbId}` : meta.name;
  return (await radarr.lookup(term))?.[0] || null;
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

// POST /api/portugas/grab  body: { url }
// Hands-free grab: paste a Portugas link and nothing else. We resolve the torrent
// via Portugas's API (using the token Prowlarr already holds) to learn the real
// release name, whether it's a movie or a series, and its TMDb/TVDb ids; add it
// to Radarr/Sonarr if it isn't there yet; then push the authenticated .torrent so
// the *arr grabs it, sends it to the download client, and imports it.
router.post('/grab', async (req, res) => {
  const url = (req.body?.url || '').trim();
  if (!url) return res.status(400).json({ error: 'Cola um link do Portugas' });

  try {
    const meta = await portugas.resolveTorrent(url);
    const type = meta.isSeries ? 'series' : 'movie';
    const svc = meta.isSeries ? sonarr : radarr;
    const serviceName = meta.isSeries ? 'sonarr' : 'radarr';
    const label = meta.isSeries ? 'Sonarr' : 'Radarr';

    const item = await lookupItem(meta);
    if (!item) throw new Error(`${label} não encontrou "${meta.name}" na base de dados`);

    const added = await ensureInLibrary(svc, serviceName, type, item);
    const result = await svc.pushRelease({
      title: meta.name,
      protocol: 'torrent',
      publishDate: new Date().toISOString(),
      guid: meta.downloadUrl,
      downloadUrl: meta.downloadUrl
    });
    const rel = Array.isArray(result) ? result[0] : result;
    if (rel && (rel.rejected || rejectionReasons(rel).length)) {
      const reasons = rejectionReasons(rel);
      return res.status(422).json({
        error: reasons.length
          ? `${label} recusou: ${reasons.join('; ')}`
          : `${label} não conseguiu associar "${meta.name}"`
      });
    }
    res.json({
      ok: true,
      service: type,
      added: !item.id,
      title: added?.title || item.title,
      release: meta.name
    });
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
