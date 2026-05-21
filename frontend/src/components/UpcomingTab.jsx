import { useCallback, useEffect, useState } from 'react';
import { Film, Tv, RefreshCw, CalendarClock } from 'lucide-react';
import { api } from '../api/client.js';
import { truncate, untilLabel, shortDate } from '../lib/format.js';

const DATE_TYPE_LABEL = {
  digital: 'Digital',
  physical: 'Physical',
  cinema: 'In cinemas'
};

// Soonest items get a brighter, gold "in X days" pill; further-out ones stay muted.
function whenPill(dateStr) {
  const days = Math.round((new Date(dateStr).getTime() - Date.now()) / 86400000);
  const soon = days <= 14;
  return (
    <span
      className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
        soon ? 'bg-gold/20 text-gold-light' : 'bg-night-700 text-silver'
      }`}
    >
      {untilLabel(dateStr)}
    </span>
  );
}

function Poster({ src, fallback: Fallback }) {
  return (
    <div className="h-24 w-16 shrink-0 overflow-hidden rounded-md bg-night-800">
      {src ? (
        <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center text-silver/60">
          <Fallback size={20} />
        </div>
      )}
    </div>
  );
}

function MovieCard({ m }) {
  return (
    <div className="card flex gap-3 p-3">
      <Poster src={m.poster} fallback={Film} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 font-semibold leading-tight text-parchment">{m.title}</p>
          {whenPill(m.date)}
        </div>
        <p className="text-xs text-silver">{m.year || ''}</p>
        <p className="mt-2 text-xs text-silver">
          <span className="rounded bg-night-800 px-1.5 py-0.5 text-parchment/90">
            {DATE_TYPE_LABEL[m.dateType] || 'Release'}
          </span>
          <span className="ml-2">{shortDate(m.date)}</span>
        </p>
      </div>
    </div>
  );
}

function EpisodeCard({ e }) {
  const code = `S${String(e.season).padStart(2, '0')}E${String(e.episode).padStart(2, '0')}`;
  return (
    <div className="card flex gap-3 p-3">
      <Poster src={e.poster} fallback={Tv} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 font-semibold leading-tight text-parchment">{e.series}</p>
          {whenPill(e.date)}
        </div>
        <p className="text-xs text-silver">
          <span className="text-gold-light">{code}</span>
          {e.title ? ` · ${truncate(e.title, 40)}` : ''}
        </p>
        <p className="mt-2 text-xs text-silver">{shortDate(e.date)}</p>
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

export default function UpcomingTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.pipeline();
      setData(res);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const movies = data?.movies?.items || [];
  const episodes = data?.episodes?.items || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs text-silver">
          <CalendarClock size={14} /> Monitored titles awaiting release
        </p>
        <button onClick={load} disabled={loading} className="btn-ghost px-3 py-1.5 text-xs">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <p className="rounded-md border border-blood/40 bg-blood/10 px-3 py-2.5 text-sm text-blood-light">
          {error}
        </p>
      )}

      {!data && !error && (
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card flex gap-3 p-3">
              <div className="skeleton h-24 w-16" />
              <div className="flex-1 space-y-2 py-1">
                <div className="skeleton h-4 w-2/3" />
                <div className="skeleton h-3 w-1/4" />
                <div className="skeleton h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {data && (
        <>
          <Section title="Movies" count={movies.length} icon={Film}>
            {data.movies.error ? (
              <p className="rounded-md border border-blood/30 bg-blood/10 px-3 py-2 text-xs text-blood-light">
                Radarr: {data.movies.error}
              </p>
            ) : movies.length === 0 ? (
              <p className="card p-4 text-center text-sm text-silver">
                Nothing on the horizon — no monitored movies awaiting release.
              </p>
            ) : (
              movies.map((m) => <MovieCard key={m.id} m={m} />)
            )}
          </Section>

          <Section title="Episodes" count={episodes.length} icon={Tv}>
            {data.episodes.error ? (
              <p className="rounded-md border border-blood/30 bg-blood/10 px-3 py-2 text-xs text-blood-light">
                Sonarr: {data.episodes.error}
              </p>
            ) : episodes.length === 0 ? (
              <p className="card p-4 text-center text-sm text-silver">
                No upcoming episodes scheduled.
              </p>
            ) : (
              episodes.map((e) => <EpisodeCard key={e.id} e={e} />)
            )}
          </Section>
        </>
      )}
    </div>
  );
}
