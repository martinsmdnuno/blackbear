import { useEffect, useRef, useState } from 'react';
import {
  X,
  Loader2,
  Trash2,
  Lock,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MinusCircle,
  FlaskConical,
  Link2,
  ArrowLeft
} from 'lucide-react';
import { api } from '../api/client.js';
import { useToast } from './Toast.jsx';
import { bytes, duration } from '../lib/format.js';

// Delete one library title, everywhere it lives. Every option change asks the
// backend for a fresh dry-run plan — the steps, the space that really comes
// back and the private-tracker guards are computed server-side from live
// data, never guessed here.
//
// Stages: review → (confirm, for private trackers) → running → done

const SERVICE_LABEL = { radarr: 'Radarr', sonarr: 'Sonarr', lidarr: 'Lidarr' };
const TYPE_NOUN = { movie: 'movie', series: 'series', album: 'album' };

function Box({ tone, icon: Icon, title, children }) {
  const tones = {
    amber: 'border-amber-400/40 bg-amber-500/10 text-amber-300',
    red: 'border-blood/50 bg-blood/15 text-blood-light',
    muted: 'border-night-700 bg-night-900 text-silver'
  };
  return (
    <div className={`space-y-1.5 rounded-md border px-3 py-2.5 text-sm ${tones[tone]}`}>
      {title && (
        <p className="flex items-center gap-1.5 font-semibold">
          {Icon && <Icon size={15} className="shrink-0" />}
          {title}
        </p>
      )}
      <div className="space-y-1 text-xs leading-relaxed text-parchment/90">{children}</div>
    </div>
  );
}

function Check({ checked, disabled, onChange, label, hint }) {
  return (
    <label
      className={`flex items-start gap-2.5 rounded-md bg-night-900 px-3 py-2.5 ${
        disabled ? 'opacity-60' : 'cursor-pointer'
      }`}
    >
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 accent-[#C9A055]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-sm text-parchment">{label}</span>
        {hint && <span className="block text-xs text-silver">{hint}</span>}
      </span>
    </label>
  );
}

function stepLabel(step) {
  if (step.kind === 'torrent') return 'Remove the torrent from qBittorrent, with its files';
  const where = SERVICE_LABEL[step.service] || step.service;
  // Music deletes differently: the album record stays (Lidarr rebuilds it from
  // MusicBrainz anyway) and what goes are the track files, after unmonitoring.
  if (step.service === 'lidarr') {
    return step.deleteFiles
      ? 'Unmonitor the album in Lidarr and delete its track files'
      : 'Unmonitor the album in Lidarr (files kept)';
  }
  return (
    `Delete from ${where}${step.deleteFiles ? ', with the library files' : ' (files kept)'}` +
    (step.addExclusion ? ', and add an import exclusion' : '')
  );
}

function StepStatus({ status }) {
  if (status === 'ok') return <CheckCircle2 size={16} className="shrink-0 text-emerald-300" />;
  if (status === 'error') return <XCircle size={16} className="shrink-0 text-blood-light" />;
  if (status === 'skipped') return <MinusCircle size={16} className="shrink-0 text-silver" />;
  return <FlaskConical size={16} className="shrink-0 text-gold-light" />;
}

function StepList({ steps, withStatus = false }) {
  return (
    <ol className="space-y-1.5">
      {steps.map((s, i) => (
        <li key={`${s.kind}:${s.hash || s.id}`} className="flex gap-2.5 rounded-md bg-night-900 px-3 py-2">
          {withStatus ? (
            <StepStatus status={s.status} />
          ) : (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-night-700 text-[11px] font-semibold text-parchment">
              {i + 1}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm text-parchment">{stepLabel(s)}</p>
            <p className="truncate text-xs text-silver" title={s.name || s.title}>
              {s.kind === 'torrent'
                ? `${s.name} · ${bytes(s.size)}${s.tracker ? ` · ${s.tracker}` : ''}`
                : s.title}
            </p>
            {s.error && (
              <p className={`mt-0.5 text-xs ${s.status === 'error' ? 'text-blood-light' : 'text-silver'}`}>
                {s.error}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

// "Frees ≈ 27 GB", with the hardlink explanation that makes that number honest.
function SpaceSummary({ plan, keepSeeding }) {
  const f = plan.freed;
  const deletesTorrent = plan.steps.some((s) => s.kind === 'torrent');
  return (
    <div className="space-y-1.5 rounded-md bg-night-900 px-3 py-2.5">
      <p className="text-sm text-silver">
        Space freed:{' '}
        <span className="text-lg font-bold text-parchment">
          {f.exact ? '' : '≈ '}
          {bytes(f.bytes)}
        </span>
      </p>
      {f.hardlinked === true && deletesTorrent && f.sharedBytes > 0 && (
        <p className="flex gap-1.5 text-xs leading-relaxed text-silver">
          <Link2 size={13} className="mt-0.5 shrink-0 text-sky-300" />
          <span>
            The library files and the torrent are hardlinks — the same blocks on disk under two
            names. They count once: {bytes(f.bytes)}, not{' '}
            {bytes(f.torrentBytes + f.sharedBytes + f.exclusiveBytes)}.
          </span>
        </p>
      )}
      {f.heldBySeeding > 0 && (
        <p className="flex gap-1.5 text-xs leading-relaxed text-amber-300/90">
          <Link2 size={13} className="mt-0.5 shrink-0" />
          <span>
            {bytes(f.heldBySeeding)} stays on disk{keepSeeding ? ' while the torrent keeps seeding' : ''}:
            the torrent holds the same blocks as the library files, so nothing is freed until it
            goes too.
          </span>
        </p>
      )}
      {f.hardlinked === null && (
        <p className="text-xs leading-relaxed text-silver">
          Couldn&apos;t read these files on disk, so this is an estimate that assumes they are
          hardlinked to the torrent.
        </p>
      )}
    </div>
  );
}

export default function DeleteItemSheet({ item, simulate, onClose }) {
  const toast = useToast();
  const [keepSeeding, setKeepSeeding] = useState(false);
  const [addExclusion, setAddExclusion] = useState(false);
  const [preview, setPreview] = useState(null); // { item, plan } from the dry run
  const [previewError, setPreviewError] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [stage, setStage] = useState('review');
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState(null);
  const changed = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingPlan(true);
    setPreviewError(null);
    setStage('review');
    setTyped('');
    api
      .libraryDelete(item.type, item.id, {
        dryRun: true,
        deleteFiles: true,
        deleteTorrent: !keepSeeding,
        addExclusion
      })
      .then((res) => {
        if (cancelled) return;
        setPreview(res);
        // The server refuses to delete this torrent (Hit & Run floors, or it
        // can't verify it) — lock the "keep seeding" option on.
        if (res.plan.torrentGuard.allowed === false && !keepSeeding) setKeepSeeding(true);
      })
      .catch((err) => !cancelled && setPreviewError(err.message))
      .finally(() => !cancelled && setLoadingPlan(false));
    return () => {
      cancelled = true;
    };
  }, [item.type, item.id, keepSeeding, addExclusion]);

  const close = () => onClose(changed.current);
  const plan = preview?.plan;
  const torrents = preview?.item?.torrents || [];
  const locked = plan?.torrentGuard.allowed === false;
  const torrentSteps = plan?.steps.filter((s) => s.kind === 'torrent') || [];
  const privateTorrents = torrents.filter((t) => t.isPrivate);
  const needsSecondClick = torrentSteps.some((s) => s.isPrivate);
  const titleOk = typed.trim().toLowerCase() === item.title.trim().toLowerCase();
  const ready = plan && !loadingPlan && !plan.blocked;

  async function run() {
    setStage('running');
    try {
      const res = await api.libraryDelete(item.type, item.id, {
        dryRun: simulate,
        deleteFiles: true,
        deleteTorrent: !keepSeeding,
        addExclusion,
        confirmTitle: typed
      });
      if (simulate) {
        setResult({
          simulated: true,
          ok: true,
          steps: res.plan.steps.map((s) => ({ ...s, status: 'simulated' })),
          freed: res.plan.freed
        });
        toast.info('Simulation only — nothing was deleted');
      } else {
        changed.current = true;
        setResult(res);
        if (res.ok) toast.success(`Deleted “${item.title}” — freed ${bytes(res.freed.bytes)}`);
        else toast.error(`Deleting “${item.title}” partially failed — see the summary`);
      }
    } catch (err) {
      // A rejected request (409/400) ran nothing; a timeout may have run some
      // steps, so refresh the list either way when this was for real.
      if (!simulate) changed.current = true;
      setResult({ requestError: err.message });
    }
    setStage('done');
  }

  const primaryLabel = simulate ? 'Simulate delete' : 'Delete';

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center md:items-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={stage === 'running' ? undefined : close}
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg animate-fade-in flex-col rounded-t-3xl border border-night-700/60 bg-night-850 shadow-card md:rounded-3xl">
        <div className="flex items-start gap-3 p-5 pb-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-bold text-parchment">
              {stage === 'done' ? 'Result' : `Delete ${TYPE_NOUN[item.type] || 'item'}`}
            </h3>
            <p className="truncate text-sm text-silver">
              {item.artist ? `${item.artist} — ` : ''}
              {item.title}
              {item.year ? ` (${item.year})` : ''} · {bytes(item.sizeOnDisk)}
            </p>
          </div>
          <button
            onClick={close}
            disabled={stage === 'running'}
            className="rounded-lg p-1 text-silver hover:text-parchment disabled:opacity-40"
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-3">
          {simulate && stage !== 'done' && (
            <Box tone="muted" icon={FlaskConical} title="Simulation mode">
              <p>Nothing will be deleted — you&apos;ll see exactly what would happen.</p>
            </Box>
          )}

          {stage === 'done' && result && <ResultView result={result} />}

          {stage !== 'done' && (
            <>
              {!preview && loadingPlan && (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-silver">
                  <Loader2 size={18} className="animate-spin text-gold" /> Working out the plan…
                </div>
              )}

              {previewError && (
                <p className="rounded-md border border-blood/40 bg-blood/10 px-3 py-2.5 text-sm text-blood-light">
                  {previewError}
                </p>
              )}

              {plan && (
                <div className={`space-y-3 ${loadingPlan ? 'pointer-events-none opacity-60' : ''}`}>
                  {locked && plan.torrentGuard.reason === 'hnr' && (
                    <Box tone="red" icon={Lock} title="Torrent must keep seeding">
                      <p>
                        Portugas Hit &amp; Run rule: a torrent can only go once it reaches ratio{' '}
                        {plan.floors.ratio.toFixed(1)} or {Math.round(plan.floors.seedHours / 24)} days
                        seeded. You can still remove the title from the library.
                      </p>
                      {torrents
                        .filter((t) => t.protected && !t.hnr.met)
                        .map((t) => (
                          <p key={t.hash} className="truncate text-silver" title={t.name}>
                            ratio {t.ratio.toFixed(2)} · seeded {duration(t.seeding_time)} — {t.name}
                          </p>
                        ))}
                    </Box>
                  )}
                  {locked && plan.torrentGuard.reason !== 'hnr' && (
                    <Box tone="amber" icon={Lock} title="Torrent can't be touched">
                      <p>{plan.torrentGuard.message}</p>
                    </Box>
                  )}

                  <div className="space-y-1.5">
                    <Check
                      checked={keepSeeding}
                      disabled={locked || torrents.length === 0}
                      onChange={setKeepSeeding}
                      label="Keep the torrent seeding"
                      hint="Only removes the title from the library — the torrent stays alive."
                    />
                    {/* Lidarr has no album-level import exclusion, so the option
                        is hidden rather than shown doing nothing. */}
                    {item.type !== 'album' && (
                      <Check
                        checked={addExclusion}
                        onChange={setAddExclusion}
                        label="Add an import exclusion"
                        hint="Stops import lists from adding it back."
                      />
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-silver">
                      What will happen
                    </p>
                    <StepList steps={plan.steps} />
                    {keepSeeding &&
                      torrents.map((t) => (
                        <p key={t.hash} className="truncate px-1 text-xs text-silver" title={t.name}>
                          Kept seeding: {t.name}
                        </p>
                      ))}
                  </div>

                  <SpaceSummary plan={plan} keepSeeding={keepSeeding} />

                  {plan.warnings.length > 0 && (
                    <Box tone="muted" icon={AlertTriangle}>
                      {plan.warnings.map((w) => (
                        <p key={w}>{w}</p>
                      ))}
                    </Box>
                  )}

                  {torrentSteps.length > 0 && privateTorrents.length > 0 && (
                    <Box tone="amber" icon={ShieldAlert} title="Private tracker">
                      {privateTorrents.map((t) => (
                        <p key={t.hash}>
                          <span className="font-semibold text-amber-300">{t.tracker || 'unknown'}</span>{' '}
                          · ratio{' '}
                          <span className={t.ratio < 1 ? 'font-semibold text-blood-light' : ''}>
                            {t.ratio.toFixed(2)}
                          </span>{' '}
                          · seeded {duration(t.seeding_time)}
                        </p>
                      ))}
                      {plan.requiresTitle && (
                        <p className="font-semibold text-blood-light">
                          Below ratio 1.0 — deleting now counts against your ratio there.
                        </p>
                      )}
                    </Box>
                  )}

                  {plan.blocked && (
                    <p className="rounded-md border border-blood/40 bg-blood/10 px-3 py-2.5 text-sm text-blood-light">
                      {plan.blocked}
                    </p>
                  )}

                  {stage === 'confirm' && (
                    <div className="space-y-2 rounded-md border border-blood/40 bg-night-900 p-3">
                      <p className="text-sm font-semibold text-parchment">
                        Second confirmation — this removes a private-tracker torrent.
                      </p>
                      {plan.requiresTitle && (
                        <>
                          <p className="text-xs text-silver">
                            Type <span className="font-semibold text-parchment">{item.title}</span> to
                            confirm.
                          </p>
                          <input
                            className="input"
                            value={typed}
                            onChange={(e) => setTyped(e.target.value)}
                            aria-label="Type the title to confirm"
                            autoFocus
                          />
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex gap-2 border-t border-night-700/60 p-4">
          {stage === 'done' && (
            <button onClick={close} className="btn-gold flex-1">
              Close
            </button>
          )}
          {stage === 'review' && (
            <>
              <button onClick={close} className="btn-ghost flex-1">
                Cancel
              </button>
              <button
                onClick={() => (needsSecondClick ? setStage('confirm') : run())}
                disabled={!ready}
                className={
                  needsSecondClick
                    ? 'btn flex-1 bg-amber-500 text-night-950 hover:bg-amber-400'
                    : 'btn-danger flex-1'
                }
              >
                {needsSecondClick ? <ShieldAlert size={15} /> : <Trash2 size={15} />}
                {needsSecondClick ? 'Continue' : primaryLabel}
              </button>
            </>
          )}
          {stage === 'confirm' && (
            <>
              <button onClick={() => setStage('review')} className="btn-ghost flex-1">
                <ArrowLeft size={15} /> Back
              </button>
              <button
                onClick={run}
                disabled={!ready || (plan.requiresTitle && !titleOk)}
                className={
                  plan?.requiresTitle
                    ? 'btn-danger flex-1'
                    : 'btn flex-1 bg-amber-500 text-night-950 hover:bg-amber-400'
                }
              >
                <Trash2 size={15} />
                {simulate ? 'Simulate delete' : 'Yes, delete it'}
              </button>
            </>
          )}
          {stage === 'running' && (
            <button disabled className="btn-ghost flex-1">
              <Loader2 size={15} className="animate-spin" />
              {simulate ? 'Simulating…' : 'Deleting…'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultView({ result }) {
  if (result.requestError) {
    return (
      <Box tone="red" icon={XCircle} title="The request failed">
        <p>{result.requestError}</p>
        <p className="text-silver">
          If it was rejected, nothing was deleted. If it timed out, some steps may still have run —
          the list will refresh, and logs/deletions.json records what happened.
        </p>
      </Box>
    );
  }
  return (
    <div className="space-y-3">
      {result.simulated ? (
        <Box tone="muted" icon={FlaskConical} title="Simulation complete — nothing was deleted" />
      ) : result.ok ? (
        <Box tone="muted" icon={CheckCircle2} title="Everything was deleted" />
      ) : (
        <Box tone="red" icon={XCircle} title="Some steps failed">
          <p>Check each step below — whatever shows as done really was deleted.</p>
        </Box>
      )}
      <StepList steps={result.steps} withStatus />
      <p className="rounded-md bg-night-900 px-3 py-2.5 text-sm text-silver">
        {result.simulated ? 'Would free' : 'Freed'}:{' '}
        <span className="text-lg font-bold text-parchment">
          {result.freed.exact ? '' : '≈ '}
          {bytes(result.freed.bytes)}
        </span>
      </p>
      {result.logError && (
        <Box tone="amber" icon={AlertTriangle} title="Deletion log not written">
          <p>{result.logError}</p>
        </Box>
      )}
    </div>
  );
}
