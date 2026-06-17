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
  Shield,
  ShieldCheck,
  ShieldAlert,
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
  tmdb: 'TMDb (Trending)',
  jellyfin: 'Jellyfin'
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
  const isJellyfin = name === 'jellyfin';
  const configured = value.apiKeyConfigured || value.passwordConfigured;

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
        <div className="flex items-center gap-2">
          {configured && !result && (
            <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
              Saved ✓
            </span>
          )}
          {result &&
            (result.ok ? (
              <CheckCircle2 size={18} className="text-emerald-400" />
            ) : (
              <XCircle size={18} className="text-blood-light" />
            ))}
        </div>
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
            {value.passwordConfigured && (
              <span className="mt-1 block text-[11px] text-silver">Saved — blank keeps it.</span>
            )}
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
          {value.apiKeyConfigured && (
            <span className="mt-1 block text-[11px] text-silver">
              Saved &amp; persisted — leave blank to keep it.
            </span>
          )}
        </label>
      )}

      {isJellyfin && (
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-silver">
            User ID <span className="normal-case text-silver/70">(optional)</span>
          </span>
          <input
            className="input"
            value={value.userId || ''}
            onChange={(e) => onChange({ ...value, userId: e.target.value })}
            placeholder="auto (first user)"
          />
        </label>
      )}

      {!isTmdb && !isJellyfin && (
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

      {isJellyfin && (
        <p className="text-xs text-silver">
          API key from Jellyfin → Dashboard → API Keys. Jellyfin runs on the host, so the URL is
          usually <code className="rounded bg-night-800 px-1">http://host.docker.internal:8096</code>
          {' '}or your LAN IP. Powers "Continue watching", the Library "watched" badge, and
          auto-hiding watched titles in Trending.
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

// Portugas (and most private trackers) require seeding each torrent to ratio 1
// OR for a minimum of 168h (7 days) — whichever comes first — before it may be
// removed. Deleting earlier counts as a Hit and Run: warnings, loss of download
// privileges, and eventually a permanent ban (Portugas rules 4.2.1 / 4.3). These
// floors are enforced here AND in the backend (services/cleanup.js) so the
// cleanup can never trigger an HnR, however the config is set.
const MIN_RATIO = 1;
const MIN_SEED_HOURS = 168;

const clampRatio = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= MIN_RATIO ? n : MIN_RATIO;
};
const clampSeedHours = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= MIN_SEED_HOURS ? Math.round(n) : MIN_SEED_HOURS;
};

function CleanupCard({ value, onChange }) {
  const c = value || {};
  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-parchment">Downloads cleanup</h3>
        <button
          type="button"
          aria-label="toggle cleanup"
          onClick={() => onChange({ ...c, enabled: !c.enabled })}
          className={`relative h-6 w-11 rounded-full transition ${c.enabled ? 'bg-gold' : 'bg-night-700'}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
              c.enabled ? 'left-[22px]' : 'left-0.5'
            }`}
          />
        </button>
      </div>
      <p className="text-xs text-silver">
        When on, a finished torrent is removed once it hits the ratio <em>or</em> has seeded for
        the hours below (whichever comes first — so a torrent with no peers can't seed forever) —
        and its files deleted to free space (safe with hardlinks: your library stays intact).
        Torrents Sonarr/Radarr are still importing are skipped.
      </p>
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />
        <p className="text-xs text-amber-200/90">
          <span className="font-semibold">Hit &amp; Run protection.</span> Private trackers
          (Portugas, rule 4.2.1) require every torrent to seed to <strong>ratio {MIN_RATIO}</strong>{' '}
          or for at least <strong>{MIN_SEED_HOURS}h (7 days)</strong> before removal. Deleting
          earlier earns an HnR strike → lost download rights and, after enough strikes, a permanent
          ban. These fields are floored at those minimums and can't be set lower.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-silver">
            Remove at ratio <span className="normal-case text-silver/60">(min {MIN_RATIO})</span>
          </span>
          <input
            type="number"
            step="0.1"
            min={MIN_RATIO}
            className="input"
            value={c.ratio ?? MIN_RATIO}
            disabled={!c.enabled}
            onChange={(e) => onChange({ ...c, ratio: Number(e.target.value) })}
            onBlur={(e) => onChange({ ...c, ratio: clampRatio(e.target.value) })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-silver">
            …or after (hours) <span className="normal-case text-silver/60">(min {MIN_SEED_HOURS})</span>
          </span>
          <input
            type="number"
            step="1"
            min={MIN_SEED_HOURS}
            className="input"
            value={c.seedHours ?? MIN_SEED_HOURS}
            disabled={!c.enabled}
            onChange={(e) => onChange({ ...c, seedHours: Number(e.target.value) })}
            onBlur={(e) => onChange({ ...c, seedHours: clampSeedHours(e.target.value) })}
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm text-parchment">
        <input
          type="checkbox"
          className="h-4 w-4 accent-gold"
          checked={c.deleteFiles !== false}
          disabled={!c.enabled}
          onChange={(e) => onChange({ ...c, deleteFiles: e.target.checked })}
        />
        Also delete files from disk
      </label>

      <hr className="border-gold/15" />

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-parchment">Re-grab stalled downloads</p>
          <p className="mt-0.5 text-xs text-silver">
            For torrents stalled longer than the minutes below, tell Sonarr/Radarr to blocklist
            the release and search again — so a stuck download gets replaced automatically.
          </p>
        </div>
        <button
          type="button"
          aria-label="toggle stalled re-grab"
          onClick={() => onChange({ ...c, reGrabStalled: !c.reGrabStalled })}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${
            c.reGrabStalled ? 'bg-gold' : 'bg-night-700'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
              c.reGrabStalled ? 'left-[22px]' : 'left-0.5'
            }`}
          />
        </button>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-silver">
          Consider stalled after (minutes)
        </span>
        <input
          type="number"
          step="5"
          min="10"
          className="input"
          value={c.stalledMinutes ?? 60}
          disabled={!c.reGrabStalled}
          onChange={(e) => onChange({ ...c, stalledMinutes: Number(e.target.value) })}
        />
      </label>
    </div>
  );
}

// Portugas guard: shows whether the Portugas indexer is tag-scoped in Radarr and
// Sonarr (so it's only used for titles the user opts into) and lets the user
// (re-)apply that scoping. "Trust but verify" — Prowlarr's full sync can strip
// the tag, so the status is read live rather than assumed.
function ServiceGuardRow({ name, info }) {
  const label = SERVICE_LABELS[name] || name;
  let icon, text, tone;
  if (info?.error) {
    icon = <ShieldAlert size={15} className="text-blood-light" />;
    text = info.error;
    tone = 'text-blood-light';
  } else if (info?.indexersFound === 0) {
    icon = <ShieldAlert size={15} className="text-amber-400" />;
    text = 'Indexer Portugas não encontrado';
    tone = 'text-amber-200/90';
  } else if (info?.protected) {
    icon = <ShieldCheck size={15} className="text-emerald-400" />;
    text = `Protegido (${info.indexers.map((i) => i.name).join(', ')})`;
    tone = 'text-emerald-300';
  } else {
    icon = <ShieldAlert size={15} className="text-amber-400" />;
    text = 'Encontrado mas SEM tag — desprotegido';
    tone = 'text-amber-200/90';
  }
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 shrink-0 font-semibold text-silver">{label}</span>
      {icon}
      <span className={tone}>{text}</span>
    </div>
  );
}

function PortugasCard() {
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .portugasStatus()
      .then((s) => {
        setStatus(s);
        setError(null);
      })
      .catch((err) => setError(err.message));

  useEffect(() => {
    load();
  }, []);

  async function apply() {
    setBusy(true);
    try {
      const s = await api.portugasSetup();
      setStatus(s);
      setError(null);
      toast.success('Protecção Portugas aplicada');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Shield size={18} className="text-gold" />
        <h3 className="font-bold text-parchment">Protecção Portugas</h3>
      </div>
      <p className="text-xs text-silver">
        O indexer Portugas é marcado com uma tag, e o Radarr/Sonarr só o consultam para títulos
        que tenham essa tag. Por defeito nada usa o Portugas — só quando ligas “Usar Portugas” ao
        adicionar um título (ex. desenhos animados). Protege também os grabs automáticos e RSS, não
        só os manuais.
      </p>

      {error ? (
        <p className="text-xs text-blood-light">{error}</p>
      ) : !status ? (
        <div className="flex items-center gap-2 text-xs text-silver">
          <Loader2 size={14} className="animate-spin" /> A verificar…
        </div>
      ) : (
        <div className="space-y-1.5">
          {['radarr', 'sonarr'].map((name) => (
            <ServiceGuardRow key={name} name={name} info={status[name]} />
          ))}
        </div>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />
        <p className="text-xs text-amber-200/90">
          Se o estado voltar a “sem tag” depois de aplicar, é o <strong>Prowlarr</strong> a
          sobrepor-se no sync. Em Prowlarr → Settings → Apps, mete a ligação ao Radarr/Sonarr em{' '}
          <strong>“Add and Remove Only”</strong> (ou marca o indexer com a tag no próprio Prowlarr)
          para a tag persistir.
        </p>
      </div>

      <button onClick={apply} disabled={busy} className="btn-ghost w-full">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
        Aplicar / Re-aplicar protecção
      </button>
    </div>
  );
}

function SettingsPanel() {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [app, setApp] = useState({ cleanup: {} });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .settings()
      .then((s) => {
        setForm(s.services);
        setApp(s.app || { cleanup: {} });
      })
      .catch((err) => setError(err.message));
  }, []);

  async function save() {
    setSaving(true);
    try {
      // Strip the *Configured booleans before sending; empty secrets are kept by the backend.
      const services = {};
      for (const [name, cfg] of Object.entries(form)) {
        const { apiKeyConfigured, passwordConfigured, ...rest } = cfg;
        services[name] = rest;
      }
      // Floor the HnR-sensitive fields one more time before sending, in case the
      // user edited and hit Save without the inputs losing focus.
      const cleanup = {
        ...app.cleanup,
        ratio: clampRatio(app.cleanup?.ratio),
        seedHours: clampSeedHours(app.cleanup?.seedHours)
      };
      const updated = await api.saveSettings({ services, app: { cleanup } });
      setForm(updated.services);
      setApp(updated.app || { cleanup: {} });
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
      <CleanupCard value={app.cleanup} onChange={(cleanup) => setApp({ ...app, cleanup })} />
      <PortugasCard />
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
