import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Camera, CheckCircle, XCircle, RefreshCw, Zap, Moon, Sun } from 'lucide-react';
import { Event } from '../../types/database';

const Scanner: React.FC = () => {
  const { user } = useAuth();
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<'Valid' | 'Invalid' | 'Duplicate' | null>(null);
  const [resultMessage, setResultMessage] = useState('');
  const [participantName, setParticipantName] = useState('');
  const [session, setSession] = useState<'AM' | 'PM'>('AM');
  const [selectedEventId, setSelectedEventId] = useState<string>(''); // Keep as string for Select input, parse later
  const [events, setEvents] = useState<Event[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // 1. Load Events
  useEffect(() => {
    const loadEvents = async () => {
      const { data } = await supabase
        .from('events')
        .select('*')
        .in('status', ['Ongoing', 'Scheduled']);
      
      if (data && data.length > 0) {
        setEvents(data);
        setSelectedEventId(data[0].event_id.toString());
      }
    };
    loadEvents();
  }, []);

  // 2. Initialize Scanner
  useEffect(() => {
    if (selectedEventId && !scanning && !scanResult) {
       startScanner();
    }
    
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(console.error);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId, scanResult]);

  const startScanner = async () => {
    if (scannerRef.current) {
        try { await scannerRef.current.stop(); } catch(e) {}
    }

    const html5QrCode = new Html5Qrcode("reader");
    scannerRef.current = html5QrCode;

    try {
        await html5QrCode.start(
            { facingMode: "environment" },
            {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0
            },
            (decodedText) => {
                handleScan(decodedText);
            },
            () => {}
        );
        setScanning(true);
        setCameraError(null);
    } catch (err) {
        setCameraError("Camera permission denied or not available.");
        setScanning(false);
    }
  };

  const handleScan = async (qrToken: string) => {
    if (!scannerRef.current) return;
    
    // Pause scanning
    await scannerRef.current.stop();
    setScanning(false);

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
            throw new Error("Invalid QR Code");
        }

        const participantId = qrData.participant_id;

        // 2. Fetch Participant Details
        const { data: partData } = await supabase
            .from('participants')
            .select('full_name')
            .eq('participant_id', participantId)
            .single();
        
        const pName = partData?.full_name || 'Unknown';
        setParticipantName(pName);

        // 3. Check Registration
        // Using 'Registered' status (Title Case)
        const { data: regData } = await supabase
            .from('event_participants')
            .select('id')
            .eq('event_id', eventId)
            .eq('participant_id', participantId)
            .eq('registration_status', 'Registered')
            .single();

        if (!regData) {
            triggerFeedback('Invalid', `Not registered for this event.`);
            await logScan(eventId, participantId, 'Invalid', 'Not Registered');
            return;
        }

        // 4. Check for Duplicate Scan
        // Unique Constraint: (event_id, participant_id, attendance_date, action_session)
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
            triggerFeedback('Duplicate', `Already scanned for ${session}.`);
            await logScan(eventId, participantId, 'Duplicate', 'Already Scanned');
            return;
        }

        // 5. Success
        triggerFeedback('Valid', `Welcome, ${pName}!`);
        await logScan(eventId, participantId, 'Valid', 'Success');

    } catch (err: any) {
        setParticipantName('Unknown');
        triggerFeedback('Invalid', err.message || 'Scan failed');
    }
  };

  const logScan = async (eventId: number, participantId: number, status: 'Valid' | 'Invalid' | 'Duplicate', notes?: string) => {
      if (!user) return;
      
      const today = new Date().toISOString().split('T')[0];
      
      await supabase.from('attendance_logs').insert({
          event_id: eventId,
          participant_id: participantId,
          user_id: user.user_id,
          scan_status: status,
          scan_time: new Date().toISOString(),
          attendance_date: today,
          action_session: session,
          remarks: notes
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

    // Auto reset
    setTimeout(() => {
        setScanResult(null);
        setParticipantName('');
        setResultMessage('');
        startScanner();
    }, 2500);
  };

  return (
    <div className="h-full flex flex-col relative bg-black">
      {/* Event & Session Selector */}
      <div className="absolute top-0 left-0 right-0 z-20 bg-black/60 backdrop-blur-sm p-4 text-white">
        <div className="flex gap-2 mb-2">
            <select 
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                className="bg-slate-800 text-white text-sm rounded-lg block w-full p-2.5 border border-slate-600"
            >
                {events.length === 0 && <option value="">No Active Events</option>}
                {events.map(e => <option key={e.event_id} value={e.event_id}>{e.event_name}</option>)}
            </select>
            
            <button 
                onClick={() => setSession(session === 'AM' ? 'PM' : 'AM')}
                className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 border ${session === 'AM' ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500' : 'bg-indigo-500/20 border-indigo-500 text-indigo-400'}`}
            >
                {session === 'AM' ? <Sun size={18}/> : <Moon size={18}/>}
                {session}
            </button>
        </div>
      </div>

      {/* Camera Viewport */}
      <div className="flex-1 relative overflow-hidden bg-black flex items-center justify-center">
         {cameraError ? (
            <div className="text-white text-center p-8">
                <p className="text-red-500 mb-4">{cameraError}</p>
                <button onClick={() => startScanner()} className="bg-slate-700 px-4 py-2 rounded">Retry Camera</button>
            </div>
         ) : (
            <div id="reader" className="w-full h-full object-cover"></div>
         )}
      </div>

      {/* Full Screen Overlay Feedback */}
      {scanResult && (
        <div className={`absolute inset-0 z-50 flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in duration-200
            ${scanResult === 'Valid' ? 'bg-green-600' : ''}
            ${scanResult === 'Invalid' ? 'bg-red-600' : ''}
            ${scanResult === 'Duplicate' ? 'bg-orange-600' : ''}
        `}>
            {scanResult === 'Valid' && <CheckCircle size={80} className="text-white mb-4" />}
            {scanResult === 'Invalid' && <XCircle size={80} className="text-white mb-4" />}
            {scanResult === 'Duplicate' && <RefreshCw size={80} className="text-white mb-4" />}
            
            <h2 className="text-4xl font-bold text-white mb-2 uppercase tracking-wide">
                {scanResult}
            </h2>
            <p className="text-white/90 text-xl font-medium">{resultMessage}</p>
        </div>
      )}

      {/* Bottom Instructions */}
      {!scanResult && (
          <div className="absolute bottom-8 left-0 right-0 text-center z-10 pointer-events-none">
              <p className="text-white/70 text-sm bg-black/50 inline-block px-4 py-1 rounded-full backdrop-blur">
                  Align QR Code within frame
              </p>
          </div>
      )}
    </div>
  );
};

export default Scanner;