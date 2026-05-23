import { useCallback, useEffect, useState } from 'react';
import { Flame, TrendingUp, Sparkles, Eye, Film, Tv, Plus, Loader2, Star, EyeOff } from 'lucide-react';
import { api } from '../api/client.js';
import { useToast } from './Toast.jsx';
import AddSheet from './AddSheet.jsx';
import { truncate } from '../lib/format.js';

const MODES = [
  { id: 'trending', label: 'Trending', icon: Flame },
  { id: 'popular', label: 'Popular', icon: TrendingUp },
  { id: 'recommended', label: 'For You', icon: Sparkles },
  { id: 'watched', label: 'Watched', icon: Eye }
];

function Card({ item, busy, onPick, onHide, onUnhide, seen }) {
  const Icon = item.type === 'movie' ? Film : Tv;
  return (
    <div className="card relative flex gap-3 p-3 transition hover:border-gold/50">
      <button
        onClick={onPick}
        disabled={busy}
        className="flex flex-1 gap-3 pr-7 text-left disabled:opacity-60"
      >
        <div className="h-28 w-[74px] shrink-0 overflow-hidden rounded-md bg-night-800">
          {item.poster ? (
            <img src={item.poster} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-silver/60">
              <Icon size={22} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-tight text-parchment">{item.title}</h3>
          <div className="flex items-center gap-2 text-xs text-silver">
            <span>{item.year || '—'}</span>
            {item.rating ? (
              <span className="flex items-center gap-0.5 text-gold-light">
                <Star size={11} className="fill-gold-light" /> {item.rating}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-0.5 text-gold">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} add
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-silver">
            {truncate(item.overview, 120) || 'No synopsis available.'}
          </p>
        </div>
      </button>
      {seen ? (
        <button
          onClick={onUnhide}
          title="Restore to Trending"
          className="absolute right-2 top-2 rounded-md p-1 text-silver transition hover:bg-night-800 hover:text-gold-light"
        >
          <Eye size={15} />
        </button>
      ) : (
        <button
          onClick={onHide}
          title="Already seen — hide"
          className="absolute right-2 top-2 rounded-md p-1 text-silver transition hover:bg-night-800 hover:text-blood-light"
        >
          <EyeOff size={15} />
        </button>
      )}
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

export default function TrendingTab() {
  const toast = useToast();
  const [mode, setMode] = useState('trending');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lookingUp, setLookingUp] = useState(null);
  const [hidden, setHidden] = useState(new Set());
  const [selected, setSelected] = useState(null);

  const load = useCallback(async (m) => {
    setLoading(true);
    setData(null);
    try {
      if (m === 'watched') {
        const res = await api.seenList();
        setData({
          movies: (res.movie || []).map((x) => ({ ...x, type: 'movie' })),
          series: (res.series || []).map((x) => ({ ...x, type: 'series' }))
        });
      } else {
        setData(m === 'recommended' ? await api.recommended() : await api.trending(m));
      }
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

  async function hide(item) {
    setHidden((h) => new Set(h).add(item.tmdbId));
    try {
      await api.markSeen(item.type, item);
    } catch (err) {
      toast.error(err.message);
      setHidden((h) => {
        const n = new Set(h);
        n.delete(item.tmdbId);
        return n;
      });
    }
  }

  async function unhide(item) {
    setData((d) => ({
      movies: (d.movies || []).filter((x) => !(x.type === 'movie' && x.tmdbId === item.tmdbId)),
      series: (d.series || []).filter((x) => !(x.type === 'series' && x.tmdbId === item.tmdbId))
    }));
    setHidden((h) => {
      const n = new Set(h);
      n.delete(item.tmdbId);
      return n;
    });
    try {
      await api.unhide(item.type, item.tmdbId);
    } catch (err) {
      toast.error(err.message);
      load('watched');
    }
  }

  const isWatched = mode === 'watched';
  const movies = isWatched
    ? data?.movies || []
    : (data?.movies || []).filter((m) => !hidden.has(m.tmdbId));
  const series = isWatched
    ? data?.series || []
    : (data?.series || []).filter((s) => !hidden.has(s.tmdbId));
  const isRecommended = mode === 'recommended';
  const emptyRecommended = isRecommended && data && !movies.length && !series.length;
  const emptyWatched = isWatched && data && !movies.length && !series.length;

  return (
    <div className="space-y-5">
      {/* Trending / Popular / For You / Watched */}
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
          <span className="mt-1 block text-xs text-silver">
            Set a TMDb API key in Settings to enable this.
          </span>
        </p>
      )}

      {loading && (
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card flex gap-3 p-3">
              <div className="skeleton h-28 w-[74px]" />
              <div className="flex-1 space-y-2 py-1">
                <div className="skeleton h-4 w-2/3" />
                <div className="skeleton h-3 w-1/4" />
                <div className="skeleton h-3 w-full" />
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

      {emptyWatched && (
        <p className="card p-6 text-center text-sm text-silver">
          Nothing hidden. Titles you mark as seen (the eye-off button) show up here — tap the eye
          to bring one back.
        </p>
      )}

      {data && !emptyRecommended && !emptyWatched && (
        <>
          {isRecommended && data.basedOn && (
            <p className="px-1 text-xs text-silver">
              Based on {data.basedOn.movies} movies and {data.basedOn.series} series in your library.
            </p>
          )}
          {isWatched && (
            <p className="px-1 text-xs text-silver">
              Hidden from Trending — tap the eye to restore, or the card to add anyway.
            </p>
          )}
          <Section title="Movies" count={movies.length} icon={Film}>
            {movies.length === 0 ? (
              <p className="card p-4 text-center text-sm text-silver">Nothing here right now.</p>
            ) : (
              movies.map((m) => (
                <Card
                  key={`m${m.tmdbId}`}
                  item={m}
                  busy={lookingUp === m.tmdbId}
                  seen={isWatched}
                  onPick={() => pick(m)}
                  onHide={() => hide(m)}
                  onUnhide={() => unhide(m)}
                />
              ))
            )}
          </Section>

          <Section title="Series" count={series.length} icon={Tv}>
            {series.length === 0 ? (
              <p className="card p-4 text-center text-sm text-silver">Nothing here right now.</p>
            ) : (
              series.map((s) => (
                <Card
                  key={`s${s.tmdbId}`}
                  item={s}
                  busy={lookingUp === s.tmdbId}
                  seen={isWatched}
                  onPick={() => pick(s)}
                  onHide={() => hide(s)}
                  onUnhide={() => unhide(s)}
                />
              ))
            )}
          </Section>
        </>
      )}

      {selected && <AddSheet type={selected.type} item={selected.item} onClose={() => setSelected(null)} />}
    </div>
  );
}
