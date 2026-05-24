import { Router } from 'express';
import { getConfig, saveConfig } from '../config.js';
import { probeService, SERVICE_NAMES } from '../services/probe.js';
import { startCleanupLoop } from '../services/cleanup.js';

const router = Router();

// Never send secrets back to the frontend; expose only whether they are set.
// Non-secret app settings (e.g. cleanup) are returned as-is.
function sanitize(config) {
  const out = { services: {}, app: config.app || {} };
  for (const [name, cfg] of Object.entries(config.services)) {
    const safe = { url: cfg.url, container: cfg.container };
    if ('username' in cfg) safe.username = cfg.username;
    if ('userId' in cfg) safe.userId = cfg.userId;
    if ('apiKey' in cfg) safe.apiKeyConfigured = Boolean(cfg.apiKey);
    if ('password' in cfg) safe.passwordConfigured = Boolean(cfg.password);
    out.services[name] = safe;
  }
  return out;
}

// GET /api/settings
router.get('/', (_req, res) => {
  res.json(sanitize(getConfig()));
});

// POST /api/settings  (partial update; empty secrets are preserved)
router.post('/', (req, res) => {
  const body = req.body || {};
  const update = {};
  if (body.services && typeof body.services === 'object') update.services = body.services;
  if (body.app && typeof body.app === 'object') update.app = body.app;
  if (!update.services && !update.app) {
    return res.status(400).json({ error: 'Expected { services } and/or { app }' });
  }
  const updated = saveConfig(update);
  // Re-arm the cleanup loop if its settings changed.
  if (update.app?.cleanup) startCleanupLoop();
  res.json(sanitize(updated));
});

// POST /api/settings/test  { service }
router.post('/test', async (req, res) => {
  const { service } = req.body || {};
  if (!SERVICE_NAMES.includes(service)) {
    return res.status(400).json({ error: `service must be one of: ${SERVICE_NAMES.join(', ')}` });
  }
  res.json(await probeService(service));
});

export default router;
