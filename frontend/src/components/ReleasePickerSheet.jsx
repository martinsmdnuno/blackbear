import { useEffect, useState } from 'react';
import { X, Loader2, Download, Check, ArrowUp, ArrowDown, Package } from 'lucide-react';
import { api } from '../api/client.js';
import { useToast } from './Toast.jsx';
import { bytes, truncate } from '../lib/format.js';

// Interactive search à la Sonarr/Radarr: list every candidate release the
// indexers return — including ones the auto-picker rejected, with the reason —
// and let the user force-grab one. The escape hatch for items that stay stuck
// no matter how many automatic searches run.
//
// target: { type: 'movie', service: 'radarr', id, label }
//       | { type: 'episode', service: 'sonarr', id, label }
//       | { type: 'season', service: 'sonarr', seriesId, seasonNumber, label }

function ageLabel(days) {
  if (days == null) return '—';
  if (days < 1) return '<1d';
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days / 365)}y`;
}

function Badge({ children, tone = 'bg-night-700 text-silver' }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${tone}`}>
      {children}
    </span>
  );
}

function ReleaseRow({ release, busy, grabbed, onGrab }) {
  return (
    <div className={`card space-y-1.5 p-3 ${release.rejected ? 'opacity-80' : ''}`}>
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 break-all text-xs leading-snug text-parchment">
          {release.title}
        </p>
        <button
          onClick={onGrab}
          disabled={busy || grabbed}
          className={grabbed ? 'btn-ghost shrink-0 px-2.5 py-1.5 text-xs' : 'btn-gold shrink-0 px-2.5 py-1.5 text-xs'}
          title={release.rejected ? 'Grab anyway, overriding the rejection' : 'Send to the download client'}
        >
          {busy ? (
            <Loader2 size={13} className="animate-spin" />
          ) : grabbed ? (
            <Check size={13} />
          ) : (
            <Download size={13} />
          )}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {release.quality && <Badge tone="bg-gold/20 text-gold-light">{release.quality}</Badge>}
        <Badge>{bytes(release.size)}</Badge>
        <Badge>{ageLabel(release.ageDays)}</Badge>
        {release.protocol === 'torrent' && (
          <Badge
            tone={
              (release.seeders ?? 0) > 0
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-blood/20 text-blood-light'
            }
          >
            <ArrowUp size={11} /> {release.seeders ?? '?'}
            <ArrowDown size={11} /> {release.leechers ?? '?'}
          </Badge>
        )}
        {release.fullSeason && (
          <Badge tone="bg-sky-500/15 text-sky-300">
            <Package size={11} /> Season pack
          </Badge>
        )}
        <Badge>{truncate(release.indexer, 20)}</Badge>
      </div>

      {release.rejected && release.rejections.length > 0 && (
        <p className="text-[11px] leading-snug text-amber-300/90">
          {release.rejections.join(' · ')}
        </p>
      )}
    </div>
  );
}

export default function ReleasePickerSheet({ target, onClose }) {
  const toast = useToast();
  const [releases, setReleases] = useState(null);
  const [error, setError] = useState(null);
  const [grabbing, setGrabbing] = useState(null);
  const [grabbed, setGrabbed] = useState(() => new Set());
  const [showRejected, setShowRejected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res =
          target.type === 'movie'
            ? await api.movieReleases(target.id)
            : target.type === 'episode'
              ? await api.episodeReleases(target.id)
              : await api.seasonReleases(target.seriesId, target.seasonNumber);
        if (!cancelled) setReleases(res);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target]);

  async function grab(release) {
    setGrabbing(release.guid);
    try {
      await api.grabRelease(target.service, release);
      setGrabbed((s) => new Set(s).add(release.guid));
      toast.success('Release sent to the download client');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setGrabbing(null);
    }
  }

  const approved = releases?.filter((r) => !r.rejected) || [];
  const rejected = releases?.filter((r) => r.rejected) || [];
  const visible = showRejected ? releases || [] : approved;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center md:items-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-2xl animate-fade-in flex-col rounded-t-3xl border border-night-700/60 bg-night-850 shadow-card md:rounded-3xl">
        <div className="flex items-start gap-3 p-5 pb-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-bold text-parchment">Pick a release</h3>
            <p className="truncate text-sm text-silver">{target.label}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-silver hover:text-parchment">
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-5 pb-5">
          {!releases && !error && (
            <div className="flex flex-col items-center gap-3 py-10 text-sm text-silver">
              <Loader2 size={22} className="animate-spin text-gold" />
              Searching all indexers — this can take a minute…
            </div>
          )}

          {error && (
            <p className="rounded-md border border-blood/40 bg-blood/10 px-3 py-2.5 text-sm text-blood-light">
              {error}
            </p>
          )}

          {releases && releases.length === 0 && (
            <p className="card p-4 text-center text-sm text-silver">
              The indexers returned nothing for this one.
            </p>
          )}

          {releases && releases.length > 0 && (
            <>
              <div className="flex items-center justify-between px-1 text-xs text-silver">
                <span>
                  {approved.length} approved · {rejected.length} rejected
                </span>
                {rejected.length > 0 && (
                  <button
                    onClick={() => setShowRejected((v) => !v)}
                    className="font-semibold text-gold-light"
                  >
                    {showRejected ? 'Hide rejected' : 'Show rejected'}
                  </button>
                )}
              </div>
              {visible.length === 0 && (
                <p className="card p-4 text-center text-sm text-silver">
                  Every release was rejected — show them to grab one anyway.
                </p>
              )}
              {visible.map((r) => (
                <ReleaseRow
                  key={r.guid}
                  release={r}
                  busy={grabbing === r.guid}
                  grabbed={grabbed.has(r.guid)}
                  onGrab={() => grab(r)}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
