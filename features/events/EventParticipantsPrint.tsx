import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Event } from '../../types/database';
import { ArrowLeft, Printer, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const EventParticipantsPrint: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<Event | null>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
        if (!eventId) return;
        try {
            const { data: eventData } = await supabase.from('events').select('*').eq('event_id', parseInt(eventId)).single();
            setEvent(eventData);

            const { data: partData } = await supabase
            .from('event_participants')
            .select(`
                registration_status,
                registered_at,
                role,
                needs_accommodation,
                accommodation_pax,
                participants (
                    full_name,
                    participant_code,
                    email,
                    position,
                    office
                )
            `)
            .eq('event_id', parseInt(eventId));
            
            const sorted = (partData || []).sort((a: any, b: any) => 
                (a.participants?.full_name || '').localeCompare(b.participants?.full_name || '')
            );
            setParticipants(sorted);

        } catch(e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };
    fetchData();
  }, [eventId]);

  const accommodationCount = React.useMemo(() => {
      return participants.filter(p => p.needs_accommodation).length;
  }, [participants]);

  if (loading) return <div className="flex justify-center items-center h-screen"><Loader2 className="animate-spin text-indigo-600" /></div>;
  if (!event) return <div className="p-8 text-center text-red-500 font-bold">Event not found</div>;

  return (
      <div className="min-h-screen bg-slate-50 p-8 font-serif print:bg-white print:p-0">
          <div className="max-w-[210mm] mx-auto mb-6 flex justify-between no-print">
               <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium">
                  <ArrowLeft size={20} /> Back
              </button>
              <button onClick={() => window.print()} className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow hover:bg-indigo-700 font-bold transition-colors">
                  <Printer size={20} /> Print List
              </button>
          </div>

          <div className="w-[210mm] mx-auto bg-white shadow-xl print:shadow-none print:w-full print:max-w-none print:p-0 min-h-[297mm] relative overflow-hidden flex flex-col mb-10">
             
             {/* Header - Matches AttendanceSheetPrint style */}
             <div className="flex items-center pt-8 px-8 mb-2">
                <div className="w-24 h-24 mr-4 flex-shrink-0 flex items-center justify-center">
                    <img 
                        src="/assets/dilg_logo.png" 
                        alt="DILG Logo" 
                        className="w-full h-full object-contain"
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://upload.wikimedia.org/wikipedia/commons/6/6f/DILG_Seal.svg';
                        }}
                    />
                </div>
                <div className="flex flex-col justify-center">
                    <h1 className="text-lg font-bold font-sans text-slate-900">DILG Region 10 - Northern Mindanao</h1>
                    <h2 className="text-2xl font-black text-black tracking-wide mt-1 uppercase font-sans">PARTICIPANTS LIST</h2>
                </div>
            </div>

             {/* Centered Event Details */}
             <div className="flex flex-col items-center justify-center text-center w-full mb-6">
                <div className="text-xl font-bold font-serif mb-1 uppercase tracking-wide">
                    {event.event_name}
                </div>
                <div className="text-sm font-sans text-slate-700">
                    {event.venue}
                </div>
                <div className="text-sm font-sans text-slate-900 mt-1">
                    {format(parseISO(event.start_date), 'MMMM d, yyyy')}
                    {event.start_date !== event.end_date && event.end_date && ` - ${format(parseISO(event.end_date), 'MMMM d, yyyy')}`}
                </div>
            </div>

            <div className="flex justify-between items-end mb-2 px-8">
                 <div className="text-xs text-slate-500 uppercase font-bold font-sans">Total Registered: {participants.length}</div>
                 {event.has_accommodation && (
                     <div className="text-xs text-slate-500 uppercase font-bold font-sans">
                         With Accommodation: {accommodationCount}
                     </div>
                 )}
            </div>

             {/* Table */}
             <div className="px-8 flex-1">
                <table className="w-full text-xs border-collapse border border-black">
                     <thead>
                         <tr className="bg-gray-200 text-center font-bold uppercase font-sans print:bg-gray-200 print:print-color-adjust-exact">
                             <th className="border border-black px-2 py-2 w-10">No.</th>
                             <th className="border border-black px-4 py-2 text-left">NAME</th>
                             <th className="border border-black px-4 py-2">ROLE</th>
                             <th className="border border-black px-4 py-2">POSITION</th>
                             <th className="border border-black px-4 py-2">OFFICE</th>
                             {event.has_accommodation && <th className="border border-black px-2 py-2 w-20">ACCOM.</th>}
                             <th className="border border-black px-4 py-2 text-center w-24">STATUS</th>
                         </tr>
                     </thead>
                     <tbody className="font-sans text-xs">
                         {participants.map((row, i) => (
                             <tr key={i} className="text-center h-8 hover:bg-slate-50 print:hover:bg-transparent break-inside-avoid">
                                 <td className="border border-black px-2 py-1.5">{i + 1}</td>
                                 <td className="border border-black px-3 py-1.5 text-left capitalize font-medium">{row.participants?.full_name}</td>
                                 <td className="border border-black px-2 py-1.5">{row.role || 'Delegate'}</td>
                                 <td className="border border-black px-2 py-1.5">{row.participants?.position}</td>
                                 <td className="border border-black px-2 py-1.5">{row.participants?.office}</td>
                                 {event.has_accommodation && (
                                     <td className="border border-black px-2 py-1.5 font-bold text-center">
                                         {row.needs_accommodation ? '✓' : '-'}
                                     </td>
                                 )}
                                 <td className="border border-black px-2 py-1.5 text-center">
                                     <span className={`uppercase text-[10px] font-bold ${
                                         row.registration_status === 'Registered' ? 'text-green-700' : 'text-red-700'
                                     }`}>
                                         {row.registration_status}
                                     </span>
                                 </td>
                             </tr>
                         ))}
                         {participants.length === 0 && (
                             <tr><td colSpan={event.has_accommodation ? 7 : 6} className="border border-black py-12 text-center text-slate-500 italic">No participants registered for this event.</td></tr>
                         )}
                     </tbody>
                 </table>
             </div>
             
             <div className="w-full px-10 pb-6 pt-4 flex justify-between text-[10px] text-slate-400 font-sans">
                 <span>System Generated Report</span>
                 <span>{format(new Date(), 'MMM d, yyyy h:mm a')}</span>
             </div>
          </div>
      </div>
  );
}

export default EventParticipantsPrint;
