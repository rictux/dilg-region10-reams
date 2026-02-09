import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { CheckCircle, XCircle, RefreshCw, Sun, Moon, AlertTriangle, Loader2 } from 'lucide-react';
import { Event } from '../../types/database';

const Scanner: React.FC = () => {
  const { user } = useAuth();
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<'Valid' | 'Invalid' | 'Duplicate' | null>(null);
  const [resultMessage, setResultMessage] = useState('');
  const [participantDetails, setParticipantDetails] = useState<{ name: string; position: string } | null>(null);
  const [session, setSession] = useState<'AM' | 'PM'>('AM');
  const [selectedEventId, setSelectedEventId] = useState<string>(''); 
  const [events, setEvents] = useState<Event[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(true);
  
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
    
    // Cleanup on unmount
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
        console.error("Failed to stop scanner", e);
      }
      scannerRef.current = null;
      setScanning(false);
    }
  };

  const startScanner = async () => {
    await cleanupScanner(); // Ensure clean state

    const html5QrCode = new Html5Qrcode(readerId);
    scannerRef.current = html5QrCode;

    try {
        await html5QrCode.start(
            { facingMode: "environment" },
            {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                aspectRatio: window.innerWidth / window.innerHeight,
                formatsToSupport: [ Html5QrcodeSupportedFormats.QR_CODE ]
            },
            (decodedText) => {
                handleScan(decodedText);
            },
            (errorMessage) => {
                // Ignore scan errors as they happen every frame no QR is detected
            }
        );
        setScanning(true);
        setCameraError(null);
    } catch (err) {
        console.error(err);
        setCameraError("Camera permission denied or not available. Please ensure you are using HTTPS or localhost.");
        setScanning(false);
    }
  };

  const handleScan = async (qrToken: string) => {
    if (!scannerRef.current) return;
    
    // Pause scanning immediately
    try {
        await scannerRef.current.stop();
        setScanning(false);
    } catch (e) {
        console.error("Error stopping scanner", e);
    }

    try {
        const eventId = parseInt(selectedEventId);
        if (isNaN(eventId)) throw new Error("No event selected");

        // 1. Find Participant by QR
        const { data: qrData, error: qrError } = await supabase
            .from('participant_qr')
            .select('participant_id')
            .eq('qr_token', qrToken)
            .single();

        if (qrError || !qrData) {
            throw new Error("QR Code not found in system.");
        }

        const participantId = qrData.participant_id;

        // 2. Fetch Participant Details
        const { data: partData } = await supabase
            .from('participants')
            .select('full_name, position, office')
            .eq('participant_id', participantId)
            .single();
        
        if (!partData) throw new Error("Participant details not found.");
        
        setParticipantDetails({
            name: partData.full_name,
            position: partData.position
        });

        // 3. Check Event Registration
        const { data: regData } = await supabase
            .from('event_participants')
            .select('registration_status')
            .eq('event_id', eventId)
            .eq('participant_id', participantId)
            .single();

        if (!regData || regData.registration_status !== 'Registered') {
            await logScan(eventId, participantId, 'Invalid', 'Not Registered');
            triggerFeedback('Invalid', `Not registered for this event.`);
            return;
        }

        // 4. Check for Duplicate Scan (Same Event, Same Day, Same Session)
        const today = new Date().toISOString().split('T')[0];
        
        const { data: existingLog } = await supabase
            .from('attendance_logs')
            .select('attendance_id')
            .eq('event_id', eventId)
            .eq('participant_id', participantId)
            .eq('attendance_date', today)
            .eq('action_session', session)
            .eq('scan_status', 'Valid')
            .single();

        if (existingLog) {
            await logScan(eventId, participantId, 'Duplicate', 'Already Scanned');
            triggerFeedback('Duplicate', `Already scanned for ${session}.`);
            return;
        }

        // 5. Success
        await logScan(eventId, participantId, 'Valid', 'Success');
        triggerFeedback('Valid', `Welcome!`);

    } catch (err: any) {
        setParticipantDetails(null);
        await logScan(parseInt(selectedEventId) || 0, 0, 'Invalid', err.message); // Log failure if possible
        triggerFeedback('Invalid', err.message || 'Scan failed');
    }
  };

  const logScan = async (eventId: number, participantId: number, status: 'Valid' | 'Invalid' | 'Duplicate', notes?: string) => {
      if (!user) return;
      if (participantId === 0) return; // Don't log unknown participants 
      
      const today = new Date().toISOString().split('T')[0];
      
      await supabase.from('attendance_logs').insert({
          event_id: eventId,
          participant_id: participantId,
          user_id: user.user_id,
          scan_status: status,
          scan_time: new Date().toISOString(),
          attendance_date: today,
          action_session: session,
          remarks: notes,
          scanner_device: navigator.userAgent
      });
  };

  const triggerFeedback = (type: 'Valid' | 'Invalid' | 'Duplicate', msg: string) => {
    setScanResult(type);
    setResultMessage(msg);
    
    // Haptic Feedback
    if (navigator.vibrate) {
        if (type === 'Valid') navigator.vibrate([100, 50, 100]);
        else navigator.vibrate([300]);
    }

    // Auto reset logic
    setTimeout(() => {
        setScanResult(null);
        setParticipantDetails(null);
        setResultMessage('');
    }, 2500); // 2.5 seconds delay before restarting scanner
  };

  return (
    <div className="h-full w-full flex flex-col relative bg-black overflow-hidden">
      
      {/* 1. Top Controls Overlay */}
      <div className="absolute top-0 left-0 right-0 z-20 p-4 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex gap-3 max-w-lg mx-auto">
            <div className="flex-1">
                {loadingEvents ? (
                    <div className="h-10 bg-slate-800 rounded animate-pulse"></div>
                ) : (
                    <select 
                        value={selectedEventId}
                        onChange={(e) => setSelectedEventId(e.target.value)}
                        className="w-full bg-slate-900/90 text-white text-sm rounded-lg p-2.5 border border-slate-700 focus:ring-indigo-500 focus:border-indigo-500 shadow-lg backdrop-blur-sm appearance-none"
                    >
                        {events.length === 0 && <option value="">No Active Events</option>}
                        {events.map(e => <option key={e.event_id} value={e.event_id}>{e.event_name}</option>)}
                    </select>
                )}
            </div>
            
            <button 
                onClick={() => setSession(session === 'AM' ? 'PM' : 'AM')}
                className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 border shadow-lg backdrop-blur-sm transition-all
                    ${session === 'AM' 
                        ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400' 
                        : 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                    }`}
            >
                {session === 'AM' ? <Sun size={18} className="fill-current"/> : <Moon size={18} className="fill-current"/>}
                {session}
            </button>
        </div>
      </div>

      {/* 2. Camera Viewport */}
      <div className="flex-1 relative flex items-center justify-center bg-black">
         {cameraError ? (
            <div className="text-white text-center p-8 max-w-xs">
                <AlertTriangle size={48} className="mx-auto text-red-500 mb-4" />
                <p className="text-red-400 mb-6 font-medium">{cameraError}</p>
                <button 
                    onClick={() => startScanner()} 
                    className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-full font-medium transition-colors"
                >
                    Retry Access
                </button>
            </div>
         ) : (
            <>
                <div id={readerId} className="w-full h-full"></div>
                {/* Aiming Guide Overlay */}
                {!scanResult && scanning && (
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                        <div className="w-64 h-64 border-2 border-white/30 rounded-xl relative">
                            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-indigo-500 -mt-1 -ml-1 rounded-tl-lg"></div>
                            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-indigo-500 -mt-1 -mr-1 rounded-tr-lg"></div>
                            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-indigo-500 -mb-1 -ml-1 rounded-bl-lg"></div>
                            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-indigo-500 -mb-1 -mr-1 rounded-br-lg"></div>
                        </div>
                        <div className="absolute bottom-20 bg-black/50 backdrop-blur px-4 py-2 rounded-full text-white/80 text-sm font-medium">
                            Align QR Code to scan
                        </div>
                    </div>
                )}
            </>
         )}
      </div>

      {/* 3. Result Overlay (Full Screen) */}
      {scanResult && (
        <div className={`absolute inset-0 z-50 flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in duration-300
            ${scanResult === 'Valid' ? 'bg-green-600' : ''}
            ${scanResult === 'Invalid' ? 'bg-red-600' : ''}
            ${scanResult === 'Duplicate' ? 'bg-orange-500' : ''}
        `}>
            <div className="bg-white/20 p-6 rounded-full mb-6 backdrop-blur-sm">
                {scanResult === 'Valid' && <CheckCircle size={80} className="text-white" />}
                {scanResult === 'Invalid' && <XCircle size={80} className="text-white" />}
                {scanResult === 'Duplicate' && <RefreshCw size={80} className="text-white" />}
            </div>
            
            <h2 className="text-5xl font-black text-white mb-4 uppercase tracking-wider drop-shadow-md">
                {scanResult}
            </h2>

            {participantDetails && (
                <div className="bg-black/20 rounded-xl p-6 w-full max-w-sm backdrop-blur-sm mb-4">
                    <p className="text-white/80 text-sm uppercase tracking-widest font-bold mb-1">Participant</p>
                    <p className="text-3xl font-bold text-white mb-1">{participantDetails.name}</p>
                    <p className="text-white/90 font-medium">{participantDetails.position}</p>
                </div>
            )}
            
            <p className="text-white text-xl font-medium max-w-xs leading-relaxed">
                {resultMessage}
            </p>
        </div>
      )}
    </div>
  );
};

export default Scanner;