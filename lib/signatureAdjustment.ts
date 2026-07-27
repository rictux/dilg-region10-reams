/**
 * Per-signatory calibration for e-signature images.
 *
 * Scanned signatures carry wildly different amounts of blank padding around the ink, so a
 * single hardcoded box renders some of them small and others oversized. These values let an
 * operator correct that once per signatory instead of living with the average.
 *
 * `scale` multiplies the template's base box; the offsets nudge the image in that template's
 * own pixel space (positive X = right, positive Y = down).
 */
export type SignatureAdjustment = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

export const DEFAULT_SIGNATURE_ADJUSTMENT: SignatureAdjustment = {
  scale: 1,
  offsetX: 0,
  offsetY: 0
};

export const SIGNATURE_ADJUSTMENT_LIMITS = {
  scale: { min: 0.4, max: 2.5, step: 0.05 },
  offsetX: { min: -80, max: 80, step: 1 },
  offsetY: { min: -60, max: 60, step: 1 }
} as const;

/**
 * Guards the render path against out-of-range or malformed values — these round-trip through
 * localStorage, so a stale or hand-edited entry must not break the certificate.
 */
export const clampSignatureAdjustment = (
  value?: Partial<SignatureAdjustment> | null
): SignatureAdjustment => {
  const clamp = (input: unknown, min: number, max: number, fallback: number) => {
    const parsed = typeof input === 'number' ? input : Number(input);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  };

  const limits = SIGNATURE_ADJUSTMENT_LIMITS;

  return {
    scale: clamp(value?.scale, limits.scale.min, limits.scale.max, DEFAULT_SIGNATURE_ADJUSTMENT.scale),
    offsetX: clamp(value?.offsetX, limits.offsetX.min, limits.offsetX.max, DEFAULT_SIGNATURE_ADJUSTMENT.offsetX),
    offsetY: clamp(value?.offsetY, limits.offsetY.min, limits.offsetY.max, DEFAULT_SIGNATURE_ADJUSTMENT.offsetY)
  };
};

export const isSignatureAdjusted = (adjustment: SignatureAdjustment) =>
  adjustment.scale !== DEFAULT_SIGNATURE_ADJUSTMENT.scale ||
  adjustment.offsetX !== DEFAULT_SIGNATURE_ADJUSTMENT.offsetX ||
  adjustment.offsetY !== DEFAULT_SIGNATURE_ADJUSTMENT.offsetY;

/**
 * Certificate types keep separate namespaces on purpose. A scale factor would transfer between
 * them, but the offsets would not — the Appearance template overlays the signature on the name
 * line while Participation stacks it above, so the same nudge means different things.
 */
export type SignatureAdjustmentScope = 'coa' | 'cop';

const storageKey = (scope: SignatureAdjustmentScope, signatoryId: number) =>
  `${scope}_signature_adjust_${signatoryId}`;

export const readStoredSignatureAdjustment = (
  scope: SignatureAdjustmentScope,
  signatoryId?: number | null
): SignatureAdjustment => {
  if (!signatoryId) return DEFAULT_SIGNATURE_ADJUSTMENT;

  try {
    const raw = localStorage.getItem(storageKey(scope, signatoryId));
    if (!raw) return DEFAULT_SIGNATURE_ADJUSTMENT;
    return clampSignatureAdjustment(JSON.parse(raw));
  } catch {
    // Unreadable or malformed entry — fall back rather than block the certificate.
    return DEFAULT_SIGNATURE_ADJUSTMENT;
  }
};

export const writeStoredSignatureAdjustment = (
  scope: SignatureAdjustmentScope,
  signatoryId: number | null | undefined,
  adjustment: SignatureAdjustment
) => {
  if (!signatoryId) return;

  try {
    localStorage.setItem(storageKey(scope, signatoryId), JSON.stringify(adjustment));
  } catch {
    /* storage full or blocked (private mode) — the in-memory value still applies */
  }
};

/** Slider metadata shared by both certificate editors. */
export const SIGNATURE_CONTROLS = [
  {
    field: 'scale' as const,
    label: 'Size',
    limits: SIGNATURE_ADJUSTMENT_LIMITS.scale,
    format: (value: number) => `${Math.round(value * 100)}%`
  },
  {
    field: 'offsetX' as const,
    label: 'Horizontal',
    limits: SIGNATURE_ADJUSTMENT_LIMITS.offsetX,
    format: (value: number) => `${value > 0 ? '+' : ''}${value} px`
  },
  {
    field: 'offsetY' as const,
    label: 'Vertical',
    limits: SIGNATURE_ADJUSTMENT_LIMITS.offsetY,
    format: (value: number) => `${value > 0 ? '+' : ''}${value} px`
  }
];
