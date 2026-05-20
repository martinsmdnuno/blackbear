import { useEffect, useState } from 'react';
import { X, Loader2, Search as SearchIcon } from 'lucide-react';
import { api } from '../api/client.js';
import { useToast } from './Toast.jsx';

const MIN_AVAILABILITY = [
  { value: 'announced', label: 'Announced' },
  { value: 'inCinemas', label: 'In Cinemas' },
  { value: 'released', label: 'Released' }
];

const SERIES_MONITOR = [
  { value: 'all', label: 'All episodes' },
  { value: 'future', label: 'Future episodes' },
  { value: 'missing', label: 'Missing episodes' },
  { value: 'existing', label: 'Existing episodes' },
  { value: 'firstSeason', label: 'First season' },
  { value: 'lastSeason', label: 'Last season' },
  { value: 'pilot', label: 'Pilot only' },
  { value: 'none', label: 'None' }
];

const SERIES_TYPE = [
  { value: 'standard', label: 'Standard' },
  { value: 'anime', label: 'Anime' },
  { value: 'daily', label: 'Daily' }
];

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-xl bg-night-900 px-3 py-2.5"
    >
      <span className="text-sm text-slate-200">{label}</span>
      <span
        className={`relative h-6 w-11 rounded-full transition ${
          checked ? 'bg-gold' : 'bg-night-700'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
            checked ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
}

export default function AddSheet({ type, item, onClose }) {
  const toast = useToast();
  const isMovie = type === 'movie';

  const [profiles, setProfiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [metaError, setMetaError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [opts, setOpts] = useState({
    qualityProfileId: null,
    rootFolderPath: '',
    monitored: true,
    minimumAvailability: 'released',
    monitor: 'all',
    seasonFolder: true,
    seriesType: 'standard',
    searchOnAdd: true
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingMeta(true);
      setMetaError(null);
      try {
        const [p, f] = await Promise.all([api.qualityProfiles(type), api.rootFolders(type)]);
        if (cancelled) return;
        setProfiles(p);
        setFolders(f);
        setOpts((o) => ({
          ...o,
          qualityProfileId: p[0]?.id ?? null,
          rootFolderPath: f[0]?.path ?? ''
        }));
      } catch (err) {
        if (!cancelled) setMetaError(err.message);
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [type]);

  async function submit() {
    if (!opts.qualityProfileId) {
      toast.error('Pick a quality profile first');
      return;
    }
    setSubmitting(true);
    try {
      await api.add({ type, item, options: opts });
      toast.success(`${item.title} added to ${isMovie ? 'Radarr' : 'Sonarr'}`);
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const poster = item.images?.find((i) => i.coverType === 'poster')?.remoteUrl;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center md:items-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg animate-fade-in rounded-t-3xl border border-night-700/60 bg-night-850 p-5 shadow-card md:rounded-3xl">
        <div className="flex items-start gap-3">
          {poster && (
            <img src={poster} alt="" className="h-24 w-16 shrink-0 rounded-lg object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-bold text-slate-100">{item.title}</h3>
            <p className="text-sm text-slate-400">
              {item.year || '—'} · {isMovie ? 'Movie' : 'Series'}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:text-slate-200">
            <X size={20} />
          </button>
        </div>

        {loadingMeta ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-slate-400">
            <Loader2 size={16} className="animate-spin" /> Loading profiles…
          </div>
        ) : metaError ? (
          <p className="mt-6 rounded-xl border border-blood/40 bg-blood/10 px-3 py-2.5 text-sm text-blood-light">
            {metaError}
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            <Field label="Quality Profile">
              <select
                className="input"
                value={opts.qualityProfileId ?? ''}
                onChange={(e) => setOpts({ ...opts, qualityProfileId: Number(e.target.value) })}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>

            {folders.length > 1 && (
              <Field label="Root Folder">
                <select
                  className="input"
                  value={opts.rootFolderPath}
                  onChange={(e) => setOpts({ ...opts, rootFolderPath: e.target.value })}
                >
                  {folders.map((f) => (
                    <option key={f.path} value={f.path}>
                      {f.path}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {isMovie ? (
              <>
                <Field label="Minimum Availability">
                  <select
                    className="input"
                    value={opts.minimumAvailability}
                    onChange={(e) => setOpts({ ...opts, minimumAvailability: e.target.value })}
                  >
                    {MIN_AVAILABILITY.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Toggle
                  label="Monitor"
                  checked={opts.monitored}
                  onChange={(v) => setOpts({ ...opts, monitored: v })}
                />
              </>
            ) : (
              <>
                <Field label="Monitor">
                  <select
                    className="input"
                    value={opts.monitor}
                    onChange={(e) => setOpts({ ...opts, monitor: e.target.value })}
                  >
                    {SERIES_MONITOR.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Series Type">
                  <select
                    className="input"
                    value={opts.seriesType}
                    onChange={(e) => setOpts({ ...opts, seriesType: e.target.value })}
                  >
                    {SERIES_TYPE.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Toggle
                  label="Season folders"
                  checked={opts.seasonFolder}
                  onChange={(v) => setOpts({ ...opts, seasonFolder: v })}
                />
              </>
            )}

            <Toggle
              label="Search on add"
              checked={opts.searchOnAdd}
              onChange={(v) => setOpts({ ...opts, searchOnAdd: v })}
            />

            <button onClick={submit} disabled={submitting} className="btn-gold w-full">
              {submitting ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <SearchIcon size={18} />
              )}
              Add to {isMovie ? 'Radarr' : 'Sonarr'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
