import { useCallback, useEffect, useState } from 'react';
import { X, Loader2, Search, Check, Tv, Download } from 'lucide-react';
import { api } from '../api/client.js';
import { useToast } from './Toast.jsx';
import { bytes } from '../lib/format.js';

// Seasons of a series already in Sonarr. This is the counterpart to picking an
// album instead of a whole discography: the series is in the library, but that
// says nothing about which seasons are actually on disk.
export default function SeasonSheet({ series, onClose }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await api.seriesSeasons(series.id));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [series.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Monitoring and searching go together: Sonarr discards a grab for a season
  // it isn't watching, so "Grab" does both.
  async function grab(season) {
    setBusy(season.seasonNumber);
    try {
      await api.setSeason(series.id, season.seasonNumber, { monitored: true, search: true });
      toast.success(`Searching season ${season.seasonNumber} of ${data.title}`);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function toggleMonitor(season) {
    setBusy(season.seasonNumber);
    try {
      await api.setSeason(series.id, season.seasonNumber, { monitored: !season.monitored });
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center md:items-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg animate-fade-in flex-col rounded-t-3xl border border-night-700/60 bg-night-850 shadow-card md:rounded-3xl">
        <div className="flex items-start gap-3 p-5 pb-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-bold text-parchment">
              {data?.title || series.title}
            </h3>
            <p className="text-sm text-silver">
              Already in Sonarr — pick a season to grab
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-silver hover:text-parchment">
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 pb-5">
          {error && (
            <p className="rounded-xl border border-blood/40 bg-blood/10 px-3 py-2.5 text-sm text-blood-light">
              {error}
            </p>
          )}
          {!data && !error && (
            <div className="flex items-center gap-2 py-6 text-sm text-silver">
              <Loader2 size={16} className="animate-spin" /> Loading seasons…
            </div>
          )}

          {data?.seasons?.map((s) => (
            <div key={s.seasonNumber} className="flex items-center gap-3 rounded-xl bg-night-900 p-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-night-800 text-sm font-bold text-parchment">
                {s.specials ? <Tv size={16} className="text-silver" /> : s.seasonNumber}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-parchment">
                  {s.specials ? 'Specials' : `Season ${s.seasonNumber}`}
                </p>
                <p className="text-xs text-silver">
                  {s.episodeFileCount}/{s.totalEpisodeCount} episodes
                  {s.sizeOnDisk > 0 ? ` · ${bytes(s.sizeOnDisk)}` : ''}
                  {!s.monitored ? ' · not monitored' : ''}
                </p>
              </div>

              {s.complete ? (
                <span className="flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-300">
                  <Check size={12} /> Complete
                </span>
              ) : (
                <div className="flex shrink-0 gap-1.5">
                  <button
                    onClick={() => toggleMonitor(s)}
                    disabled={busy === s.seasonNumber}
                    className="btn-ghost px-2 py-1.5 text-xs"
                    title={s.monitored ? 'Stop monitoring this season' : 'Monitor this season'}
                  >
                    {s.monitored ? 'Unmonitor' : 'Monitor'}
                  </button>
                  <button
                    onClick={() => grab(s)}
                    disabled={busy === s.seasonNumber}
                    className="btn-gold px-2.5 py-1.5 text-xs"
                    title="Monitor it and search the indexers now"
                  >
                    {busy === s.seasonNumber ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : s.episodeFileCount > 0 ? (
                      <Search size={13} />
                    ) : (
                      <Download size={13} />
                    )}
                    Grab
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
