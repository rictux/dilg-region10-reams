import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { supabase } from '../../lib/supabase';
import { Participant } from '../../types/database';
import { ArrowLeft, Download } from 'lucide-react';
import { toPng } from 'html-to-image';

const BadgePrint: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [qrToken, setQrToken] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const badgeRef = useRef<HTMLDivElement>(null);

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

  const handleSaveBadge = async () => {
      if (badgeRef.current && participant) {
          try {
              const dataUrl = await toPng(badgeRef.current, { cacheBust: true, backgroundColor: '#ffffff' });
              const link = document.createElement('a');
              link.download = `${participant.full_name.replace(/\s+/g, '_')}_Badge.png`;
              link.href = dataUrl;
              link.click();
          } catch (err) {
              console.error('Error generating badge image:', err);
              alert('Failed to save badge image.');
          }
      }
  };

  if (loading) return <div>Loading...</div>;
  if (!participant) return <div>Participant not found</div>;

  return (
    <div className="min-h-screen bg-[#EDEAE2] p-8 flex flex-col items-center">
      
      {/* Controls - Hidden on Print */}
      <div className="w-full max-w-2xl flex justify-between mb-8 no-print">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-[#6B6860] hover:text-[#111110]">
            <ArrowLeft size={20} /> Back
        </button>
        <button onClick={handleSaveBadge} className="bg-[#4B3FE4] text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-md">
            <Download size={20} /> Save Badge
        </button>
      </div>

      {/* Badge Card */}
      <div ref={badgeRef} className="bg-white w-[350px] h-[500px] shadow-2xl rounded-xl border border-[#E0DDD4] flex flex-col items-center justify-between p-8 text-center">
          <div className="w-full border-b-2 border-[#4B3FE4] pb-4 mb-4">
              <h1 className="text-2xl font-bold text-[#2F26A0] uppercase tracking-widest">Event Pass</h1>
              <p className="text-[#9A9890] text-xs mt-1">AUTHORIZED PERSONNEL</p>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center space-y-4">
              <div className="border-4 border-[#111110] bg-white p-2 rounded-lg">
                {qrToken && (
                  <div className="relative inline-block">
                    <QRCode value={qrToken} size={150} fgColor="#000000" bgColor="#FFFFFF" level="H" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-full p-1">
                      <img src="/assets/dilg_logo.png" alt="DILG Logo" className="w-9 h-9 object-contain rounded-full" />
                    </div>
                  </div>
                )}
              </div>
              <div>
                  <h2 className="text-xl font-bold text-[#111110] mt-4">{participant.full_name}</h2>
                  <p className="text-[#7C7A72] font-medium">{participant.position}</p>
                  <p className="text-[#9A9890] text-sm mt-1">{participant.office}</p>
              </div>
          </div>
      </div>
    </div>
  );
};

export default BadgePrint;
