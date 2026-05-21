const DEFAULT_TIMEOUT = 12000;

export function trimUrl(url) {
  return (url || '').replace(/\/+$/, '');
}

// Thin fetch wrapper with an abort timeout so a hung/offline service can never
// block a request forever. Throws a readable Error on non-2xx responses.
export async function httpRequest(url, options = {}) {
  const { timeout = DEFAULT_TIMEOUT, label = 'service', ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let res;
  try {
    res = await fetch(url, { ...rest, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`${label} timed out after ${timeout}ms`);
    }
    throw new Error(`${label} unreachable: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      // ignore body read errors
    }
    throw new Error(formatHttpError(label, res.status, body));
  }
  return res;
}

// Turn an error response body into a readable message. Sonarr/Radarr return a
// JSON array of validation errors ([{ propertyName, errorMessage, ... }]); other
// services may return { message } or { error }. Fall back to trimmed raw text.
function formatHttpError(label, status, body) {
  let detail = (body || '').trim();
  if (detail) {
    try {
      const json = JSON.parse(detail);
      if (Array.isArray(json)) {
        const msgs = json.map((e) => e.errorMessage || e.message).filter(Boolean);
        if (msgs.length) detail = msgs.join('; ');
      } else if (json && typeof json === 'object') {
        detail = json.errorMessage || json.message || json.error || detail;
      }
    } catch {
      // not JSON — keep the raw text
    }
  }
  detail = detail.replace(/\s+/g, ' ').slice(0, 300);
  return `${label} ${status}${detail ? `: ${detail}` : ''}`;
}

export async function httpJson(url, options = {}) {
  const res = await httpRequest(url, options);
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
