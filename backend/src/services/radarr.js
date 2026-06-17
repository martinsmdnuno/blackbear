import { createArrClient } from './arr.js';

const client = createArrClient('radarr', '/api/v3', 'Radarr');

export const lookup = (term) =>
  client.get(`/movie/lookup?term=${encodeURIComponent(term)}`);

export const qualityProfiles = () => client.get('/qualityprofile');

export const rootFolders = () => client.get('/rootfolder');

export const addMovie = (payload) => client.post('/movie', payload);

export const allMovies = () => client.get('/movie');

export const deleteMovie = (id, deleteFiles) =>
  client.del(`/movie/${id}?deleteFiles=${deleteFiles ? 'true' : 'false'}&addImportExclusion=false`);

export const queue = () => client.get('/queue?pageSize=100');

// Remove a queue item, blocklisting the release so Radarr grabs a different one.
export const removeQueueItem = (id) =>
  client.del(`/queue/${id}?removeFromClient=true&blocklist=true&skipRedownload=false`);

// Trigger an indexer search for specific movies.
export const searchMovies = (movieIds) =>
  client.post('/command', { name: 'MoviesSearch', movieIds });

// Interactive search: list every candidate release instead of letting Radarr
// auto-pick. Queries all indexers synchronously, so it needs a long timeout.
const RELEASE_TIMEOUT = 90000;

export const movieReleases = (movieId) =>
  client.get(`/release?movieId=${movieId}`, { timeout: RELEASE_TIMEOUT });

// Grab a specific release from the last search (Radarr resolves guid+indexerId
// against its release cache, so this must follow a recent releases() call).
export const grabRelease = (guid, indexerId) =>
  client.post('/release', { guid, indexerId }, { timeout: RELEASE_TIMEOUT });

// Tags + indexers — used by the Portugas guard to scope the Portugas indexer to
// tagged media only (see services/portugas.js).
export const tags = () => client.get('/tag');

export const createTag = (label) => client.post('/tag', { label });

export const indexers = () => client.get('/indexer');

// forceSave skips the live "test the indexer" step Radarr otherwise runs on
// save — a private tracker can be slow/flaky and we only changed its tags.
export const updateIndexer = (indexer) =>
  client.put(`/indexer/${indexer.id}?forceSave=true`, indexer, { timeout: 30000 });

export const systemStatus = () => client.get('/system/status');

export const health = () => client.get('/health');

export const diskSpace = () => client.get('/diskspace');

export const calendar = (start, end) =>
  client.get(`/calendar?start=${start}&end=${end}&unmonitored=false`);

export default client;
