import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Event, Participant } from '../../types/database';
import { ArrowLeft, Printer, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';

const CertificateOfAppearancePrint: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [event, setEvent] = useState<Event | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [signatory, setSignatory] = useState<{name: string, position: string, esig_link: string} | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (eventId && user) {
      fetchData(parseInt(eventId));
    }
  }, [eventId, user]);

  const fetchData = async (id: number) => {
    try {
      // Fetch Event
      const { data: eventData } = await supabase
        .from('events')
        .select('*')
        .eq('event_id', id)
        .single();
      
      if (!eventData) throw new Error("Event not found");
      setEvent(eventData);

      // Fetch Signatory for the event's organizing office
      if (eventData.organize_by) {
        const { data: sigData } = await supabase
          .from('tbl_signatory')
          .select('*')
          .eq('office_id', eventData.organize_by)
          .maybeSingle();
        
        if (sigData) {
          setSignatory(sigData);
        }
      }

      // Fetch Logs for the event
      const { data: logs } = await supabase
        .from('attendance_logs')
        .select('participant_id')
        .eq('event_id', id);

      if (!logs) {
        setParticipants([]);
        return;
      }

      // Get unique participant IDs who have logs
      const uniqueParticipantIds = Array.from(new Set(logs.map(log => log.participant_id)));

      if (uniqueParticipantIds.length === 0) {
        setParticipants([]);
        return;
      }

      // Fetch participant details
      const { data: participantsData } = await supabase
        .from('participants')
        .select('*')
        .in('participant_id', uniqueParticipantIds)
        .order('l_name', { ascending: true });

      setParticipants(participantsData || []);

    } catch (e) {
      console.error("Error fetching data", e);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <p className="text-slate-500 mb-4">Event not found.</p>
        <button onClick={() => navigate('/reports')} className="text-indigo-600 hover:underline">
          Back to Reports
        </button>
      </div>
    );
  }

  // Format dates
  const startDate = parseISO(event.start_date);
  const endDate = event.end_date ? parseISO(event.end_date) : startDate;
  
  let dateString = '';
  if (event.end_date && event.start_date !== event.end_date) {
    if (startDate.getMonth() === endDate.getMonth() && startDate.getFullYear() === endDate.getFullYear()) {
      dateString = `${format(startDate, 'MMMM d')}-${format(endDate, 'd, yyyy')}`;
    } else if (startDate.getFullYear() === endDate.getFullYear()) {
      dateString = `${format(startDate, 'MMMM d')} - ${format(endDate, 'MMMM d, yyyy')}`;
    } else {
      dateString = `${format(startDate, 'MMMM d, yyyy')} - ${format(endDate, 'MMMM d, yyyy')}`;
    }
  } else {
    dateString = format(startDate, 'MMMM d, yyyy');
  }

  // Chunk participants into pairs (2 per page)
  const chunkedParticipants = [];
  for (let i = 0; i < participants.length; i += 2) {
    chunkedParticipants.push(participants.slice(i, i + 2));
  }

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white flex flex-col items-center">
      {/* Non-printable header */}
      <div className="print:hidden bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm w-full">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/reports')}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
          >
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Certificates of Appearance</h1>
            <p className="text-sm text-slate-500">{event.event_name} • {participants.length} Participants</p>
          </div>
        </div>
        <button 
          onClick={handlePrint}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors shadow-sm"
        >
          <Printer size={18} /> Print Certificates
        </button>
      </div>

      {/* Printable Content */}
      <div className="p-8 print:p-0 flex flex-col items-center w-full">
        {participants.length === 0 ? (
          <div className="text-center p-12 bg-white rounded-xl shadow-sm border border-slate-200 w-full max-w-2xl mt-8">
            <p className="text-slate-500">No participants with attendance logs found for this event.</p>
          </div>
        ) : (
          <div className="w-full flex flex-col items-center">
            {chunkedParticipants.map((pair, pageIndex) => (
              <div 
                key={pageIndex} 
                className="w-[210mm] h-[297mm] bg-white print:shadow-none shadow-md mb-8 print:mb-0 relative overflow-hidden page-break-after-always flex flex-col"
              >
                {pair.map((participant, index) => (
                  <div key={participant.participant_id} className="flex-1 flex flex-col relative box-border p-8">
                    
                    {/* Certificate Content */}
                    <div className="flex-1 flex flex-col justify-center">
                      
                      {/* Header */}
                      <div className="text-center mb-4">
                        <img 
                          src="/assets/dilg_logo.png" 
                          alt="DILG Logo" 
                          className="w-20 h-20 mx-auto mb-1 object-contain"
                        />
                        <p className="text-[11px] font-serif leading-tight">Republic of the Philippines</p>
                        <p className="text-[12px] font-bold font-serif leading-tight">DEPARTMENT OF THE INTERIOR AND LOCAL GOVERNMENT</p>
                        <p className="text-[12px] font-bold font-serif leading-tight">REGION X - NORTHERN MINDANAO</p>
                        <p className="text-[11px] font-serif leading-tight">Km 3 Fr. W.F. Masterson Avenue, Upper Carmen, Cagayan de Oro City</p>
                        <p className="text-[11px] font-serif text-blue-600 underline leading-tight">www.region10.dilg.gov.ph</p>
                      </div>

                      {/* Title */}
                      <h2 className="text-lg font-bold text-center tracking-[0.4em] mb-4 font-serif">
                        CERTIFICATE OF APPEARANCE
                      </h2>

                      {/* Body */}
                      <div className="text-justify text-[13px] leading-relaxed font-serif mb-4 px-4">
                        <span className="ml-8">This is to certify that Mr./Ms.</span>
                        <span className="inline-block border-b border-black font-bold px-2 mx-1 min-w-[200px] text-center">
                          {participant.full_name}
                        </span>
                        <span>with official station at</span>
                        <span className="inline-block border-b border-black font-bold px-2 mx-1 min-w-[150px] text-center">
                          {participant.office || '______________________'}
                        </span>
                        <span>attended the</span>
                        <span className="font-bold mx-1">{event.event_name}</span>
                        <span>held on {dateString}, at {event.venue}.</span>
                      </div>

                      <div className="text-justify text-[13px] leading-relaxed font-serif mb-4 px-4">
                        <span className="ml-8">It is further certified that during the stay of the above-mentioned individual, this office provided the following:</span>
                      </div>

                      {/* Table */}
                      <div className="flex justify-center mb-4">
                        <table className="border-collapse border border-black w-3/4 text-center font-serif text-[13px]">
                          <tbody>
                            <tr>
                              <td className="border border-black py-1 w-1/3">AM Snacks</td>
                              <td className="border border-black py-1 w-1/3">Lunch</td>
                              <td className="border border-black py-1 w-1/3">PM Snacks</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Signatory */}
                      <div className="mt-auto text-center font-serif flex flex-col items-center pt-4">
                        <div className="relative inline-block">
                          {signatory?.esig_link && (
                            <img 
                              src={signatory.esig_link} 
                              alt="E-Signature" 
                              className="absolute left-1/2 -translate-x-1/2 bottom-4 h-16 object-contain z-0 pointer-events-none"
                              referrerPolicy="no-referrer"
                            />
                          )}
                          <p className="font-bold text-[14px] uppercase relative z-10">{signatory?.name || 'CORAZON S. VICENTE'}</p>
                          <p className="text-[13px] relative z-10">{signatory?.position || 'Division Chief, LGMED'}</p>
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="mt-6 text-center font-serif text-[10px] text-slate-800 leading-tight">
                        <p className="italic font-bold">"Matino, Mahusay at Maasahan"</p>
                        <p>T: (088) 859-4181 E: records.dilg10@gmail.com FB: www.facebook.com/DILGX</p>
                      </div>

                    </div>

                    {/* Divider line between the two certificates on the page */}
                    {index === 0 && (
                      <div className="absolute bottom-0 left-8 right-8 border-b border-dashed border-slate-300 print:border-slate-400"></div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            background-color: white !important;
          }
          .page-break-after-always {
            page-break-after: always;
            break-after: page;
          }
        }
      `}</style>
    </div>
  );
};

export default CertificateOfAppearancePrint;
