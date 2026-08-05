import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, GraduationCap, X } from 'lucide-react';

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
};

// ─── Layout helpers ───────────────────────────────────────────────────────────

const CARD_MAX_WIDTH = 380;
const VIEWPORT_MARGIN = 12;
const SPOTLIGHT_GAP = 16;

type Rect = { top: number; left: number; width: number; height: number };

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
export const GuidedTour: React.FC<GuidedTourProps> = ({ isOpen, steps, onClose }) => {
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
      document
        .querySelector(`[data-tour="${step.target}"]`)
        ?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
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
      const target = step?.target;
      const next = target ? toRect(document.querySelector(`[data-tour="${target}"]`)) : null;
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

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Certificate of Participation tutorial">
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

// ─── Step script ──────────────────────────────────────────────────────────────

type StepFactoryOptions = {
  openSettings: () => void;
  closeSettings: () => void;
};

/**
 * Walks the operator through one full run: configure the certificate, narrow the list
 * down to the right people, then hand the certificates out.
 */
export const buildCoPTourSteps = ({ openSettings, closeSettings }: StepFactoryOptions): TourStep[] => [
  {
    id: 'welcome',
    title: 'Generate Certificates of Participation',
    placement: 'center',
    onEnter: closeSettings,
    body: (
      <>
        <p className="mb-2">
          This walkthrough covers the full run in four parts: <strong>set up the certificate</strong>,{' '}
          <strong>filter the participants</strong>, <strong>check the preview</strong>, then{' '}
          <strong>email, print or export</strong>.
        </p>
        <p>
          Use <strong>Next</strong> / <strong>Back</strong> (or the ← → arrow keys) to move through it, and{' '}
          <strong>Esc</strong> to leave at any point. You can reopen it later from the{' '}
          <strong>Tutorial</strong> button in the header.
        </p>
      </>
    ),
  },
  {
    id: 'settings-button',
    section: 'Part 1 · Set up the certificate',
    title: 'Open Certificate Settings',
    target: 'cop-settings-button',
    placement: 'bottom',
    onEnter: closeSettings,
    body: (
      <p>
        Everything about how the certificate <em>looks</em> lives here — wording, credit hours,
        background, paper size and signatories. Set this up first: every change shows up
        immediately in the preview and applies to every certificate you generate.
      </p>
    ),
  },
  {
    id: 'title',
    section: 'Part 1 · Set up the certificate',
    title: 'Pick the certificate title',
    target: 'cop-settings-title',
    placement: 'right',
    onEnter: openSettings,
    body: (
      <p>
        Choose between <strong>Participation</strong>, <strong>Appreciation</strong> and{' '}
        <strong>Completion</strong>. This is the heading printed in script at the top of the
        certificate — pick the one that matches what the activity actually awards.
      </p>
    ),
  },
  {
    id: 'body-text',
    section: 'Part 1 · Set up the certificate',
    title: 'Choose or write the body text',
    target: 'cop-settings-body',
    placement: 'right',
    onEnter: openSettings,
    body: (
      <>
        <p className="mb-2">
          Start from one of the three templates, then edit the text freely if the activity needs
          different wording.
        </p>
        <p>
          The placeholders <strong>{'{EventName}'}</strong>, <strong>{'{EventDate}'}</strong>,{' '}
          <strong>{'{Venue}'}</strong>, <strong>{'{CreditPhrase}'}</strong> and{' '}
          <strong>{'{GivenDate}'}</strong> are filled in per participant when the certificate is
          rendered — keep them in place. <strong>Reset</strong> restores the default wording.
        </p>
      </>
    ),
  },
  {
    id: 'credit-hours',
    section: 'Part 1 · Set up the certificate',
    title: 'Set the training credit hours',
    target: 'cop-settings-credit',
    placement: 'right',
    onEnter: openSettings,
    body: (
      <p>
        Enter a whole number of hours and the certificate reads “…with a credit of{' '}
        <strong>Four (4)</strong> training hours.” Leave it blank and that phrase is dropped
        entirely, which is what you want for activities that award no credit.
      </p>
    ),
  },
  {
    id: 'accreditation',
    section: 'Part 1 · Set up the certificate',
    title: 'Add PRC / CPD details',
    target: 'cop-settings-accreditation',
    placement: 'right',
    onEnter: openSettings,
    body: (
      <>
        <p className="mb-2">
          Only needed for activities that carry professional credit — leave both off and the
          certificate prints exactly as before.
        </p>
        <p className="mb-2">
          <strong>Show “PRC License No.” line</strong> prints a blank line under the participant's
          name for them to fill in by hand after printing.
        </p>
        <p>
          Then pick the accreditation line shown above the signatory:{' '}
          <strong>Option 1</strong> for the DILG 10 CPD provider number, or{' '}
          <strong>Option 2</strong> for the PRC accreditation number — whose last segment you can
          change per activity, since it differs from one accredited programme to the next.
        </p>
      </>
    ),
  },
  {
    id: 'theme',
    section: 'Part 1 · Set up the certificate',
    title: 'Choose the background theme',
    target: 'cop-settings-theme',
    placement: 'right',
    onEnter: openSettings,
    body: (
      <p>
        Click any uploaded image to use it as the certificate background, or upload a new one
        (images only, under 5&nbsp;MB). Use a landscape image that matches the paper size you
        picked. Hover a theme to reveal its delete button. With no theme selected the certificate
        prints on plain white.
      </p>
    ),
  },
  {
    id: 'paper-size',
    section: 'Part 1 · Set up the certificate',
    title: 'Pick the paper size',
    target: 'cop-settings-paper',
    placement: 'right',
    onEnter: openSettings,
    body: (
      <p>
        Both sizes are landscape. <strong>A4</strong> prints one certificate per sheet;{' '}
        <strong>A5</strong> pairs two certificates onto a single A4 sheet when you print, so it is
        the cheaper option for large batches.
      </p>
    ),
  },
  {
    id: 'signatories',
    section: 'Part 1 · Set up the certificate',
    title: 'Set the signatories',
    target: 'cop-settings-signatories',
    placement: 'right',
    onEnter: openSettings,
    body: (
      <>
        <p className="mb-2">
          The <strong>primary signatory</strong> is required. Add a <strong>partner agency
          signatory</strong> only for co-organised activities — it needs both an agency name and an
          agency logo, so agencies missing either won't appear in the list.
        </p>
        <p>
          Untick <strong>Include signature image</strong> when the certificates will be signed by
          hand; the name and position still print, only the scanned signature is left off.
        </p>
      </>
    ),
  },
  {
    id: 'save-settings',
    section: 'Part 1 · Set up the certificate',
    title: 'Save and close',
    target: 'cop-settings-save',
    placement: 'top',
    onEnter: openSettings,
    body: (
      <p>
        This saves the chosen <strong>signatories</strong> to the event, so they are still selected
        the next time anyone opens this page. Title, body text, credit hours, PRC/CPD details, theme
        and paper size apply to the current session only — set them again if you come back later.
      </p>
    ),
  },
  {
    id: 'attendance-filter',
    section: 'Part 2 · Filter the participants',
    title: 'Filter by complete or incomplete attendance',
    target: 'cop-attendance-filter',
    placement: 'right',
    onEnter: closeSettings,
    body: (
      <>
        <p className="mb-2">
          <strong>Complete</strong> keeps only participants who were logged present on{' '}
          <em>every</em> event date. <strong>Incomplete</strong> shows the ones who missed at least
          one — normally the people who should <em>not</em> receive a certificate.
        </p>
        <p>
          Each of these also replaces the current selection with everything it matches, so one
          click both filters and selects. <strong>Select All</strong> goes back to the full list;{' '}
          <strong>Unselect</strong> clears the selection.
        </p>
      </>
    ),
  },
  {
    id: 'role-filter',
    section: 'Part 2 · Filter the participants',
    title: 'Filter by role',
    target: 'cop-role-filter',
    placement: 'right',
    body: (
      <p>
        Narrow the list to <strong>Delegate</strong>, <strong>Secretariat/Guest</strong> or{' '}
        <strong>Speaker</strong>, with the headcount shown under each. This stacks with the
        attendance filter, so you can issue different wording to different roles — for example
        pick the Speaker role, switch the title to <em>Certificate of Appreciation</em>, and send
        that batch on its own.
      </p>
    ),
  },
  {
    id: 'search',
    section: 'Part 2 · Filter the participants',
    title: 'Search for specific names',
    target: 'cop-search',
    placement: 'right',
    body: (
      <p>
        Type any part of a name to narrow the visible list further. Search only hides rows — it
        never changes who is selected, so it is safe to use while a batch is already picked.
      </p>
    ),
  },
  {
    id: 'list',
    section: 'Part 2 · Filter the participants',
    title: 'Confirm the selection',
    target: 'cop-participant-list',
    placement: 'right',
    body: (
      <>
        <p className="mb-2">
          Tick or untick individual participants to fine-tune the batch. Only{' '}
          <strong>selected</strong> participants are emailed, printed or exported — the counter
          just above the list is the number you are about to generate.
        </p>
        <p>
          A blue <strong>mail badge</strong> marks anyone who has already been sent their
          certificate, so you can avoid sending duplicates. Click a row to preview it.
        </p>
      </>
    ),
  },
  {
    id: 'preview',
    section: 'Part 3 · Check the preview',
    title: 'Review before you generate',
    target: 'cop-preview',
    placement: 'left',
    body: (
      <p>
        The preview is the real certificate, rendered at the exact export size — what you see here
        is what gets printed. Check the spelling of the name, the dates and the body wording on a
        few records before running a batch. The <strong>eye icon</strong> on a list row opens it
        larger.
      </p>
    ),
  },
  {
    id: 'signature-adjust',
    section: 'Part 3 · Check the preview',
    title: 'Calibrate the signature (optional)',
    target: 'cop-signature-adjust',
    placement: 'bottom',
    body: (
      <p>
        If a scanned signature sits too high, too low or too large over the printed name, open{' '}
        <strong>Adjustment</strong> and nudge its size and position while watching the preview.
        The calibration is remembered per signatory on this browser, so you only have to do it
        once.
      </p>
    ),
  },
  {
    id: 'email',
    section: 'Part 4 · Send them out',
    title: 'Email the certificates',
    target: 'cop-email-button',
    placement: 'bottom',
    body: (
      <>
        <p className="mb-2">
          Renders a PDF per selected participant and emails it to the address on their record.
          Participants without an email address are skipped, and a progress dialog reports each
          send as it happens.
        </p>
        <p>
          Sending is logged, so those rows come back with the blue mail badge. Keep the tab open
          until the batch finishes.
        </p>
      </>
    ),
  },
  {
    id: 'print',
    section: 'Part 4 · Send them out',
    title: 'Print the certificates',
    target: 'cop-print-button',
    placement: 'bottom',
    body: (
      <>
        <p className="mb-2">
          Builds a print-ready document for every selected participant and opens your browser's
          print dialog — A4 one per page, A5 two per page.
        </p>
        <p>
          The page opens in a new tab, so <strong>allow pop-ups</strong> for this site. In the
          print dialog set margins to <strong>None</strong> and turn on background graphics so the
          theme is not clipped.
        </p>
      </>
    ),
  },
  {
    id: 'export',
    section: 'Part 4 · Send them out',
    title: 'Export as PDF files',
    target: 'cop-export-button',
    placement: 'bottom',
    body: (
      <p>
        Downloads the same certificates as high-resolution PDFs — a single file for one
        participant, or a ZIP named after the event for a batch. Use this when you need to archive
        the certificates or hand them over as files.
      </p>
    ),
  },
  {
    id: 'finish',
    title: "You're set",
    placement: 'center',
    body: (
      <>
        <p className="mb-2">
          The short version: <strong>Settings</strong> → filter by <strong>attendance</strong> and{' '}
          <strong>role</strong> → confirm the selection → check the preview →{' '}
          <strong>Email</strong>, <strong>Print</strong> or <strong>Export</strong>.
        </p>
        <p>Reopen this walkthrough any time from the <strong>Tutorial</strong> button in the header.</p>
      </>
    ),
  },
];

// ─── Header trigger ───────────────────────────────────────────────────────────

export const TutorialButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    data-tour="cop-tutorial-button"
    onClick={onClick}
    title="Replay the step-by-step tutorial"
    className="flex items-center justify-center gap-1.5 rounded-lg border border-[#E0DDD4] px-3 py-2 text-sm font-medium text-[#6B6860] transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
  >
    <GraduationCap size={15} /> Tutorial
  </button>
);
