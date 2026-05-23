import { useEffect, useRef, useState } from 'react';
import { Search, Film, Tv, User, Plus, Loader2, X } from 'lucide-react';
import { api } from '../api/client.js';
import { useToast } from './Toast.jsx';
import AddSheet from './AddSheet.jsx';
import { truncate } from '../lib/format.js';

const MODES = [
  { id: 'movie', label: 'Movie', icon: Film },
  { id: 'series', label: 'Series', icon: Tv },
  { id: 'person', label: 'Person', icon: User }
];

function ResultCard({ item, onAdd }) {
  const poster = item.images?.find((i) => i.coverType === 'poster')?.remoteUrl;
  return (
    <button
      onClick={onAdd}
      className="card flex w-full gap-3 p-3 text-left transition hover:border-gold/40"
    >
      <div className="h-28 w-[74px] shrink-0 overflow-hidden rounded-md bg-night-800">
        {poster ? (
          <img src={poster} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-silver/70">
            <Film size={24} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <h3 className="flex-1 font-semibold leading-tight text-parchment">{item.title}</h3>
          <span className="shrink-0 rounded-md bg-gold/15 px-1.5 py-0.5 text-gold">
            <Plus size={16} />
          </span>
        </div>
        <p className="text-xs text-silver">{item.year || 'Unknown year'}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-silver">
          {truncate(item.overview, 140) || 'No synopsis available.'}
        </p>
      </div>
    </button>
  );
}

function PersonCard({ person, onOpen }) {
  return (
    <button
      onClick={onOpen}
      className="card flex w-full items-center gap-3 p-3 text-left transition hover:border-gold/40"
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-night-800">
        {person.profile ? (
          <img src={person.profile} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-silver/60">
            <User size={24} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold leading-tight text-parchment">{person.name}</h3>
        {person.department && <p className="text-xs text-gold-light">{person.department}</p>}
        {person.knownFor?.length > 0 && (
          <p className="mt-0.5 text-xs text-silver">{truncate(person.knownFor.join(' · '), 60)}</p>
        )}
      </div>
    </button>
  );
}

function CreditCard({ item, busy, onAdd }) {
  const Icon = item.type === 'movie' ? Film : Tv;
  return (
    <button
      onClick={onAdd}
      disabled={busy}
      className="card flex w-full gap-3 p-2.5 text-left transition hover:border-gold/40 disabled:opacity-60"
    >
      <div className="h-20 w-[54px] shrink-0 overflow-hidden rounded bg-night-800">
        {item.poster ? (
          <img src={item.poster} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-silver/60">
            <Icon size={18} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-semibold leading-tight text-parchment">{item.title}</h4>
        <p className="text-xs text-silver">
          {item.year || '—'} · <span className="text-gold-light">{item.role}</span>
        </p>
      </div>
      <span className="self-center text-gold">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
      </span>
    </button>
  );
}

function PersonModal({ person, onClose, onPick, lookingUp }) {
  const [credits, setCredits] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .personCredits(person.id)
      .then((c) => !cancelled && setCredits(c))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [person.id]);

  const movies = credits?.movies || [];
  const series = credits?.series || [];

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center md:items-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-3xl border border-gold/20 bg-night-850 md:rounded-3xl">
        <div className="flex items-center gap-3 border-b border-gold/15 p-4">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-night-800">
            {person.profile && (
              <img src={person.profile} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-bold text-parchment">{person.name}</h3>
            {person.department && <p className="text-xs text-silver">{person.department}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-silver hover:text-parchment">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {error && <p className="text-sm text-blood-light">{error}</p>}
          {!credits && !error && (
            <div className="flex items-center gap-2 text-sm text-silver">
              <Loader2 size={16} className="animate-spin" /> Loading filmography…
            </div>
          )}
          {credits && movies.length === 0 && series.length === 0 && (
            <p className="text-center text-sm text-silver">No movies or series found.</p>
          )}
          {movies.length > 0 && (
            <div className="space-y-2">
              <h4 className="px-1 text-xs font-bold uppercase tracking-wide text-parchment/90">
                Movies ({movies.length})
              </h4>
              {movies.map((m) => (
                <CreditCard key={`m${m.tmdbId}`} item={m} busy={lookingUp === m.tmdbId} onAdd={() => onPick(m)} />
              ))}
            </div>
          )}
          {series.length > 0 && (
            <div className="space-y-2">
              <h4 className="px-1 text-xs font-bold uppercase tracking-wide text-parchment/90">
                Series ({series.length})
              </h4>
              {series.map((s) => (
                <CreditCard key={`s${s.tmdbId}`} item={s} busy={lookingUp === s.tmdbId} onAdd={() => onPick(s)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SearchTab() {
  const toast = useToast();
  const [mode, setMode] = useState('movie');
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [lookingUp, setLookingUp] = useState(null);
  const [selected, setSelected] = useState(null);
  const debounce = useRef(null);

  function runSearch(q, m) {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setError(null);
    const request = m === 'person' ? api.searchPerson(q) : api.search(m, q);
    request
      .then((res) => {
        setResults(res || []);
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
    debounce.current = setTimeout(() => runSearch(term, mode), 450);
    return () => clearTimeout(debounce.current);
  }, [term, mode]);

  // Resolve a TMDb title (from a person's filmography) into a real Radarr/Sonarr
  // object, then open the Add sheet.
  async function resolveAndAdd(item) {
    setLookingUp(item.tmdbId);
    try {
      const t = item.type === 'movie' ? `tmdb:${item.tmdbId}` : item.title;
      let res = await api.search(item.type, t);
      if ((!res || !res.length) && item.type === 'movie') res = await api.search('movie', item.title);
      if (res && res.length) setSelected({ type: item.type, item: res[0] });
      else toast.error(`Couldn't find "${item.title}" in ${item.type === 'movie' ? 'Radarr' : 'Sonarr'}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLookingUp(null);
    }
  }

  const placeholders = { movie: 'movies', series: 'series', person: 'actors & directors' };

  return (
    <div className="space-y-4">
      {/* Movie / Series / Person toggle */}
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-night-850 p-1">
        {MODES.map((t) => {
          const Icon = t.icon;
          const isActive = mode === t.id;
          return (
            <button
              key={t.id}
              onClick={() => {
                setMode(t.id);
                setResults([]);
                setSearched(false);
              }}
              className={`flex items-center justify-center gap-2 rounded-md py-2.5 text-sm font-semibold transition
                          ${isActive ? 'bg-gold text-night-950' : 'text-silver'}`}
            >
              <Icon size={18} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Search input */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-silver" />
        <input
          autoFocus
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={`Search ${placeholders[mode]}…`}
          className="input pl-10"
        />
        {loading && (
          <Loader2 size={18} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gold" />
        )}
      </div>

      {error && (
        <p className="rounded-md border border-blood/40 bg-blood/10 px-3 py-2.5 text-sm text-blood-light">
          {error}
          {mode === 'person' && (
            <span className="mt-1 block text-xs text-silver">
              Person search uses TMDb — set a TMDb API key in Settings.
            </span>
          )}
        </p>
      )}

      <div className="space-y-2.5">
        {loading &&
          results.length === 0 &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card flex gap-3 p-3">
              <div className="skeleton h-28 w-[74px]" />
              <div className="flex-1 space-y-2 py-1">
                <div className="skeleton h-4 w-2/3" />
                <div className="skeleton h-3 w-1/4" />
                <div className="skeleton h-3 w-full" />
              </div>
            </div>
          ))}

        {!loading && searched && results.length === 0 && !error && (
          <p className="py-10 text-center text-sm text-silver">No matches for “{term}”.</p>
        )}

        {mode === 'person'
          ? results.map((p) => (
              <PersonCard key={p.id} person={p} onOpen={() => setSelectedPerson(p)} />
            ))
          : results.map((item) => (
              <ResultCard
                key={item.tmdbId || item.tvdbId || item.titleSlug}
                item={item}
                onAdd={() => setSelected({ type: mode, item })}
              />
            ))}
      </div>

      {!searched && !loading && (
        <p className="py-10 text-center text-sm text-silver">
          {mode === 'person'
            ? 'Search a name to browse what they acted in or directed.'
            : 'Hunt for treasure — search a title to add it.'}
        </p>
      )}

      {selectedPerson && (
        <PersonModal
          person={selectedPerson}
          onClose={() => setSelectedPerson(null)}
          onPick={resolveAndAdd}
          lookingUp={lookingUp}
        />
      )}

      {selected && (
        <AddSheet type={selected.type} item={selected.item} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
