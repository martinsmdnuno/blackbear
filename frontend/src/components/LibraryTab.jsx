import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Trash2,
  RefreshCw,
  Loader2,
  ShieldCheck,
  Hourglass,
  HardDrive,
  Film,
  Tv
} from 'lucide-react';
import { api } from '../api/client.js';
import { useToast } from './Toast.jsx';
import { bytes, truncate } from '../lib/format.js';

function seededLabel(hours) {
  if (hours >= 48) return `${Math.round(hours / 24)}d`;
  return `${hours}h`;
}

function reasonPill(item) {
  if (item.importing) {
    return (
      <span className="shrink-0 rounded-md bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
        Importing
      </span>
    );
  }
  if (item.reason === 'ratio') {
    return (
      <span className="shrink-0 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
        Ratio met
      </span>
    );
  }
  if (item.reason === 'time') {
    return (
      <span className="shrink-0 rounded-md bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-300">
        Seed time met
      </span>
    );
  }
  return null;
}

function DeleteButton({ onClick, busy, active, small = false }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`btn-danger shrink-0 ${small ? 'px-2 py-1' : 'px-2.5 py-1.5'} text-xs`}
      title="Delete everywhere (library + torrent + files)"
    >
      {active ? (
        <Loader2 size={13} className="animate-spin" />
      ) : (
        <Trash2 size={13} />
      )}
    </button>
  );
}

function TorrentRow({ item, thresholds, showPill = true, action }) {
  const meta = [
    bytes(item.size),
    `ratio ${item.ratio.toFixed(2)} / ${thresholds.ratio.toFixed(1)}`,
    `seeded ${seededLabel(item.seededHours)} / ${seededLabel(thresholds.seedHours)}`
  ].join(' · ');
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg bg-night-900 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-parchment" title={item.name}>
          {item.name}
        </p>
        <p className="mt-0.5 truncate text-xs text-silver">{meta}</p>
      </div>
      <span className="hidden sm:contents">{showPill && reasonPill(item)}</span>
      {action}
    </div>
  );
}

// Series → seasons → episode torrents, sized and sorted for display.
function groupSeries(items) {
  const map = new Map();
  for (const i of items) {
    const key = (i.seriesTitle || i.name).toLowerCase();
    if (!map.has(key)) {
      map.set(key, { title: i.seriesTitle || i.name, size: 0, items: [], seasons: new Map() });
    }
    const g = map.get(key);
    g.size += i.size || 0;
    g.items.push(i);
    const sk = i.season ?? -1;
    if (!g.seasons.has(sk)) g.seasons.set(sk, []);
    g.seasons.get(sk).push(i);
  }
  return [...map.values()]
    .map((g) => ({
      ...g,
      seasons: [...g.seasons.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([season, eps]) => ({
          season,
          items: eps.sort((a, b) => a.name.localeCompare(b.name)),
          size: eps.reduce((s, e) => s + (e.size || 0), 0)
        }))
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export default function LibraryTab() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null); // key of the delete in flight
  const [media, setMedia] = useState('movies');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.seeding());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const items = data?.items || [];
  const movies = useMemo(() => items.filter((i) => i.mediaType !== 'series'), [items]);
  const series = useMemo(() => items.filter((i) => i.mediaType === 'series'), [items]);
  const active = media === 'movies' ? movies : series;
  const ready = useMemo(() => active.filter((i) => i.eligible), [active]);
  const waiting = useMemo(() => active.filter((i) => !i.eligible), [active]);
  const readySize = useMemo(() => ready.reduce((s, i) => s + (i.size || 0), 0), [ready]);
  const seriesGroups = useMemo(
    () => (media === 'series' ? groupSeries(ready) : []),
    [media, ready]
  );

  async function remove(itemsToDelete, key) {
    const label =
      itemsToDelete.length === 1
        ? `“${truncate(itemsToDelete[0].name, 60)}”`
        : `${itemsToDelete.length} torrents`;
    const total = bytes(itemsToDelete.reduce((s, i) => s + (i.size || 0), 0));
    if (
      !window.confirm(
        `Delete ${label} everywhere (${total})?\n\n` +
          'Removes the torrent and its files, plus the movie/episodes from your ' +
          'library (Radarr/Sonarr, files included). It will also disappear from Jellyfin.'
      )
    )
      return;
    setDeleting(key);
    try {
      const res = await api.seedingDelete(itemsToDelete.map((i) => i.hash));
      if (res.deleted.length) {
        const fromLibrary = res.deleted.filter((d) => d.library).length;
        toast.success(
          `Removed ${res.deleted.length} torrent(s)` +
            (fromLibrary ? ` (${fromLibrary} also from the library)` : '') +
            ` — freed ${bytes(res.deleted.reduce((s, d) => s + (d.size || 0), 0))}`
        );
      }
      if (res.skipped.length) {
        toast.error(`Skipped ${res.skipped.length}: ${res.skipped[0].reason}`);
      }
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(null);
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton h-16" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p className="rounded-xl border border-blood/40 bg-blood/10 px-3 py-2.5 text-sm text-blood-light">
          {error}
        </p>
        <button onClick={load} className="btn-ghost text-sm">
          <RefreshCw size={14} /> Try again
        </button>
      </div>
    );
  }

  const th = data?.thresholds || { ratio: 1, seedHours: 168 };
  const readyCount = (list) => list.filter((i) => i.eligible).length;

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
        <span className="inline-flex items-center gap-1.5 text-parchment">
          <HardDrive size={15} className="shrink-0 text-gold" />
          {ready.length} ready · up to {bytes(readySize)}
        </span>
        <span className="inline-flex items-center gap-1.5 text-silver">
          <Hourglass size={15} className="shrink-0" />
          {waiting.length} still seeding
        </span>
        <span className="inline-flex items-center gap-1.5 text-silver">
          <ShieldCheck size={15} className="shrink-0 text-emerald-300" />
          {data?.protectedCount ?? 0} Portugas protected
        </span>
        <button
          onClick={load}
          disabled={loading}
          className="btn-ghost ml-auto px-2.5 py-1.5 text-xs"
          title="Refresh"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        </button>
      </div>

      {/* Movies / Series switch */}
      <div className="flex gap-2">
        <button
          onClick={() => setMedia('movies')}
          className={`${media === 'movies' ? 'btn-gold' : 'btn-ghost'} flex-1 px-3 py-2 text-sm sm:flex-none`}
        >
          <Film size={15} /> Movies ({readyCount(movies)})
        </button>
        <button
          onClick={() => setMedia('series')}
          className={`${media === 'series' ? 'btn-gold' : 'btn-ghost'} flex-1 px-3 py-2 text-sm sm:flex-none`}
        >
          <Tv size={15} /> Series ({readyCount(series)})
        </button>
      </div>

      {/* Ready to remove */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-silver">
            Ready to remove
          </h3>
          {ready.length > 1 && (
            <button
              onClick={() => remove(ready, 'all')}
              disabled={deleting !== null}
              className="btn-danger px-3 py-1.5 text-xs"
            >
              {deleting === 'all' ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Trash2 size={13} />
              )}
              Delete all ({ready.length})
            </button>
          )}
        </div>

        {ready.length === 0 ? (
          <p className="rounded-lg bg-night-900 px-3 py-3 text-sm text-silver">
            Nothing to clean up here — every finished torrent is still earning its seed time or
            ratio.
          </p>
        ) : media === 'movies' ? (
          ready.map((item) => (
            <TorrentRow
              key={item.hash}
              item={item}
              thresholds={th}
              action={
                <DeleteButton
                  onClick={() => remove([item], item.hash)}
                  busy={deleting !== null}
                  active={deleting === item.hash}
                />
              }
            />
          ))
        ) : (
          seriesGroups.map((g) => (
            <div key={g.title} className="card space-y-3 p-3">
              <div className="flex min-w-0 items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-parchment" title={g.title}>
                    {g.title}
                  </p>
                  <p className="text-xs text-silver">
                    {g.items.length} torrent{g.items.length === 1 ? '' : 's'} · {bytes(g.size)}
                  </p>
                </div>
                <button
                  onClick={() => remove(g.items, `series:${g.title}`)}
                  disabled={deleting !== null}
                  className="btn-danger shrink-0 px-2.5 py-1.5 text-xs"
                >
                  {deleting === `series:${g.title}` ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Trash2 size={13} />
                  )}
                  All
                </button>
              </div>

              {g.seasons.map((s) => (
                <div key={s.season} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gold-light">
                      {s.season === -1 ? 'Other' : `Season ${s.season}`}
                    </p>
                    <span className="text-[11px] text-silver">
                      {s.items.length} · {bytes(s.size)}
                    </span>
                    {s.items.length > 1 && (
                      <button
                        onClick={() => remove(s.items, `season:${g.title}:${s.season}`)}
                        disabled={deleting !== null}
                        className="btn-ghost ml-auto px-2 py-1 text-[11px]"
                      >
                        {deleting === `season:${g.title}:${s.season}` ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Trash2 size={12} />
                        )}
                        Season
                      </button>
                    )}
                  </div>
                  {s.items.map((item) => (
                    <TorrentRow
                      key={item.hash}
                      item={item}
                      thresholds={th}
                      showPill={false}
                      action={
                        <DeleteButton
                          small
                          onClick={() => remove([item], item.hash)}
                          busy={deleting !== null}
                          active={deleting === item.hash}
                        />
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
          ))
        )}
      </section>

      {/* Still seeding */}
      {waiting.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-silver">
            Still seeding
          </h3>
          {waiting.map((item) => (
            <TorrentRow key={item.hash} item={item} thresholds={th} action={null} />
          ))}
        </section>
      )}

      <p className="text-xs leading-relaxed text-silver">
        Torrents appear here once they hit ratio {th.ratio.toFixed(1)} or{' '}
        {Math.round(th.seedHours / 24)} days of seeding — the same Hit &amp; Run-safe floors the
        auto cleanup uses. Portugas torrents are <span className="text-parchment">never</span>{' '}
        listed or deletable from this screen, and every delete is re-checked on the server.
        Deleting removes the title <span className="text-parchment">everywhere</span>: the
        torrent and its files, the Radarr movie or Sonarr episodes (files included, episodes
        unmonitored so nothing gets re-downloaded), and Jellyfin is refreshed so it disappears
        there too.
      </p>
    </div>
  );
}
