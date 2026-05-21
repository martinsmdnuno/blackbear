import { createArrClient } from './arr.js';

const client = createArrClient('sonarr', '/api/v3', 'Sonarr');

export const lookup = (term) =>
  client.get(`/series/lookup?term=${encodeURIComponent(term)}`);

export const qualityProfiles = () => client.get('/qualityprofile');

export const rootFolders = () => client.get('/rootfolder');

export const addSeries = (payload) => client.post('/series', payload);

export const queue = () =>
  client.get('/queue?includeUnknownSeriesItems=true&pageSize=100');

export const systemStatus = () => client.get('/system/status');

export const health = () => client.get('/health');

export const calendar = (start, end) =>
  client.get(`/calendar?start=${start}&end=${end}&unmonitored=false&includeSeries=true`);

export default client;
