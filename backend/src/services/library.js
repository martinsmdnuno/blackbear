import { MIN_RATIO, MIN_SEED_HOURS } from './cleanup.js';
import { isPortugasTracker } from './portugas.js';

// The Library's decision logic, kept free of network and disk access so it can
// be unit-tested: every fetcher it needs is passed in by the caller
// (routes/library.js).

// --- Item ↔ torrent association ---------------------------------------------
//
// Never by file name. Radarr/Sonarr record a `downloadFolderImported` history
// event for every import, and its `downloadId` is the torrent's infohash
// (uppercase). That is the only link we trust.

// Radarr/Sonarr call it downloadFolderImported, Lidarr trackFileImported — both
// are eventType 3, and both carry the torrent infohash in downloadId. (Lidarr
// also emits downloadImported, 8, once per release: that one has no albumId, so
// it is not an import record as far as the Library is concerned.)
const IMPORT_EVENT = new Set(['downloadFolderImported', 'trackFileImported', 3, '3']);

export const normalizeHash = (h) => String(h || '').trim().toLowerCase();

// history records → Map(itemId → Set(lowercase hash)). `idField` is movieId or
// seriesId. Non-import events are dropped in case the eventType filter was
// ignored upstream.
export function indexImports(records, idField) {
  const map = new Map();
  for (const r of records || []) {
    if (r?.eventType != null && !IMPORT_EVENT.has(r.eventType)) continue;
    const id = r?.[idField];
    const hash = normalizeHash(r?.downloadId);
    if (!id || !hash) continue;
    if (!map.has(id)) map.set(id, new Set());
    map.get(id).add(hash);
  }
  return map;
}

// qBittorrent torrents → Map(lowercase hash → torrent). Hybrid v1/v2 torrents
// are reachable by either infohash, whichever one the *arr recorded.
export function torrentIndex(torrents) {
  const map = new Map();
  for (const t of torrents || []) {
    for (const h of [t.hash, t.infohash_v1, t.infohash_v2]) {
      const key = normalizeHash(h);
      if (key && !map.has(key)) map.set(key, t);
    }
  }
  return map;
}

// The torrents still alive in qBittorrent for a set of imported hashes (a
// series can have many). Hashes whose torrent is already gone are skipped.
export function matchTorrents(hashes, index) {
  const seen = new Set();
  const out = [];
  for (const h of hashes || []) {
    const t = index.get(normalizeHash(h));
    if (!t || seen.has(t.hash)) continue;
    seen.add(t.hash);
    out.push(t);
  }
  return out.sort((a, b) => (a.added_on || 0) - (b.added_on || 0));
}

// How many library items claim each hash — a torrent imported into two items
// (e.g. a collection pack) keeps seeding for the other one if we delete it.
export function hashOwners(importIndexes) {
  const owners = new Map();
  for (const index of importIndexes) {
    for (const hashes of index.values()) {
      for (const h of hashes) owners.set(h, (owners.get(h) || 0) + 1);
    }
  }
  return owners;
}

// --- Private tracker detection ------------------------------------------------

export function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

export function magnetTrackerUrls(magnet) {
  const urls = [];
  for (const m of String(magnet || '').matchAll(/[?&]tr=([^&]+)/g)) {
    try {
      urls.push(decodeURIComponent(m[1]));
    } catch {
      // malformed component — skip
    }
  }
  return urls;
}

// "tracker.example.org" matches the entry "example.org" or "tracker.example.org".
// Entries may be written with a scheme or port; only the hostname counts.
export function hostInList(host, list) {
  if (!host) return false;
  return (list || []).some((entry) => {
    const e = String(entry || '')
      .trim()
      .toLowerCase()
      .replace(/^[a-z]+:\/\//, '')
      .replace(/[:/].*$/, '');
    return e && (host === e || host.endsWith(`.${e}`));
  });
}

const isAnnounceUrl = (u) => /^(https?|udp):\/\//i.test(u || '');

// Is this torrent from a private tracker, and which one? In order of trust:
//   1. `private` on the torrents/info row (qBittorrent 5.x — free, already here)
//   2. `is_private` from torrents/properties (qBittorrent 4.5+)
//   3. the tracker hostname against the configured PRIVATE_TRACKERS list
// The announce URLs come from the info row and magnet first, and only fall back
// to the per-torrent trackers call when those are empty (e.g. a stopped torrent).
export async function detectPrivacy(t, { properties, trackers, privateHosts = [] } = {}) {
  let isPrivate = typeof t.private === 'boolean' ? t.private : null;
  let source = isPrivate === null ? null : 'info';

  if (isPrivate === null && properties) {
    const props = await properties(t.hash).catch(() => null);
    if (typeof props?.is_private === 'boolean') {
      isPrivate = props.is_private;
      source = 'properties';
    }
  }

  const urls = [t.tracker, ...magnetTrackerUrls(t.magnet_uri)].filter(isAnnounceUrl);
  if (!urls.length && trackers) {
    const list = await trackers(t.hash).catch(() => []);
    for (const tr of list || []) {
      if (isAnnounceUrl(tr?.url)) urls.push(tr.url);
    }
  }
  const hosts = [...new Set(urls.map(hostnameOf).filter(Boolean))];

  if (isPrivate === null) {
    isPrivate = hosts.some((h) => hostInList(h, privateHosts));
    source = 'list';
  }

  return {
    isPrivate,
    source,
    tracker: hosts.find((h) => hostInList(h, privateHosts)) || hosts[0] || null,
    trackerUrls: [...new Set(urls)]
  };
}

// --- Seeding / Hit & Run -----------------------------------------------------

const SEEDING_STATES = new Set(['uploading', 'stalledUP', 'forcedUP', 'queuedUP']);

export const isSeedingState = (state) => SEEDING_STATES.has(state);

// Real seeding time when qBittorrent reports it; otherwise time since
// completion (what the auto cleanup measures). The former never overstates.
export function seedSeconds(t, nowSec = Date.now() / 1000) {
  if (typeof t.seeding_time === 'number' && t.seeding_time >= 0) return t.seeding_time;
  return t.completion_on > 0 ? Math.max(0, nowSec - t.completion_on) : 0;
}

// Same floors as the auto cleanup (Portugas rule 4.2.1): ratio 1 OR 168h seeded.
export function hnrStatus(t, nowSec) {
  const ratioOk = (t.ratio ?? 0) >= MIN_RATIO;
  const timeOk = seedSeconds(t, nowSec) >= MIN_SEED_HOURS * 3600;
  return { ratioOk, timeOk, met: ratioOk || timeOk };
}

// The torrent as the frontend sees it. `protected` = Portugas, or a private
// torrent whose tracker we couldn't identify (never guess in its favour).
export function summarizeTorrent(t, privacy, { busy = new Set(), owners = new Map(), nowSec } = {}) {
  const hash = normalizeHash(t.hash);
  const isProtected =
    isPortugasTracker(privacy.trackerUrls) || (privacy.isPrivate && !privacy.trackerUrls.length);
  return {
    hash,
    name: t.name,
    size: t.size || 0,
    // Floor, not round: 0.996 must not display (or count) as ratio 1.00.
    ratio: Math.floor((t.ratio ?? 0) * 100) / 100,
    seeding_time: Math.round(seedSeconds(t, nowSec)),
    state: t.state,
    tracker: privacy.tracker,
    isPrivate: Boolean(privacy.isPrivate),
    protected: isProtected,
    seeding: isSeedingState(t.state),
    importing: busy.has(hash),
    sharedWithOthers: (owners.get(hash) || 0) > 1,
    hnr: hnrStatus(t, nowSec)
  };
}

// --- Normalisation -------------------------------------------------------------

// Radarr/Sonarr call it a poster; Lidarr calls an album's artwork a cover.
const posterOf = (images) =>
  images?.find((i) => i.coverType === 'poster' || i.coverType === 'cover')?.remoteUrl || null;

const parentDir = (path) => (path ? path.slice(0, path.lastIndexOf('/')) || null : null);

// "Bluray-1080p" or, for a mixed series, "Bluray-1080p +2" (most common first).
export function qualitySummary(names) {
  const counts = new Map();
  for (const n of names) if (n) counts.set(n, (counts.get(n) || 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  if (!sorted.length) return null;
  return sorted.length === 1 ? sorted[0] : `${sorted[0]} +${sorted.length - 1}`;
}

export function normalizeMovie(m) {
  const file = m.movieFile;
  return {
    key: `movie:${m.id}`,
    id: m.id,
    type: 'movie',
    title: m.title,
    year: m.year || null,
    sizeOnDisk: m.sizeOnDisk || file?.size || 0,
    path: m.path || null,
    quality: file?.quality?.quality?.name || null,
    added: file?.dateAdded || m.added || null,
    poster: posterOf(m.images),
    fileCount: file ? 1 : 0,
    files: file?.path ? [{ path: file.path, size: file.size || 0 }] : []
  };
}

export function normalizeSeries(s, episodeFiles = []) {
  return {
    key: `series:${s.id}`,
    id: s.id,
    type: 'series',
    title: s.title,
    year: s.year || null,
    sizeOnDisk: s.statistics?.sizeOnDisk || 0,
    path: s.path || null,
    quality: qualitySummary(episodeFiles.map((f) => f.quality?.quality?.name)),
    added: s.added || null,
    poster: posterOf(s.images),
    fileCount: s.statistics?.episodeFileCount || episodeFiles.length,
    files: episodeFiles.filter((f) => f.path).map((f) => ({ path: f.path, size: f.size || 0 }))
  };
}

// An album is the music unit of the Library — the artist is only its container,
// so deleting one album leaves the rest of the discography alone. Unlike a
// movie or a series, the on-disk folder isn't carried by the API record, so it
// is derived from the track files themselves.
export function normalizeAlbum(a, trackFiles = []) {
  const files = trackFiles.filter((f) => f.path).map((f) => ({ path: f.path, size: f.size || 0 }));
  return {
    key: `album:${a.id}`,
    id: a.id,
    type: 'album',
    title: a.title,
    artist: a.artist?.artistName || null,
    year: a.releaseDate ? Number(String(a.releaseDate).slice(0, 4)) || null : null,
    sizeOnDisk: a.statistics?.sizeOnDisk || 0,
    path: parentDir(files[0]?.path) || a.artist?.path || null,
    quality: qualitySummary(trackFiles.map((f) => f.quality?.quality?.name)),
    added: trackFiles[0]?.dateAdded || a.added || null,
    poster: posterOf(a.images) || posterOf(a.artist?.images),
    fileCount: a.statistics?.trackFileCount || files.length,
    // The delete path removes the files by id, never by path.
    trackFileIds: trackFiles.map((f) => f.id).filter((id) => id != null),
    files
  };
}

// --- Disk space ---------------------------------------------------------------

// files: [{ size, nlink }] where nlink is null when the file couldn't be stat'ed.
export function linkStats(files) {
  let exclusiveBytes = 0;
  let sharedBytes = 0;
  let unknownBytes = 0;
  for (const f of files || []) {
    if (f.nlink == null) unknownBytes += f.size || 0;
    else if (f.nlink > 1) sharedBytes += f.size || 0;
    else exclusiveBytes += f.size || 0;
  }
  const hardlinked = sharedBytes > 0 ? true : unknownBytes > 0 ? null : false;
  return { exclusiveBytes, sharedBytes, unknownBytes, hardlinked };
}

// Bytes that actually come back. A hardlinked file is one set of blocks under
// two names (library + torrent), so it is freed only when BOTH go:
//   deleteTorrent → every torrent byte, plus library files nothing else links to
//   keep seeding  → only the library files nothing else links to (often ≈ 0)
// Files we couldn't stat count as hardlinked when the item has a torrent (the
// stack always hardlinks imports) and as exclusive when it doesn't.
export function estimateFreed({ files, torrents = [], deleteFiles = true, deleteTorrent = true }) {
  const { exclusiveBytes, sharedBytes, unknownBytes, hardlinked } = linkStats(files);
  const hasTorrents = torrents.length > 0;
  const torrentBytes = torrents.reduce((s, t) => s + (t.size || 0), 0);
  const assumedShared = sharedBytes + (hasTorrents ? unknownBytes : 0);
  const libraryOnly = exclusiveBytes + (hasTorrents ? 0 : unknownBytes);

  let bytes = 0;
  if (deleteFiles) bytes += libraryOnly;
  if (deleteTorrent && hasTorrents) {
    // Without the library files, the hardlinked part stays held by the library.
    bytes += deleteFiles ? torrentBytes : Math.max(0, torrentBytes - assumedShared);
  }

  return {
    bytes,
    exact: unknownBytes === 0,
    hardlinked,
    torrentBytes,
    sharedBytes: assumedShared,
    exclusiveBytes: libraryOnly,
    // Library bytes a still-seeding torrent keeps alive on disk.
    heldBySeeding: deleteFiles && !(deleteTorrent && hasTorrents) && hasTorrents ? assumedShared : 0
  };
}

// --- Delete plan ---------------------------------------------------------------

export function parseDeleteOptions(body = {}) {
  const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
  return {
    deleteFiles: bool(body.deleteFiles, true),
    deleteTorrent: bool(body.deleteTorrent, true),
    addExclusion: bool(body.addExclusion, false),
    dryRun: bool(body.dryRun, false),
    confirmTitle: typeof body.confirmTitle === 'string' ? body.confirmTitle : ''
  };
}

export const titleMatches = (typed, title) =>
  String(typed || '').trim().toLowerCase() === String(title || '').trim().toLowerCase();

// What deleting `item` would do. `item.torrents` is null when qBittorrent or
// the import history was unavailable (`item.torrentsError` says which); we then
// refuse to touch torrents, since we can't check them. `item.hasImports` is true
// when the history links the item to at least one hash (or couldn't be read).
// Nothing here runs anything — dry runs return this as-is.
export function buildPlan(item, opts) {
  const torrents = item.torrents;
  const known = torrents || [];
  const warnings = [];

  const importing = known.filter((t) => t.importing);
  const hnrLocked = known.filter((t) => t.protected && !t.hnr.met);

  let torrentGuard = { allowed: true, reason: null, message: null };
  if (torrents === null && item.hasImports) {
    torrentGuard = {
      allowed: false,
      reason: 'unverifiable',
      message: `Can't verify this item's torrents — ${item.torrentsError || 'qBittorrent unavailable'}.`
    };
  } else if (hnrLocked.length) {
    torrentGuard = {
      allowed: false,
      reason: 'hnr',
      message:
        `Portugas torrent below the Hit & Run floors (ratio ${MIN_RATIO.toFixed(1)} or ` +
        `${MIN_SEED_HOURS}h seeded) — it must keep seeding.`
    };
  }

  const deleteTorrent = opts.deleteTorrent && known.length > 0;
  let blocked = null;
  if (importing.length) {
    blocked = 'A torrent for this item is still being imported — try again once it finishes.';
  } else if (opts.deleteTorrent && !torrentGuard.allowed) {
    blocked = torrentGuard.message;
  }

  const steps = [];
  if (deleteTorrent) {
    for (const t of known) {
      steps.push({
        kind: 'torrent',
        service: 'qbittorrent',
        hash: t.hash,
        name: t.name,
        size: t.size,
        tracker: t.tracker,
        isPrivate: t.isPrivate,
        deleteFiles: true
      });
    }
  }
  const ARR_SERVICE = { movie: 'radarr', series: 'sonarr', album: 'lidarr' };
  steps.push({
    kind: 'arr',
    service: ARR_SERVICE[item.type],
    id: item.id,
    title: item.title,
    deleteFiles: opts.deleteFiles,
    addExclusion: opts.addExclusion
  });

  if (opts.deleteTorrent && torrents !== null && !known.length) {
    warnings.push(
      item.hasImports
        ? 'Its torrent is no longer in qBittorrent — only the library side will be removed.'
        : 'No torrent is linked to this item in the *arr import history.'
    );
  }
  if (!opts.deleteTorrent && known.length) {
    warnings.push('The torrent keeps seeding: its files stay on disk.');
  }
  if (deleteTorrent && known.some((t) => t.sharedWithOthers)) {
    warnings.push('One of these torrents was also imported into another library item.');
  }

  const freed = estimateFreed({
    files: item.files,
    torrents: known,
    deleteFiles: opts.deleteFiles,
    deleteTorrent
  });
  if (torrents !== null && !known.length && freed.sharedBytes > 0) {
    warnings.push(
      'Its files are hardlinked to a copy outside the library (probably a torrent the ' +
        'import history no longer knows) — that space stays used until the copy goes too.'
    );
  }

  const minPrivateRatio = Math.min(...known.filter((t) => t.isPrivate).map((t) => t.ratio));
  return {
    steps,
    blocked,
    warnings,
    torrentGuard,
    isPrivate: known.some((t) => t.isPrivate),
    requiresTitle: deleteTorrent && known.some((t) => t.isPrivate && t.ratio < MIN_RATIO),
    minPrivateRatio: Number.isFinite(minPrivateRatio) ? minPrivateRatio : null,
    freed,
    floors: { ratio: MIN_RATIO, seedHours: MIN_SEED_HOURS }
  };
}

// Run the plan step by step: torrents first (so qBittorrent never sees files
// vanish under a live torrent), then the *arr. The first failure stops the
// rest — deleting the library entry after a failed torrent delete would leave
// the torrent's files orphaned on disk with nothing pointing at them.
export async function executePlan(plan, { removeTorrent, deleteItem }) {
  const steps = [];
  let failed = false;
  for (const step of plan.steps) {
    if (failed) {
      steps.push({ ...step, status: 'skipped', error: 'Not run — an earlier step failed' });
      continue;
    }
    try {
      if (step.kind === 'torrent') await removeTorrent(step.hash);
      else await deleteItem(step);
      steps.push({ ...step, status: 'ok', error: null });
    } catch (err) {
      failed = true;
      steps.push({ ...step, status: 'error', error: err.message });
    }
  }
  return { ok: !failed, steps };
}

// Bounded-concurrency map — keeps a big library from firing hundreds of
// requests/stat calls at once.
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
