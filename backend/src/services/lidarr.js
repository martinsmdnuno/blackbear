import { createArrClient } from './arr.js';

// Lidarr speaks the same *arr shape as Sonarr/Radarr but on /api/v1, and its
// unit of work is the album (an artist is the container, like a series).
const client = createArrClient('lidarr', '/api/v1', 'Lidarr');

export const lookupArtist = (term) =>
  client.get(`/artist/lookup?term=${encodeURIComponent(term)}`);

export const lookupAlbum = (term) =>
  client.get(`/album/lookup?term=${encodeURIComponent(term)}`);

export const qualityProfiles = () => client.get('/qualityprofile');

// Lidarr-only: decides which release types (album / EP / single / live /
// compilation) an artist is tracked for. Without it an artist can drag in
// hundreds of singles and bootlegs, so the add flow has to expose it.
export const metadataProfiles = () => client.get('/metadataprofile');

export const rootFolders = () => client.get('/rootfolder');

export const addArtist = (payload) => client.post('/artist', payload);

export const allArtists = () => client.get('/artist');

export const artist = (id) => client.get(`/artist/${id}`);

// Removing an artist folder full of albums can outlast the default 12s timeout.
export const deleteArtist = (id, deleteFiles, addExclusion = false) =>
  client.del(
    `/artist/${id}?deleteFiles=${deleteFiles ? 'true' : 'false'}&addImportListExclusion=${addExclusion ? 'true' : 'false'}`,
    { timeout: 60000 }
  );

export const albums = (artistId) => client.get(`/album?artistId=${artistId}`);

// Every album Lidarr knows for the artists in the library, each with its
// statistics (trackFileCount / sizeOnDisk) — one call, unlike Sonarr where the
// episode files need a request per series.
export const allAlbums = () => client.get('/album');

export const album = (id) => client.get(`/album/${id}`);

export const setAlbumsMonitored = (albumIds, monitored) =>
  client.put('/album/monitor', { albumIds, monitored });

// Track files, which the Library uses for on-disk size and hardlink counting.
// Lidarr refuses an unfiltered /trackfile ("artistId, albumId, trackFileIds or
// unmapped must be provided"), so one of the two filters is mandatory. Asking
// per artist is the cheaper sweep: one call covers all of that artist's albums.
export const trackFilesByArtist = (artistId) => client.get(`/trackfile?artistId=${artistId}`);

export const trackFilesByAlbum = (albumId) => client.get(`/trackfile?albumId=${albumId}`);

// Delete track files from disk without touching the album entity. This is how
// music deletion differs from movies: an album is metadata hanging off an
// artist (Lidarr re-adds it on the next refresh), so what we remove are the
// files — after unmonitoring, or Lidarr grabs the album straight back.
export const deleteTrackFiles = (trackFileIds) =>
  client.del('/trackfile/bulk', {
    body: JSON.stringify({ trackFileIds }),
    headers: { 'Content-Type': 'application/json' },
    timeout: 60000
  });

// Every import record. eventType 3 is trackFileImported, the counterpart of
// Radarr's downloadFolderImported — its downloadId is the torrent infohash,
// which is how the Library ties an album to its torrent(s). Verified against a
// real import: 1 → grabbed, 3 → trackFileImported (one per track), 8 →
// downloadImported (one per release). The Library wants 3, not 8: only the
// per-track records carry the album a file landed in.
export const importHistory = () => client.allPages('/history?eventType=3');

export const historyForDownload = (downloadId) =>
  client.get(`/history?page=1&pageSize=100&downloadId=${encodeURIComponent(downloadId)}`);

export const queue = () => client.get('/queue?pageSize=100&includeAlbum=true&includeArtist=true');

export const removeQueueItem = (id) =>
  client.del(`/queue/${id}?removeFromClient=true&blocklist=true&skipRedownload=false`);

export const searchAlbums = (albumIds) => client.post('/command', { name: 'AlbumSearch', albumIds });

// Interactive search — queries every indexer synchronously, so it needs room.
const RELEASE_TIMEOUT = 90000;

export const albumReleases = (albumId) =>
  client.get(`/release?albumId=${albumId}`, { timeout: RELEASE_TIMEOUT });

export const grabRelease = (guid, indexerId) =>
  client.post('/release', { guid, indexerId }, { timeout: RELEASE_TIMEOUT });

// Tags + indexers — the Portugas guard scopes the Portugas indexer to tagged
// artists only, exactly as it does for movies and series (services/portugas.js).
export const tags = () => client.get('/tag');

export const createTag = (label) => client.post('/tag', { label });

export const indexers = () => client.get('/indexer');

export const updateIndexer = (indexer) =>
  client.put(`/indexer/${indexer.id}?forceSave=true`, indexer, { timeout: 30000 });

export const systemStatus = () => client.get('/system/status');

export const health = () => client.get('/health');

export const diskSpace = () => client.get('/diskspace');

export const calendar = (start, end) =>
  client.get(`/calendar?start=${start}&end=${end}&unmonitored=false`);

export const history = (pageSize = 100) =>
  client.get(
    `/history?page=1&pageSize=${pageSize}&sortKey=date&sortDirection=descending&eventType=1&eventType=3`
  );

export default client;
