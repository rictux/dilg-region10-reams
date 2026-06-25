
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
  Play
} from 'lucide-react';
import { Event, GiveawayItem } from '../../types/database';
import { format } from 'date-fns';
import { SCAN_EVENT_ACCESS_ROLES, fetchAccessibleEvents } from '../../lib/eventAccess';
import { PRESENT_ATTENDANCE_STATUSES } from '../../lib/attendance';

type ScanMode = 'attendance' | 'giveaway';

interface RecentScan {
    id: string;
    name: string;
    position: string;
    status: 'Valid' | 'Invalid' | 'Duplicate' | 'Offline-Saved';
    timestamp: Date;
    message: string;
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
    };
}

interface ParticipantDetails {
    name: string;
    position: string;
    office: string;
    photo?: string;
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

const Scanner: React.FC = () => {
  const { user } = useAuth();
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
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const cameraViewportRef = useRef<HTMLDivElement | null>(null);
  const readerId = "qr-reader-viewport";
  
  // Ref to hold selectedEventId to avoid restarting scanner on change
  const eventIdRef = useRef(selectedEventId);
  const scanModeRef = useRef<ScanMode>(scanMode);
  const sessionRef = useRef<'AM' | 'PM'>(session);
  const isProcessingRef = useRef(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Utility function to generate 8 character alphanumeric string
  const generateDeviceToken = () => {
    return 'web-' + Math.random().toString(36).substring(2, 10);
  };

  // Ref to hold device token
  const deviceTokenRef = useRef(generateDeviceToken());
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
          
          if (data.length === 1) {
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
  }, [isOnline, user]);

  // --- 3. Cache Participants when Event is Selected ---
  useEffect(() => {
    const cacheParticipants = async () => {
        if (!selectedEventId || !isOnline) return;

        try {
            const { data } = await supabase
                .from('event_participants')
                .select(`
                    participant_id,
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
                            office: row.participants.office
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
    }
  };

  const startScanner = async () => {
    if (scannerRef.current) {
        await cleanupScanner();
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
    } catch (err) {
        console.error(err);
        setCameraError("Camera permission denied. Please ensure you are using HTTPS or localhost.");
        setScanning(false);
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
                scanner_device: deviceTokenRef.current + " (Offline)",
                timestamp: Date.now()
            };

            const newQueue = [...offlineQueue, offlineItem];
            setOfflineQueue(newQueue);
            localStorage.setItem('eventpulse_offline_queue', JSON.stringify(newQueue));

            setParticipantDetails({
                name: cachedP.full_name,
                position: cachedP.position,
                office: cachedP.office
            });

            processScanResult('Offline-Saved', 'Saved locally. Will sync when online.', cachedP.full_name, cachedP.position);
        } else {
            processScanResult('Invalid', 'Participant not found in offline cache.', qrToken);
        }
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

        const participant = {
            name: partData.full_name,
            position: partData.position,
            office: partData.office
        };
        setParticipantDetails(participant);

        const { data: regData } = await supabase
            .from('event_participants')
            .select('registration_status, giveaway_selections')
            .eq('event_id', eventId)
            .eq('participant_id', partData.participant_id)
            .single();

        if (!regData || regData.registration_status !== 'Registered') {
            if (currentMode === 'attendance') {
                await logScan(eventId, partData.participant_id, 'Invalid', deviceScanTime, deviceAttendanceDate, currentSession, 'Not Registered');
            }
            processScanResult('Invalid', 'Not registered for this event.', participant.name, participant.position, { autoReset: currentMode !== 'giveaway' });
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
                processScanResult('Duplicate', `Already scanned for ${currentSession}.`, participant.name, participant.position);
                return;
            } else {
                const { error: updateError } = await supabase
                    .from('attendance_logs')
                    .update({ 
                        scan_time: deviceScanTime,
                        scanner_device: deviceTokenRef.current,
                        remarks: 'Updated PM Time'
                    })
                    .eq('attendance_id', existingLog.attendance_id);

                if (updateError) throw updateError;
                processScanResult('Valid', 'PM Time Updated', participant.name, participant.position);
                return;
            }
        }

        await logScan(eventId, partData.participant_id, 'Valid', deviceScanTime, deviceAttendanceDate, currentSession, 'Success');
        processScanResult('Valid', 'Attendance Recorded', participant.name, participant.position);

    } catch (err: any) {
        processScanResult('Invalid', err.message || 'Scan failed', 'Unknown', '', { autoReset: currentMode !== 'giveaway' });
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
          scanner_device: deviceTokenRef.current
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
          scanner_device: deviceTokenRef.current,
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
      options: { autoReset?: boolean } = {}
  ) => {
      setScanResult(status);
      setResultMessage(message);
      setResultRequiresAck(options.autoReset === false);

      const newScan: RecentScan = {
          id: Date.now().toString(),
          name,
          position,
          status,
          message,
          timestamp: new Date()
      };
      setRecentScans(prev => [newScan, ...prev].slice(0, 20));

      if (navigator.vibrate) {
        if (status === 'Valid' || status === 'Offline-Saved') navigator.vibrate([100]);
        else navigator.vibrate([300]);
      }

      if (resetTimerRef.current) {
          clearTimeout(resetTimerRef.current);
      }

      if (options.autoReset === false) {
          resetTimerRef.current = null;
          return;
      }

      resetTimerRef.current = setTimeout(() => {
          clearScanResult({
              resumeCamera: scanModeRef.current === 'attendance',
              pauseCamera: scanModeRef.current !== 'attendance'
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

      setScanMode(nextMode);
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
    <div className="h-full w-full flex flex-col bg-black p-0 lg:flex-row lg:gap-0 lg:bg-slate-900 overflow-hidden">
        
        {/* LEFT/TOP: Controls + Camera Section */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-none border-0 bg-slate-950 shadow-none lg:rounded-none">
            <div className="shrink-0 border-b border-slate-800 bg-slate-950/95 p-1 sm:p-2 lg:p-3">
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
                            : 'md:grid-cols-[minmax(0,1fr)_220px_220px] xl:grid-cols-[minmax(0,1fr)_240px_240px]'
                    }`}>
                        <div className="col-span-2 md:col-span-1 flex-1 w-full rounded-none sm:rounded-xl lg:rounded-2xl border border-slate-800 bg-slate-900/70 p-0.5 sm:p-1.5">
                            <p className="px-2 pb-0.5 text-[9px] sm:text-[11px] font-bold uppercase tracking-[0.18em] sm:tracking-[0.24em] text-slate-500">Event</p>
                            {loadingEvents ? (
                                <div className="h-9 sm:h-12 bg-slate-800 rounded-none sm:rounded-xl animate-pulse"></div>
                            ) : (
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
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
                                        className="w-full bg-slate-950 text-white text-[11px] sm:text-xs font-medium rounded-none sm:rounded-xl pl-9 pr-8 py-2 sm:py-2.5 border border-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm appearance-none"
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
                                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className={`${scanMode === 'giveaway' ? 'col-span-2 md:col-span-1' : 'col-span-1'} w-full xl:w-auto rounded-none sm:rounded-xl lg:rounded-2xl border border-slate-800 bg-slate-900/70 p-0.5 sm:p-1.5 shadow-sm`}>
                            <p className="px-2 pb-0.5 text-[9px] sm:text-[11px] font-bold uppercase tracking-[0.18em] sm:tracking-[0.24em] text-slate-500">Mode</p>
                            <div className="grid grid-cols-2 gap-1">
                                <button
                                    type="button"
                                    onClick={() => handleScanModeChange('attendance')}
                                    aria-pressed={scanMode === 'attendance'}
                                    className={`px-2 py-2 sm:px-3 sm:py-2.5 rounded-none sm:rounded-xl text-[11px] sm:text-sm font-bold flex items-center justify-center gap-1 transition-all border
                                        ${scanMode === 'attendance'
                                            ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                                            : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-emerald-500/10'
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
                                            : 'bg-slate-950/60 border-slate-800 text-slate-300'
                                        }
                                        ${selectedEventHasGiveaways && isOnline
                                            ? 'hover:bg-fuchsia-500/10'
                                            : 'opacity-40 cursor-not-allowed text-slate-500'
                                        }`}
                                >
                                    <Gift size={14} className="sm:w-4 sm:h-4" />
                                    Giveaway
                                </button>
                            </div>
                        </div>
                        
                        {scanMode === 'attendance' && (
                            <div className="col-span-1 w-full xl:w-auto rounded-none sm:rounded-xl lg:rounded-2xl border border-slate-800 bg-slate-900/70 p-0.5 sm:p-1.5 shadow-sm">
                                <p className="px-2 pb-0.5 text-[9px] sm:text-[11px] font-bold uppercase tracking-[0.18em] sm:tracking-[0.24em] text-slate-500">Session</p>
                                <div className="grid grid-cols-2 gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setSession('AM')}
                                        disabled={!isSessionEnabled('AM')}
                                        aria-pressed={session === 'AM'}
                                        className={`px-2 py-2 sm:px-3 sm:py-2.5 rounded-none sm:rounded-xl text-[11px] sm:text-sm font-bold flex items-center justify-center gap-1 transition-all border
                                            ${session === 'AM'
                                                ? 'bg-amber-500/20 border-amber-400/60 text-amber-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                                                : 'bg-slate-950/60 border-slate-800 text-slate-300'
                                            }
                                            ${isSessionEnabled('AM')
                                                ? 'hover:bg-amber-500/10'
                                                : 'opacity-40 cursor-not-allowed text-slate-500'
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
                                                ? 'bg-indigo-600/20 border-indigo-500/60 text-indigo-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                                                : 'bg-slate-950/60 border-slate-800 text-slate-300'
                                            }
                                            ${isSessionEnabled('PM')
                                                ? 'hover:bg-indigo-600/10'
                                                : 'opacity-40 cursor-not-allowed text-slate-500'
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
                                    : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
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
                            <p className="text-slate-400 mb-6 font-medium text-sm leading-relaxed">{cameraError}</p>
                            <button 
                                onClick={() => startScanner()} 
                                className="bg-white text-black px-8 py-3 rounded-full font-bold hover:bg-slate-200 transition-colors"
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
                                            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
                                            {scanMode === 'giveaway' ? 'Scan Giveaway Claim' : 'Focusing on QR Code...'}
                                        </div>
                                    </div>
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
                                            <p className="mt-2 max-w-xs text-sm font-medium leading-relaxed text-slate-400">
                                                The camera is off to reduce heat and battery use.
                                            </p>
                                            <button
                                                type="button"
                                                onClick={resumeCamera}
                                                className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-white px-8 py-3 text-sm font-black text-slate-950 transition-colors hover:bg-slate-200"
                                            >
                                                <Play size={18} />
                                                Scan Again
                                            </button>
                                        </>
                                    ) : !selectedEventId ? (
                                        <>
                                            <Calendar className="w-16 h-16 text-slate-500 mb-4" />
                                            <h3 className="text-xl font-bold text-slate-300">No Event Selected</h3>
                                            <p className="text-slate-500 mt-2">Please select an ongoing event to start scanning.</p>
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
                        
                        <p className="text-slate-500 font-medium mb-6">{resultMessage}</p>

                        {participantDetails && (scanResult === 'Valid' || scanResult === 'Duplicate' || scanResult === 'Offline-Saved' || resultRequiresAck) && (
                            <div className="w-full bg-slate-50 rounded-xl p-4 border border-slate-100">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Participant</p>
                                <p className="text-xl font-bold text-slate-900 leading-tight">{participantDetails.name}</p>
                                <p className="text-indigo-600 font-medium text-sm mt-1">{participantDetails.position}</p>
                                <p className="text-slate-500 text-xs">{participantDetails.office}</p>
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
                                            <span className="font-medium text-slate-600">{item.label}</span>
                                            <span className="text-lg font-black text-slate-900 text-right">{item.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        {resultRequiresAck ? (
                            <button
                                type="button"
                                onClick={() => clearScanResult({ resumeCamera: true })}
                                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
                            >
                                <Play size={16} />
                                Scan Again
                            </button>
                        ) : (
                            <div className="w-full bg-slate-100 h-1.5 rounded-full mt-6 overflow-hidden">
                                 <div className="h-full bg-slate-300 animate-[progress_2s_linear_forwards]"></div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>

        {/* RIGHT/BOTTOM: Recent Scans History */}
        <div className="hidden lg:flex lg:w-96 w-full bg-white rounded-[28px] border border-slate-200 shadow-[0_12px_30px_rgba(15,23,42,0.08)] lg:rounded-none lg:border-l lg:border-t-0 lg:border-r-0 lg:border-b-0 lg:border-slate-800 lg:h-full flex-col z-10 lg:z-auto max-h-[34vh] lg:max-h-full overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <History size={18} className="text-indigo-600"/> 
                    Recent Scans
                </h3>
                <span className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded-full">{recentScans.length}</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-0">
                {recentScans.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-sm">
                        <div className="bg-slate-50 p-4 rounded-full mb-3">
                            <User size={24} className="opacity-30" />
                        </div>
                        <p>No scans yet.</p>
                        <p className="text-xs opacity-70">Ready to scan attendees.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {recentScans.map((scan) => (
                            <div key={scan.id} className="p-4 hover:bg-slate-50 transition-colors animate-in slide-in-from-left-4 duration-300">
                                <div className="flex justify-between items-start mb-1">
                                    <p className="font-bold text-slate-800 text-sm truncate pr-2">{scan.name}</p>
                                    <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">
                                        {format(scan.timestamp, 'h:mm:ss a')}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <p className="text-xs text-slate-500 truncate max-w-[150px]">{scan.position || 'Unknown Position'}</p>
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

    </div>
  );
};

export default Scanner;
