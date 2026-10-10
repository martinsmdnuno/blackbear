import { getAppConfig } from '../config.js';
import * as radarr from './radarr.js';
import * as sonarr from './sonarr.js';

// A Portugas link pushed with tmdbId/imdbId (routes/portugas.js) can be matched to
// the library item by ID only — e.g. the release says "Animales" but the movie is
// "Animals". Radarr/Sonarr then download it fine but refuse to import it on their
// own and leave the queue item as importBlocked with this warning:
//   Radarr: "Found matching movie via grab history, but release was matched to
//            movie by ID. Manual Import required."
//   Sonarr: "Found matching series via grab history, but release was matched to
//            series by ID. Automatic import is not possible. ..."
// The match is the one we asked for, so this loop finishes the import itself.
// Every other blocked import (title mismatch, not an upgrade…) is left alone for
// a human to look at.
export const ID_MATCH_RE = /release was matched to (movie|series) by ID/i;

// Rejections the Manual Import screen shows only because the release name didn't
// match — moot once we hand it the movie/series the grab was pushed for. Anything
// else (sample, not an upgrade, already imported…) keeps the file out.
const OVERRIDABLE_REJECTION_RE =
  /matched to (movie|series) by ID|unknown (movie|series)|unable to (parse|identify)|title mismatch/i;

// Don't hammer Radarr/Sonarr: a download gets a few tries, spaced out, then it's
// left in the queue for a human.
const RETRY_AFTER_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const attempts = new Map(); // `${svc}:${downloadId}` → { count, at }

let timer = null;
let lastRun = null;

function messagesOf(record) {
  const out = [];
  for (const m of record?.statusMessages || []) {
    for (const text of m?.messages || []) out.push(String(text));
  }
  if (record?.errorMessage) out.push(String(record.errorMessage));
  return out;
}

// importBlocked and *only* warned about the by-ID match. If Radarr/Sonarr also
// complain about something else, a human should see it.
export function isIdMatchBlocked(record) {
  if (record?.trackedDownloadState !== 'importBlocked') return false;
  const msgs = messagesOf(record);
  return msgs.length > 0 && msgs.every((m) => ID_MATCH_RE.test(m));
}

function rejectionsBlock(candidate) {
  return (candidate?.rejections || []).some((r) => {
    const reason = typeof r === 'string' ? r : r?.reason || '';
    return !OVERRIDABLE_REJECTION_RE.test(reason);
  });
}

// Build the ManualImport `files` for a Radarr download. Pure, so it's testable.
export function planRadarrImport(record, candidates) {
  const movieId = record?.movieId;
  if (!movieId) return { files: [], skipped: ['queue item has no movieId'] };
  const files = [];
  const skipped = [];
  for (const c of candidates || []) {
    if (c?.movie?.id && c.movie.id !== movieId) {
      skipped.push(`${c.relativePath || c.path}: parsed as another movie (${c.movie.id})`);
    } else if (rejectionsBlock(c)) {
      skipped.push(`${c.relativePath || c.path}: ${(c.rejections || []).map((r) => r?.reason || r).join('; ')}`);
    } else {
      files.push({
        path: c.path,
        folderName: c.folderName,
        movieId,
        quality: c.quality,
        languages: c.languages,
        releaseGroup: c.releaseGroup,
        indexerFlags: c.indexerFlags,
        downloadId: c.downloadId || record.downloadId
      });
    }
  }
  return { files, skipped };
}

// Build the ManualImport `files` for a Sonarr download. Sonarr has one queue
// record per episode of the download, so `records` is every record for that
// hash; the episodes they name are the only ones a file may be imported as.
export function planSonarrImport(records, candidates) {
  const seriesId = records?.find((r) => r.seriesId)?.seriesId;
  if (!seriesId) return { files: [], skipped: ['queue item has no seriesId'] };
  const queued = new Set(records.map((r) => r.episodeId).filter(Boolean));
  const usable = [];
  const skipped = [];
  for (const c of candidates || []) {
    const label = c.relativePath || c.path;
    if (c?.series?.id && c.series.id !== seriesId) {
      skipped.push(`${label}: parsed as another series (${c.series.id})`);
    } else if (rejectionsBlock(c)) {
      skipped.push(`${label}: ${(c.rejections || []).map((r) => r?.reason || r).join('; ')}`);
    } else {
      usable.push(c);
    }
  }
  const files = [];
  for (const c of usable) {
    let episodeIds = (c.episodes || []).map((e) => e.id).filter((id) => queued.has(id));
    // A single-file download whose name couldn't be parsed into episodes: it's
    // the episode(s) the grab was for.
    if (!episodeIds.length && usable.length === 1 && !(c.episodes || []).length) {
      episodeIds = [...queued];
    }
    if (!episodeIds.length) {
      skipped.push(`${c.relativePath || c.path}: no queued episode to import it as`);
      continue;
    }
    files.push({
      path: c.path,
      folderName: c.folderName,
      seriesId,
      episodeIds,
      quality: c.quality,
      languages: c.languages,
      releaseGroup: c.releaseGroup,
      releaseType: c.releaseType,
      indexerFlags: c.indexerFlags,
      downloadId: c.downloadId || records[0].downloadId
    });
  }
  return { files, skipped };
}

const SERVICES = [
  { svc: 'radarr', api: radarr, plan: (records, cands) => planRadarrImport(records[0], cands) },
  { svc: 'sonarr', api: sonarr, plan: planSonarrImport }
];

// One pass over the Radarr + Sonarr queues. `dryRun` logs what it would import
// without running the command.
export async function runAutoImport({ dryRun } = {}) {
  const cfg = getAppConfig().autoImport || {};
  if (cfg.enabled === false) return { skipped: 'disabled' };
  const dry = dryRun ?? cfg.dryRun === true;
  const now = Date.now();
  const imported = [];
  const left = [];

  for (const { svc, api, plan } of SERVICES) {
    let queue;
    try {
      queue = await api.queue();
    } catch (err) {
      left.push({ svc, reason: `queue unreachable: ${err.message}` });
      continue;
    }
    const byDownload = new Map();
    for (const r of queue?.records || []) {
      if (!r.downloadId || !isIdMatchBlocked(r)) continue;
      const id = String(r.downloadId);
      if (!byDownload.has(id)) byDownload.set(id, []);
      byDownload.get(id).push(r);
    }

    for (const [downloadId, records] of byDownload) {
      const title = records[0].title;
      const key = `${svc}:${downloadId.toLowerCase()}`;
      const prev = attempts.get(key);
      if (prev && (prev.count >= MAX_ATTEMPTS || now - prev.at < RETRY_AFTER_MS)) continue;

      try {
        const candidates = await api.manualImportCandidates(downloadId);
        const { files, skipped } = plan(records, candidates);
        for (const s of skipped) console.log(`[auto-import] ${svc} "${title}": skipping ${s}`);
        if (!files.length) {
          left.push({ svc, title, reason: 'no importable file' });
          if (!dry) attempts.set(key, { count: (prev?.count || 0) + 1, at: now });
          continue;
        }
        const summary = files.map((f) => f.path).join(', ');
        if (dry) {
          console.log(`[auto-import] DRY RUN ${svc} "${title}" → would import ${files.length} file(s): ${summary}`);
        } else {
          attempts.set(key, { count: (prev?.count || 0) + 1, at: now });
          await api.manualImport(files, 'auto');
          console.log(`[auto-import] ${svc} "${title}" → ManualImport of ${files.length} file(s): ${summary}`);
        }
        imported.push({ svc, title, files: files.length, dryRun: dry });
      } catch (err) {
        attempts.set(key, { count: (prev?.count || 0) + 1, at: now });
        console.error(`[auto-import] ${svc} "${title}" failed:`, err.message);
        left.push({ svc, title, reason: err.message });
      }
    }
  }

  lastRun = { at: new Date().toISOString(), imported: imported.length, left: left.length, dryRun: dry };
  return { imported, left, ...lastRun };
}

export function getLastRun() {
  return lastRun;
}

export function startAutoImportLoop() {
  if (timer) clearInterval(timer);
  const cfg = getAppConfig().autoImport || {};
  const seconds = Math.max(60, Number(cfg.intervalSeconds) || 300);
  timer = setInterval(() => {
    runAutoImport().catch((err) => console.error('[auto-import] loop error:', err.message));
  }, seconds * 1000);
  setTimeout(() => runAutoImport().catch(() => {}), 20000);
}
