import { httpJson, trimUrl } from './http.js';
import * as lidarr from './lidarr.js';

// Lidarr can only list the albums of an artist it already tracks — its
// /album?artistId= needs a library id. But the metadata server Lidarr itself
// reads from (SkyHook, api.lidarr.audio) answers with an artist's whole
// discography by MusicBrainz id. That is what lets you open "Linkin Park" and
// pick "Meteora" without remembering what it was called.
const DEFAULT_SOURCE = 'https://api.lidarr.audio/api/v0.4';

// Lidarr lets the metadata source be overridden (Settings → Metadata). Follow it
// if it is set, so this lists exactly what Lidarr will create when it refreshes.
async function metadataSource() {
  try {
    const cfg = await lidarr.default.get('/config/metadataprovider');
    if (cfg?.metadataSource && /^https?:\/\//i.test(cfg.metadataSource)) {
      return trimUrl(cfg.metadataSource);
    }
  } catch {
    // older Lidarr or no access — the default is what nearly everyone uses
  }
  return DEFAULT_SOURCE;
}

export async function fetchArtist(mbid) {
  const base = await metadataSource();
  return httpJson(`${base}/artist/${encodeURIComponent(mbid)}`, {
    label: 'Lidarr metadata',
    timeout: 20000
  });
}

// The shelf an album sits on. Order matters: a live EP is live before it is an
// EP, because what you want to know first is "is this the studio record".
export function albumGroup(type, secondaryTypes = []) {
  const sec = secondaryTypes || [];
  if (sec.includes('Live')) return 'live';
  if (sec.includes('Compilation')) return 'compilation';
  if (sec.length) return 'other'; // remix, demo, soundtrack, spoken word…
  if (type === 'Album') return 'album';
  if (type === 'EP') return 'ep';
  if (type === 'Single') return 'single';
  return 'other';
}

export const GROUP_ORDER = ['album', 'ep', 'live', 'compilation', 'single', 'other'];

const coverUrl = (releaseGroupId) =>
  `https://coverartarchive.org/release-group/${releaseGroupId}/front-250`;

// Merge the metadata server's discography with what Lidarr holds for the same
// artist. Pure, so it is testable without either service.
//
// - Release groups with no Official release are dropped: they are dated live
//   bootlegs ("2012-08-11: Jiffy Lube Live") that bury the records, and Lidarr's
//   stock metadata profiles skip them anyway.
// - A library album is matched on its current id or any of the old ids
//   MusicBrainz merged into it, since Lidarr may still hold one of those.
export function mapDiscography(raw, libraryAlbums = []) {
  const byForeignId = new Map();
  for (const a of libraryAlbums || []) {
    if (a?.foreignAlbumId) byForeignId.set(a.foreignAlbumId, a);
  }

  const seen = new Set();
  const albums = [];
  for (const r of raw?.Albums || []) {
    const statuses = r.ReleaseStatuses || [];
    const ids = [r.Id, ...(r.OldIds || [])];
    const lib = ids.map((id) => byForeignId.get(id)).find(Boolean) || null;
    if (!lib && statuses.length && !statuses.includes('Official')) continue;
    if (lib) seen.add(lib.foreignAlbumId);
    albums.push(toAlbum({
      foreignAlbumId: lib?.foreignAlbumId || r.Id,
      title: r.Title,
      albumType: r.Type,
      secondaryTypes: r.SecondaryTypes || [],
      releaseDate: r.ReleaseDate || null,
      coverId: r.Id
    }, lib));
  }

  // Anything Lidarr holds that the metadata server no longer lists (renamed or
  // merged away) still belongs on the list — it may have files on disk.
  for (const a of libraryAlbums || []) {
    if (seen.has(a.foreignAlbumId)) continue;
    albums.push(toAlbum({
      foreignAlbumId: a.foreignAlbumId,
      title: a.title,
      albumType: a.albumType,
      secondaryTypes: (a.secondaryTypes || []).map((t) => t?.name || t),
      releaseDate: a.releaseDate || null,
      coverId: a.foreignAlbumId
    }, a));
  }

  return albums.sort(
    (x, y) =>
      GROUP_ORDER.indexOf(x.group) - GROUP_ORDER.indexOf(y.group) ||
      String(y.releaseDate || '').localeCompare(String(x.releaseDate || ''))
  );
}

function toAlbum(base, lib) {
  const st = lib?.statistics || {};
  const total = st.totalTrackCount || 0;
  const have = st.trackFileCount || 0;
  return {
    foreignAlbumId: base.foreignAlbumId,
    title: base.title,
    albumType: base.albumType || null,
    secondaryTypes: base.secondaryTypes,
    group: albumGroup(base.albumType, base.secondaryTypes),
    releaseDate: base.releaseDate ? String(base.releaseDate).slice(0, 10) : null,
    year: base.releaseDate ? Number(String(base.releaseDate).slice(0, 4)) || null : null,
    cover: coverUrl(base.coverId),
    library: lib
      ? {
          id: lib.id,
          monitored: Boolean(lib.monitored),
          trackFileCount: have,
          totalTrackCount: total,
          sizeOnDisk: st.sizeOnDisk || 0,
          complete: total > 0 && have >= total
        }
      : null
  };
}
