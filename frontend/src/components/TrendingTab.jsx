import { useCallback, useEffect, useState } from 'react';
import {
  Flame,
  Clock,
  Sparkles,
  Sparkle,
  Film,
  Tv,
  Plus,
  Loader2,
  Star,
  Check,
  DownloadCloud,
  CheckCircle2
} from 'lucide-react';
import { api } from '../api/client.js';
import { useToast } from './Toast.jsx';
import AddSheet from './AddSheet.jsx';
import { agoLabel } from '../lib/format.js';

const MODES = [
  { id: 'trending', label: 'Trending', icon: Flame },
  { id: 'recent', label: 'Recent', icon: Clock },
  { id: 'recommended', label: 'For You', icon: Sparkles },
  { id: 'novidades', label: 'Novidades', icon: Sparkle }
];

// A discovery poster (Trending / Recent / For You) — tap to add via AddSheet.
function PosterCard({ item, busy, owned, onPick }) {
  const Icon = item.type === 'movie' ? Film : Tv;
  return (
    <button
      onClick={onPick}
      disabled={busy}
      className="group relative block overflow-hidden rounded-lg bg-night-800 text-left ring-1 ring-transparent transition hover:ring-gold/50 disabled:opacity-60"
    >
      <div className="aspect-[2/3] w-full overflow-hidden bg-night-800">
        {item.poster ? (
          <img
            src={item.poster}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-silver/60">
            <Icon size={26} />
          </div>
        )}
        <span
          className={`absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur
            ${owned ? 'bg-emerald-500/85 text-night-950' : 'bg-night-950/75 text-gold'}`}
        >
          {owned ? (
            <>
              <Check size={11} /> In library
            </>
          ) : busy ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <>
              <Plus size={11} /> Add
            </>
          )}
        </span>
      </div>
      <div className="p-1.5">
        <h3 className="truncate text-xs font-semibold leading-tight text-parchment">{item.title}</h3>
        <div className="flex items-center gap-1.5 text-[10px] text-silver">
          <span>{item.year || '—'}</span>
          {item.rating ? (
            <span className="flex items-center gap-0.5 text-gold-light">
              <Star size={9} className="fill-gold-light" /> {item.rating}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

// A "Novidades" poster — what just landed, with its grab/import state.
function NovidadeCard({ item }) {
  const Icon = item.type === 'movie' ? Film : Tv;
  const imported = item.state === 'imported';
  const isEp = item.type === 'episode';
  const code =
    isEp && item.season != null && item.episode != null
      ? `S${String(item.season).padStart(2, '0')}E${String(item.episode).padStart(2, '0')}`
      : null;
  return (
    <div className="relative block overflow-hidden rounded-lg bg-night-800 ring-1 ring-transparent">
      <div className="aspect-[2/3] w-full overflow-hidden bg-night-800">
        {item.poster ? (
          <img src={item.poster} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-silver/60">
            <Icon size={26} />
          </div>
        )}
        <span
          className={`absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur
            ${imported ? 'bg-emerald-500/85 text-night-950' : 'bg-sky-500/85 text-night-950'}`}
        >
          {imported ? <CheckCircle2 size={11} /> : <DownloadCloud size={11} />}
          {imported ? 'Imported' : 'Downloading'}
        </span>
      </div>
      <div className="p-1.5">
        <h3 className="truncate text-xs font-semibold leading-tight text-parchment">
          {isEp ? item.series : item.title}
        </h3>
        <div className="flex items-center gap-1.5 text-[10px] text-silver">
          {code && <span className="font-semibold text-parchment/80">{code}</span>}
          <span>{agoLabel(item.date)}</span>
        </div>
      </div>
    </div>
  );
}

function Section({ title, count, icon: Icon, children }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2 px-1">
        <Icon size={16} className="text-gold" />
        <h3 className="text-sm font-bold uppercase tracking-wide text-parchment/90">{title}</h3>
        {count != null && (
          <span className="rounded-full bg-night-700 px-2 py-0.5 text-xs font-semibold text-parchment/90">
            {count}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

const GRID = 'grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5';

export default function TrendingTab() {
  const toast = useToast();
  const [mode, setMode] = useState('trending');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lookingUp, setLookingUp] = useState(null);
  const [selected, setSelected] = useState(null);
  const [ownedIds, setOwnedIds] = useState({ movie: new Set(), series: new Set() });

  useEffect(() => {
    api
      .libraryIds()
      .then((d) => setOwnedIds({ movie: new Set(d.movie || []), series: new Set(d.series || []) }))
      .catch(() => {});
  }, []);

  const load = useCallback(async (m) => {
    setLoading(true);
    setData(null);
    try {
      if (m === 'novidades') setData(await api.novidades());
      else if (m === 'recommended') setData(await api.recommended());
      else setData(await api.trending(m));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(mode);
  }, [mode, load]);

  // A trending item only carries a TMDb id; resolve it through Radarr/Sonarr's
  // own lookup so the AddSheet gets a real, addable object.
  async function pick(item) {
    setLookingUp(item.tmdbId);
    try {
      const term = item.type === 'movie' ? `tmdb:${item.tmdbId}` : item.title;
      let results = await api.search(item.type, term);
      if ((!results || !results.length) && item.type === 'movie') {
        results = await api.search('movie', item.title);
      }
      if (results && results.length) {
        setSelected({ type: item.type, item: results[0] });
      } else {
        toast.error(`Couldn't find "${item.title}" in ${item.type === 'movie' ? 'Radarr' : 'Sonarr'}`);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLookingUp(null);
    }
  }

  // Flag a just-added title "In library" right away, no refresh needed.
  function handleAdded(type, item) {
    if (!item.tmdbId) return;
    const key = type === 'movie' ? 'movie' : 'series';
    setOwnedIds((o) => ({ ...o, [key]: new Set(o[key]).add(item.tmdbId) }));
  }

  const isNovidades = mode === 'novidades';
  const isRecommended = mode === 'recommended';
  const movies = data?.movies || [];
  const series = data?.series || [];
  const novidades = data?.items || [];
  const emptyRecommended = isRecommended && data && !movies.length && !series.length;
  const emptyNovidades = isNovidades && data && !novidades.length;

  return (
    <div className="space-y-5">
      {/* Trending / Recent / For You / Novidades */}
      <div className="grid grid-cols-4 gap-1 rounded-lg bg-night-850 p-1">
        {MODES.map((t) => {
          const Icon = t.icon;
          const active = mode === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setMode(t.id)}
              className={`flex items-center justify-center gap-1 rounded-md py-2.5 text-xs font-semibold transition
                          ${active ? 'bg-gold text-night-950' : 'text-silver'}`}
            >
              <Icon size={15} />
              {t.label}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="rounded-md border border-blood/40 bg-blood/10 px-3 py-2.5 text-sm text-blood-light">
          {error}
          {!isNovidades && (
            <span className="mt-1 block text-xs text-silver">
              Set a TMDb API key in Settings to enable this.
            </span>
          )}
        </p>
      )}

      {loading && (
        <div className={GRID}>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-lg bg-night-800">
              <div className="skeleton aspect-[2/3] w-full" />
              <div className="space-y-1.5 p-1.5">
                <div className="skeleton h-3 w-3/4" />
                <div className="skeleton h-2.5 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {emptyRecommended && (
        <p className="card p-6 text-center text-sm text-silver">
          No recommendations yet. Add a few movies or series (Radarr/Sonarr) and Blackbear will
          suggest similar titles here.
        </p>
      )}

      {emptyNovidades && (
        <p className="card p-6 text-center text-sm text-silver">
          Nothing new lately. Titles you grab or import show up here as they land.
        </p>
      )}

      {/* Novidades: a single feed, newest first. */}
      {isNovidades && data && !emptyNovidades && (
        <div className={GRID}>
          {novidades.map((n) => (
            <NovidadeCard key={`${n.type}${n.id}`} item={n} />
          ))}
        </div>
      )}

      {/* Discovery modes: Movies then Series, each a poster grid. */}
      {!isNovidades && data && !emptyRecommended && (
        <>
          {isRecommended && data.basedOn && (
            <p className="px-1 text-xs text-silver">
              Based on {data.basedOn.movies} movies and {data.basedOn.series} series in your library.
            </p>
          )}
          <Section title="Movies" count={movies.length} icon={Film}>
            {movies.length === 0 ? (
              <p className="card p-4 text-center text-sm text-silver">Nothing here right now.</p>
            ) : (
              <div className={GRID}>
                {movies.map((m) => (
                  <PosterCard
                    key={`m${m.tmdbId}`}
                    item={m}
                    busy={lookingUp === m.tmdbId}
                    owned={ownedIds.movie.has(m.tmdbId)}
                    onPick={() => pick(m)}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section title="Series" count={series.length} icon={Tv}>
            {series.length === 0 ? (
              <p className="card p-4 text-center text-sm text-silver">Nothing here right now.</p>
            ) : (
              <div className={GRID}>
                {series.map((s) => (
                  <PosterCard
                    key={`s${s.tmdbId}`}
                    item={s}
                    busy={lookingUp === s.tmdbId}
                    owned={ownedIds.series.has(s.tmdbId)}
                    onPick={() => pick(s)}
                  />
                ))}
              </div>
            )}
          </Section>
        </>
      )}

      {selected && (
        <AddSheet
          type={selected.type}
          item={selected.item}
          onAdded={handleAdded}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
