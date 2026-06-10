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

export const systemStatus = () => client.get('/system/status');

export const health = () => client.get('/health');

export const diskSpace = () => client.get('/diskspace');

export const calendar = (start, end) =>
  client.get(`/calendar?start=${start}&end=${end}&unmonitored=false`);

export default client;
