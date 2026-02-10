import React, { useEffect, useRef, useState } from 'react';
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
  Clock,
  ChevronRight
} from 'lucide-react';
import { Event } from '../../types/database';
import { format } from 'date-fns';

interface RecentScan {
    id: string;
    name: string;
    position: string;
    status: 'Valid' | 'Invalid' | 'Duplicate';
    timestamp: Date;
    message: string;
}

const Scanner: React.FC = () => {
  const { user } = useAuth();
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<'Valid' | 'Invalid' | 'Duplicate' | null>(null);
  const [resultMessage, setResultMessage] = useState('');
  const [participantDetails, setParticipantDetails] = useState<{ name: string; position: string; office: string; photo?: string } | null>(null);
  const [session, setSession] = useState<'AM' | 'PM'>('AM');
  const [selectedEventId, setSelectedEventId] = useState<string>(''); 
  const [events, setEvents] = useState<Event[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(true);
  
  // Recent History State
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const readerId = "qr-reader-viewport";

  // 1. Load Events
  useEffect(() => {
    const loadEvents = async () => {
      try {
        const { data } = await supabase
          .from('events')
          .select('*')
          .in('status', ['Ongoing', 'Scheduled'])
          .order('start_date', { ascending: false });
        
        if (data && data.length > 0) {
          setEvents(data);
          // Default to the first ongoing event, or just the first one
          const ongoing = data.find(e => e.status === 'Ongoing');
          setSelectedEventId(ongoing ? ongoing.event_id.toString() : data[0].event_id.toString());
        }
      } catch (error) {
        console.error("Error loading events", error);
      } finally {
        setLoadingEvents(false);
      }
    };
    loadEvents();
  }, []);

  // 2. Initialize Scanner logic
   useEffect(() => {
    // Only start if we have an event selected and not currently showing a result
    if (selectedEventId && !scanResult && !scanning) {
       startScanner();
    }
    
    return () => {
      cleanupScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId, scanResult]);

  const cleanupScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
            await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch(e) {
        // console.error("Failed to stop scanner", e);
      }
      scannerRef.current = null;
      setScanning(false);
    }
  };

  const startScanner = async () => {
    await cleanupScanner(); 

    const html5QrCode = new Html5Qrcode(readerId, { 
      formatsToSupport: [ Html5QrcodeSupportedFormats.QR_CODE ],
      verbose: false 
    });
    scannerRef.current = html5QrCode;

    try {
        await html5QrCode.start(
            { facingMode: "environment" },
            {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                aspectRatio: window.innerWidth < 768 ? 1 : 1.77, // Square on mobile, wide on desktop
            },
            (decodedText) => {
                handleScan(decodedText);
            },
            (errorMessage) => {
                // Ignore frame errors
            }
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
    if (!scannerRef.current) return;
    
    try {
        await scannerRef.current.stop();
        setScanning(false);
    } catch (e) { console.error(e) }

    try {
        const eventId = parseInt(selectedEventId);
        if (isNaN(eventId)) throw new Error("No event selected");

        // 1. Find Participant
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

        // 2. Check Event Registration
        const { data: regData } = await supabase
            .from('event_participants')
            .select('registration_status')
            .eq('event_id', eventId)
            .eq('participant_id', partData.participant_id)
            .single();

        if (!regData || regData.registration_status !== 'Registered') {
            await logScan(eventId, partData.participant_id, 'Invalid', 'Not Registered');
            processScanResult('Invalid', 'Not registered for this event.', participant.name, participant.position);
            return;
        }

        // 3. Check Duplicate
        const today = new Date().toISOString().split('T')[0];
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
            await logScan(eventId, partData.participant_id, 'Duplicate', 'Already Scanned');
            processScanResult('Duplicate', `Already scanned for ${session}.`, participant.name, participant.position);
            return;
        }

        // 4. Success
        await logScan(eventId, partData.participant_id, 'Valid', 'Success');
        processScanResult('Valid', 'Attendance Recorded', participant.name, participant.position);

    } catch (err: any) {
        processScanResult('Invalid', err.message || 'Scan failed', 'Unknown');
    }
  };

  const logScan = async (eventId: number, participantId: number, status: 'Valid' | 'Invalid' | 'Duplicate', notes?: string) => {
      if (!user) return;
      if (status === 'Duplicate') return; // DB constraint

      const today = new Date().toISOString().split('T')[0];
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
          scanner_device: navigator.userAgent
      });
  };

  const processScanResult = (status: 'Valid' | 'Invalid' | 'Duplicate', message: string, name: string = 'Unknown', position: string = '') => {
      setScanResult(status);
      setResultMessage(message);

      // Add to history
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
        if (status === 'Valid') navigator.vibrate([100]);
        else navigator.vibrate([300]);
      }

      setTimeout(() => {
          setScanResult(null);
          setParticipantDetails(null);
          setResultMessage('');
      }, 2000);
  };
    
  return (
    <div className="h-full w-full flex flex-col lg:flex-row bg-slate-900 overflow-hidden">
        
        {/* LEFT/TOP: Camera Section */}
        <div className="flex-1 flex flex-col relative bg-black">
            
            {/* Top Bar Overlay */}
            <div className="absolute top-0 left-0 right-0 z-20 p-4 bg-gradient-to-b from-black/80 to-transparent">
                 <div className="flex flex-col sm:flex-row gap-3 max-w-4xl mx-auto items-center">
                    <div className="flex-1 w-full sm:w-auto">
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
                                    {events.length === 0 && <option value="">No Active Events</option>}
                                    {events.map(e => <option key={e.event_id} value={e.event_id}>{e.event_name}</option>)}
                                </select>
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
                                <div className="w-72 h-72 border-2 border-white/40 rounded-3xl relative overflow-hidden">
                                    <div className="absolute inset-0 border-[40px] border-black/30"></div>
                                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white -mt-1 -ml-1 rounded-tl-lg"></div>
                                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white -mt-1 -mr-1 rounded-tr-lg"></div>
                                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white -mb-1 -ml-1 rounded-bl-lg"></div>
                                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white -mb-1 -mr-1 rounded-br-lg"></div>
                                    
                                    {/* Scan Line Animation */}
                                    <div className="absolute top-0 left-0 w-full h-1 bg-red-500/80 shadow-[0_0_15px_rgba(239,68,68,0.8)] animate-[scan_2s_ease-in-out_infinite]"></div>
                                </div>
                                <div className="mt-8 bg-black/60 backdrop-blur-md px-6 py-2 rounded-full text-white/90 text-sm font-medium border border-white/10">
                                    Align QR Code within frame
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Styles for scan animation */}
            <style>{`
                @keyframes scan {
                    0%, 100% { transform: translateY(0); opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    50% { transform: translateY(288px); }
                }
            `}</style>

            {/* RESULT OVERLAY */}
            {scanResult && (
                <div className={`absolute inset-0 z-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-200 backdrop-blur-md bg-black/40`}>
                    <div className={`
                        w-full max-w-sm rounded-3xl shadow-2xl p-8 flex flex-col items-center
                        ${scanResult === 'Valid' ? 'bg-white' : 'bg-white'}
                        border-t-8
                        ${scanResult === 'Valid' ? 'border-emerald-500' : ''}
                        ${scanResult === 'Invalid' ? 'border-red-500' : ''}
                        ${scanResult === 'Duplicate' ? 'border-amber-500' : ''}
                    `}>
                        <div className={`
                            -mt-16 mb-4 p-4 rounded-full border-4 border-white shadow-lg
                            ${scanResult === 'Valid' ? 'bg-emerald-500' : ''}
                            ${scanResult === 'Invalid' ? 'bg-red-500' : ''}
                            ${scanResult === 'Duplicate' ? 'bg-amber-500' : ''}
                        `}>
                            {scanResult === 'Valid' && <CheckCircle size={48} className="text-white" />}
                            {scanResult === 'Invalid' && <XCircle size={48} className="text-white" />}
                            {scanResult === 'Duplicate' && <RefreshCw size={48} className="text-white" />}
                        </div>

                        <h2 className={`text-3xl font-black uppercase tracking-tight mb-2
                            ${scanResult === 'Valid' ? 'text-emerald-600' : ''}
                            ${scanResult === 'Invalid' ? 'text-red-600' : ''}
                            ${scanResult === 'Duplicate' ? 'text-amber-600' : ''}
                        `}>
                            {scanResult === 'Valid' ? 'Verified!' : scanResult}
                        </h2>
                        
                        <p className="text-slate-500 font-medium mb-6">{resultMessage}</p>

                        {(scanResult === 'Valid' || scanResult === 'Duplicate') && participantDetails && (
                            <div className="w-full bg-slate-50 rounded-xl p-4 border border-slate-100">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Participant</p>
                                <p className="text-xl font-bold text-slate-900 leading-tight">{participantDetails.name}</p>
                                <p className="text-indigo-600 font-medium text-sm mt-1">{participantDetails.position}</p>
                                <p className="text-slate-500 text-xs">{participantDetails.office}</p>
                            </div>
                        )}
                        
                        {/* Progress Bar for Auto Dismiss */}
                        <div className="w-full bg-slate-100 h-1.5 rounded-full mt-6 overflow-hidden">
                             <div className="h-full bg-slate-300 animate-[progress_2s_linear_forwards]"></div>
                        </div>
                        <style>{`@keyframes progress { from { width: 100%; } to { width: 0%; } }`}</style>
                    </div>
                </div>
            )}
        </div>

        {/* RIGHT/BOTTOM: Recent Scans History (Sidebar on Desktop, Bottom panel on Mobile) */}
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
                                        ${scan.status === 'Invalid' ? 'bg-red-50 text-red-700' : ''}
                                        ${scan.status === 'Duplicate' ? 'bg-amber-50 text-amber-700' : ''}
                                    `}>
                                        {scan.status}
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