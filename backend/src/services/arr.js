import { getService } from '../config.js';
import { httpJson, trimUrl } from './http.js';

// Sonarr, Radarr and Prowlarr share the *arr API shape: an X-Api-Key header and
// a versioned /api/vN base path. This factory centralises that so each service
// module stays a thin wrapper.
export function createArrClient(serviceName, apiBase, label) {
  function resolveBase() {
    const cfg = getService(serviceName);
    if (!cfg?.url) throw new Error(`${label} URL not configured`);
    if (!cfg?.apiKey) throw new Error(`${label} API key not configured`);
    return { base: `${trimUrl(cfg.url)}${apiBase}`, apiKey: cfg.apiKey };
  }

  async function request(path, options = {}) {
    const { base, apiKey } = resolveBase();
    return httpJson(`${base}${path}`, {
      ...options,
      label,
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
  }

  // Walk a paged *arr endpoint (history, wanted…) and return every record.
  // Capped so a runaway totalRecords can never loop forever.
  async function allPages(path, { pageSize = 1000, maxPages = 50, ...options } = {}) {
    const sep = path.includes('?') ? '&' : '?';
    const records = [];
    for (let page = 1; page <= maxPages; page++) {
      const res = await request(`${path}${sep}page=${page}&pageSize=${pageSize}`, {
        ...options,
        method: 'GET'
      });
      const batch = res?.records || [];
      records.push(...batch);
      if (batch.length < pageSize || records.length >= (res?.totalRecords ?? 0)) break;
    }
    return records;
  }

  return {
    label,
    apiBase,
    request,
    get: (path, options) => request(path, { ...options, method: 'GET' }),
    post: (path, body, options) =>
      request(path, { ...options, method: 'POST', body: JSON.stringify(body) }),
    put: (path, body, options) =>
      request(path, { ...options, method: 'PUT', body: JSON.stringify(body) }),
    del: (path, options) => request(path, { ...options, method: 'DELETE' }),
    allPages
  };
}
