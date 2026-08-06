import { DelegateType, Event } from '../types/database';

// Principal / Representative only apply to Delegates, and only on events that
// opted in via `has_principal_delegates`. Everything here assumes that rule so
// callers don't each have to re-check it.

export const DELEGATE_TYPES: DelegateType[] = ['Principal', 'Representative'];

/**
 * What a registrant picks in the "Are you attending as" question. 'Attendee'
 * exists only in the UI: it means "neither" and is stored as NULL, so it never
 * reaches the database and needs no schema support. Use `delegateTypeFromChoice`
 * on the way to persistence.
 */
export const ATTENDEE_CHOICE = 'Attendee' as const;
export type DelegateChoice = DelegateType | typeof ATTENDEE_CHOICE;
export const DELEGATE_CHOICES: DelegateChoice[] = [...DELEGATE_TYPES, ATTENDEE_CHOICE];

/** Collapses a form choice to the column value: 'Attendee' and '' both persist as NULL. */
export const delegateTypeFromChoice = (
  choice: DelegateChoice | '' | null | undefined
): DelegateType | null => (DELEGATE_TYPES.includes(choice as DelegateType) ? (choice as DelegateType) : null);

export const isPrincipalEvent = (event?: Pick<Event, 'has_principal_delegates'> | null) =>
  Boolean(event?.has_principal_delegates);

/** Normalizes a raw column value; anything unexpected (or a non-Delegate row) becomes null. */
export const readDelegateType = (
  role: string | null | undefined,
  value: string | null | undefined
): DelegateType | null => {
  if (role !== 'Delegate') return null;
  return DELEGATE_TYPES.includes(value as DelegateType) ? (value as DelegateType) : null;
};

/** The value to persist, given the role the row is being saved with. */
export const delegateTypeForRole = (
  role: string | null | undefined,
  value: string | null | undefined
): DelegateType | null => readDelegateType(role, value);

export const DELEGATE_CHIP_CLASS: Record<DelegateType, string> = {
  Principal: 'bg-amber-100 text-amber-800 border-amber-200',
  Representative: 'bg-sky-50 text-sky-700 border-sky-200'
};

/** Row tint used to make Principals scannable at a glance in long tables. */
export const DELEGATE_ROW_CLASS: Record<DelegateType, string> = {
  Principal: 'border-l-2 border-amber-400 bg-amber-50/40',
  Representative: 'border-l-2 border-sky-300 bg-sky-50/30'
};

export const DELEGATE_SHORT_LABEL: Record<DelegateType, string> = {
  Principal: 'Principal',
  Representative: 'Rep.'
};

/**
 * True for a Delegate holding no Principal/Representative seat — an "Attendee",
 * which is stored as NULL. These are the rows the scanner offers to reassign.
 */
export const isPlainDelegate = (
  role: string | null | undefined,
  value: string | null | undefined
) => role === 'Delegate' && !DELEGATE_TYPES.includes(value as DelegateType);
