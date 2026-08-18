import React from 'react';

/**
 * Presentation primitives shared by the Items views.
 *
 * These live outside both pages so the inventory grid and the history log can
 * agree on how a field label and a figure are set, without either page having
 * to import from the other.
 */

/**
 * One field-label treatment for the whole feature. Replaces the three near-miss
 * variants these files had grown (text-xs / text-[11px] / mixed tracking).
 */
export const MICRO = 'text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400';

/**
 * A count that is also a filter. Both Items tabs narrow their list the same way,
 * so they narrow it with the same control: a dot carrying the state's colour, the
 * state's name, and how many are in it. A zero-count state is dimmed rather than
 * hidden — "nothing damaged" is worth seeing.
 */
export const FilterChip: React.FC<{
  label: string;
  count: number;
  dot?: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, count, dot, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
      active
        ? 'border-indigo-600 bg-indigo-600 text-white'
        : 'border-slate-200 bg-card text-slate-600 hover:border-slate-300 hover:bg-slate-50'
    } ${count === 0 && !active ? 'opacity-50' : ''}`}
  >
    {dot && (
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? 'bg-white/70' : dot}`} />
    )}
    <span className="font-medium">{label}</span>
    <span
      className={`font-display font-bold tabular-nums ${active ? 'text-white' : 'text-slate-900'}`}
    >
      {count}
    </span>
  </button>
);

export interface LedgerFigure {
  label: string;
  value: string | number;
  /** Renders the figure in amber — reserved for stock still in someone's hands. */
  alert?: boolean;
}

/**
 * A row of figures read as one line of a ledger, replacing the stack of tiles
 * that each wrapped a single number in its own card. Same information, a
 * quarter of the vertical space — which is what the stacked mobile layout was
 * short of — and the figures sit close enough to be compared.
 *
 * Figures are set in Archivo, which carries real 700-weight cuts; Inter is only
 * loaded to 600, so `font-bold` on it is a browser-synthesised approximation.
 */
export const LedgerStrip: React.FC<{ figures: LedgerFigure[]; className?: string }> = ({
  figures,
  className = '',
}) => (
  // No outer border of its own: one caller sits it above a table and wants a
  // rule underneath, the other wraps it in a bordered box. Shipping a border
  // here and cancelling it with `border-b-0` would leave which one wins up to
  // the order Tailwind happens to emit the two rules in.
  <div className={`grid grid-cols-3 divide-x divide-slate-100 ${className}`}>
    {figures.map((f) => (
      <div key={f.label} className="px-4 py-3 sm:px-5">
        <p className={MICRO}>{f.label}</p>
        <p
          className={`mt-1 font-display text-xl font-bold leading-none tabular-nums sm:text-2xl ${
            f.alert ? 'text-amber-600' : 'text-slate-900'
          }`}
        >
          {f.value}
        </p>
      </div>
    ))}
  </div>
);
