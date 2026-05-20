import { Router } from 'express';
import * as sonarr from '../services/sonarr.js';
import * as radarr from '../services/radarr.js';
import * as prowlarr from '../services/prowlarr.js';
import * as bazarr from '../services/bazarr.js';
import * as docker from '../services/docker.js';
import { probeService, SERVICE_NAMES } from '../services/probe.js';

const router = Router();

async function settle(fn, fallback) {
  try {
    return { data: await fn() };
  } catch (err) {
    return { data: fallback, error: err.message };
  }
}

async function buildIndexers() {
  const [list, status] = await Promise.all([prowlarr.indexers(), prowlarr.indexerStatus()]);
  const failingById = new Map((status || []).map((s) => [s.indexerId, s]));
  return (list || []).map((idx) => {
    const fail = failingById.get(idx.id);
    return {
      id: idx.id,
      name: idx.name,
      enabled: idx.enable,
      failing: Boolean(fail),
      disabledTill: fail?.disabledTill || null,
      lastError: fail?.mostRecentFailure || null
    };
  });
}

async function buildHealthWarnings() {
  const tag = (arr, service) => (arr || []).map((w) => ({ service, ...w }));
  const [s, r, p] = await Promise.all([
    settle(sonarr.health, []),
    settle(radarr.health, []),
    settle(prowlarr.health, [])
  ]);
  return [...tag(s.data, 'sonarr'), ...tag(r.data, 'radarr'), ...tag(p.data, 'prowlarr')];
}

// GET /api/diagnostics
router.get('/', async (_req, res) => {
  const [health, diskSpace, indexers, providers, warnings] = await Promise.all([
    Promise.all(SERVICE_NAMES.map(probeService)),
    settle(radarr.diskSpace, []),
    settle(buildIndexers, []),
    settle(bazarr.providers, { data: [] }),
    settle(buildHealthWarnings, [])
  ]);

  res.json({
    health,
    diskSpace: { items: diskSpace.data || [], error: diskSpace.error || null },
    indexers: { items: indexers.data || [], error: indexers.error || null },
    providers: { items: providers.data?.data || providers.data || [], error: providers.error || null },
    healthWarnings: { items: warnings.data || [], error: warnings.error || null },
    docker: { available: docker.dockerAvailable() }
  });
});

// GET /api/diagnostics/logs/:service?tail=200
router.get('/logs/:service', async (req, res) => {
  if (!docker.dockerAvailable()) {
    return res.status(503).json({ error: 'Docker socket not available to BlackBeard' });
  }
  const tail = Math.min(Number(req.query.tail) || 200, 2000);
  try {
    const text = await docker.logs(req.params.service, tail);
    res.json({ service: req.params.service, tail, logs: text });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/diagnostics/restart/:service
router.post('/restart/:service', async (req, res) => {
  if (!docker.dockerAvailable()) {
    return res.status(503).json({ error: 'Docker socket not available to BlackBeard' });
  }
  try {
    const result = await docker.restart(req.params.service);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
