import express from 'express';
import cors from 'cors';
import { loadConfig, CONFIG_PATH } from './config.js';
import searchRoutes from './routes/search.js';
import addRoutes from './routes/add.js';
import downloadsRoutes from './routes/downloads.js';
import pipelineRoutes from './routes/pipeline.js';
import trendingRoutes from './routes/trending.js';
import settingsRoutes from './routes/settings.js';
import diagnosticsRoutes from './routes/diagnostics.js';

const PORT = Number(process.env.PORT) || 3000;

loadConfig();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ status: 'ok', app: 'blackbeard' }));

app.use('/api/search', searchRoutes);
app.use('/api/add', addRoutes);
app.use('/api/downloads', downloadsRoutes);
app.use('/api/pipeline', pipelineRoutes);
app.use('/api/trending', trendingRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/diagnostics', diagnosticsRoutes);

app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: err.message || 'Internal error' });
});

app.listen(PORT, () => {
  console.log(`🏴‍☠️  BlackBeard backend listening on :${PORT}`);
  console.log(`    config: ${CONFIG_PATH}`);
});
