import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center';

export type TourStep = {
  id: string;
  /** Grouping label shown above the title (e.g. "Step 1 · Set up"). */
  section?: string;
  title: string;
  body: React.ReactNode;
  /** Value of the `data-tour` attribute on the element to spotlight. */
  target?: string;
  placement?: TourPlacement;
  /** Extra pixels of breathing room around the spotlight. */
  padding?: number;
  /**
   * Runs once when the step becomes active — used to put the page into the state the
   * step describes (opening the Settings modal, for instance).
   */
  onEnter?: () => void;
};

type GuidedTourProps = {
  isOpen: boolean;
  steps: TourStep[];
  /** Fired for Finish, Skip, the close button and Esc alike. */
  onClose: () => void;
  /** Announced to screen readers as the dialog's name. */
  ariaLabel?: string;
};

// ─── Layout helpers ───────────────────────────────────────────────────────────

const CARD_MAX_WIDTH = 380;
const VIEWPORT_MARGIN = 12;
const SPOTLIGHT_GAP = 16;

type Rect = { top: number; left: number; width: number; height: number };

/**
 * The same anchor is often rendered twice — once in a `hidden md:block` desktop layout and
 * once in a `md:hidden` phone layout — so the first match in the DOM is regularly the one
 * the current breakpoint has collapsed. Pick the first anchor that actually occupies space.
 */
const findTarget = (name?: string): Element | null => {
  if (!name) return null;
  const matches = Array.from(document.querySelectorAll(`[data-tour="${name}"]`));
  return matches.find(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  }) ?? null;
};

const toRect = (el: Element | null): Rect | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  // Elements hidden by a responsive utility class (`hidden md:flex`) are still in the
  // DOM but measure zero — treat them as absent so the step falls back to a centered card.
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
};

const sameRect = (a: Rect | null, b: Rect | null) => {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, Math.max(min, max)));

/** Picks the first side the card fully fits on, preferring the step's own placement. */
const resolvePlacement = (
  rect: Rect,
  preferred: TourPlacement,
  cardW: number,
  cardH: number,
  vw: number,
  vh: number
): Exclude<TourPlacement, 'center'> => {
  const space = {
    bottom: vh - VIEWPORT_MARGIN - (rect.top + rect.height + SPOTLIGHT_GAP),
    top: rect.top - SPOTLIGHT_GAP - VIEWPORT_MARGIN,
    right: vw - VIEWPORT_MARGIN - (rect.left + rect.width + SPOTLIGHT_GAP),
    left: rect.left - SPOTLIGHT_GAP - VIEWPORT_MARGIN,
  };
  const needed = { bottom: cardH, top: cardH, right: cardW, left: cardW };
  const order: Array<Exclude<TourPlacement, 'center'>> =
    preferred === 'center'
      ? ['bottom', 'top', 'right', 'left']
      : [preferred, ...(['bottom', 'top', 'right', 'left'] as const).filter(p => p !== preferred)];

  const fitting = order.find(p => space[p] >= needed[p]);
  if (fitting) return fitting;
  // Nothing fits outright — use whichever side is roomiest and let the card clamp.
  return order.reduce((best, p) => (space[p] - needed[p] > space[best] - needed[best] ? p : best), order[0]);
};

const positionCard = (
  rect: Rect,
  placement: Exclude<TourPlacement, 'center'>,
  cardW: number,
  cardH: number,
  vw: number,
  vh: number
) => {
  const maxLeft = vw - cardW - VIEWPORT_MARGIN;
  const maxTop = vh - cardH - VIEWPORT_MARGIN;
  const centeredLeft = rect.left + rect.width / 2 - cardW / 2;
  const centeredTop = rect.top + rect.height / 2 - cardH / 2;

  switch (placement) {
    case 'bottom':
      return { top: clamp(rect.top + rect.height + SPOTLIGHT_GAP, VIEWPORT_MARGIN, maxTop), left: clamp(centeredLeft, VIEWPORT_MARGIN, maxLeft) };
    case 'top':
      return { top: clamp(rect.top - SPOTLIGHT_GAP - cardH, VIEWPORT_MARGIN, maxTop), left: clamp(centeredLeft, VIEWPORT_MARGIN, maxLeft) };
    case 'right':
      return { top: clamp(centeredTop, VIEWPORT_MARGIN, maxTop), left: clamp(rect.left + rect.width + SPOTLIGHT_GAP, VIEWPORT_MARGIN, maxLeft) };
    case 'left':
      return { top: clamp(centeredTop, VIEWPORT_MARGIN, maxTop), left: clamp(rect.left - SPOTLIGHT_GAP - cardW, VIEWPORT_MARGIN, maxLeft) };
  }
};

// ─── Guided tour overlay ──────────────────────────────────────────────────────

/**
 * A dependency-free spotlight tour. Steps point at elements through a `data-tour`
 * attribute, so the page only has to label its anchors — no refs get threaded around.
 */
export const GuidedTour: React.FC<GuidedTourProps> = ({ isOpen, steps, onClose, ariaLabel = 'Guided tutorial' }) => {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardSize, setCardSize] = useState({ width: CARD_MAX_WIDTH, height: 220 });
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1024 : window.innerWidth,
    height: typeof window === 'undefined' ? 768 : window.innerHeight,
  }));
  const cardRef = useRef<HTMLDivElement>(null);

  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  // Restart from the top every time the tour is opened.
  useEffect(() => { if (isOpen) setIndex(0); }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    step?.onEnter?.();
    // `step` is intentionally tracked by index only — re-running on identity changes
    // would fire the side effect on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, index]);

  // Bring the anchor into view before measuring it.
  useEffect(() => {
    if (!isOpen || !step?.target) return;
    const timer = window.setTimeout(() => {
      findTarget(step.target)?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    }, 60);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, index]);

  // Poll the anchor's box. A modal opening, a smooth scroll settling and a window resize
  // all move it, and one rAF loop covers every case without a pile of listeners.
  useEffect(() => {
    if (!isOpen) return;
    let frame = 0;
    const tick = () => {
      const next = toRect(findTarget(step?.target));
      setRect(current => (sameRect(current, next) ? current : next));
      setViewport(current =>
        current.width === window.innerWidth && current.height === window.innerHeight
          ? current
          : { width: window.innerWidth, height: window.innerHeight }
      );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, index]);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!isOpen || !el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      setCardSize(current =>
        current.width === width && current.height === height ? current : { width, height }
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isOpen, index]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setIndex(i => Math.min(i + 1, steps.length - 1)); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setIndex(i => Math.max(i - 1, 0)); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, steps.length, onClose]);

  const layout = useMemo(() => {
    const cardW = Math.min(CARD_MAX_WIDTH, viewport.width - VIEWPORT_MARGIN * 2);
    if (!rect || step?.placement === 'center') {
      return {
        cardW,
        style: {
          top: Math.max(VIEWPORT_MARGIN, viewport.height / 2 - cardSize.height / 2),
          left: Math.max(VIEWPORT_MARGIN, viewport.width / 2 - cardW / 2),
        },
      };
    }
    const placement = resolvePlacement(rect, step?.placement ?? 'bottom', cardW, cardSize.height, viewport.width, viewport.height);
    return { cardW, style: positionCard(rect, placement, cardW, cardSize.height, viewport.width, viewport.height) };
  }, [rect, step?.placement, cardSize.height, viewport]);

  if (!isOpen || !step) return null;

  const padding = step.padding ?? 8;

  // z-95 clears every modal the tour has to narrate — the Events access dialog and its user
  // dropdown reach z-90 — while staying under the z-100 principal-arrival alert.
  return (
    <div className="fixed inset-0 z-[95]" role="dialog" aria-modal="true" aria-label={ariaLabel}>
      {/* Click blocker — the tour is read-only, so nothing underneath should react. */}
      <div className={`absolute inset-0 ${rect ? '' : 'bg-black/60'}`} onClick={e => e.stopPropagation()} />

      {/* Spotlight: the ring dims everything outside the hole in a single element. */}
      {rect && (
        <div
          className="pointer-events-none absolute rounded-lg ring-2 ring-violet-400/70 transition-all duration-200"
          style={{
            top: rect.top - padding,
            left: rect.left - padding,
            width: rect.width + padding * 2,
            height: rect.height + padding * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
          }}
        />
      )}

      <div
        ref={cardRef}
        onClick={e => e.stopPropagation()}
        className="absolute rounded-2xl border border-[#E0DDD4] bg-white shadow-2xl transition-[top,left] duration-200"
        style={{ width: layout.cardW, maxHeight: viewport.height - VIEWPORT_MARGIN * 2, ...layout.style }}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            {step.section && (
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-600">{step.section}</p>
            )}
            <h3 className="text-sm font-bold leading-snug text-[#2A2926]">{step.title}</h3>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-[#9A9890] transition-colors hover:text-[#6B6860]"
            title="Close tutorial (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[45vh] overflow-y-auto px-5 py-3 text-xs leading-relaxed text-[#6B6860] [&_strong]:font-semibold [&_strong]:text-[#4A4843]">
          {step.body}
        </div>

        <div className="flex items-center gap-3 border-t border-[#EDEAE2] px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="h-1 w-full overflow-hidden rounded-full bg-[#EDEAE2]">
              <div
                className="h-full rounded-full bg-violet-500 transition-all duration-200"
                style={{ width: `${((index + 1) / steps.length) * 100}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-[#9A9890]">{index + 1} of {steps.length}</p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {!isLast && (
              <button
                onClick={onClose}
                className="px-2 py-1.5 text-[11px] font-medium text-[#9A9890] transition-colors hover:text-[#6B6860]"
              >
                Skip
              </button>
            )}
            <button
              onClick={() => setIndex(i => Math.max(i - 1, 0))}
              disabled={isFirst}
              className="inline-flex items-center gap-1 rounded-lg border border-[#E0DDD4] px-2.5 py-1.5 text-[11px] font-medium text-[#4A4843] transition-colors hover:bg-[#F5F3EE] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={13} /> Back
            </button>
            <button
              onClick={() => (isLast ? onClose() : setIndex(i => i + 1))}
              className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-violet-700"
            >
              {isLast ? 'Finish' : <>Next <ChevronRight size={13} /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GuidedTour;
