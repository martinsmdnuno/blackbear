import { createArrClient } from './arr.js';

const client = createArrClient('prowlarr', '/api/v1', 'Prowlarr');

export const systemStatus = () => client.get('/system/status');

export const indexers = () => client.get('/indexer');

export const indexerStatus = () => client.get('/indexerstatus');

export const health = () => client.get('/health');

export default client;
