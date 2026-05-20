import { useEffect, useRef, useState } from 'react';
import { Search, Film, Tv, Plus, Loader2 } from 'lucide-react';
import { api } from '../api/client.js';
import AddSheet from './AddSheet.jsx';
import { truncate } from '../lib/format.js';

function ResultCard({ item, onAdd }) {
  const poster = item.images?.find((i) => i.coverType === 'poster')?.remoteUrl;
  return (
    <button
      onClick={onAdd}
      className="card flex w-full gap-3 p-3 text-left transition hover:border-gold/40"
    >
      <div className="h-28 w-[74px] shrink-0 overflow-hidden rounded-lg bg-night-800">
        {poster ? (
          <img src={poster} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-600">
            <Film size={24} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <h3 className="flex-1 font-semibold leading-tight text-slate-100">{item.title}</h3>
          <span className="shrink-0 rounded-md bg-gold/15 px-1.5 py-0.5 text-gold">
            <Plus size={16} />
          </span>
        </div>
        <p className="text-xs text-slate-400">{item.year || 'Unknown year'}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
          {truncate(item.overview, 140) || 'No synopsis available.'}
        </p>
      </div>
    </button>
  );
}

export default function SearchTab() {
  const [type, setType] = useState('movie');
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState(null);
  const debounce = useRef(null);

  function runSearch(q, t) {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setError(null);
    api
      .search(t, q)
      .then((res) => {
        setResults(res);
        setSearched(true);
      })
      .catch((err) => {
        setError(err.message);
        setResults([]);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => runSearch(term, type), 450);
    return () => clearTimeout(debounce.current);
  }, [term, type]);

  return (
    <div className="space-y-4">
      {/* Movie / Series toggle */}
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-night-850 p-1">
        {[
          { id: 'movie', label: 'Movie', icon: Film },
          { id: 'series', label: 'Series', icon: Tv }
        ].map((t) => {
          const Icon = t.icon;
          const isActive = type === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setType(t.id)}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition
                          ${isActive ? 'bg-gold text-night-950' : 'text-slate-400'}`}
            >
              <Icon size={18} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Search input */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          autoFocus
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={`Search ${type === 'movie' ? 'movies' : 'series'}…`}
          className="input pl-10"
        />
        {loading && (
          <Loader2 size={18} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gold" />
        )}
      </div>

      {error && (
        <p className="rounded-xl border border-blood/40 bg-blood/10 px-3 py-2.5 text-sm text-blood-light">
          {error}
        </p>
      )}

      {/* Results */}
      <div className="space-y-2.5">
        {loading && results.length === 0 &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card flex gap-3 p-3">
              <div className="skeleton h-28 w-[74px]" />
              <div className="flex-1 space-y-2 py-1">
                <div className="skeleton h-4 w-2/3" />
                <div className="skeleton h-3 w-1/4" />
                <div className="skeleton h-3 w-full" />
                <div className="skeleton h-3 w-5/6" />
              </div>
            </div>
          ))}

        {!loading && searched && results.length === 0 && !error && (
          <p className="py-10 text-center text-sm text-slate-500">
            No matches for “{term}”.
          </p>
        )}

        {results.map((item) => (
          <ResultCard
            key={item.tmdbId || item.tvdbId || item.titleSlug}
            item={item}
            onAdd={() => setSelected(item)}
          />
        ))}
      </div>

      {!searched && !loading && (
        <p className="py-10 text-center text-sm text-slate-500">
          Hunt for treasure — search a title to add it.
        </p>
      )}

      {selected && <AddSheet type={type} item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
