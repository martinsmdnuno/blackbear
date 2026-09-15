import { useEffect, useState } from 'react';
import { X, Loader2, Search as SearchIcon, Check } from 'lucide-react';
import { api } from '../api/client.js';
import { artwork } from '../lib/format.js';
import { useToast } from './Toast.jsx';

const MIN_AVAILABILITY = [
  { value: 'announced', label: 'Announced' },
  { value: 'inCinemas', label: 'In Cinemas' },
  { value: 'released', label: 'Released' }
];

const SERIES_MONITOR = [
  { value: 'all', label: 'All episodes' },
  { value: 'seasons', label: 'Specific seasons…' },
  { value: 'future', label: 'Future episodes' },
  { value: 'missing', label: 'Missing episodes' },
  { value: 'existing', label: 'Existing episodes' },
  { value: 'firstSeason', label: 'First season' },
  { value: 'lastSeason', label: 'Last season' },
  { value: 'pilot', label: 'Pilot only' },
  { value: 'none', label: 'None' }
];

// Lidarr's MonitorTypes. "All albums" is the honest default, but paired with a
// restrictive metadata profile — that pair is what keeps a discography sane.
const ARTIST_MONITOR = [
  { value: 'all', label: 'All albums' },
  { value: 'future', label: 'Future albums' },
  { value: 'missing', label: 'Missing albums' },
  { value: 'existing', label: 'Existing albums' },
  { value: 'latest', label: 'Latest album' },
  { value: 'first', label: 'First album' },
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
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-silver">
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
      <span className="text-sm text-parchment">{label}</span>
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

export default function AddSheet({ type, item, onClose, onAdded }) {
  const toast = useToast();
  const isMovie = type === 'movie';
  const isArtist = type === 'artist';
  const isAlbum = type === 'album';
  // Both music types need Lidarr's profile lists; an album also creates the
  // artist behind it, so it asks for the same two profiles.
  const isMusic = isArtist || isAlbum;
  const title = item.title || item.artistName;

  const [profiles, setProfiles] = useState([]);
  const [metaProfiles, setMetaProfiles] = useState([]);
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
    metadataProfileId: null,
    seasons: [],
    searchOnAdd: true,
    usePortugas: false
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingMeta(true);
      setMetaError(null);
      try {
        const profileType = type === 'album' ? 'artist' : type;
        const [p, f, mp] = await Promise.all([
          api.qualityProfiles(profileType),
          api.rootFolders(profileType),
          type === 'artist' || type === 'album' ? api.metadataProfiles() : Promise.resolve([])
        ]);
        if (cancelled) return;
        setProfiles(p);
        setFolders(f);
        setMetaProfiles(mp);
        // Prefer the root folder's own defaults where the service has them
        // (Lidarr does), so music starts on the FLAC profile rather than "Any".
        const root = f[0];
        const has = (id, list) => list.some((x) => x.id === id);
        setOpts((o) => ({
          ...o,
          qualityProfileId: has(root?.defaultQualityProfileId, p)
            ? root.defaultQualityProfileId
            : (p[0]?.id ?? null),
          rootFolderPath: root?.path ?? '',
          metadataProfileId: has(root?.defaultMetadataProfileId, mp)
            ? root.defaultMetadataProfileId
            : (mp[0]?.id ?? null)
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
      const options =
        opts.monitor === 'seasons'
          ? { ...opts, seasons: opts.seasons }
          : { ...opts, seasons: undefined };
      if (opts.monitor === 'seasons' && !opts.seasons.length) {
        toast.error('Pick at least one season');
        setSubmitting(false);
        return;
      }
      await api.add({ type, item, options });
      const where = isMovie ? 'Radarr' : isMusic ? 'Lidarr' : 'Sonarr';
      toast.success(`${title} added to ${where}`);
      onAdded?.(type, item);
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const poster = artwork(item.images);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center md:items-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg animate-fade-in rounded-t-3xl border border-night-700/60 bg-night-850 p-5 shadow-card md:rounded-3xl">
        <div className="flex items-start gap-3">
          {poster && (
            <img src={poster} alt="" className="h-24 w-16 shrink-0 rounded-lg object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-bold text-parchment">{title}</h3>
            <p className="truncate text-sm text-silver">
              {isAlbum
                ? [
                    item.artist?.artistName,
                    item.releaseDate ? String(item.releaseDate).slice(0, 4) : null,
                    item.albumType
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : isArtist
                  ? [item.disambiguation, item.artistType].filter(Boolean).join(' · ') || 'Artist'
                  : `${item.year || '—'} · ${isMovie ? 'Movie' : 'Series'}`}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-silver hover:text-parchment">
            <X size={20} />
          </button>
        </div>

        {loadingMeta ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-silver">
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

            {isMusic && (
              <>
                <Field label="Metadata Profile">
                  <select
                    className="input"
                    value={opts.metadataProfileId ?? ''}
                    onChange={(e) =>
                      setOpts({ ...opts, metadataProfileId: Number(e.target.value) })
                    }
                  >
                    {metaProfiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-silver">
                    {isAlbum
                      ? 'Used for the artist this album hangs off. If it excludes the album — Standard drops compilations and live records — Lidarr never creates it.'
                      : 'What counts as part of the discography. A permissive one drags in every single, live bootleg and remix compilation the artist ever touched.'}
                  </span>
                </Field>
                {isAlbum ? (
                  <p className="rounded-lg bg-night-900 px-3 py-2.5 text-xs text-silver">
                    Only this album is monitored. The artist is added alongside it — the rest of
                    the discography stays untouched.
                  </p>
                ) : (
                <Field label="Monitor">
                  <select
                    className="input"
                    value={opts.monitor}
                    onChange={(e) => setOpts({ ...opts, monitor: e.target.value })}
                  >
                    {ARTIST_MONITOR.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </Field>
                )}
              </>
            )}

            {isMusic ? null : isMovie ? (
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
                {opts.monitor === 'seasons' && (
                  <div className="space-y-1.5 rounded-xl bg-night-900 p-3">
                    <p className="text-xs text-silver">
                      Only the seasons you tick are monitored. Sonarr grabs nothing for the rest.
                    </p>
                    <div className="max-h-44 space-y-1 overflow-y-auto">
                      {(item.seasons || [])
                        .slice()
                        .sort((a, b) => a.seasonNumber - b.seasonNumber)
                        .map((s) => {
                          const on = opts.seasons.includes(s.seasonNumber);
                          return (
                            <button
                              key={s.seasonNumber}
                              type="button"
                              onClick={() =>
                                setOpts({
                                  ...opts,
                                  seasons: on
                                    ? opts.seasons.filter((n) => n !== s.seasonNumber)
                                    : [...opts.seasons, s.seasonNumber]
                                })
                              }
                              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition
                                          ${on ? 'bg-gold/15 text-gold' : 'text-silver hover:bg-night-800'}`}
                            >
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border
                                            ${on ? 'border-gold bg-gold text-night-950' : 'border-night-700'}`}
                              >
                                {on && <Check size={11} strokeWidth={3} />}
                              </span>
                              {s.seasonNumber === 0 ? 'Specials' : `Season ${s.seasonNumber}`}
                            </button>
                          );
                        })}
                      {!(item.seasons || []).length && (
                        <p className="px-1 py-2 text-xs text-silver">
                          Sonarr's lookup listed no seasons for this title.
                        </p>
                      )}
                    </div>
                  </div>
                )}

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

            <div className="space-y-1">
              <Toggle
                label={`Usar Portugas${isMusic ? ' (música PT)' : ' (desenhos animados)'}`}
                checked={opts.usePortugas}
                onChange={(v) => setOpts({ ...opts, usePortugas: v })}
              />
              <p className="px-1 text-[11px] leading-snug text-silver">
                Por defeito o Portugas é evitado (protecção Hit&nbsp;&amp;&nbsp;Run). Liga apenas
                para conteúdo que queres mesmo ir buscar lá — tipicamente{' '}
                {isMusic ? 'música portuguesa' : 'desenhos animados'}.
              </p>
            </div>

            <button onClick={submit} disabled={submitting} className="btn-gold w-full">
              {submitting ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <SearchIcon size={18} />
              )}
              Add to {isMovie ? 'Radarr' : isMusic ? 'Lidarr' : 'Sonarr'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
