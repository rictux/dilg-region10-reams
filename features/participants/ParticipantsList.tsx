import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Participant } from '../../types/database';
import { UserPlus, QrCode } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ParticipantsList: React.FC = () => {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchParticipants();
  }, []);

  const fetchParticipants = async () => {
    setLoading(true);
    const { data } = await supabase.from('participants').select('*');
    if (data) setParticipants(data);
    setLoading(false);
  };

  const handleGenerateQR = async (participant: Participant) => {
      // Check if QR exists
      const { data: existing } = await supabase.from('participant_qr').select('*').eq('participant_id', participant.participant_id).single();
      
      if (!existing) {
          // Generate unique token
          const token = `evt-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          await supabase.from('participant_qr').insert({
              participant_id: participant.participant_id,
              qr_token: token
          });
      }
      navigate(`/badges/${participant.participant_id}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Participants</h2>
        <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
            <UserPlus size={20} /> Add Participant
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-semibold">
                    <tr>
                        <th className="px-6 py-4">Code</th>
                        <th className="px-6 py-4">Name</th>
                        <th className="px-6 py-4">Email</th>
                        <th className="px-6 py-4">Position</th>
                        <th className="px-6 py-4">Office</th>
                        <th className="px-6 py-4">QR / Badge</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {participants.map((p) => (
                        <tr key={p.participant_id} className="hover:bg-slate-50">
                             <td className="px-6 py-4 text-slate-600 font-mono">{p.participant_code}</td>
                            <td className="px-6 py-4 font-medium text-slate-800">{p.full_name}</td>
                            <td className="px-6 py-4 text-slate-600">{p.email}</td>
                            <td className="px-6 py-4 text-slate-600">{p.position}</td>
                            <td className="px-6 py-4 text-slate-600">{p.office}</td>
                            <td className="px-6 py-4">
                                <button 
                                    onClick={() => handleGenerateQR(p)}
                                    className="text-indigo-600 hover:bg-indigo-50 px-3 py-1 rounded-full flex items-center gap-1 text-xs font-semibold border border-indigo-200"
                                >
                                    <QrCode size={14} /> View Badge
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};

export default ParticipantsList;