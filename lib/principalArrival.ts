import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

// Announcing a Principal delegate's arrival.
//
// The portal has no service worker, so this is page-level: it reaches any tab
// that is open, including backgrounded ones, but not a closed browser. Four
// signals stack so at least one lands regardless of how the browser is
// configured: a toast, a chime, an OS notification while the tab is hidden, and
// a flashing document title.
//
// Scanning devices announce locally and broadcast on a Realtime channel keyed by
// the organizing office, so everyone in that office hears it too.

export const PRINCIPAL_ARRIVAL_EVENT = 'principal_arrival';

export interface PrincipalArrivalPayload {
  event_id: number;
  event_name: string;
  participant_name: string;
  position?: string | null;
  office?: string | null;
  /** ISO timestamp of the scan. */
  at: string;
  /** True when the arrival came from promoting a Representative at the scanner. */
  promoted?: boolean;
  /**
   * The user who scanned. They already saw the arrival on the scanner's result
   * card, so the modal is skipped for them — on every tab and device they are
   * signed in on, not just the connection that sent the broadcast.
   */
  scanned_by?: number | null;
}

/** Everyone in the organizing office hears arrivals for that office's events. */
export const officeArrivalChannel = (officeId: number | string) =>
  `principal_arrivals_office_${officeId}`;

/** Fallback for events with no organizing office (Admin-created), scoped to viewers of that event. */
export const eventArrivalChannel = (eventId: number | string) =>
  `principal_arrivals_event_${eventId}`;

// --- Chime -----------------------------------------------------------------

let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) {
    try {
      audioContext = new Ctor();
    } catch {
      return null;
    }
  }
  return audioContext;
};

/**
 * Browsers only allow audio to start from a user gesture. Call this from a click
 * (Start Scanning, etc.) so later arrival chimes are allowed to play.
 */
export const primeArrivalAudio = () => {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume().catch(() => undefined);
  }
};

/** Two-tone rising chime. Synthesized so no audio asset has to ship. */
export const playArrivalChime = () => {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => undefined);
  }

  const start = ctx.currentTime;
  [
    { freq: 880, at: 0 },
    { freq: 1318.5, at: 0.18 }
  ].forEach(({ freq, at }) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(freq, start + at);

    gain.gain.setValueAtTime(0.0001, start + at);
    gain.gain.exponentialRampToValueAtTime(0.22, start + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + at + 0.42);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start + at);
    oscillator.stop(start + at + 0.45);
  });
};

// --- OS notification -------------------------------------------------------

/** Ask once, from a user gesture. Safe to call repeatedly. */
export const requestArrivalNotifications = () => {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'default') return;
  void Notification.requestPermission().catch(() => undefined);
};

const showArrivalNotification = (payload: PrincipalArrivalPayload) => {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    new Notification('Principal delegate has arrived', {
      body: [payload.participant_name, payload.office, payload.event_name]
        .filter(Boolean)
        .join(' — '),
      // Collapses repeat scans of the same person into one notification.
      tag: `principal-${payload.event_id}-${payload.participant_name}`
    });
  } catch {
    // Some browsers throw when constructing notifications outside a SW.
  }
};

// --- Title flash -----------------------------------------------------------

let titleFlashTimer: ReturnType<typeof setInterval> | null = null;
let originalTitle = '';
let visibilityBound = false;

const stopTitleFlash = () => {
  if (titleFlashTimer) {
    clearInterval(titleFlashTimer);
    titleFlashTimer = null;
  }
  if (originalTitle) {
    document.title = originalTitle;
    originalTitle = '';
  }
};

const flashTitle = (message: string) => {
  if (typeof document === 'undefined') return;

  if (!visibilityBound) {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) stopTitleFlash();
    });
    visibilityBound = true;
  }

  // Only meaningful while the tab is in the background.
  if (!document.hidden) return;

  if (!titleFlashTimer) {
    originalTitle = document.title;
  } else {
    clearInterval(titleFlashTimer);
  }

  let showingMessage = false;
  titleFlashTimer = setInterval(() => {
    showingMessage = !showingMessage;
    document.title = showingMessage ? message : originalTitle;
  }, 1000);
};

// --- Announce --------------------------------------------------------------

interface AnnounceOptions {
  /** Suppress the modal when the caller renders its own result UI (the scanner). */
  suppressModal?: boolean;
}

export interface ArrivalMeta {
  /** True on the scanning device, which shows its own result card instead. */
  suppressModal: boolean;
}

// The modal lives in Layout, but arrivals are announced from plain modules and
// from inside Realtime callbacks. Components subscribe here instead. Listeners
// always fire — `suppressModal` only tells the modal to stay closed, while other
// listeners (the Overview panel) still refresh.
type ArrivalListener = (payload: PrincipalArrivalPayload, meta: ArrivalMeta) => void;
const arrivalListeners = new Set<ArrivalListener>();

export const onPrincipalArrival = (listener: ArrivalListener) => {
  arrivalListeners.add(listener);
  return () => {
    arrivalListeners.delete(listener);
  };
};

// The same arrival reaches a listener on both the office and event channels, and
// the scanning device announces locally before broadcasting. Collapse repeats.
const recentAnnouncements = new Map<string, number>();
const ANNOUNCE_DEDUPE_MS = 15000;

const isDuplicateAnnouncement = (payload: PrincipalArrivalPayload) => {
  const key = `${payload.event_id}|${payload.participant_name}|${payload.at}`;
  const now = Date.now();

  for (const [seenKey, seenAt] of recentAnnouncements) {
    if (now - seenAt > ANNOUNCE_DEDUPE_MS) recentAnnouncements.delete(seenKey);
  }

  if (recentAnnouncements.has(key)) return true;
  recentAnnouncements.set(key, now);
  return false;
};

export const announcePrincipalArrival = (
  payload: PrincipalArrivalPayload,
  options: AnnounceOptions = {}
) => {
  if (isDuplicateAnnouncement(payload)) return;

  const meta: ArrivalMeta = { suppressModal: Boolean(options.suppressModal) };
  arrivalListeners.forEach((listener) => {
    try {
      listener(payload, meta);
    } catch (err) {
      console.warn('[principal-arrival] listener failed', err);
    }
  });

  playArrivalChime();
  showArrivalNotification(payload);
  flashTitle(`🔔 ${payload.participant_name} arrived`);

  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate([120, 60, 120]);
  }
};


// --- Channels --------------------------------------------------------------
//
// One channel per topic, shared by senders and receivers.
//
// A Realtime socket cannot join the same topic twice: a second
// `supabase.channel(topic)` on the client that already joined that topic fails
// to subscribe, and removing it tears down the first subscription. The scanning
// user is usually also a listener on the office channel, so a send-only channel
// would collide with their own Layout subscription and silently never send.

const arrivalChannels = new Map<string, { channel: RealtimeChannel; ready: Promise<boolean> }>();

const ensureArrivalChannel = (topic: string) => {
  const existing = arrivalChannels.get(topic);
  if (existing) return existing;

  const channel = supabase.channel(topic);

  channel.on('broadcast', { event: PRINCIPAL_ARRIVAL_EVENT }, ({ payload }) => {
    const arrival = payload as PrincipalArrivalPayload;
    if (arrival?.participant_name) announcePrincipalArrival(arrival);
  });

  const ready = new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (!ok) console.warn(`[principal-arrival] could not join ${topic}`);
      resolve(ok);
    };

    const timeout = setTimeout(() => finish(false), 5000);

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timeout);
        finish(true);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        clearTimeout(timeout);
        finish(false);
      }
    });
  });

  const entry = { channel, ready };
  arrivalChannels.set(topic, entry);
  return entry;
};

/**
 * Declares which arrival topics this client should be listening on. Joins the
 * missing ones and drops the rest. Called by Layout as the user's accessible
 * events change.
 */
export const setArrivalChannels = (topics: string[]) => {
  const desired = new Set(topics);

  arrivalChannels.forEach((entry, topic) => {
    if (desired.has(topic)) return;
    arrivalChannels.delete(topic);
    void supabase.removeChannel(entry.channel);
  });

  topics.forEach(ensureArrivalChannel);
};

// --- Broadcast -------------------------------------------------------------

interface BroadcastTarget {
  officeId?: number | null;
  eventId: number;
}

/**
 * Sends on both the organizing-office channel and the per-event channel.
 *
 * Listeners join whichever they qualify for: everyone in the organizing office,
 * plus anyone with access to that specific event. Sending on both covers events
 * with no organizing office and users with no office_id, either of which would
 * otherwise drop the announcement silently. Receivers dedupe.
 */
export const broadcastPrincipalArrival = async (
  payload: PrincipalArrivalPayload,
  target: BroadcastTarget
) => {
  const topics = [eventArrivalChannel(target.eventId)];
  if (target.officeId) topics.unshift(officeArrivalChannel(target.officeId));

  await Promise.all(topics.map(async (topic) => {
    const { channel, ready } = ensureArrivalChannel(topic);

    // A channel that never joined cannot send; the arrival still shows locally.
    if (!(await ready)) return;

    const result = await channel.send({
      type: 'broadcast',
      event: PRINCIPAL_ARRIVAL_EVENT,
      payload
    });

    if (result !== 'ok') {
      console.warn(`[principal-arrival] send on ${topic} returned ${result}`);
    }
  }));
};
