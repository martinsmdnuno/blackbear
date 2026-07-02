import { createArrClient } from './arr.js';

const client = createArrClient('prowlarr', '/api/v1', 'Prowlarr');

export const systemStatus = () => client.get('/system/status');

export const indexers = () => client.get('/indexer');

// A single indexer with its `fields` populated — we read the Portugas UNIT3D API
// token back from here so grab-by-link can resolve a torrent authenticated,
// without asking the user for a passkey.
export const indexer = (id) => client.get(`/indexer/${id}`);

export const indexerStatus = () => client.get('/indexerstatus');

export const health = () => client.get('/health');

export default client;
