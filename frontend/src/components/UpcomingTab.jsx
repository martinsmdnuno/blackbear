import { useCallback, useEffect, useMemo, useState } from 'react';
import { Film, Tv, RefreshCw, CalendarClock, Search, RotateCcw, Loader2, ScanSearch } from 'lucide-react';
import { api } from '../api/client.js';
import { useToast } from './Toast.jsx';
import ReleasePickerSheet from './ReleasePickerSheet.jsx';
import { truncate, untilLabel, shortDate } from '../lib/format.js';

const DATE_TYPE_LABEL = {
  digital: 'Digital',
  physical: 'Physical',
  cinema: 'In cinemas'
};

// Pill for a missing item, split by what's actually wrong:
//   - "Stalled"     (amber) — a download exists but isn't moving
//   - "Downloading" (sky)   — a download is in progress, no action needed
//   - "No sources"  (red)   — nothing found on the indexers yet
function missingPill(queue) {
  if (queue?.state === 'stalled') {
    return (
      <span className="shrink-0 rounded-md bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
        Stalled
      </span>
    );
  }
  if (queue) {
    return (
      <span className="shrink-0 rounded-md bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-300">
        Downloading
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-md bg-blood/20 px-2 py-0.5 text-[11px] font-semibold text-blood-light">
      No sources
    </span>
  );
}

// Pill: missing states above, gold for soon-coming, muted silver otherwise.
function whenPill(item) {
  if (item.missing) return missingPill(item.queue);
  const days = Math.round((new Date(item.date).getTime() - Date.now()) / 86400000);
  const soon = days <= 14;
  return (
    <span
      className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
        soon ? 'bg-gold/20 text-gold-light' : 'bg-night-700 text-silver'
      }`}
    >
      {untilLabel(item.date)}
    </span>
  );
}

// Search again (no sources) or renew the stuck download (stalled), plus an
// interactive "Pick" that lists every candidate release for manual selection —
// the way out when automatic searches keep failing. Hidden while a healthy
// download is in progress.
function RenewAction({ item, busy, onSearch, onRenew, onPick }) {
  if (!item.missing) return null;
  if (item.queue && item.queue.state !== 'stalled') return null;
  const stalled = item.queue?.state === 'stalled';
  return (
    <div className="mt-2 flex gap-2">
      <button
        onClick={stalled ? onRenew : onSearch}
        disabled={busy}
        className="btn-ghost px-2.5 py-1.5 text-xs"
        title={stalled ? 'Drop the stuck download, blocklist it and search again' : 'Search indexers now'}
      >
        {busy ? (
          <Loader2 size={13} className="animate-spin" />
        ) : stalled ? (
          <RotateCcw size={13} />
        ) : (
          <Search size={13} />
        )}
        {stalled ? 'Renew' : 'Search'}
      </button>
      <button
        onClick={onPick}
        disabled={busy}
        className="btn-ghost px-2.5 py-1.5 text-xs"
        title="List every release the indexers have and pick one manually"
      >
        <ScanSearch size={13} />
        Pick
      </button>
    </div>
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

function MovieCard({ m, busy, onSearch, onRenew, onPick }) {
  return (
    <div className="card flex gap-3 p-3">
      <Poster src={m.poster} fallback={Film} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 font-semibold leading-tight text-parchment">{m.title}</p>
          {whenPill(m)}
        </div>
        <p className="text-xs text-silver">{m.year || ''}</p>
        <p className="mt-2 text-xs text-silver">
          <span className="rounded bg-night-800 px-1.5 py-0.5 text-parchment/90">
            {DATE_TYPE_LABEL[m.dateType] || 'Release'}
          </span>
          <span className="ml-2">{shortDate(m.date)}</span>
        </p>
        <RenewAction item={m} busy={busy} onSearch={onSearch} onRenew={onRenew} onPick={onPick} />
      </div>
    </div>
  );
}

function EpisodeCard({ e, busy, onSearch, onRenew, onPick }) {
  const code = `S${String(e.season).padStart(2, '0')}E${String(e.episode).padStart(2, '0')}`;
  return (
    <div className="card flex gap-3 p-3">
      <Poster src={e.poster} fallback={Tv} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 font-semibold leading-tight text-parchment">{e.series}</p>
          {whenPill(e)}
        </div>
        <p className="text-xs text-silver">
          <span className="text-gold-light">{code}</span>
          {e.title ? ` · ${truncate(e.title, 40)}` : ''}
        </p>
        <p className="mt-2 text-xs text-silver">{shortDate(e.date)}</p>
        <RenewAction item={e} busy={busy} onSearch={onSearch} onRenew={onRenew} onPick={onPick} />
      </div>
    </div>
  );
}

// One chip per season with 2+ missing episodes: a single SeasonSearch command
// covers season packs and is far lighter on indexers than per-episode searches.
// The ScanSearch half opens the interactive picker for the season instead.
function SeasonChips({ groups, busyKey, onSearch, onPick }) {
  if (!groups.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {groups.map((g) => (
        <div key={g.key} className="flex overflow-hidden rounded-lg">
          <button
            onClick={() => onSearch(g)}
            disabled={busyKey === g.key}
            className="btn-ghost rounded-none px-2.5 py-1.5 text-xs"
            title={`Search the whole season on the indexers (${g.count} missing episodes)`}
          >
            {busyKey === g.key ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Search size={13} />
            )}
            {truncate(g.series, 24)} · S{String(g.season).padStart(2, '0')} ({g.count})
          </button>
          <button
            onClick={() => onPick(g)}
            disabled={busyKey === g.key}
            className="btn-ghost rounded-none border-l border-night-700/60 px-2 py-1.5 text-xs"
            title="List season releases and pick one manually"
          >
            <ScanSearch size={13} />
          </button>
        </div>
      ))}
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
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState(null);
  const [picker, setPicker] = useState(null);

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

  // Seasons with 2+ missing episodes still lacking an active download.
  const seasonGroups = useMemo(() => {
    const map = new Map();
    for (const e of episodes) {
      if (!e.missing || e.queue) continue;
      const key = `${e.seriesId}:${e.season}`;
      const g = map.get(key) || { key, seriesId: e.seriesId, series: e.series, season: e.season, count: 0 };
      g.count += 1;
      map.set(key, g);
    }
    return [...map.values()].filter((g) => g.count >= 2).sort((a, b) => b.count - a.count);
  }, [episodes]);

  async function run(key, fn, successMsg) {
    setBusyKey(key);
    try {
      await fn();
      toast.success(successMsg);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyKey(null);
    }
  }

  const searchMovie = (m) =>
    run(`movie:${m.id}`, () => api.renewMovie(m.id), `Searching indexers for "${m.title}"`);
  const renewMovie = (m) =>
    run(
      `movie:${m.id}`,
      () => api.renewQueue('radarr', m.queue.id, m.queue.downloadId),
      `Renewing "${m.title}" — old download blocklisted, searching again`
    );
  const searchEpisode = (e) =>
    run(`ep:${e.id}`, () => api.renewEpisode(e.id), `Searching indexers for ${e.series}`);
  const renewEpisode = (e) =>
    run(
      `ep:${e.id}`,
      () => api.renewQueue('sonarr', e.queue.id, e.queue.downloadId),
      `Renewing ${e.series} — old download blocklisted, searching again`
    );
  const searchSeason = (g) =>
    run(
      g.key,
      () => api.renewSeason(g.seriesId, g.season),
      `Searching season ${g.season} of ${g.series}`
    );

  const pickMovie = (m) =>
    setPicker({ type: 'movie', service: 'radarr', id: m.id, label: `${m.title}${m.year ? ` (${m.year})` : ''}` });
  const pickEpisode = (e) =>
    setPicker({
      type: 'episode',
      service: 'sonarr',
      id: e.id,
      label: `${e.series} · S${String(e.season).padStart(2, '0')}E${String(e.episode).padStart(2, '0')}`
    });
  const pickSeason = (g) =>
    setPicker({
      type: 'season',
      service: 'sonarr',
      seriesId: g.seriesId,
      seasonNumber: g.season,
      label: `${g.series} · Season ${g.season}`
    });

  // Refresh after the picker closes — a grab puts the item in the queue.
  const closePicker = () => {
    setPicker(null);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs text-silver">
          <CalendarClock size={14} /> No sources (red) · stalled (amber) + upcoming
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
              movies.map((m) => (
                <MovieCard
                  key={m.id}
                  m={m}
                  busy={busyKey === `movie:${m.id}`}
                  onSearch={() => searchMovie(m)}
                  onRenew={() => renewMovie(m)}
                  onPick={() => pickMovie(m)}
                />
              ))
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
              <>
                <SeasonChips
                  groups={seasonGroups}
                  busyKey={busyKey}
                  onSearch={searchSeason}
                  onPick={pickSeason}
                />
                {episodes.map((e) => (
                  <EpisodeCard
                    key={e.id}
                    e={e}
                    busy={busyKey === `ep:${e.id}`}
                    onSearch={() => searchEpisode(e)}
                    onRenew={() => renewEpisode(e)}
                    onPick={() => pickEpisode(e)}
                  />
                ))}
              </>
            )}
          </Section>
        </>
      )}

      {picker && <ReleasePickerSheet target={picker} onClose={closePicker} />}
    </div>
  );
}
