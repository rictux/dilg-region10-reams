
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  CheckCircle,
  XCircle,
  RefreshCw,
  Sun,
  Moon,
  AlertTriangle,
  History,
  User,
  MapPin,
  Calendar,
  WifiOff,
  CloudUpload,
  Gift,
  Pause,
  Play,
  Loader2,
  Star,
  UserCheck,
  Camera,
  Package
} from 'lucide-react';
import { toast } from 'sonner';
import { DelegateType, Event, GiveawayItem, PrincipalArrivalSource } from '../../types/database';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { SCAN_EVENT_ACCESS_ROLES, fetchAccessibleEvents } from '../../lib/eventAccess';
import { PRESENT_ATTENDANCE_STATUSES } from '../../lib/attendance';
import {
  DELEGATE_CHOICES,
  DelegateChoice,
  delegateTypeFromChoice,
  isPlainDelegate,
  readDelegateType
} from '../../lib/delegates';
import { diffRecords, logAudit } from '../../lib/auditLog';
import { readDeviceLabelSync, resolveDeviceLabel } from '../../lib/deviceLabel';
import {
  announcePrincipalArrival,
  broadcastPrincipalArrival,
  primeArrivalAudio,
  requestArrivalNotifications
} from '../../lib/principalArrival';
import { borrowService, ActiveBorrow } from '../../lib/borrowService';

type ScanMode = 'attendance' | 'giveaway' | 'borrow';

interface RecentScan {
    id: string;
    name: string;
    position: string;
    status: 'Valid' | 'Invalid' | 'Duplicate' | 'Offline-Saved';
    timestamp: Date;
    message: string;
    delegateType?: DelegateType | null;
}

interface OfflineScanItem {
    id: string; // Unique ID for queue management
    event_id: number;
    participant_id: number;
    participant_code: string;
    attendance_date: string;
    scan_time: string; // ISO string
    session: 'AM' | 'PM';
    scanner_device: string;
    timestamp: number;
}

interface ParticipantCache {
    [code: string]: {
        participant_id: number;
        full_name: string;
        position: string;
        office: string;
        role: string | null;
        delegate_type: DelegateType | null;
    };
}

interface ParticipantDetails {
    name: string;
    position: string;
    office: string;
    photo?: string;
    participantId?: number;
    delegateType?: DelegateType | null;
    // Needed to tell an ordinary Delegate apart from a Speaker/VIP, which never
    // carry a delegate type and so must not be offered a reassignment.
    role?: string | null;
}

interface CapabilityRange {
    min: number;
    max: number;
    step: number;
}

// What the running camera track actually lets us change. `focusMode` /
// `focusDistance` / `zoom` are non-standard MediaStream constraints: Chrome and
// Edge expose them on many phone cameras, and almost never on desktop webcams,
// so everything here is detected at runtime rather than assumed.
interface CameraControlSupport {
    zoom: CapabilityRange | null;
    focusDistance: CapabilityRange | null;
    supportsManualFocus: boolean;
    supportsContinuousFocus: boolean;
}

interface GiveawayDisplayItem {
    key: string;
    label: string;
    value: string;
}

interface GiveawayClaimDetails {
    items: GiveawayDisplayItem[];
    claimedAt?: string | null;
    alreadyClaimed: boolean;
}

/** "45m" / "2h" / "2h 15m" — how long a returned item was held. */
const formatHeldFor = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
};

const Scanner: React.FC = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<'Valid' | 'Invalid' | 'Duplicate' | 'Offline-Saved' | null>(null);
  const [resultMessage, setResultMessage] = useState('');
  const [resultRequiresAck, setResultRequiresAck] = useState(false);
  const [participantDetails, setParticipantDetails] = useState<ParticipantDetails | null>(null);
  const [giveawayClaimDetails, setGiveawayClaimDetails] = useState<GiveawayClaimDetails | null>(null);
  const [scanMode, setScanMode] = useState<ScanMode>('attendance');
  const [cameraPaused, setCameraPaused] = useState(false);
  const [session, setSession] = useState<'AM' | 'PM'>('AM');
  const [selectedEventId, setSelectedEventId] = useState<string>(''); 
  const [events, setEvents] = useState<Event[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(true);
  
  // Offline & Sync State
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState<OfflineScanItem[]>([]);
  const [participantCache, setParticipantCache] = useState<ParticipantCache>({});
  const [isSyncing, setIsSyncing] = useState(false);

  // Recent History State
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [focusBoxSize, setFocusBoxSize] = useState(280);

  // Camera focus / zoom controls, populated once the track is live.
  const [cameraControls, setCameraControls] = useState<CameraControlSupport | null>(null);
  const [zoomValue, setZoomValue] = useState<number | null>(null);
  const [focusDistanceValue, setFocusDistanceValue] = useState<number | null>(null);
  const [manualFocusEnabled, setManualFocusEnabled] = useState(false);
  const [showCameraControls, setShowCameraControls] = useState(false);

  // Auto-Registration Modal State
  const [showAutoRegModal, setShowAutoRegModal] = useState(false);
  const [autoRegStep, setAutoRegStep] = useState<'confirm' | 'details'>('confirm');
  const [scannedParticipant, setScannedParticipant] = useState<any>(null);
  const [autoRegData, setAutoRegData] = useState({
    needs_accommodation: false,
    date_accommodation: [] as string[],
    need_ca: false,
    delegate_type: '' as '' | DelegateChoice,
    giveaway_selections: {} as Record<string, string | boolean>
  });
  const [autoRegSubmitting, setAutoRegSubmitting] = useState(false);
  const [isPromoting, setIsPromoting] = useState(false);

  // Borrow Mode State
  const [showBorrowActionModal, setShowBorrowActionModal] = useState(false);
  const [borrowAction, setBorrowAction] = useState<'borrow' | 'return' | null>(null);
  const [borrowStep, setBorrowStep] = useState<'action' | 'participant' | 'item'>('action');
  const [borrowParticipant, setBorrowParticipant] = useState<any>(null);
  const [borrowItem, setBorrowItem] = useState<any>(null);
  const [borrowActiveBorrows, setBorrowActiveBorrows] = useState<ActiveBorrow[]>([]);

  // True once the scanner has picked a delegate type for the current scan, so
  // the card doesn't come straight back asking to correct the choice again.
  const [delegateTypeAssigned, setDelegateTypeAssigned] = useState(false);
  const [autoRegEventId, setAutoRegEventId] = useState<number | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const cameraViewportRef = useRef<HTMLDivElement | null>(null);
  const readerId = "qr-reader-viewport";

  // Ref to hold selectedEventId to avoid restarting scanner on change
  const eventIdRef = useRef(selectedEventId);
  const selectedEventRef = useRef<Event | null>(null);
  const scanModeRef = useRef<ScanMode>(scanMode);
  const sessionRef = useRef<'AM' | 'PM'>(session);
  const isProcessingRef = useRef(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs for borrow mode state to keep handleScan callback in sync
  const borrowStepRef = useRef<'action' | 'participant' | 'item'>('action');
  const borrowActionRef = useRef<'borrow' | 'return' | null>(null);
  const borrowParticipantRef = useRef<any>(null);

  // What every log this page writes records as its `scanner_device`. Seeded
  // synchronously so a scan landing right after mount still names a device,
  // then upgraded once the Client Hints model resolves.
  const deviceLabelRef = useRef(readDeviceLabelSync());
  const getDeviceDateString = useCallback((date: Date) => format(date, 'yyyy-MM-dd'), []);

  const getDefaultSessionForEvent = (event?: Event): 'AM' | 'PM' => {
    if (!event || event.session === 'All_Day') {
      return new Date().getHours() < 12 ? 'AM' : 'PM';
    }

    return event.session;
  };

  const getQrboxSize = useCallback((viewfinderWidth: number, viewfinderHeight: number) => {
    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
    return Math.floor(minEdge * 0.65);
  }, []);

  const selectedEvent = events.find((event) => event.event_id.toString() === selectedEventId);
  const selectedEventGiveaways = selectedEvent?.giveaways || [];
  const selectedEventHasGiveaways = selectedEventGiveaways.length > 0;
  const selectedEventHasPrincipals = Boolean(selectedEvent?.has_principal_delegates);

  // Which delegate types the scanned participant can still be reassigned to.
  // A plain Delegate — an "Attendee", stored as NULL — can become either; a
  // Representative can only be corrected upward to Principal; a Principal is
  // already at the top and gets no buttons.
  const delegateReassignmentOptions: DelegateType[] = (() => {
      if (!selectedEventHasPrincipals) return [];
      if (scanMode !== 'attendance') return [];
      if (!participantDetails?.participantId) return [];
      if (scanResult !== 'Valid' && scanResult !== 'Duplicate' && scanResult !== 'Offline-Saved') return [];
      // The choice was already made on this card — offering "Mark as Principal"
      // to someone just marked Representative would only re-ask the question.
      if (delegateTypeAssigned) return [];
      if (participantDetails.delegateType === 'Principal') return [];
      if (participantDetails.delegateType === 'Representative') return ['Principal'];
      return isPlainDelegate(participantDetails.role, participantDetails.delegateType)
          ? ['Principal', 'Representative']
          : [];
  })();
  // False on cameras that expose no adjustable focus/zoom — typically desktop webcams.
  const hasCameraAdjustments = Boolean(
    cameraControls?.zoom || (cameraControls?.supportsManualFocus && cameraControls?.focusDistance)
  );

  const isSessionEnabled = (sessionOption: 'AM' | 'PM') => {
    if (!selectedEvent) return false;
    return selectedEvent.session === 'All_Day' || selectedEvent.session === sessionOption;
  };

  useEffect(() => {
    eventIdRef.current = selectedEventId;
  }, [selectedEventId]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    scanModeRef.current = scanMode;
  }, [scanMode]);

  // handleScan runs inside the html5-qrcode callback, which holds the closure
  // from when scanning started — event details have to come through refs.
  useEffect(() => {
    selectedEventRef.current = selectedEvent ?? null;
  }, [selectedEvent]);

  useEffect(() => {
    if (scanMode === 'giveaway' && (!selectedEventHasGiveaways || !isOnline)) {
      setScanMode('attendance');
    }
  }, [scanMode, selectedEventHasGiveaways, isOnline]);

  useEffect(() => {
    const updateFocusBoxSize = () => {
      const viewport = cameraViewportRef.current;
      if (!viewport) return;

      const { clientWidth, clientHeight } = viewport;
      if (!clientWidth || !clientHeight) return;

      setFocusBoxSize(getQrboxSize(clientWidth, clientHeight));
    };

    updateFocusBoxSize();

    const viewport = cameraViewportRef.current;
    if (!viewport || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateFocusBoxSize);
      return () => window.removeEventListener('resize', updateFocusBoxSize);
    }

    const observer = new ResizeObserver(updateFocusBoxSize);
    observer.observe(viewport);
    window.addEventListener('resize', updateFocusBoxSize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateFocusBoxSize);
    };
  }, [getQrboxSize]);

  useEffect(() => {
    if (!selectedEvent) return;

    if (selectedEvent.session === 'All_Day') {
      setSession((prev) => prev);
      return;
    }

    if (session !== selectedEvent.session) {
      setSession(selectedEvent.session);
    }
  }, [selectedEvent, session]);

  // --- 0. Device Label ---
  useEffect(() => {
    let active = true;
    resolveDeviceLabel().then((label) => {
      if (active) deviceLabelRef.current = label;
    });
    return () => { active = false; };
  }, []);

  // --- 1. Network Status Listeners & Queue Loading ---
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Load existing queue from local storage
    const storedQueue = localStorage.getItem('eventpulse_offline_queue');
    if (storedQueue) {
        try {
            const parsedQueue = JSON.parse(storedQueue) as Partial<OfflineScanItem>[];
            setOfflineQueue(
                parsedQueue.map((item) => ({
                    ...item,
                    attendance_date: item.attendance_date ?? getDeviceDateString(new Date(item.scan_time ?? Date.now()))
                })) as OfflineScanItem[]
            );
        } catch (e) {
            console.error("Error parsing offline queue", e);
        }
    }

    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- 2. Load Events ---
  useEffect(() => {
    const loadEvents = async () => {
      try {
        const today = format(new Date(), 'yyyy-MM-dd');

        const data = await fetchAccessibleEvents(user, {
          accessRoles: SCAN_EVENT_ACCESS_ROLES,
          dateContains: today,
          excludeCancelled: true,
          deletedView: 'active',
          orderBy: 'start_date',
          ascending: false
        });
        
        if (data && data.length > 0) {
          setEvents(data);

          // An `?event=<id>` param (e.g. the dashboard's Scan button) preselects
          // that event even when several are happening today.
          const requestedId = searchParams.get('event');
          const requestedEvent = requestedId
            ? data.find((event) => event.event_id.toString() === requestedId)
            : undefined;

          if (requestedEvent) {
            setSelectedEventId(requestedEvent.event_id.toString());
            setSession(getDefaultSessionForEvent(requestedEvent));
          } else if (data.length === 1) {
            setSelectedEventId(data[0].event_id.toString());
            setSession(getDefaultSessionForEvent(data[0]));
          } else {
            setSelectedEventId('');
          }
        } else {
            setEvents([]);
            setSelectedEventId('');
        }
      } catch (error) {
        console.error("Error loading events", error);
      } finally {
        setLoadingEvents(false);
      }
    };
    
    if (isOnline && user) {
        loadEvents();
    }
  }, [isOnline, user, searchParams]);

  // --- 3. Cache Participants when Event is Selected ---
  useEffect(() => {
    const cacheParticipants = async () => {
        if (!selectedEventId || !isOnline) return;

        try {
            const { data } = await supabase
                .from('event_participants')
                .select(`
                    participant_id,
                    role,
                    delegate_type,
                    participants (
                        participant_id,
                        participant_code,
                        full_name,
                        position,
                        office
                    )
                `)
                .eq('event_id', selectedEventId)
                .eq('registration_status', 'Registered');

            if (data) {
                const cache: ParticipantCache = {};
                data.forEach((row: any) => {
                    if (row.participants) {
                        cache[row.participants.participant_code] = {
                            participant_id: row.participants.participant_id,
                            full_name: row.participants.full_name,
                            position: row.participants.position,
                            office: row.participants.office,
                            role: row.role ?? null,
                            delegate_type: readDelegateType(row.role, row.delegate_type)
                        };
                    }
                });
                setParticipantCache(cache);
            }
        } catch (err) {
            console.error("Failed to cache participants", err);
        }
    };

    cacheParticipants();
  }, [selectedEventId, isOnline]);

  // --- 4. Sync Logic ---
  const syncOfflineScans = useCallback(async () => {
      if (offlineQueue.length === 0 || !isOnline || isSyncing) return;

      setIsSyncing(true);
      const newQueue = [...offlineQueue];
      const item = newQueue[0]; 
      const attendanceDate = item.attendance_date ?? getDeviceDateString(new Date(item.scan_time));

      try {
            const { data: existingLog } = await supabase
                .from('attendance_logs')
                .select('attendance_id, scan_time')
                .eq('event_id', item.event_id)
                .eq('participant_id', item.participant_id)
                .eq('attendance_date', attendanceDate)
                .eq('action_session', item.session)
                .in('scan_status', [...PRESENT_ATTENDANCE_STATUSES])
                .order('attendance_id', { ascending: true })
                .limit(1)
                .maybeSingle();

            if (existingLog) {
                if (item.session === 'PM') {
                    if (new Date(item.scan_time) > new Date(existingLog.scan_time)) {
                        await supabase
                            .from('attendance_logs')
                            .update({ 
                                scan_time: item.scan_time,
                                scanner_device: item.scanner_device + ' (Synced)',
                                remarks: 'Updated PM Time (Synced)'
                            })
                            .eq('attendance_id', existingLog.attendance_id);
                    }
                }
            } else {
                await supabase.from('attendance_logs').insert({
                    event_id: item.event_id,
                    participant_id: item.participant_id,
                    user_id: user?.user_id,
                    scan_status: 'Valid',
                    attendance_date: attendanceDate,
                    action_session: item.session,
                    scan_time: item.scan_time,
                    remarks: 'Synced from Offline',
                    scanner_device: item.scanner_device
                });
            }

            newQueue.shift();
            setOfflineQueue(newQueue);
            localStorage.setItem('eventpulse_offline_queue', JSON.stringify(newQueue));

      } catch (err) {
          console.error("Sync error for item", item, err);
      } finally {
          setIsSyncing(false);
      }
  }, [offlineQueue, isOnline, isSyncing, user]);

  useEffect(() => {
      if (isOnline && offlineQueue.length > 0) {
          const timer = setTimeout(() => {
              syncOfflineScans();
          }, 1000); 
          return () => clearTimeout(timer);
      }
  }, [isOnline, offlineQueue, syncOfflineScans]);


  // Keep borrow state refs in sync with state
  useEffect(() => {
    borrowStepRef.current = borrowStep;
    borrowActionRef.current = borrowAction;
    borrowParticipantRef.current = borrowParticipant;
  }, [borrowStep, borrowAction, borrowParticipant]);

  // --- 5. Scanner Initialization ---
  useEffect(() => {
    if (selectedEventId && !scanResult && !scanning && !cameraPaused) {
       startScanner();
    }
    else if ((!selectedEventId || scanResult || cameraPaused) && scanning) {
        cleanupScanner();
    }
  }, [selectedEventId, scanResult, scanning, cameraPaused]);

  useEffect(() => {
      return () => {
          if (resetTimerRef.current) {
              clearTimeout(resetTimerRef.current);
          }
          cleanupScanner();
      };
  }, []);

  const cleanupScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
            await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch(e) { }
      scannerRef.current = null;
      setScanning(false);
      // Capabilities belong to the track that just stopped.
      setCameraControls(null);
      setShowCameraControls(false);
      setZoomValue(null);
      setFocusDistanceValue(null);
      setManualFocusEnabled(false);
    }
  };

  const toCapabilityRange = (capability: any): CapabilityRange | null => {
      if (!capability) return null;
      const { min, max, step } = capability;
      if (typeof min !== 'number' || typeof max !== 'number' || !(max > min)) return null;
      return {
          min,
          max,
          step: typeof step === 'number' && step > 0 ? step : (max - min) / 100
      };
  };

  // Reads what this specific camera supports. Called after the track is live,
  // because capabilities are empty until then.
  const detectCameraControls = () => {
      const scanner = scannerRef.current;
      if (!scanner) return;

      try {
          const capabilities = scanner.getRunningTrackCapabilities() as any;
          const settings = scanner.getRunningTrackSettings() as any;
          const focusModes: string[] = Array.isArray(capabilities?.focusMode) ? capabilities.focusMode : [];

          const support: CameraControlSupport = {
              zoom: toCapabilityRange(capabilities?.zoom),
              focusDistance: toCapabilityRange(capabilities?.focusDistance),
              supportsManualFocus: focusModes.includes('manual'),
              supportsContinuousFocus: focusModes.includes('continuous')
          };

          setCameraControls(support);
          setZoomValue(typeof settings?.zoom === 'number' ? settings.zoom : support.zoom?.min ?? null);
          setFocusDistanceValue(
              typeof settings?.focusDistance === 'number' ? settings.focusDistance : support.focusDistance?.min ?? null
          );
          setManualFocusEnabled(settings?.focusMode === 'manual');
      } catch {
          // Browser exposes no track capabilities at all. Treat it as a
          // fixed-focus camera so the distance hint still shows.
          setCameraControls({
              zoom: null,
              focusDistance: null,
              supportsManualFocus: false,
              supportsContinuousFocus: false
          });
      }
  };

  const applyTrackConstraint = async (constraint: Record<string, unknown>) => {
      const scanner = scannerRef.current;
      if (!scanner) return false;

      try {
          await scanner.applyVideoConstraints({ advanced: [constraint] } as any);
          return true;
      } catch {
          toast.error('This camera rejected that setting.');
          return false;
      }
  };

  const handleZoomChange = (value: number) => {
      setZoomValue(value);
      void applyTrackConstraint({ zoom: value });
  };

  const handleFocusDistanceChange = (value: number) => {
      setFocusDistanceValue(value);
      void applyTrackConstraint({ focusMode: 'manual', focusDistance: value });
  };

  const handleManualFocusToggle = async (enabled: boolean) => {
      if (enabled) {
          const target = focusDistanceValue ?? cameraControls?.focusDistance?.min ?? 0;
          const applied = await applyTrackConstraint({ focusMode: 'manual', focusDistance: target });
          if (applied) {
              setManualFocusEnabled(true);
              setFocusDistanceValue(target);
          }
          return;
      }

      const applied = await applyTrackConstraint({ focusMode: 'continuous' });
      if (applied) setManualFocusEnabled(false);
  };

  const startScanner = async () => {
    if (scannerRef.current) {
        await cleanupScanner();
    }

    // Both need a user gesture; starting the camera is the one we get.
    if (selectedEventRef.current?.has_principal_delegates) {
        primeArrivalAudio();
        requestArrivalNotifications();
    }

    const html5QrCode = new Html5Qrcode(readerId, { 
      formatsToSupport: [ Html5QrcodeSupportedFormats.QR_CODE ],
      verbose: false 
    });
    scannerRef.current = html5QrCode;

    try {
        await html5QrCode.start(
            { facingMode: "environment" },
            {
                fps: 20, // Increased FPS for smoother scanning and faster focus reaction
                qrbox: (viewfinderWidth, viewfinderHeight) => {
                    const qrboxSize = getQrboxSize(viewfinderWidth, viewfinderHeight);
                    return {
                        width: qrboxSize,
                        height: qrboxSize
                    };
                },
                aspectRatio: window.innerWidth < 768 ? 1 : 1.77, 
                // Advanced constraints for better focus
                videoConstraints: {
                    facingMode: "environment",
                    // @ts-ignore - focusMode is supported in many browsers even if not in standard TS types
                    focusMode: "continuous",
                    width: { min: 640, ideal: 1280, max: 1920 },
                    height: { min: 480, ideal: 720, max: 1080 }
                }
            },
            (decodedText) => {
                handleScan(decodedText);
            },
            (errorMessage) => { }
        );
        setScanning(true);
        setCameraError(null);

        // Chrome can report empty capabilities for a moment after the track
        // starts, so probe again once the camera has settled.
        detectCameraControls();
        setTimeout(() => {
            if (scannerRef.current?.isScanning) detectCameraControls();
        }, 800);
    } catch (err) {
        console.error(err);
        setCameraError("Camera permission denied. Please ensure you are using HTTPS or localhost.");
        setScanning(false);
    }
  };

  const getEventAccommodationDates = (event?: Event) => {
    if (!event?.has_accommodation) return [] as string[];
    const savedDates = (event.dates_with_accom || []).filter(Boolean);
    if (savedDates.length > 0) return savedDates;

    try {
      if (!event.start_date) return [];
      const startDate = new Date(event.start_date);
      const endDate = event.end_date ? new Date(event.end_date) : startDate;

      const dates: string[] = [];
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        dates.push(currentDate.toISOString().split('T')[0]);
        currentDate.setDate(currentDate.getDate() + 1);
      }
      return dates;
    } catch {
      return [];
    }
  };

  const handleAutoRegConfirm = () => {
    setAutoRegStep('details');
  };

  const handleAutoRegSubmit = async () => {
    if (!scannedParticipant || !autoRegEventId || !selectedEvent) return;

    setAutoRegSubmitting(true);
    try {
      const accommodationDates = autoRegData.needs_accommodation && selectedEvent.has_accommodation
        ? autoRegData.date_accommodation
        : null;

      const scanMoment = new Date();
      const deviceScanTime = scanMoment.toISOString();
      const deviceAttendanceDate = getDeviceDateString(scanMoment);
      const currentSession = sessionRef.current;

      const { error } = await supabase
        .from('event_participants')
        .insert({
          event_id: autoRegEventId,
          participant_id: scannedParticipant.participant_id,
          registration_status: 'Registered',
          role: 'Delegate',
          // 'Attendee' is a UI-only answer meaning "neither", so it collapses to NULL.
          delegate_type: selectedEvent?.has_principal_delegates ? delegateTypeFromChoice(autoRegData.delegate_type) : null,
          needs_accommodation: autoRegData.needs_accommodation,
          accommodation_pax: autoRegData.needs_accommodation ? 1 : 0,
          date_accommodation: accommodationDates,
          need_ca: autoRegData.need_ca,
          giveaway_selections: autoRegData.giveaway_selections,
          accept_photo_video: false,
          store_to_db: false
        });

      if (error) {
        if (error.code === '23505') {
          processScanResult('Duplicate', 'Participant is already registered.', scannedParticipant.full_name, scannedParticipant.position);
        } else {
          throw error;
        }
      } else {
        // Log the attendance after successful auto-registration
        await logScan(autoRegEventId, scannedParticipant.participant_id, 'Valid', deviceScanTime, deviceAttendanceDate, currentSession, 'Auto-Registered');

        const registeredType = selectedEvent?.has_principal_delegates
          ? delegateTypeFromChoice(autoRegData.delegate_type)
          : null;

        setParticipantDetails({
          name: scannedParticipant.full_name,
          position: scannedParticipant.position,
          office: scannedParticipant.office,
          participantId: scannedParticipant.participant_id,
          delegateType: registeredType,
          role: 'Delegate'
        });
        processScanResult(
          'Valid',
          'Auto-registered successfully',
          scannedParticipant.full_name,
          scannedParticipant.position,
          { delegateType: registeredType, role: 'Delegate' }
        );
        setShowAutoRegModal(false);
        setScannedParticipant(null);

        if (registeredType === 'Principal') {
          void announceArrival({
            name: scannedParticipant.full_name,
            position: scannedParticipant.position,
            office: scannedParticipant.office,
            participantId: scannedParticipant.participant_id
          }, { source: 'AutoRegistered' });
        }
      }
    } catch (err: any) {
      processScanResult('Invalid', err.message || 'Auto-registration failed', scannedParticipant.full_name, '');
    } finally {
      setAutoRegSubmitting(false);
    }
  };

  const handleScan = async (qrToken: string) => {
    if (!scannerRef.current || isProcessingRef.current) return;

    isProcessingRef.current = true;

    try {
        if (scannerRef.current.isScanning) {
            await scannerRef.current.stop();
        }
        setScanning(false);
    } catch (e) { console.error(e) }

    const currentEventIdStr = eventIdRef.current;
    const eventId = parseInt(currentEventIdStr);
    if (isNaN(eventId)) {
        isProcessingRef.current = false;
        return;
    }

    const scanMoment = new Date();
    const deviceScanTime = scanMoment.toISOString();
    const deviceAttendanceDate = getDeviceDateString(scanMoment);
    const currentMode = scanModeRef.current;
    const currentSession = sessionRef.current;

    if (!isOnline) {
        if (currentMode === 'giveaway') {
            processScanResult(
                'Invalid',
                'Giveaway claim logging requires an internet connection.',
                'Offline',
                '',
                { autoReset: false }
            );
            return;
        }

        const cachedP = participantCache[qrToken];
        
        if (cachedP) {
            const offlineItem: OfflineScanItem = {
                id: Date.now().toString() + Math.random().toString().slice(2),
                event_id: eventId,
                participant_id: cachedP.participant_id,
                participant_code: qrToken,
                attendance_date: deviceAttendanceDate,
                scan_time: deviceScanTime,
                session: currentSession,
                scanner_device: deviceLabelRef.current + " (Offline)",
                timestamp: Date.now()
            };

            const newQueue = [...offlineQueue, offlineItem];
            setOfflineQueue(newQueue);
            localStorage.setItem('eventpulse_offline_queue', JSON.stringify(newQueue));

            setParticipantDetails({
                name: cachedP.full_name,
                position: cachedP.position,
                office: cachedP.office,
                participantId: cachedP.participant_id,
                delegateType: cachedP.delegate_type,
                role: cachedP.role
            });

            processScanResult(
                'Offline-Saved',
                'Saved locally. Will sync when online.',
                cachedP.full_name,
                cachedP.position,
                { delegateType: cachedP.delegate_type, role: cachedP.role }
            );

            if (cachedP.delegate_type === 'Principal') {
                void announceArrival({
                    name: cachedP.full_name,
                    position: cachedP.position,
                    office: cachedP.office,
                    participantId: cachedP.participant_id
                });
            }
        } else {
            processScanResult('Invalid', 'Participant not found in offline cache.', qrToken);
        }
        return;
    }

    // Second leg of the borrow flow: this QR is an item code, not a participant
    // code, so it must never reach the participants lookup below. Read from refs
    // — handleScan is handed to html5-qrcode once per camera start and would
    // otherwise close over the step it had when that start happened.
    if (currentMode === 'borrow'
        && borrowStepRef.current === 'item'
        && borrowParticipantRef.current
        && borrowActionRef.current) {
        await handleBorrowItemScan(
            qrToken,
            borrowParticipantRef.current,
            eventId,
            borrowActionRef.current
        );
        return;
    }

    try {
        const { data: partData, error: partError } = await supabase
            .from('participants')
            .select('participant_id, full_name, position, office')
            .eq('participant_code', qrToken)
            .single();

        if (partError || !partData) {
            processScanResult('Invalid', 'Participant not found in database.', qrToken, '', { autoReset: currentMode !== 'giveaway' });
            return;
        }

        const { data: regData } = await supabase
            .from('event_participants')
            .select('registration_status, giveaway_selections, role, delegate_type')
            .eq('event_id', eventId)
            .eq('participant_id', partData.participant_id)
            .single();

        const delegateType = selectedEventRef.current?.has_principal_delegates
            ? readDelegateType(regData?.role, regData?.delegate_type)
            : null;

        const participant = {
            name: partData.full_name,
            position: partData.position,
            office: partData.office,
            participantId: partData.participant_id,
            delegateType,
            role: regData?.role ?? null
        };
        setParticipantDetails(participant);

        if (!regData || regData.registration_status !== 'Registered') {
            if (currentMode === 'attendance') {
                // Show auto-registration modal for attendance mode
                setScannedParticipant(partData);
                setAutoRegStep('confirm');
                setAutoRegData({
                  needs_accommodation: false,
                  date_accommodation: [],
                  need_ca: false,
                  delegate_type: '',
                  giveaway_selections: {}
                });
                setAutoRegEventId(eventId);
                setShowAutoRegModal(true);
                return;
            } else {
                processScanResult('Invalid', 'Not registered for this event.', participant.name, participant.position, { autoReset: currentMode !== 'giveaway' });
                return;
            }
        }

        // First leg of the borrow flow: a participant was scanned, so ask what to
        // do with them. The item scan is handled by the early return above, so
        // this only ever runs for the 'action' step.
        if (currentMode === 'borrow') {
            // Refs are written alongside state so the next decoded QR sees the
            // participant even though the effect that syncs them runs later.
            borrowParticipantRef.current = participant;
            setBorrowParticipant(participant);

            // What they already hold decides whether Return is offered at all.
            const activeBorrows = await borrowService.getActiveBorrows(
                partData.participant_id,
                eventId
            );
            setBorrowActiveBorrows(activeBorrows);

            // Hold the camera while the choice is open, so a badge drifting back
            // into frame cannot restart the flow underneath the modal.
            setShowBorrowActionModal(true);
            setCameraPaused(true);
            return;
        }

        if (currentMode === 'giveaway') {
            await handleGiveawayClaim(eventId, partData.participant_id, participant, regData.giveaway_selections || {}, deviceScanTime);
            return;
        }

        const { data: existingLog } = await supabase
            .from('attendance_logs')
            .select('attendance_id')
            .eq('event_id', eventId)
            .eq('participant_id', partData.participant_id)
            .eq('attendance_date', deviceAttendanceDate)
            .eq('action_session', currentSession)
            .in('scan_status', [...PRESENT_ATTENDANCE_STATUSES])
            .order('attendance_id', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (existingLog) {
            if (currentSession === 'AM') {
                processScanResult('Duplicate', `Already scanned for ${currentSession}.`, participant.name, participant.position, { delegateType, role: regData.role });
                return;
            } else {
                const { error: updateError } = await supabase
                    .from('attendance_logs')
                    .update({
                        scan_time: deviceScanTime,
                        scanner_device: deviceLabelRef.current,
                        remarks: 'Updated PM Time'
                    })
                    .eq('attendance_id', existingLog.attendance_id);

                if (updateError) throw updateError;
                processScanResult('Valid', 'PM Time Updated', participant.name, participant.position, { delegateType, role: regData.role });
                return;
            }
        }

        await logScan(eventId, partData.participant_id, 'Valid', deviceScanTime, deviceAttendanceDate, currentSession, 'Success');
        processScanResult('Valid', 'Attendance Recorded', participant.name, participant.position, { delegateType, role: regData.role });

        if (delegateType === 'Principal') {
            void announceArrival(participant);
        }

    } catch (err: any) {
        processScanResult('Invalid', err.message || 'Scan failed', 'Unknown', '', { autoReset: currentMode !== 'giveaway' });
    }
  };

  // Every arrival path funnels through here: announce on this device, persist the
  // arrival, then broadcast to everyone else watching the event.
  const announceArrival = async (
      participant: {
          name: string;
          position?: string | null;
          office?: string | null;
          participantId?: number | null;
      },
      options: { source?: PrincipalArrivalSource } = {}
  ) => {
      const event = selectedEventRef.current;
      if (!event) return;

      const source = options.source ?? 'Scan';
      const arrivedAt = new Date();

      const payload = {
          event_id: event.event_id,
          event_name: event.event_name,
          participant_name: participant.name,
          position: participant.position ?? null,
          office: participant.office ?? null,
          at: arrivedAt.toISOString(),
          promoted: source === 'Promoted',
          scanned_by: user?.user_id ?? null
      };

      // The scanner's own result card already announces this arrival on screen.
      announcePrincipalArrival(payload, { suppressModal: true });

      // Offline arrivals still announce on this device; there is nothing to log
      // or broadcast to until the socket is back.
      if (!navigator.onLine) return;

      await Promise.all([
          logPrincipalArrival(event.event_id, participant.participantId, arrivedAt, source),
          broadcastPrincipalArrival(payload, {
              officeId: event.organize_by,
              eventId: event.event_id
          })
      ]);
  };

  const logPrincipalArrival = async (
      eventId: number,
      participantId: number | null | undefined,
      arrivedAt: Date,
      source: PrincipalArrivalSource
  ) => {
      if (!participantId) return;

      const { error } = await supabase.from('principal_arrival_logs').insert({
          event_id: eventId,
          participant_id: participantId,
          user_id: user?.user_id ?? null,
          arrived_at: arrivedAt.toISOString(),
          arrival_date: getDeviceDateString(arrivedAt),
          source,
          scanner_device: deviceLabelRef.current,
          remarks: source === 'Promoted'
              ? 'Marked as Principal at the scanner'
              : source === 'AutoRegistered'
                  ? 'Registered and arrived at the scanner'
                  : null
      });

      // 23505 is the once-per-day unique index: the same Principal re-scanned.
      if (error && (error as any).code !== '23505') {
          console.warn('[principal-arrival] could not log arrival', error);
      }
  };

  // Scan-time correction: an ordinary Attendee turns out to hold the seat, or a
  // Representative turns out to be the Principal after all.
  const assignDelegateType = async (next: DelegateType) => {
      const event = selectedEventRef.current;
      const details = participantDetails;
      if (!event || !details?.participantId || isPromoting) return;

      setIsPromoting(true);
      try {
          const previous = { delegate_type: details.delegateType ?? null };
          const { error } = await supabase
              .from('event_participants')
              .update({ delegate_type: next })
              .eq('event_id', event.event_id)
              .eq('participant_id', details.participantId);

          if (error) throw error;

          logAudit({
              actor: user,
              action: 'Update',
              entityType: 'EventParticipant',
              entityId: details.participantId,
              entityLabel: details.name,
              eventId: event.event_id,
              eventName: event.event_name,
              reason: `Marked as ${next} at the scanner`,
              changes: diffRecords(previous, { delegate_type: next })
          });

          const updated = { ...details, delegateType: next };
          setParticipantDetails(updated);
          setParticipantCache((prev) => {
              const code = Object.keys(prev).find((key) => prev[key].participant_id === details.participantId);
              if (!code) return prev;
              return { ...prev, [code]: { ...prev[code], delegate_type: next } };
          });
          setRecentScans((prev) => prev.map((scan, index) => (
              index === 0 ? { ...scan, delegateType: next } : scan
          )));
          setResultMessage(`Marked as ${next}`);
          setDelegateTypeAssigned(true);

          // Only a Principal's arrival is announced.
          if (next === 'Principal') {
              await announceArrival(updated, { source: 'Promoted' });
          }
      } catch (err: any) {
          toast.error(`Could not mark as ${next}: ` + (err?.message || 'Unknown error'));
      } finally {
          setIsPromoting(false);
      }
  };

  const logScan = async (eventId: number, participantId: number, status: 'Valid' | 'Invalid' | 'Duplicate', scanTimeStr: string, attendanceDate: string, scanSession: 'AM' | 'PM', notes?: string) => {
      if (!user) return;
      const dbEventId = eventId === 0 ? null : eventId;
      const dbParticipantId = participantId === 0 ? null : participantId;

      await supabase.from('attendance_logs').insert({
          event_id: dbEventId,
          participant_id: dbParticipantId,
          user_id: user.user_id,
          scan_status: status,
          attendance_date: attendanceDate,
          action_session: scanSession,
          remarks: notes,
          scan_time: scanTimeStr,
          scanner_device: deviceLabelRef.current
      });
  };

  const formatGiveawayValue = (item: GiveawayItem, rawValue: string | boolean | null | undefined) => {
      if (item.type === 'boolean') {
          return rawValue === true ? 'Yes' : 'No';
      }

      if (typeof rawValue === 'string' && rawValue.trim()) {
          return rawValue;
      }

      return 'No selection';
  };

  const hasClaimableGiveawaySelection = (giveaways: GiveawayItem[], selections: Record<string, string | boolean> | null | undefined) => {
      return giveaways.some((item) => {
          const value = selections?.[item.key];

          if (item.type === 'boolean') {
              return value === true;
          }

          return typeof value === 'string' && value.trim().length > 0;
      });
  };

  const buildGiveawayDisplayItems = (giveaways: GiveawayItem[], selections: Record<string, string | boolean> | null | undefined) => {
      return giveaways.map((item) => ({
          key: item.key,
          label: item.label,
          value: formatGiveawayValue(item, selections?.[item.key])
      }));
  };

  const buildGiveawaySnapshot = (giveaways: GiveawayItem[], selections: Record<string, string | boolean> | null | undefined) => {
      return {
          items: giveaways.map((item) => ({
              key: item.key,
              label: item.label,
              type: item.type,
              raw_value: selections?.[item.key] ?? null,
              display_value: formatGiveawayValue(item, selections?.[item.key])
          }))
      };
  };

  const handleGiveawayClaim = async (
      eventId: number,
      participantId: number,
      participant: ParticipantDetails,
      giveawaySelections: Record<string, string | boolean>,
      scanTimeStr: string
  ) => {
      const eventForScan = events.find((event) => event.event_id === eventId);
      const giveaways = eventForScan?.giveaways || [];

      if (giveaways.length === 0) {
          setGiveawayClaimDetails(null);
          processScanResult('Invalid', 'This event has no giveaways configured.', participant.name, participant.position, { autoReset: false });
          return;
      }

      const displayItems = buildGiveawayDisplayItems(giveaways, giveawaySelections);
      const claimDetails = {
          items: displayItems,
          alreadyClaimed: false
      };

      if (!hasClaimableGiveawaySelection(giveaways, giveawaySelections)) {
          setGiveawayClaimDetails(null);
          processScanResult(
              'Invalid',
              "Participant don't want giveaways selected.",
              participant.name,
              participant.position,
              { autoReset: false }
          );
          return;
      }

      const { data: existingClaim, error: existingError } = await supabase
          .from('giveaway_claim_logs')
          .select('claim_id, claimed_at')
          .eq('event_id', eventId)
          .eq('participant_id', participantId)
          .maybeSingle();

      if (existingError) {
          throw existingError;
      }

      if (existingClaim) {
          setGiveawayClaimDetails({
              ...claimDetails,
              alreadyClaimed: true,
              claimedAt: existingClaim.claimed_at
          });
          processScanResult(
              'Duplicate',
              `Claimed on ${format(new Date(existingClaim.claimed_at), 'MMM d, yyyy h:mm a')}.`,
              participant.name,
              participant.position,
              { autoReset: false }
          );
          return;
      }

      const { error: insertError } = await supabase.from('giveaway_claim_logs').insert({
          event_id: eventId,
          participant_id: participantId,
          user_id: user?.user_id,
          claimed_at: scanTimeStr,
          claim_status: 'Claimed',
          giveaway_snapshot: buildGiveawaySnapshot(giveaways, giveawaySelections),
          scanner_device: deviceLabelRef.current,
          remarks: 'Claimed via scanner giveaway mode'
      });

      if (insertError) {
          if ((insertError as any).code === '23505') {
              setGiveawayClaimDetails({
                  ...claimDetails,
                  alreadyClaimed: true
              });
              processScanResult('Duplicate', 'Claimed already.', participant.name, participant.position, { autoReset: false });
              return;
          }

          throw insertError;
      }

      setGiveawayClaimDetails(claimDetails);
      processScanResult('Valid', 'Giveaway claim logged.', participant.name, participant.position, { autoReset: false });
  };

  const clearScanResult = (options: { resumeCamera?: boolean; pauseCamera?: boolean } = {}) => {
      if (resetTimerRef.current) {
          clearTimeout(resetTimerRef.current);
          resetTimerRef.current = null;
      }

      setScanResult(null);
      setParticipantDetails(null);
      setGiveawayClaimDetails(null);
      setResultMessage('');
      setResultRequiresAck(false);
      setDelegateTypeAssigned(false);
      isProcessingRef.current = false;

      if (options.resumeCamera) {
          setCameraPaused(false);
      } else if (options.pauseCamera) {
          setCameraPaused(true);
      }
  };

  const processScanResult = (
      status: 'Valid' | 'Invalid' | 'Duplicate' | 'Offline-Saved',
      message: string,
      name: string = 'Unknown',
      position: string = '',
      options: { autoReset?: boolean; delegateType?: DelegateType | null; role?: string | null } = {}
  ) => {
      // On events that seat principals, every Delegate card is held until
      // acknowledged: a Principal so the arrival isn't cleared before anyone
      // reads it, and a Representative or Attendee so there is time to correct
      // the type. Non-delegates, and every scan on ordinary events, keep the 2s
      // flow.
      const holdForDelegateAction = Boolean(selectedEventRef.current?.has_principal_delegates)
          && options.role === 'Delegate';
      const autoReset = (options.delegateType || holdForDelegateAction) ? false : options.autoReset;

      setScanResult(status);
      setResultMessage(message);
      setResultRequiresAck(autoReset === false);
      setDelegateTypeAssigned(false);

      const newScan: RecentScan = {
          id: Date.now().toString(),
          name,
          position,
          status,
          message,
          timestamp: new Date(),
          delegateType: options.delegateType ?? null
      };
      setRecentScans(prev => [newScan, ...prev].slice(0, 20));

      if (navigator.vibrate) {
        if (status === 'Valid' || status === 'Offline-Saved') navigator.vibrate([100]);
        else navigator.vibrate([300]);
      }

      if (resetTimerRef.current) {
          clearTimeout(resetTimerRef.current);
      }

      if (autoReset === false) {
          resetTimerRef.current = null;
          return;
      }

      resetTimerRef.current = setTimeout(() => {
          // Borrow runs back-to-back like attendance — the next delegate is
          // already waiting — so it keeps the camera live rather than parking it.
          const keepsCameraLive = scanModeRef.current === 'attendance'
              || scanModeRef.current === 'borrow';
          clearScanResult({
              resumeCamera: keepsCameraLive,
              pauseCamera: !keepsCameraLive
          });
      }, 2000);
  };

  const pauseCamera = () => {
      if (scanResult) {
          clearScanResult({ pauseCamera: true });
          return;
      }

      setCameraPaused(true);
  };

  const resumeCamera = () => {
      if (!selectedEventId) return;

      if (scanResult) {
          clearScanResult({ resumeCamera: true });
          return;
      }

      setCameraError(null);
      setCameraPaused(false);
  };

  const handleScanModeChange = (nextMode: ScanMode) => {
      if (nextMode === scanMode) return;

      if (nextMode === 'giveaway' && (!selectedEventHasGiveaways || !isOnline)) {
          return;
      }

      if (scanResult) {
          clearScanResult({ pauseCamera: cameraPaused });
      }

      // Leaving borrow mid-flow must not leave leg two armed — the next mode's
      // scans would be read as item codes.
      resetBorrowFlow();

      setScanMode(nextMode);
  };

  // Returns the flow to "waiting for a participant". Refs are cleared alongside
  // state because the scan callback reads the refs, and React state would not be
  // visible to a QR decoded before the next render.
  const resetBorrowFlow = () => {
      borrowStepRef.current = 'action';
      borrowActionRef.current = null;
      borrowParticipantRef.current = null;
      setBorrowStep('action');
      setBorrowAction(null);
      setBorrowParticipant(null);
      setBorrowActiveBorrows([]);
      setShowBorrowActionModal(false);
  };

  // Arms leg two. The refs are what the scan callback reads, so they are set
  // here rather than left to the sync effect — the camera restarts immediately
  // and a QR can be decoded before React re-renders. Clearing isProcessingRef is
  // what lets that next scan through at all: handleScan set it on the
  // participant scan and nothing else releases it on this path.
  const beginBorrowLeg = (action: 'borrow' | 'return') => {
      borrowActionRef.current = action;
      borrowStepRef.current = 'item';
      setBorrowAction(action);
      setBorrowStep('item');
      setShowBorrowActionModal(false);
      isProcessingRef.current = false;
      setCameraPaused(false);
  };

  // Leg two of the flow: `itemCode` is an item QR, and `participant` is whoever
  // was scanned in leg one. Every exit resets the flow so the next scan starts
  // over at the participant step rather than half-way through this one.
  const handleBorrowItemScan = async (
      itemCode: string,
      participant: ParticipantDetails,
      eventId: number,
      action: 'borrow' | 'return'
  ) => {
    const name = participant.name;
    const position = participant.position;

    if (!user?.office_id) {
      resetBorrowFlow();
      processScanResult('Invalid', 'Your account is not assigned to an office.', name, position);
      return;
    }

    try {
      const item = await borrowService.getItemByCode(itemCode, user.office_id);

      if (!item) {
        resetBorrowFlow();
        processScanResult('Invalid', 'Item not found in this office inventory.', name, position);
        return;
      }

      if (action === 'borrow') {
        const result = await borrowService.borrowItem(
            eventId,
            participant.participantId || 0,
            item.item_id,
            deviceLabelRef.current
        );

        resetBorrowFlow();

        if (result) {
          processScanResult('Valid', `${item.item_name} → ${name}`, name, position);
        } else {
          // borrowItem swallows the RPC error, and the one it can raise is the
          // uniqueness guard on an item that is already out.
          processScanResult('Duplicate', `${item.item_name} is already borrowed.`, name, position);
        }
        return;
      }

      const activeBorrows = await borrowService.getActiveBorrows(
          participant.participantId || 0,
          eventId
      );
      const borrow = activeBorrows.find(b => b.item_id === item.item_id);

      if (!borrow) {
        resetBorrowFlow();
        processScanResult('Invalid', `${name} is not holding ${item.item_name}.`, name, position);
        return;
      }

      const result = await borrowService.returnItem(
          borrow.borrow_id,
          participant.participantId || 0,
          deviceLabelRef.current
      );

      resetBorrowFlow();

      if (result) {
        const heldMinutes = Math.max(
            0,
            Math.round((Date.now() - new Date(borrow.borrowed_at).getTime()) / 60000)
        );
        processScanResult('Valid', `${item.item_name} returned after ${formatHeldFor(heldMinutes)}.`, name, position);
      } else {
        processScanResult('Invalid', `Could not return ${item.item_name}.`, name, position);
      }
    } catch (err) {
      console.error('Borrow scan failed:', err);
      resetBorrowFlow();
      processScanResult('Invalid', 'Could not record that borrow.', name, position);
    }
  };

  const getResultTitle = () => {
      if (scanResult === 'Valid') return 'Verified!';
      if (scanResult === 'Offline-Saved') return 'Saved (Offline)';
      if (scanResult === 'Duplicate' && giveawayClaimDetails?.alreadyClaimed) return 'Claimed Already';
      return scanResult;
  };

  const eventOptionTextStyle: React.CSSProperties = {
      fontSize: 'inherit'
  };

  return (
    <div className="h-full w-full flex flex-col bg-black p-0 lg:flex-row lg:gap-0 lg:bg-[#111110] overflow-hidden">
        
        {/* LEFT/TOP: Controls + Camera Section */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-none border-0 bg-[#0F0F0E] shadow-none lg:rounded-none">
            <div className="shrink-0 border-b border-[#2A2926] bg-[#0F0F0E]/95 p-1 sm:p-2 lg:p-3">
                 <div className="flex flex-col gap-1 max-w-5xl mx-auto">
                    {(!isOnline || offlineQueue.length > 0) && (
                        <div className="flex justify-end gap-2">
                            {!isOnline && (
                                <div className="bg-red-500/20 text-red-400 px-2.5 sm:px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-bold flex items-center gap-1.5 backdrop-blur-md border border-red-500/30">
                                    <WifiOff size={14} /> Offline Mode
                                </div>
                            )}
                            {offlineQueue.length > 0 && (
                                 <div className="bg-amber-500/20 text-amber-400 px-2.5 sm:px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-bold flex items-center gap-1.5 backdrop-blur-md border border-amber-500/30 animate-pulse">
                                    <CloudUpload size={14} /> {offlineQueue.length} Pending
                                 </div>
                            )}
                        </div>
                    )}

                    <div className={`grid grid-cols-2 gap-1 sm:gap-2 md:items-start ${
                        scanMode === 'giveaway'
                            ? 'md:grid-cols-[minmax(0,1fr)_220px] xl:grid-cols-[minmax(0,1fr)_240px]'
                            : 'md:grid-cols-[minmax(0,1fr)_330px_220px] xl:grid-cols-[minmax(0,1fr)_360px_240px]'
                    }`}>
                        <div className="col-span-2 md:col-span-1 flex-1 w-full rounded-none sm:rounded-xl lg:rounded-2xl border border-[#2A2926] bg-[#111110]/70 p-0.5 sm:p-1.5">
                            <p className="px-2 pb-0.5 text-[9px] sm:text-[11px] font-bold uppercase tracking-[0.18em] sm:tracking-[0.24em] text-[#7C7A72]">Event</p>
                            {loadingEvents ? (
                                <div className="h-9 sm:h-12 bg-[#2A2926] rounded-none sm:rounded-xl animate-pulse"></div>
                            ) : (
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9A9890]" size={16} />
                                    <select 
                                        value={selectedEventId}
                                        onChange={(e) => {
                                            const nextEventId = e.target.value;
                                            setSelectedEventId(nextEventId);
                                            setCameraPaused(false);

                                            const nextEvent = events.find((event) => event.event_id.toString() === nextEventId);
                                            if (nextEvent) {
                                                setSession(getDefaultSessionForEvent(nextEvent));
                                            }
                                        }}
                                        className="w-full bg-[#0F0F0E] text-white text-[11px] sm:text-xs font-medium rounded-none sm:rounded-xl pl-9 pr-8 py-2 sm:py-2.5 border border-[#4A4843] focus:ring-2 focus:ring-[#6255E9] focus:border-[#6255E9] shadow-sm appearance-none"
                                    >
                                        {events.length === 0 ? (
                                            <option className="text-[11px] sm:text-xs" style={eventOptionTextStyle} value="">No Events Today</option>
                                        ) : (
                                            <>
                                                {(events.length > 1 || !selectedEventId) && <option className="text-[11px] sm:text-xs" style={eventOptionTextStyle} value="">-- Select Event --</option>}
                                                {events.map(e => <option className="text-[11px] sm:text-xs" style={eventOptionTextStyle} key={e.event_id} value={e.event_id}>{e.event_name}</option>)}
                                            </>
                                        )}
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                        <svg className="w-4 h-4 text-[#9A9890]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className={`${scanMode === 'giveaway' ? 'col-span-2 md:col-span-1' : 'col-span-1'} w-full xl:w-auto rounded-none sm:rounded-xl lg:rounded-2xl border border-[#2A2926] bg-[#111110]/70 p-0.5 sm:p-1.5 shadow-sm`}>
                            <p className="px-2 pb-0.5 text-[9px] sm:text-[11px] font-bold uppercase tracking-[0.18em] sm:tracking-[0.24em] text-[#7C7A72]">Mode</p>
                            <div className="grid grid-cols-3 gap-1">
                                <button
                                    type="button"
                                    onClick={() => handleScanModeChange('attendance')}
                                    aria-pressed={scanMode === 'attendance'}
                                    className={`px-2 py-2 sm:px-3 sm:py-2.5 rounded-none sm:rounded-xl text-[11px] sm:text-sm font-bold flex items-center justify-center gap-1 transition-all border
                                        ${scanMode === 'attendance'
                                            ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                                            : 'bg-[#0F0F0E]/60 border-[#2A2926] text-[#C5C2BA] hover:bg-emerald-500/10'
                                        }`}
                                >
                                    <CheckCircle size={14} className="sm:w-4 sm:h-4" />
                                    Attendance
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleScanModeChange('giveaway')}
                                    disabled={!selectedEventHasGiveaways || !isOnline}
                                    aria-pressed={scanMode === 'giveaway'}
                                    title={!selectedEventHasGiveaways ? 'No giveaways configured for this event' : !isOnline ? 'Giveaway claims require internet connection' : 'Scan giveaway claims'}
                                    className={`px-2 py-2 sm:px-3 sm:py-2.5 rounded-none sm:rounded-xl text-[11px] sm:text-sm font-bold flex items-center justify-center gap-1 transition-all border
                                        ${scanMode === 'giveaway'
                                            ? 'bg-fuchsia-500/20 border-fuchsia-400/60 text-fuchsia-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                                            : 'bg-[#0F0F0E]/60 border-[#2A2926] text-[#C5C2BA]'
                                        }
                                        ${selectedEventHasGiveaways && isOnline
                                            ? 'hover:bg-fuchsia-500/10'
                                            : 'opacity-40 cursor-not-allowed text-[#7C7A72]'
                                        }`}
                                >
                                    <Gift size={14} className="sm:w-4 sm:h-4" />
                                    Giveaway
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleScanModeChange('borrow')}
                                    aria-pressed={scanMode === 'borrow'}
                                    title="Borrow and return items"
                                    className={`px-2 py-2 sm:px-3 sm:py-2.5 rounded-none sm:rounded-xl text-[11px] sm:text-sm font-bold flex items-center justify-center gap-1 transition-all border
                                        ${scanMode === 'borrow'
                                            ? 'bg-blue-500/20 border-blue-400/60 text-blue-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                                            : 'bg-[#0F0F0E]/60 border-[#2A2926] text-[#C5C2BA] hover:bg-blue-500/10'
                                        }`}
                                >
                                    <Package size={14} className="sm:w-4 sm:h-4" />
                                    Borrow
                                </button>
                            </div>
                        </div>
                        
                        {scanMode === 'attendance' && (
                            <div className="col-span-1 w-full xl:w-auto rounded-none sm:rounded-xl lg:rounded-2xl border border-[#2A2926] bg-[#111110]/70 p-0.5 sm:p-1.5 shadow-sm">
                                <p className="px-2 pb-0.5 text-[9px] sm:text-[11px] font-bold uppercase tracking-[0.18em] sm:tracking-[0.24em] text-[#7C7A72]">Session</p>
                                <div className="grid grid-cols-2 gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setSession('AM')}
                                        disabled={!isSessionEnabled('AM')}
                                        aria-pressed={session === 'AM'}
                                        className={`px-2 py-2 sm:px-3 sm:py-2.5 rounded-none sm:rounded-xl text-[11px] sm:text-sm font-bold flex items-center justify-center gap-1 transition-all border
                                            ${session === 'AM'
                                                ? 'bg-amber-500/20 border-amber-400/60 text-amber-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                                                : 'bg-[#0F0F0E]/60 border-[#2A2926] text-[#C5C2BA]'
                                            }
                                            ${isSessionEnabled('AM')
                                                ? 'hover:bg-amber-500/10'
                                                : 'opacity-40 cursor-not-allowed text-[#7C7A72]'
                                            }`}
                                    >
                                        <Sun size={14} className="fill-current sm:w-4 sm:h-4" />
                                        AM
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSession('PM')}
                                        disabled={!isSessionEnabled('PM')}
                                        aria-pressed={session === 'PM'}
                                        className={`px-2 py-2 sm:px-3 sm:py-2.5 rounded-none sm:rounded-xl text-[11px] sm:text-sm font-bold flex items-center justify-center gap-1 transition-all border
                                            ${session === 'PM'
                                                ? 'bg-[#4B3FE4]/20 border-[#6255E9]/60 text-[#A29AEC] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                                                : 'bg-[#0F0F0E]/60 border-[#2A2926] text-[#C5C2BA]'
                                            }
                                            ${isSessionEnabled('PM')
                                                ? 'hover:bg-[#4B3FE4]/10'
                                                : 'opacity-40 cursor-not-allowed text-[#7C7A72]'
                                            }`}
                                    >
                                        <Moon size={14} className="fill-current sm:w-4 sm:h-4" />
                                        PM
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={cameraPaused ? resumeCamera : pauseCamera}
                            disabled={!selectedEventId || !!scanResult}
                            className={`inline-flex items-center justify-center gap-1.5 rounded-none sm:rounded-xl border px-3 py-1.5 text-[11px] sm:text-xs font-bold transition-colors ${
                                cameraPaused
                                    ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                                    : 'border-[#4A4843] bg-[#111110] text-[#C5C2BA] hover:bg-[#2A2926]'
                            } ${(!selectedEventId || !!scanResult) ? 'cursor-not-allowed opacity-45' : ''}`}
                        >
                            {cameraPaused ? <Play size={15} /> : <Pause size={15} />}
                            {cameraPaused ? 'Resume Camera' : 'Pause Camera'}
                        </button>
                    </div>
                </div>
            </div>

                <div ref={cameraViewportRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black sm:min-h-[520px] lg:min-h-0">
                    {cameraError ? (
                        <div className="text-white text-center p-8 max-w-sm">
                            <div className="bg-red-500/20 p-6 rounded-full inline-block mb-6">
                                <AlertTriangle size={48} className="text-red-500" />
                            </div>
                            <h3 className="text-xl font-bold mb-2">Camera Access Error</h3>
                            <p className="text-[#9A9890] mb-6 font-medium text-sm leading-relaxed">{cameraError}</p>
                            <button 
                                onClick={() => startScanner()} 
                                className="bg-white text-black px-8 py-3 rounded-full font-bold hover:bg-[#E0DDD4] transition-colors"
                            >
                                Retry Camera
                            </button>
                        </div>
                    ) : (
                        <>
                            <div
                                id={readerId}
                                className="w-full h-full [&>div]:h-full [&>div]:w-full [&_video]:h-full [&_video]:w-full [&_video]:max-w-none [&_video]:object-cover"
                            ></div>
                            
                            {/* Static Overlay Guide */}
                            {!scanResult && scanning && (
                                <div className="absolute inset-0 pointer-events-none flex items-center justify-center -translate-y-8 sm:-translate-y-6">
                                    <div
                                        className="relative"
                                        style={{ width: `${focusBoxSize}px`, height: `${focusBoxSize}px` }}
                                    >
                                        <div className="absolute top-0 left-0 w-9 h-9 sm:w-10 sm:h-10 border-t-4 border-l-4 border-white -mt-1 -ml-1 sm:rounded-tl-xl"></div>
                                        <div className="absolute top-0 right-0 w-9 h-9 sm:w-10 sm:h-10 border-t-4 border-r-4 border-white -mt-1 -mr-1 sm:rounded-tr-xl"></div>
                                        <div className="absolute bottom-0 left-0 w-9 h-9 sm:w-10 sm:h-10 border-b-4 border-l-4 border-white -mb-1 -ml-1 sm:rounded-bl-xl"></div>
                                        <div className="absolute bottom-0 right-0 w-9 h-9 sm:w-10 sm:h-10 border-b-4 border-r-4 border-white -mb-1 -mr-1 sm:rounded-br-xl"></div>
                                        <div className="absolute left-1/2 top-full mt-3 sm:mt-5 -translate-x-1/2 bg-black/75 backdrop-blur-md px-4 py-2 sm:px-6 sm:py-3 rounded-full text-white text-xs sm:text-sm font-bold border border-white/20 tracking-wide flex items-center justify-center gap-2 shadow-lg whitespace-nowrap min-w-[210px] sm:min-w-0">
                                            <div className="w-2 h-2 bg-[#6255E9] rounded-full animate-pulse"></div>
                                            {scanMode === 'giveaway' ? 'Scan Giveaway Claim' : scanMode === 'borrow' ? (borrowAction ? 'Scan Item QR Code' : 'Scan Participant QR Code') : 'Focusing on QR Code...'}
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            {/* Camera focus / zoom. Rendered from what the running
                                track reports, so desktop webcams that expose
                                nothing get the distance hint instead. */}
                            {!scanResult && scanning && cameraControls && (
                                <div className="absolute bottom-3 right-3 z-20 flex w-[min(19rem,calc(100%-1.5rem))] flex-col items-end gap-2">
                                    {showCameraControls && (
                                        <div className="w-full rounded-2xl border border-white/15 bg-black/80 p-4 text-white shadow-xl backdrop-blur-md">
                                            {hasCameraAdjustments ? (
                                                <div className="space-y-4">
                                                    {cameraControls.zoom && zoomValue !== null && (
                                                        <div>
                                                            <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-white/70">
                                                                <span>Zoom</span>
                                                                <span className="font-mono text-white">{zoomValue.toFixed(1)}×</span>
                                                            </div>
                                                            <input
                                                                type="range"
                                                                min={cameraControls.zoom.min}
                                                                max={cameraControls.zoom.max}
                                                                step={cameraControls.zoom.step}
                                                                value={zoomValue}
                                                                onChange={(e) => handleZoomChange(Number(e.target.value))}
                                                                className="w-full accent-[#6255E9]"
                                                            />
                                                        </div>
                                                    )}

                                                    {cameraControls.supportsManualFocus && cameraControls.focusDistance && (
                                                        <div>
                                                            <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-white/70">
                                                                <span>Focus</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleManualFocusToggle(!manualFocusEnabled)}
                                                                    className="rounded-full border border-white/25 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white transition-colors hover:bg-white/10"
                                                                >
                                                                    {manualFocusEnabled ? 'Manual' : 'Auto'}
                                                                </button>
                                                            </div>
                                                            <input
                                                                type="range"
                                                                min={cameraControls.focusDistance.min}
                                                                max={cameraControls.focusDistance.max}
                                                                step={cameraControls.focusDistance.step}
                                                                value={focusDistanceValue ?? cameraControls.focusDistance.min}
                                                                onChange={(e) => handleFocusDistanceChange(Number(e.target.value))}
                                                                disabled={!manualFocusEnabled}
                                                                className="w-full accent-[#6255E9] disabled:opacity-40"
                                                            />
                                                            <p className="mt-1 text-[10px] leading-relaxed text-white/50">
                                                                {manualFocusEnabled
                                                                    ? 'Drag until the QR code looks sharp.'
                                                                    : 'Switch to Manual to set focus yourself.'}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="space-y-1.5">
                                                    <p className="text-[11px] font-bold uppercase tracking-widest text-white/70">Fixed focus camera</p>
                                                    <p className="text-xs leading-relaxed text-white/70">
                                                        This camera exposes no focus or zoom control to the browser. Hold the QR code
                                                        <span className="font-bold text-white"> 25–40&nbsp;cm </span>
                                                        away, keep it flat and well lit, and avoid glare on phone screens.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => setShowCameraControls((prev) => !prev)}
                                        className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/70 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white backdrop-blur-md transition-colors hover:bg-black/90"
                                    >
                                        <Camera size={13} />
                                        {hasCameraAdjustments ? 'Camera' : 'Focus help'}
                                    </button>
                                </div>
                            )}

                            {!scanResult && !scanning && !loadingEvents && (
                                 <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white p-6 text-center">
                                    {cameraPaused && selectedEventId ? (
                                        <>
                                            <div className="mb-5 rounded-full bg-emerald-500/20 p-5 text-emerald-300">
                                                <Play size={52} />
                                            </div>
                                            <h3 className="text-2xl font-black text-white">Camera Paused</h3>
                                            <p className="mt-2 max-w-xs text-sm font-medium leading-relaxed text-[#9A9890]">
                                                The camera is off to reduce heat and battery use.
                                            </p>
                                            <button
                                                type="button"
                                                onClick={resumeCamera}
                                                className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-white px-8 py-3 text-sm font-black text-[#0F0F0E] transition-colors hover:bg-[#E0DDD4]"
                                            >
                                                <Play size={18} />
                                                Scan Again
                                            </button>
                                        </>
                                    ) : !selectedEventId ? (
                                        <>
                                            <Calendar className="w-16 h-16 text-[#7C7A72] mb-4" />
                                            <h3 className="text-xl font-bold text-[#C5C2BA]">No Event Selected</h3>
                                            <p className="text-[#7C7A72] mt-2">Please select an ongoing event to start scanning.</p>
                                        </>
                                    ) : (
                                        <>
                                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
                                            <p className="font-medium">Initializing Advanced Scanner...</p>
                                        </>
                                    )}
                                 </div>
                            )}
                        </>
                    )}
                </div>

                <style>{`
                    #qr-shaded-region {
                        display: none !important;
                    }

                    @keyframes scan {
                        0% { transform: translateY(0); opacity: 0; }
                        10% { opacity: 1; }
                        90% { opacity: 1; }
                        100% { transform: translateY(320px); opacity: 0; }
                    }
                `}</style>

            {/* RESULT OVERLAY */}
            {scanResult && (
                <div className={`absolute inset-0 z-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-200 backdrop-blur-md bg-black/40`}>
                    <div className={`
                        w-full ${giveawayClaimDetails ? 'max-w-lg' : 'max-w-sm'} rounded-3xl shadow-2xl p-8 flex flex-col items-center
                        bg-white
                        border-t-8
                        ${scanResult === 'Valid' ? 'border-emerald-500' : ''}
                        ${scanResult === 'Offline-Saved' ? 'border-blue-500' : ''}
                        ${scanResult === 'Invalid' ? 'border-red-500' : ''}
                        ${scanResult === 'Duplicate' ? 'border-amber-500' : ''}
                    `}>
                        <div className={`
                            -mt-16 mb-4 p-4 rounded-full border-4 border-white shadow-lg
                            ${scanResult === 'Valid' ? 'bg-emerald-500' : ''}
                            ${scanResult === 'Offline-Saved' ? 'bg-blue-500' : ''}
                            ${scanResult === 'Invalid' ? 'bg-red-500' : ''}
                            ${scanResult === 'Duplicate' ? 'bg-amber-500' : ''}
                        `}>
                            {scanResult === 'Valid' && <CheckCircle size={48} className="text-white" />}
                            {scanResult === 'Offline-Saved' && <WifiOff size={48} className="text-white" />}
                            {scanResult === 'Invalid' && <XCircle size={48} className="text-white" />}
                            {scanResult === 'Duplicate' && <RefreshCw size={48} className="text-white" />}
                        </div>

                        <h2 className={`text-3xl font-black uppercase tracking-tight mb-2
                            ${scanResult === 'Valid' ? 'text-emerald-600' : ''}
                            ${scanResult === 'Offline-Saved' ? 'text-blue-600' : ''}
                            ${scanResult === 'Invalid' ? 'text-red-600' : ''}
                            ${scanResult === 'Duplicate' ? 'text-amber-600' : ''}
                        `}>
                            {getResultTitle()}
                        </h2>
                        
                        <p className="text-[#7C7A72] font-medium mb-6">{resultMessage}</p>

                        {participantDetails?.delegateType === 'Principal' && (
                            <div className="mb-4 w-full rounded-2xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-2 text-amber-700">
                                    <Star size={18} className="fill-amber-500 text-amber-500" />
                                    <span className="text-sm font-black uppercase tracking-widest">Principal Delegate</span>
                                </div>
                                <p className="mt-1 text-xs font-medium text-amber-800">
                                    {participantDetails.name} has arrived at this event.
                                </p>
                            </div>
                        )}

                        {participantDetails && (scanResult === 'Valid' || scanResult === 'Duplicate' || scanResult === 'Offline-Saved' || resultRequiresAck) && (
                            <div className="w-full bg-[#F5F3EE] rounded-xl p-4 border border-[#EDEAE2]">
                                <p className="text-xs font-bold text-[#9A9890] uppercase tracking-widest mb-1">Participant</p>
                                <p className="text-xl font-bold text-[#111110] leading-tight">{participantDetails.name}</p>
                                <p className="text-[#4B3FE4] font-medium text-sm mt-1">{participantDetails.position}</p>
                                <p className="text-[#7C7A72] text-xs">{participantDetails.office}</p>
                                {participantDetails.delegateType === 'Representative' && (
                                    <span className="mt-2 inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-sky-700">
                                        Representative
                                    </span>
                                )}
                            </div>
                        )}

                        {/*
                          A Representative may turn out to be the Principal, and an
                          ordinary Attendee may turn out to hold the seat entirely.
                          Offer whichever reassignments the current type allows.
                        */}
                        {delegateReassignmentOptions.length > 0 && (
                            <div className={`mt-4 grid w-full gap-2 ${delegateReassignmentOptions.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                {delegateReassignmentOptions.map((option) => (
                                    <button
                                        key={option}
                                        type="button"
                                        onClick={() => assignDelegateType(option)}
                                        disabled={isPromoting || !isOnline}
                                        className={`inline-flex items-center justify-center gap-2 rounded-xl border-2 px-5 py-3 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                            option === 'Principal'
                                                ? 'border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100'
                                                : 'border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100'
                                        }`}
                                        title={!isOnline ? 'Requires an internet connection' : undefined}
                                    >
                                        {isPromoting
                                            ? <Loader2 size={16} className="animate-spin" />
                                            : option === 'Principal' ? <Star size={16} /> : <UserCheck size={16} />}
                                        {isPromoting ? 'Marking…' : `Mark as ${option}`}
                                    </button>
                                ))}
                            </div>
                        )}

                        {giveawayClaimDetails && (
                            <div className="mt-4 w-full rounded-2xl border border-fuchsia-100 bg-fuchsia-50/70 p-5 text-left">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <p className="text-[11px] font-bold uppercase tracking-widest text-fuchsia-700">Giveaways / Freebies</p>
                                    <span className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase ${
                                        giveawayClaimDetails.alreadyClaimed
                                            ? 'bg-amber-100 text-amber-700'
                                            : 'bg-emerald-100 text-emerald-700'
                                    }`}>
                                        {giveawayClaimDetails.alreadyClaimed ? 'Claimed Already' : 'Logged'}
                                    </span>
                                </div>
                                <div className="space-y-3">
                                    {giveawayClaimDetails.items.map((item) => (
                                        <div key={item.key} className="flex items-start justify-between gap-4 rounded-xl bg-white/90 px-4 py-3 text-base shadow-sm">
                                            <span className="font-medium text-[#6B6860]">{item.label}</span>
                                            <span className="text-lg font-black text-[#111110] text-right">{item.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        {resultRequiresAck ? (
                            <button
                                type="button"
                                onClick={() => clearScanResult({ resumeCamera: true })}
                                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#111110] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#2A2926] focus:outline-none focus:ring-2 focus:ring-[#7C7A72] focus:ring-offset-2"
                            >
                                <Play size={16} />
                                Scan Again
                            </button>
                        ) : (
                            <div className="w-full bg-[#EDEAE2] h-1.5 rounded-full mt-6 overflow-hidden">
                                 <div className="h-full bg-[#C5C2BA] animate-[progress_2s_linear_forwards]"></div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>

        {/* RIGHT/BOTTOM: Recent Scans History */}
        <div className="hidden lg:flex lg:w-96 w-full bg-white rounded-[28px] border border-[#E0DDD4] shadow-[0_12px_30px_rgba(15,23,42,0.08)] lg:rounded-none lg:border-l lg:border-t-0 lg:border-r-0 lg:border-b-0 lg:border-[#2A2926] lg:h-full flex-col z-10 lg:z-auto max-h-[34vh] lg:max-h-full overflow-hidden">
            <div className="p-4 border-b border-[#EDEAE2] flex justify-between items-center bg-[#F5F3EE]">
                <h3 className="font-bold text-[#2A2926] flex items-center gap-2">
                    <History size={18} className="text-[#4B3FE4]"/> 
                    Recent Scans
                </h3>
                <span className="text-xs bg-[#E0DDD4] text-[#6B6860] px-2 py-1 rounded-full">{recentScans.length}</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-0">
                {recentScans.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-[#9A9890] text-sm">
                        <div className="bg-[#F5F3EE] p-4 rounded-full mb-3">
                            <User size={24} className="opacity-30" />
                        </div>
                        <p>No scans yet.</p>
                        <p className="text-xs opacity-70">Ready to scan attendees.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-[#EDEAE2]">
                        {recentScans.map((scan) => (
                            <div
                                key={scan.id}
                                className={`p-4 hover:bg-[#F5F3EE] transition-colors animate-in slide-in-from-left-4 duration-300 ${
                                    scan.delegateType === 'Principal' ? 'border-l-2 border-amber-400 bg-amber-50/50' : ''
                                }`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <p className="font-bold text-[#2A2926] text-sm truncate pr-2 inline-flex items-center gap-1.5">
                                        {scan.delegateType === 'Principal' && (
                                            <Star size={12} className="shrink-0 fill-amber-500 text-amber-500" />
                                        )}
                                        <span className="truncate">{scan.name}</span>
                                    </p>
                                    <span className="text-[10px] text-[#9A9890] font-mono whitespace-nowrap">
                                        {format(scan.timestamp, 'h:mm:ss a')}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <p className="text-xs text-[#7C7A72] truncate max-w-[150px]">{scan.position || 'Unknown Position'}</p>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase
                                        ${scan.status === 'Valid' ? 'bg-emerald-50 text-emerald-700' : ''}
                                        ${scan.status === 'Offline-Saved' ? 'bg-blue-50 text-blue-700' : ''}
                                        ${scan.status === 'Invalid' ? 'bg-red-50 text-red-700' : ''}
                                        ${scan.status === 'Duplicate' ? 'bg-amber-50 text-amber-700' : ''}
                                    `}>
                                        {scan.status === 'Offline-Saved' ? 'Offline' : scan.status}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>

        {/* Auto-Registration Modal */}
        {showAutoRegModal && scannedParticipant && selectedEvent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200 max-w-md w-full">
              {autoRegStep === 'confirm' ? (
                <div className="p-6 flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                      <AlertTriangle className="w-6 h-6 text-amber-600" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">Not Yet Registered</h3>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <p className="text-sm text-slate-700">
                      <span className="font-semibold">{scannedParticipant.full_name}</span> is not yet registered for this event.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={handleAutoRegConfirm}
                      className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
                    >
                      Auto Register
                    </button>
                    <button
                      onClick={() => {
                        setShowAutoRegModal(false);
                        setScannedParticipant(null);
                        isProcessingRef.current = false;
                      }}
                      className="sm:w-auto px-5 py-3 rounded-xl font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-6 flex flex-col gap-6 max-h-96 overflow-y-auto">
                  <h3 className="text-lg font-bold text-slate-900">Event Details</h3>

                  {/* Principal / Representative / Attendee */}
                  {selectedEvent.has_principal_delegates && (
                    <div className="space-y-3">
                      <label className="block text-sm font-semibold text-slate-900">
                        Attending as
                      </label>
                      <div className="flex flex-wrap gap-4">
                        {DELEGATE_CHOICES.map((type) => (
                          <label key={type} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="delegate_type"
                              checked={autoRegData.delegate_type === type}
                              onChange={() => setAutoRegData(prev => ({ ...prev, delegate_type: type }))}
                              className="w-4 h-4"
                            />
                            <span className="text-sm text-slate-700">{type}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Accommodation */}
                  {selectedEvent.has_accommodation && (
                    <div className="space-y-3">
                      <label className="block text-sm font-semibold text-slate-900">
                        Accommodation
                      </label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="accommodation"
                            checked={!autoRegData.needs_accommodation}
                            onChange={() => setAutoRegData(prev => ({
                              ...prev,
                              needs_accommodation: false,
                              date_accommodation: []
                            }))}
                            className="w-4 h-4"
                          />
                          <span className="text-sm text-slate-700">No</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="accommodation"
                            checked={autoRegData.needs_accommodation}
                            onChange={() => setAutoRegData(prev => ({
                              ...prev,
                              needs_accommodation: true
                            }))}
                            className="w-4 h-4"
                          />
                          <span className="text-sm text-slate-700">Yes</span>
                        </label>
                      </div>

                      {/* Accommodation Dates */}
                      {autoRegData.needs_accommodation && getEventAccommodationDates(selectedEvent).length > 0 && (
                        <div className="space-y-2">
                          <label className="block text-xs font-semibold text-slate-700">
                            Select dates:
                          </label>
                          <div className="space-y-2">
                            {getEventAccommodationDates(selectedEvent).map((date) => (
                              <label key={date} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={autoRegData.date_accommodation.includes(date)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setAutoRegData(prev => ({
                                        ...prev,
                                        date_accommodation: [...prev.date_accommodation, date]
                                      }));
                                    } else {
                                      setAutoRegData(prev => ({
                                        ...prev,
                                        date_accommodation: prev.date_accommodation.filter(d => d !== date)
                                      }));
                                    }
                                  }}
                                  className="w-4 h-4"
                                />
                                <span className="text-sm text-slate-700">
                                  {new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Want CA */}
                  <div className="space-y-3">
                    <label className="block text-sm font-semibold text-slate-900">
                      Want CA
                    </label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="ca"
                          checked={!autoRegData.need_ca}
                          onChange={() => setAutoRegData(prev => ({ ...prev, need_ca: false }))}
                          className="w-4 h-4"
                        />
                        <span className="text-sm text-slate-700">No</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="ca"
                          checked={autoRegData.need_ca}
                          onChange={() => setAutoRegData(prev => ({ ...prev, need_ca: true }))}
                          className="w-4 h-4"
                        />
                        <span className="text-sm text-slate-700">Yes</span>
                      </label>
                    </div>
                  </div>

                  {/* Giveaways */}
                  {selectedEvent.giveaways && selectedEvent.giveaways.length > 0 && (
                    <div className="space-y-3">
                      <label className="block text-sm font-semibold text-slate-900">
                        {selectedEvent.giveaways[0]?.label || 'Giveaways'}
                      </label>
                      {selectedEvent.giveaways.map((item: any) => {
                        if (item.type === 'single-select') {
                          return (
                            <select
                              key={item.key}
                              value={autoRegData.giveaway_selections[item.key] || ''}
                              onChange={(e) => setAutoRegData(prev => ({
                                ...prev,
                                giveaway_selections: { ...prev.giveaway_selections, [item.key]: e.target.value }
                              }))}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            >
                              <option value="">Select {item.label}</option>
                              {(item.options || []).map((opt: any) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          );
                        } else if (item.type === 'boolean') {
                          return (
                            <div key={item.key} className="flex gap-4">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name={item.key}
                                  checked={!autoRegData.giveaway_selections[item.key]}
                                  onChange={() => setAutoRegData(prev => ({
                                    ...prev,
                                    giveaway_selections: { ...prev.giveaway_selections, [item.key]: false }
                                  }))}
                                  className="w-4 h-4"
                                />
                                <span className="text-sm text-slate-700">No</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name={item.key}
                                  checked={!!autoRegData.giveaway_selections[item.key]}
                                  onChange={() => setAutoRegData(prev => ({
                                    ...prev,
                                    giveaway_selections: { ...prev.giveaway_selections, [item.key]: true }
                                  }))}
                                  className="w-4 h-4"
                                />
                                <span className="text-sm text-slate-700">Yes</span>
                              </label>
                            </div>
                          );
                        }
                        return null;
                      })}
                    </div>
                  )}

                  {/* Buttons */}
                  <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-200">
                    <button
                      onClick={handleAutoRegSubmit}
                      disabled={autoRegSubmitting}
                      className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                      {autoRegSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                      Register
                    </button>
                    <button
                      onClick={() => {
                        setShowAutoRegModal(false);
                        setAutoRegStep('confirm');
                        setScannedParticipant(null);
                        isProcessingRef.current = false;
                      }}
                      className="sm:w-auto px-5 py-3 rounded-xl font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* Borrow / Return choice — leg one of the borrow flow has just
            identified a participant, and the camera is held until a choice is
            made. */}
        {showBorrowActionModal && borrowParticipant && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="border-b border-slate-100 bg-slate-50 p-5">
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Participant</p>
                <h3 className="mt-1 text-xl font-bold leading-tight text-slate-900">{borrowParticipant.name}</h3>
                {borrowParticipant.position && (
                  <p className="text-sm font-medium text-indigo-600">{borrowParticipant.position}</p>
                )}
                {borrowParticipant.office && (
                  <p className="text-xs text-slate-500">{borrowParticipant.office}</p>
                )}
              </div>

              <div className="p-5">
                {borrowActiveBorrows.length > 0 ? (
                  <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-amber-700">
                      Currently holding {borrowActiveBorrows.length}
                    </p>
                    <ul className="mt-2 space-y-1">
                      {borrowActiveBorrows.map((b) => (
                        <li key={b.borrow_id} className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="font-semibold text-amber-900">{b.item_name}</span>
                          <span className="shrink-0 text-xs text-amber-700">
                            since {format(new Date(b.borrowed_at), 'h:mm a')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-sm text-slate-500">No items currently borrowed.</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => beginBorrowLeg('borrow')}
                    className="flex flex-col items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-4 font-bold text-white transition-colors hover:bg-indigo-700"
                  >
                    <Package size={22} />
                    Borrow
                  </button>

                  <button
                    onClick={() => beginBorrowLeg('return')}
                    disabled={borrowActiveBorrows.length === 0}
                    title={borrowActiveBorrows.length === 0 ? 'Nothing to return' : undefined}
                    className="flex flex-col items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-4 font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    <CheckCircle size={22} />
                    Return
                  </button>
                </div>

                <p className="mt-4 text-center text-xs font-medium text-slate-500">
                  Then scan the item's QR code.
                </p>
              </div>

              <div className="border-t border-slate-200 p-4">
                <button
                  onClick={() => {
                    resetBorrowFlow();
                    isProcessingRef.current = false;
                    setCameraPaused(false);
                  }}
                  className="w-full rounded-xl px-5 py-2.5 font-semibold text-slate-500 transition-colors hover:bg-slate-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

export default Scanner;
