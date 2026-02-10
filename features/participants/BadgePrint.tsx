import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { supabase } from '../../lib/supabase';
import { Participant } from '../../types/database';
import { ArrowLeft, Printer } from 'lucide-react';

const BadgePrint: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [qrToken, setQrToken] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
        if (!id) return;
        const participantId = parseInt(id);
        if (isNaN(participantId)) return;
        
        // 1. Get Participant
        const { data: pData } = await supabase.from('participants').select('*').eq('participant_id', participantId).single();
        if (pData) {
            setParticipant(pData);
            setQrToken(pData.participant_code);
        }

        setLoading(false);
    };
    fetchData();
  }, [id]);

  if (loading) return <div>Loading...</div>;
  if (!participant) return <div>Participant not found</div>;

  return (
    <div className="min-h-screen bg-slate-100 p-8 flex flex-col items-center">
      
      {/* Controls - Hidden on Print */}
      <div className="w-full max-w-2xl flex justify-between mb-8 no-print">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-slate-600 hover:text-slate-900">
            <ArrowLeft size={20} /> Back
        </button>
        <button onClick={() => window.print()} className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-md">
            <Printer size={20} /> Print Badge
        </button>
      </div>

      {/* Badge Card */}
      <div className="bg-white w-[350px] h-[500px] shadow-2xl rounded-xl border border-slate-200 flex flex-col items-center justify-between p-8 text-center print:shadow-none print:border print:w-full print:h-full print:absolute print:inset-0 print:m-0">
          <div className="w-full border-b-2 border-indigo-600 pb-4 mb-4">
              <h1 className="text-2xl font-bold text-indigo-800 uppercase tracking-widest">Event Pass</h1>
              <p className="text-slate-400 text-xs mt-1">AUTHORIZED PERSONNEL</p>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center space-y-4">
              <div className="border-4 border-slate-900 p-2 rounded-lg">
                {qrToken && <QRCode value={qrToken} size={150} />}
              </div>
              <div>
                  <h2 className="text-xl font-bold text-slate-900 mt-4">{participant.full_name}</h2>
                  <p className="text-slate-500 font-medium">{participant.position}</p>
                  <p className="text-slate-400 text-sm mt-1">{participant.office}</p>
              </div>
          </div>

          <div className="w-full pt-6 border-t border-slate-100">
              <p className="text-xs text-slate-300 font-mono">{participant.participant_code}</p>
          </div>
      </div>
    </div>
  );
};

export default BadgePrint;