import { useEffect, useState } from 'react';
import {
  Settings as SettingsIcon,
  Stethoscope,
  CheckCircle2,
  XCircle,
  Loader2,
  Save,
  Plug,
  HardDrive,
  Radio,
  Subtitles,
  AlertTriangle,
  ScrollText,
  RotateCw,
  X
} from 'lucide-react';
import { api } from '../api/client.js';
import { useToast } from './Toast.jsx';
import { bytes } from '../lib/format.js';

const SERVICE_LABELS = {
  sonarr: 'Sonarr',
  radarr: 'Radarr',
  prowlarr: 'Prowlarr',
  bazarr: 'Bazarr',
  qbittorrent: 'qBittorrent',
  tmdb: 'TMDb (Trending)'
};

// Services backed by a Docker container (i.e. that support restart/logs).
// TMDb is a cloud API, so it's excluded from the Containers panel.
const CONTAINER_SERVICES = ['sonarr', 'radarr', 'prowlarr', 'bazarr', 'qbittorrent'];

/* ----------------------------- Settings panel ----------------------------- */

function ServiceForm({ name, value, onChange }) {
  const toast = useToast();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);
  const isQbit = name === 'qbittorrent';
  const isTmdb = name === 'tmdb';

  async function test() {
    setTesting(true);
    setResult(null);
    try {
      const r = await api.testConnection(name);
      setResult(r);
      if (r.ok) toast.success(`${SERVICE_LABELS[name]} reachable${r.version ? ` (v${r.version})` : ''}`);
      else toast.error(`${SERVICE_LABELS[name]}: ${r.error}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-parchment">{SERVICE_LABELS[name]}</h3>
        {result &&
          (result.ok ? (
            <CheckCircle2 size={18} className="text-emerald-400" />
          ) : (
            <XCircle size={18} className="text-blood-light" />
          ))}
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-silver">
          URL
        </span>
        <input
          className="input"
          value={value.url}
          onChange={(e) => onChange({ ...value, url: e.target.value })}
          placeholder="http://host:port"
        />
      </label>

      {isQbit ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-silver">
              Username
            </span>
            <input
              className="input"
              value={value.username || ''}
              onChange={(e) => onChange({ ...value, username: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-silver">
              Password
            </span>
            <input
              type="password"
              className="input"
              value={value.password || ''}
              onChange={(e) => onChange({ ...value, password: e.target.value })}
              placeholder={value.passwordConfigured ? '•••••••• (set)' : 'not set'}
            />
          </label>
        </div>
      ) : (
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-silver">
            API Key
          </span>
          <input
            type="password"
            className="input"
            value={value.apiKey || ''}
            onChange={(e) => onChange({ ...value, apiKey: e.target.value })}
            placeholder={value.apiKeyConfigured ? '•••••••• (set)' : 'not set'}
          />
        </label>
      )}

      {!isTmdb && (
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-silver">
            Container name (for restart/logs)
          </span>
          <input
            className="input"
            value={value.container || ''}
            onChange={(e) => onChange({ ...value, container: e.target.value })}
          />
        </label>
      )}

      {isTmdb && (
        <p className="text-xs text-silver">
          Free API key from themoviedb.org → Settings → API. Powers the Trending tab.
        </p>
      )}

      <button onClick={test} disabled={testing} className="btn-ghost w-full">
        {testing ? <Loader2 size={16} className="animate-spin" /> : <Plug size={16} />}
        Test connection
      </button>
      {result && !result.ok && <p className="text-xs text-blood-light">{result.error}</p>}
    </div>
  );
}

function SettingsPanel() {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .settings()
      .then((s) => setForm(s.services))
      .catch((err) => setError(err.message));
  }, []);

  async function save() {
    setSaving(true);
    try {
      // Strip the *Configured booleans before sending; empty secrets are kept by the backend.
      const payload = {};
      for (const [name, cfg] of Object.entries(form)) {
        const { apiKeyConfigured, passwordConfigured, ...rest } = cfg;
        payload[name] = rest;
      }
      const updated = await api.saveSettings(payload);
      setForm(updated.services);
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <p className="rounded-xl border border-blood/40 bg-blood/10 px-3 py-2.5 text-sm text-blood-light">
        {error}
      </p>
    );
  }
  if (!form) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-40 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {Object.keys(SERVICE_LABELS).map((name) => (
        <ServiceForm
          key={name}
          name={name}
          value={form[name]}
          onChange={(v) => setForm({ ...form, [name]: v })}
        />
      ))}
      <button onClick={save} disabled={saving} className="btn-gold w-full">
        {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
        Save settings
      </button>
    </div>
  );
}

/* --------------------------- Diagnostics panel ---------------------------- */

function LogsModal({ service, onClose }) {
  const [logs, setLogs] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .logs(service, 300)
      .then((r) => setLogs(r.logs || '(empty)'))
      .catch((err) => setError(err.message));
  }, [service]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className="card relative z-10 flex h-[80vh] w-full max-w-2xl flex-col p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-bold text-parchment">{SERVICE_LABELS[service]} — logs</h3>
          <button onClick={onClose} className="text-silver hover:text-parchment">
            <X size={20} />
          </button>
        </div>
        {error ? (
          <p className="text-sm text-blood-light">{error}</p>
        ) : logs == null ? (
          <div className="flex flex-1 items-center justify-center text-silver">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <pre className="flex-1 overflow-auto whitespace-pre-wrap rounded-lg bg-night-950 p-3 text-[11px] leading-relaxed text-parchment/90">
            {logs}
          </pre>
        )}
      </div>
    </div>
  );
}

function HealthRow({ h }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-night-900 px-3 py-2.5">
      {h.ok ? (
        <CheckCircle2 size={18} className="shrink-0 text-emerald-400" />
      ) : (
        <XCircle size={18} className="shrink-0 text-blood-light" />
      )}
      <span className="font-semibold text-parchment">{SERVICE_LABELS[h.service]}</span>
      <span className="ml-auto truncate text-xs text-silver">
        {h.ok ? (h.version ? `v${h.version}` : 'online') : h.error}
      </span>
    </div>
  );
}

function DiagnosticsPanel() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [logService, setLogService] = useState(null);
  const [restarting, setRestarting] = useState(null);

  function load() {
    setLoading(true);
    api
      .diagnostics()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function restart(service) {
    if (!window.confirm(`Restart the ${SERVICE_LABELS[service]} container?`)) return;
    setRestarting(service);
    try {
      await api.restart(service);
      toast.success(`${SERVICE_LABELS[service]} restarting`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRestarting(null);
    }
  }

  if (error) {
    return (
      <p className="rounded-xl border border-blood/40 bg-blood/10 px-3 py-2.5 text-sm text-blood-light">
        {error}
      </p>
    );
  }
  if (!data) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-24 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  const dockerOn = data.docker?.available;

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={load} disabled={loading} className="btn-ghost px-3 py-1.5 text-xs">
          <RotateCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Health */}
      <section className="card space-y-2 p-4">
        <h3 className="flex items-center gap-2 font-bold text-parchment">
          <Stethoscope size={18} className="text-gold" /> Service Health
        </h3>
        {data.health.map((h) => (
          <HealthRow key={h.service} h={h} />
        ))}
      </section>

      {/* Disk space */}
      <section className="card space-y-3 p-4">
        <h3 className="flex items-center gap-2 font-bold text-parchment">
          <HardDrive size={18} className="text-gold" /> Disk Space
        </h3>
        {data.diskSpace.error ? (
          <p className="text-xs text-blood-light">{data.diskSpace.error}</p>
        ) : data.diskSpace.items.length === 0 ? (
          <p className="text-sm text-silver">No data.</p>
        ) : (
          data.diskSpace.items.map((d) => {
            const used = d.totalSpace ? (d.totalSpace - d.freeSpace) / d.totalSpace : 0;
            return (
              <div key={d.path}>
                <div className="flex justify-between text-xs text-silver">
                  <span className="truncate">{d.label || d.path}</span>
                  <span>
                    {bytes(d.freeSpace)} free / {bytes(d.totalSpace)}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-night-800">
                  <div
                    className={`h-full rounded-full ${used > 0.9 ? 'bg-blood' : 'progress-gold'}`}
                    style={{ width: `${Math.round(used * 100)}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* Indexers */}
      <section className="card space-y-2 p-4">
        <h3 className="flex items-center gap-2 font-bold text-parchment">
          <Radio size={18} className="text-gold" /> Prowlarr Indexers
        </h3>
        {data.indexers.error ? (
          <p className="text-xs text-blood-light">{data.indexers.error}</p>
        ) : data.indexers.items.length === 0 ? (
          <p className="text-sm text-silver">No indexers.</p>
        ) : (
          data.indexers.items.map((idx) => (
            <div key={idx.id} className="flex items-center gap-2 rounded-lg bg-night-900 px-3 py-2 text-sm">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  !idx.enabled ? 'bg-silver' : idx.failing ? 'bg-blood' : 'bg-emerald-400'
                }`}
              />
              <span className="truncate text-parchment">{idx.name}</span>
              <span className="ml-auto text-xs text-silver">
                {!idx.enabled ? 'disabled' : idx.failing ? 'failing' : 'ok'}
              </span>
            </div>
          ))
        )}
      </section>

      {/* Bazarr providers */}
      <section className="card space-y-2 p-4">
        <h3 className="flex items-center gap-2 font-bold text-parchment">
          <Subtitles size={18} className="text-gold" /> Bazarr Providers
        </h3>
        {data.providers.error ? (
          <p className="text-xs text-blood-light">{data.providers.error}</p>
        ) : data.providers.items.length === 0 ? (
          <p className="text-sm text-silver">No providers configured.</p>
        ) : (
          data.providers.items.map((p) => {
            const ok = !p.status || /^view on site$/i.test(p.status);
            return (
              <div key={p.name} className="flex items-center gap-2 rounded-lg bg-night-900 px-3 py-2 text-sm">
                <span className={`h-2 w-2 shrink-0 rounded-full ${ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <span className="truncate text-parchment">{p.name}</span>
                {!ok && <span className="ml-auto text-xs text-amber-300">{p.status}</span>}
              </div>
            );
          })
        )}
      </section>

      {/* Health warnings */}
      <section className="card space-y-2 p-4">
        <h3 className="flex items-center gap-2 font-bold text-parchment">
          <AlertTriangle size={18} className="text-gold" /> Health Warnings
        </h3>
        {data.healthWarnings.items.length === 0 ? (
          <p className="text-sm text-silver">No warnings. Smooth sailing.</p>
        ) : (
          data.healthWarnings.items.map((w, i) => (
            <div key={i} className="rounded-lg bg-night-900 px-3 py-2 text-sm">
              <span className="mr-2 rounded bg-night-700 px-1.5 py-0.5 text-[11px] uppercase text-parchment/90">
                {w.service}
              </span>
              <span className="text-parchment/90">{w.message}</span>
            </div>
          ))
        )}
      </section>

      {/* Container controls */}
      <section className="card space-y-2 p-4">
        <h3 className="flex items-center gap-2 font-bold text-parchment">
          <ScrollText size={18} className="text-gold" /> Containers
        </h3>
        {!dockerOn && (
          <p className="rounded-lg bg-night-900 px-3 py-2 text-xs text-silver">
            Docker socket not mounted — logs and restart are unavailable. Mount
            <code className="mx-1 rounded bg-night-800 px-1">/var/run/docker.sock</code>
            to enable.
          </p>
        )}
        {CONTAINER_SERVICES.map((name) => (
          <div key={name} className="flex items-center gap-2 rounded-lg bg-night-900 px-3 py-2">
            <span className="text-sm text-parchment">{SERVICE_LABELS[name]}</span>
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => setLogService(name)}
                disabled={!dockerOn}
                className="btn-ghost px-2.5 py-1.5 text-xs"
              >
                <ScrollText size={14} /> Logs
              </button>
              <button
                onClick={() => restart(name)}
                disabled={!dockerOn || restarting === name}
                className="btn-ghost px-2.5 py-1.5 text-xs"
              >
                {restarting === name ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RotateCw size={14} />
                )}
                Restart
              </button>
            </div>
          </div>
        ))}
      </section>

      {logService && <LogsModal service={logService} onClose={() => setLogService(null)} />}
    </div>
  );
}

/* ------------------------------- Container -------------------------------- */

export default function SettingsTab() {
  const [sub, setSub] = useState('settings');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-night-850 p-1">
        {[
          { id: 'settings', label: 'Settings', icon: SettingsIcon },
          { id: 'diagnostics', label: 'Diagnostics', icon: Stethoscope }
        ].map((t) => {
          const Icon = t.icon;
          const active = sub === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSub(t.id)}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition
                          ${active ? 'bg-gold text-night-950' : 'text-silver'}`}
            >
              <Icon size={18} />
              {t.label}
            </button>
          );
        })}
      </div>

      {sub === 'settings' ? <SettingsPanel /> : <DiagnosticsPanel />}

      <p className="pt-4 text-center text-xs italic text-silver/70">
        Yo ho ho and a bottle of rum
      </p>
    </div>
  );
}
