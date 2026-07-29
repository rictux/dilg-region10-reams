import { supabase } from './supabase';
import { User } from '../types/database';

/**
 * Tracks which in-app walkthroughs a user has already been offered.
 *
 * The record lives in `users.guides_seen` (jsonb, guide id → ISO timestamp) so it follows
 * the account across devices and a shared office PC never hides the tour from the next
 * person to sign in. A per-user localStorage key mirrors it, which covers the window
 * before the row comes back and the case where the write fails outright.
 */

export type GuideId = 'cop';

const localKey = (guideId: GuideId, userId?: number | null) =>
  `guide_seen_${guideId}${userId ? `_${userId}` : ''}`;

const readLocal = (guideId: GuideId, userId?: number | null) => {
  try {
    return localStorage.getItem(localKey(guideId, userId)) !== null;
  } catch {
    return false;
  }
};

export const hasSeenGuide = (user: User | null, guideId: GuideId): boolean => {
  const seen = user?.guides_seen;
  if (seen && typeof seen === 'object' && seen[guideId]) return true;
  return readLocal(guideId, user?.user_id);
};

/**
 * Records the guide as seen. Resolves to the updated map so the caller can hand it to
 * `refreshProfile()`-free state, or null when nothing was persisted to the account.
 */
export const markGuideSeen = async (
  user: User | null,
  guideId: GuideId
): Promise<Record<string, string> | null> => {
  const stamp = new Date().toISOString();

  // Write the device copy first — it is what stops the tour reappearing if the user is
  // signed out or the update below fails.
  try { localStorage.setItem(localKey(guideId, user?.user_id), stamp); } catch { /* storage unavailable */ }

  if (!user?.user_id) return null;

  const next = { ...(user.guides_seen ?? {}), [guideId]: stamp };
  const { error } = await supabase
    .from('users')
    .update({ guides_seen: next })
    .eq('user_id', user.user_id);

  if (error) {
    // Non-fatal: the localStorage mirror already suppresses the tour on this device.
    console.error(`Unable to record the "${guideId}" guide as seen:`, error);
    return null;
  }

  return next;
};
