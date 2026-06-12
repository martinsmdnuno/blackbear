import { createArrClient } from './arr.js';

const client = createArrClient('sonarr', '/api/v3', 'Sonarr');

export const lookup = (term) =>
  client.get(`/series/lookup?term=${encodeURIComponent(term)}`);

export const qualityProfiles = () => client.get('/qualityprofile');

export const rootFolders = () => client.get('/rootfolder');

export const addSeries = (payload) => client.post('/series', payload);

export const allSeries = () => client.get('/series');

export const deleteSeries = (id, deleteFiles) =>
  client.del(`/series/${id}?deleteFiles=${deleteFiles ? 'true' : 'false'}`);

export const queue = () =>
  client.get('/queue?includeUnknownSeriesItems=true&pageSize=100');

// Remove a queue item, blocklisting the release so Sonarr grabs a different one.
export const removeQueueItem = (id) =>
  client.del(`/queue/${id}?removeFromClient=true&blocklist=true&skipRedownload=false`);

// Trigger an indexer search for specific episodes / a whole season.
export const searchEpisodes = (episodeIds) =>
  client.post('/command', { name: 'EpisodeSearch', episodeIds });

export const searchSeason = (seriesId, seasonNumber) =>
  client.post('/command', { name: 'SeasonSearch', seriesId, seasonNumber });

// Interactive search: list every candidate release instead of letting Sonarr
// auto-pick. Queries all indexers synchronously, so it needs a long timeout.
const RELEASE_TIMEOUT = 90000;

export const episodeReleases = (episodeId) =>
  client.get(`/release?episodeId=${episodeId}`, { timeout: RELEASE_TIMEOUT });

export const seasonReleases = (seriesId, seasonNumber) =>
  client.get(`/release?seriesId=${seriesId}&seasonNumber=${seasonNumber}`, {
    timeout: RELEASE_TIMEOUT
  });

// Grab a specific release from the last search (Sonarr resolves guid+indexerId
// against its release cache, so this must follow a recent releases() call).
export const grabRelease = (guid, indexerId) =>
  client.post('/release', { guid, indexerId }, { timeout: RELEASE_TIMEOUT });

export const systemStatus = () => client.get('/system/status');

export const health = () => client.get('/health');

export const calendar = (start, end) =>
  client.get(`/calendar?start=${start}&end=${end}&unmonitored=false&includeSeries=true`);

// Aired but not downloaded yet (paginated, large pageSize so we get most).
export const missing = (pageSize = 200) =>
  client.get(
    `/wanted/missing?page=1&pageSize=${pageSize}&sortKey=airDateUtc&sortDirection=descending&monitored=true&includeSeries=true`
  );

export default client;
