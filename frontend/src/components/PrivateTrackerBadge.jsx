import { useEffect, useRef, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { duration } from '../lib/format.js';

// Amber badge for a title seeded on a private tracker. Hover (desktop) or tap
// (phone) shows the ratio and seed time of each of its torrents on that tracker,
// so the ratio impact is visible before anyone reaches for delete.
export default function PrivateTrackerBadge({ tracker, torrents }) {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const ref = useRef(null);

  // Open towards whichever side has room, so the popover never runs off a
  // phone screen.
  function show() {
    const rect = ref.current?.getBoundingClientRect();
    setAlignRight(Boolean(rect && rect.left + 248 > window.innerWidth));
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const below = torrents.some((t) => t.ratio < 1);

  return (
    <span
      ref={ref}
      className="relative inline-flex"
      // Hover is for real mice only: a phone tap also fires enter events, which
      // would open the popover just before the click toggles it shut again.
      onPointerEnter={(e) => e.pointerType === 'mouse' && show()}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (open) setOpen(false);
          else show();
        }}
        className="inline-flex max-w-[11rem] items-center gap-1 rounded-md bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-300 ring-1 ring-amber-400/40"
        aria-expanded={open}
        title={`Private tracker: ${tracker || 'unknown'}`}
      >
        <ShieldAlert size={12} className="shrink-0" />
        <span className="truncate">{tracker || 'Private'}</span>
      </button>

      {open && (
        <span className={`absolute ${alignRight ? 'right-0' : 'left-0'} top-full z-30 mt-1 w-60 space-y-1.5 rounded-md border border-amber-400/30 bg-night-850 p-2.5 text-xs shadow-card`}>
          <span className="block font-semibold text-amber-300">Private tracker</span>
          {torrents.map((t) => (
            <span key={t.hash} className="block">
              <span className="block truncate text-parchment" title={t.name}>
                {t.name}
              </span>
              <span className="block text-silver">
                ratio{' '}
                <span className={t.ratio < 1 ? 'font-semibold text-blood-light' : 'text-parchment'}>
                  {t.ratio.toFixed(2)}
                </span>{' '}
                · seeded {duration(t.seeding_time)}
              </span>
            </span>
          ))}
          {below && (
            <span className="block text-[11px] leading-snug text-amber-300/90">
              Below ratio 1.0 — deleting now costs ratio on this tracker.
            </span>
          )}
        </span>
      )}
    </span>
  );
}
