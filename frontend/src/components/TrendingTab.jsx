import { useCallback, useEffect, useState } from 'react';
import { Flame, TrendingUp, Film, Tv, Plus, Loader2, Star } from 'lucide-react';
import { api } from '../api/client.js';
import { useToast } from './Toast.jsx';
import AddSheet from './AddSheet.jsx';
import { truncate } from '../lib/format.js';

function Card({ item, busy, onPick }) {
  const Icon = item.type === 'movie' ? Film : Tv;
  return (
    <button
      onClick={onPick}
      disabled={busy}
      className="card flex w-full gap-3 p-3 text-left transition hover:border-gold/50 disabled:opacity-60"
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
        <div className="flex items-start gap-2">
          <h3 className="flex-1 font-semibold leading-tight text-parchment">{item.title}</h3>
          <span className="shrink-0 rounded-md bg-gold/15 px-1.5 py-0.5 text-gold">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-silver">
          <span>{item.year || '—'}</span>
          {item.rating ? (
            <span className="flex items-center gap-0.5 text-gold-light">
              <Star size={11} className="fill-gold-light" /> {item.rating}
            </span>
          ) : null}
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-silver">
          {truncate(item.overview, 130) || 'No synopsis available.'}
        </p>
      </div>
    </button>
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
  const [selected, setSelected] = useState(null);

  const load = useCallback(async (m) => {
    setLoading(true);
    setData(null);
    try {
      const res = await api.trending(m);
      setData(res);
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

  const movies = data?.movies || [];
  const series = data?.series || [];

  return (
    <div className="space-y-5">
      {/* Trending / Popular toggle */}
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-night-850 p-1">
        {[
          { id: 'trending', label: 'Trending', icon: Flame },
          { id: 'popular', label: 'Popular', icon: TrendingUp }
        ].map((t) => {
          const Icon = t.icon;
          const active = mode === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setMode(t.id)}
              className={`flex items-center justify-center gap-2 rounded-md py-2.5 text-sm font-semibold transition
                          ${active ? 'bg-gold text-night-950' : 'text-silver'}`}
            >
              <Icon size={18} />
              {t.label}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="rounded-md border border-blood/40 bg-blood/10 px-3 py-2.5 text-sm text-blood-light">
          {error}
          <span className="mt-1 block text-xs text-silver">
            Set a TMDb API key in Settings to enable Trending.
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

      {data && (
        <>
          <Section title="Movies" count={movies.length} icon={Film}>
            {movies.length === 0 ? (
              <p className="card p-4 text-center text-sm text-silver">Nothing here right now.</p>
            ) : (
              movies.map((m) => (
                <Card key={`m${m.tmdbId}`} item={m} busy={lookingUp === m.tmdbId} onPick={() => pick(m)} />
              ))
            )}
          </Section>

          <Section title="Series" count={series.length} icon={Tv}>
            {series.length === 0 ? (
              <p className="card p-4 text-center text-sm text-silver">Nothing here right now.</p>
            ) : (
              series.map((s) => (
                <Card key={`s${s.tmdbId}`} item={s} busy={lookingUp === s.tmdbId} onPick={() => pick(s)} />
              ))
            )}
          </Section>
        </>
      )}

      {selected && <AddSheet type={selected.type} item={selected.item} onClose={() => setSelected(null)} />}
    </div>
  );
}
