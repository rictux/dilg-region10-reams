
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
  Wifi,
  WifiOff,
  CloudUpload
} from 'lucide-react';
import { Event } from '../../types/database';
import { format } from 'date-fns';

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

const Scanner: React.FC = () => {
  const { user } = useAuth();
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<'Valid' | 'Invalid' | 'Duplicate' | 'Offline-Saved' | null>(null);
  const [resultMessage, setResultMessage] = useState('');
  const [participantDetails, setParticipantDetails] = useState<{ name: string; position: string; office: string; photo?: string } | null>(null);
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
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const readerId = "qr-reader-viewport";
  
  // Ref to hold selectedEventId to avoid restarting scanner on change
  const eventIdRef = useRef(selectedEventId);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    eventIdRef.current = selectedEventId;
  }, [selectedEventId]);

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
            setOfflineQueue(JSON.parse(storedQueue));
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
        const today = new Date().toISOString().split('T')[0];

        let query = supabase
          .from('events')
          .select('*')
          .lte('start_date', today)
          .gte('end_date', today)
          .neq('status', 'Cancelled')
          .order('start_date', { ascending: false });

        // Filter events by office for non-admins
        if (user?.role !== 'Admin' && user?.office_id) {
            query = query.eq('organize_by', user.office_id);
        }

        const { data } = await query;
        
        if (data && data.length > 0) {
          setEvents(data);
          
          if (data.length === 1) {
            setSelectedEventId(data[0].event_id.toString());
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

      try {
            const today = item.scan_time.split('T')[0];
            const { data: existingLog } = await supabase
                .from('attendance_logs')
                .select('attendance_id, scan_time')
                .eq('event_id', item.event_id)
                .eq('participant_id', item.participant_id)
                .eq('attendance_date', today)
                .eq('action_session', item.session)
                .eq('scan_status', 'Valid')
                .single();

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
                    attendance_date: today,
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
    if (selectedEventId && !scanResult && !scanning) {
       startScanner();
    } 
    else if ((!selectedEventId || scanResult) && scanning) {
        cleanupScanner();
    }
  }, [selectedEventId, scanResult, scanning]);

  useEffect(() => {
      return () => {
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
                    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                    const qrboxSize = Math.floor(minEdge * 0.65);
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

    const deviceScanTime = new Date().toISOString();

    if (!isOnline) {
        const cachedP = participantCache[qrToken];
        
        if (cachedP) {
            const offlineItem: OfflineScanItem = {
                id: Date.now().toString() + Math.random().toString().slice(2),
                event_id: eventId,
                participant_id: cachedP.participant_id,
                participant_code: qrToken,
                scan_time: deviceScanTime,
                session: session,
                scanner_device: navigator.userAgent + " (Offline)",
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
            processScanResult('Invalid', 'Participant not found in database.', qrToken);
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
            .select('registration_status')
            .eq('event_id', eventId)
            .eq('participant_id', partData.participant_id)
            .single();

        if (!regData || regData.registration_status !== 'Registered') {
            await logScan(eventId, partData.participant_id, 'Invalid', deviceScanTime, 'Not Registered');
            processScanResult('Invalid', 'Not registered for this event.', participant.name, participant.position);
            return;
        }

        const today = deviceScanTime.split('T')[0];
        const { data: existingLog } = await supabase
            .from('attendance_logs')
            .select('attendance_id')
            .eq('event_id', eventId)
            .eq('participant_id', partData.participant_id)
            .eq('attendance_date', today)
            .eq('action_session', session)
            .eq('scan_status', 'Valid')
            .single();

        if (existingLog) {
            if (session === 'AM') {
                processScanResult('Duplicate', `Already scanned for ${session}.`, participant.name, participant.position);
                return;
            } else {
                const { error: updateError } = await supabase
                    .from('attendance_logs')
                    .update({ 
                        scan_time: deviceScanTime,
                        scanner_device: navigator.userAgent,
                        remarks: 'Updated PM Time'
                    })
                    .eq('attendance_id', existingLog.attendance_id);

                if (updateError) throw updateError;
                processScanResult('Valid', 'PM Time Updated', participant.name, participant.position);
                return;
            }
        }

        await logScan(eventId, partData.participant_id, 'Valid', deviceScanTime, 'Success');
        processScanResult('Valid', 'Attendance Recorded', participant.name, participant.position);

    } catch (err: any) {
        processScanResult('Invalid', err.message || 'Scan failed', 'Unknown');
    }
  };

  const logScan = async (eventId: number, participantId: number, status: 'Valid' | 'Invalid' | 'Duplicate', scanTimeStr: string, notes?: string) => {
      if (!user) return;
      const today = scanTimeStr.split('T')[0];
      const dbEventId = eventId === 0 ? null : eventId;
      const dbParticipantId = participantId === 0 ? null : participantId;

      await supabase.from('attendance_logs').insert({
          event_id: dbEventId,
          participant_id: dbParticipantId,
          user_id: user.user_id,
          scan_status: status,
          attendance_date: today,
          action_session: session,
          remarks: notes,
          scan_time: scanTimeStr,
          scanner_device: navigator.userAgent
      });
  };

  const processScanResult = (status: 'Valid' | 'Invalid' | 'Duplicate' | 'Offline-Saved', message: string, name: string = 'Unknown', position: string = '') => {
      setScanResult(status);
      setResultMessage(message);

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

      setTimeout(() => {
          setScanResult(null);
          setParticipantDetails(null);
          setResultMessage('');
          isProcessingRef.current = false;
      }, 2000);
  };
    
  return (
    <div className="h-full w-full flex flex-col lg:flex-row bg-slate-900 overflow-hidden">
        
        {/* LEFT/TOP: Camera Section */}
        <div className="flex-1 flex flex-col relative bg-black">
            
            {/* Top Bar Overlay */}
            <div className="absolute top-0 left-0 right-0 z-20 p-4 bg-gradient-to-b from-black/80 to-transparent">
                 <div className="flex flex-col sm:flex-row gap-3 max-w-4xl mx-auto items-center">
                    
                    {/* Status Indicators */}
                    <div className="flex items-center gap-2 absolute top-4 right-4 sm:relative sm:top-0 sm:right-0 sm:order-last">
                        {isOnline ? (
                            <div className="bg-green-500/20 text-green-400 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 backdrop-blur-md border border-green-500/30">
                                <Wifi size={14} /> Online
                            </div>
                        ) : (
                            <div className="bg-red-500/20 text-red-400 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 backdrop-blur-md border border-red-500/30">
                                <WifiOff size={14} /> Offline Mode
                            </div>
                        )}
                        {offlineQueue.length > 0 && (
                             <div className="bg-amber-500/20 text-amber-400 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 backdrop-blur-md border border-amber-500/30 animate-pulse">
                                <CloudUpload size={14} /> {offlineQueue.length} Pending
                             </div>
                        )}
                    </div>

                    <div className="flex-1 w-full sm:w-auto mt-8 sm:mt-0">
                        {loadingEvents ? (
                            <div className="h-11 bg-slate-800 rounded-lg animate-pulse"></div>
                        ) : (
                            <div className="relative">
                                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <select 
                                    value={selectedEventId}
                                    onChange={(e) => setSelectedEventId(e.target.value)}
                                    className="w-full bg-slate-900/80 text-white text-sm font-medium rounded-xl pl-10 pr-8 py-3 border border-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-xl backdrop-blur-md appearance-none"
                                >
                                    {events.length === 0 ? (
                                        <option value="">No Events Today</option>
                                    ) : (
                                        <>
                                            {(events.length > 1 || !selectedEventId) && <option value="">-- Select Event --</option>}
                                            {events.map(e => <option key={e.event_id} value={e.event_id}>{e.event_name}</option>)}
                                        </>
                                    )}
                                </select>
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                </div>
                            </div>
                        )}
                    </div>
                    
                    <button 
                        onClick={() => setSession(session === 'AM' ? 'PM' : 'AM')}
                        className={`w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 border shadow-xl backdrop-blur-md transition-all
                            ${session === 'AM' 
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 hover:bg-amber-500/30' 
                                : 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300 hover:bg-indigo-600/30'
                            }`}
                    >
                        {session === 'AM' ? <Sun size={18} className="fill-current"/> : <Moon size={18} className="fill-current"/>}
                        {session} Session
                    </button>
                </div>
            </div>

            {/* Camera Viewport */}
            <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-black">
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
                        <div id={readerId} className="w-full h-full object-cover"></div>
                        
                        {/* Static Overlay Guide */}
                        {!scanResult && scanning && (
                            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                                <div className="w-64 h-64 sm:w-80 sm:h-80 border-2 border-white/40 rounded-3xl relative overflow-hidden backdrop-brightness-150">
                                    <div className="absolute inset-0 border-[60px] border-black/40"></div>
                                    <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-indigo-500 -mt-1 -ml-1 rounded-tl-xl shadow-[0_0_10px_rgba(79,70,229,0.5)]"></div>
                                    <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-indigo-500 -mt-1 -mr-1 rounded-tr-xl shadow-[0_0_10px_rgba(79,70,229,0.5)]"></div>
                                    <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-indigo-500 -mb-1 -ml-1 rounded-bl-xl shadow-[0_0_10px_rgba(79,70,229,0.5)]"></div>
                                    <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-indigo-500 -mb-1 -mr-1 rounded-br-xl shadow-[0_0_10px_rgba(79,70,229,0.5)]"></div>
                                    
                                    {/* Scan Line Animation - High Tech look */}
                                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent shadow-[0_0_20px_rgba(79,70,229,0.9)] animate-[scan_2.5s_ease-in-out_infinite]"></div>
                                </div>
                                <div className="mt-8 bg-black/70 backdrop-blur-md px-6 py-2.5 rounded-full text-white/90 text-sm font-bold border border-white/20 tracking-wide flex items-center gap-2">
                                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
                                    Focusing on QR Code...
                                </div>
                            </div>
                        )}
                        
                        {!scanResult && !scanning && !loadingEvents && (
                             <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white p-6 text-center">
                                {!selectedEventId ? (
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

            {/* Styles for scan animation */}
            <style>{`
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
                        w-full max-w-sm rounded-3xl shadow-2xl p-8 flex flex-col items-center
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
                            {scanResult === 'Valid' ? 'Verified!' : scanResult === 'Offline-Saved' ? 'Saved (Offline)' : scanResult}
                        </h2>
                        
                        <p className="text-slate-500 font-medium mb-6">{resultMessage}</p>

                        {(scanResult === 'Valid' || scanResult === 'Duplicate' || scanResult === 'Offline-Saved') && participantDetails && (
                            <div className="w-full bg-slate-50 rounded-xl p-4 border border-slate-100">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Participant</p>
                                <p className="text-xl font-bold text-slate-900 leading-tight">{participantDetails.name}</p>
                                <p className="text-indigo-600 font-medium text-sm mt-1">{participantDetails.position}</p>
                                <p className="text-slate-500 text-xs">{participantDetails.office}</p>
                            </div>
                        )}
                        
                        <div className="w-full bg-slate-100 h-1.5 rounded-full mt-6 overflow-hidden">
                             <div className="h-full bg-slate-300 animate-[progress_2s_linear_forwards]"></div>
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* RIGHT/BOTTOM: Recent Scans History */}
        <div className="lg:w-96 w-full bg-white border-l border-slate-800 lg:h-full flex flex-col z-10 lg:z-auto max-h-[40vh] lg:max-h-full">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <History size={18} className="text-indigo-600"/> 
                    Scan History
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
