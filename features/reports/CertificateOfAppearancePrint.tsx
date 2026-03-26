import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Event, Participant } from '../../types/database';
import { ArrowLeft, Printer, Loader2 } from 'lucide-react';
import { eachDayOfInterval, format, parseISO } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import QRCode from 'react-qr-code';
import { parseFoodInclusion } from '../../lib/eventFoodInclusion';

type CertificateParticipant = {
  participant: Participant;
  needs_accommodation: boolean;
  date_accommodation: string[];
  log_dates: string[];
};

const CertificateOfAppearancePrint: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [event, setEvent] = useState<Event | null>(null);
  const [participants, setParticipants] = useState<CertificateParticipant[]>([]);
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
        .select('participant_id, attendance_date')
        .eq('event_id', id);

      if (!logs) {
        setParticipants([]);
        return;
      }

      // Get unique participant IDs who have logs
      const uniqueParticipantIds = Array.from(new Set(logs.map(log => log.participant_id)));
      const logDatesByParticipant = new Map<number, Set<string>>();

      logs.forEach((log) => {
        if (!log.participant_id || !log.attendance_date) return;
        if (!logDatesByParticipant.has(log.participant_id)) {
          logDatesByParticipant.set(log.participant_id, new Set<string>());
        }
        logDatesByParticipant.get(log.participant_id)?.add(log.attendance_date);
      });

      if (uniqueParticipantIds.length === 0) {
        setParticipants([]);
        return;
      }

      // Fetch participant details together with event registration details
      const { data: participantsData } = await supabase
        .from('event_participants')
        .select(`
          participant_id,
          needs_accommodation,
          date_accommodation,
          participants (*)
        `)
        .eq('event_id', id)
        .in('participant_id', uniqueParticipantIds)
        .order('participant_id', { ascending: true });

      const normalizedParticipants = (participantsData || [])
        .map((record: any) => ({
          participant: Array.isArray(record.participants) ? (record.participants[0] || null) : record.participants,
          needs_accommodation: !!record.needs_accommodation,
          date_accommodation: (record.date_accommodation || []).filter(Boolean),
          log_dates: Array.from(logDatesByParticipant.get(record.participant_id) || []).sort()
        }))
        .filter((record): record is CertificateParticipant => !!record.participant)
        .sort((a, b) => {
          const lastNameCompare = (a.participant.l_name || '').localeCompare(b.participant.l_name || '');
          if (lastNameCompare !== 0) return lastNameCompare;
          return (a.participant.full_name || '').localeCompare(b.participant.full_name || '');
        });

      setParticipants(normalizedParticipants);

    } catch (e) {
      console.error("Error fetching data", e);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const getEventDateRows = (selectedEvent: Event) => {
    try {
      const start = parseISO(selectedEvent.start_date);
      const end = selectedEvent.end_date ? parseISO(selectedEvent.end_date) : start;
      const safeEnd = end < start ? start : end;
      return eachDayOfInterval({ start, end: safeEnd }).map((date) => ({
        key: format(date, 'yyyy-MM-dd'),
        label: format(date, 'MMMM d, yyyy')
      }));
    } catch {
      return [{
        key: selectedEvent.start_date,
        label: selectedEvent.start_date
      }];
    }
  };

  const getEventAccommodationDates = (selectedEvent: Event) => {
    if (!selectedEvent.has_accommodation) return [] as string[];
    const savedDates = (selectedEvent.dates_with_accom || []).filter(Boolean);
    if (savedDates.length > 0) return savedDates;
    return getEventDateRows(selectedEvent).map((row) => row.key);
  };

  const getParticipantDateRows = (selectedEvent: Event, participantRecord: CertificateParticipant) => {
    const logDateSet = new Set(participantRecord.log_dates);
    return getEventDateRows(selectedEvent).filter((row) => logDateSet.has(row.key));
  };

  const getEventFoodInclusionMap = (selectedEvent: Event) => {
    return parseFoodInclusion(
      selectedEvent.food_inclusion || [],
      getEventDateRows(selectedEvent).map((row) => row.key)
    );
  };

  const formatFoodInclusion = (meals: string[]) => {
    return meals.length > 0 ? meals.join(', ') : '-';
  };

  const getCertificateLayoutMode = (rowCount: number) => {
    if (rowCount >= 5) return 'compact';
    if (rowCount >= 4) return 'dense';
    return 'default';
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

  const eventFoodInclusionMap = getEventFoodInclusionMap(event);

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
                {pair.map((participantRecord, index) => {
                  const participantDateRows = getParticipantDateRows(event, participantRecord);
                  const layoutMode = getCertificateLayoutMode(participantDateRows.length);
                  const isDenseLayout = layoutMode !== 'default';
                  const isCompactLayout = layoutMode === 'compact';

                  return (
                  <div
                    key={participantRecord.participant.participant_id}
                    className={`h-[148.5mm] flex flex-col relative box-border overflow-hidden ${
                      isCompactLayout ? 'px-6 py-5' : isDenseLayout ? 'px-7 py-6' : 'p-8'
                    }`}
                  >
                    
                    {/* Certificate Content */}
                    <div className={`flex-1 flex flex-col relative ${isDenseLayout ? 'justify-start' : 'justify-center'}`}>
                      
                      {/* Right QR Code */}
                      <div className={`absolute right-0 flex flex-col items-center text-center ${isDenseLayout ? 'bottom-1' : 'bottom-0'}`}>
                        <QRCode
                          value={`${window.location.origin}/lookup?participant=${participantRecord.participant.participant_id}`}
                          size={isCompactLayout ? 42 : isDenseLayout ? 46 : 52}
                        />
                        <p className={`mt-2 font-medium text-slate-700 leading-tight ${isCompactLayout ? 'text-[8px] max-w-[78px]' : 'text-[9px] max-w-[90px]'}`}>
                          Scan to verify
                        </p>
                      </div>

                      {/* Header */}
                      <div className={`text-center ${isCompactLayout ? 'mb-2' : isDenseLayout ? 'mb-3' : 'mb-4'}`}>
                        <img 
                          src="/assets/dilg_logo.png" 
                          alt="DILG Logo" 
                          className={`${isCompactLayout ? 'w-14 h-14' : isDenseLayout ? 'w-16 h-16' : 'w-20 h-20'} mx-auto mb-1 object-contain`}
                        />
                        <p className={`${isCompactLayout ? 'text-[9px]' : isDenseLayout ? 'text-[10px]' : 'text-[11px]'} font-serif leading-tight`}>Republic of the Philippines</p>
                        <p className={`${isCompactLayout ? 'text-[10px]' : isDenseLayout ? 'text-[11px]' : 'text-[12px]'} font-bold font-serif leading-tight`}>DEPARTMENT OF THE INTERIOR AND LOCAL GOVERNMENT</p>
                        <p className={`${isCompactLayout ? 'text-[10px]' : isDenseLayout ? 'text-[11px]' : 'text-[12px]'} font-bold font-serif leading-tight`}>REGION X - NORTHERN MINDANAO</p>
                        <p className={`${isCompactLayout ? 'text-[9px]' : isDenseLayout ? 'text-[10px]' : 'text-[11px]'} font-serif leading-tight`}>Km 3 Fr. W.F. Masterson Avenue, Upper Carmen, Cagayan de Oro City</p>
                        <p className={`${isCompactLayout ? 'text-[9px]' : isDenseLayout ? 'text-[10px]' : 'text-[11px]'} font-serif text-blue-600 underline leading-tight`}>www.region10.dilg.gov.ph</p>
                      </div>

                      {/* Title */}
                      <h2 className={`${isCompactLayout ? 'text-[15px] mb-2 tracking-[0.28em]' : isDenseLayout ? 'text-base mb-3 tracking-[0.32em]' : 'text-lg mb-4 tracking-[0.4em]'} font-bold text-center font-serif`}>
                        CERTIFICATE OF APPEARANCE
                      </h2>

                      {/* Body */}
                      <div className={`${isCompactLayout ? 'text-[11px] leading-snug mb-2 px-2' : isDenseLayout ? 'text-[12px] leading-snug mb-3 px-3' : 'text-[13px] leading-relaxed mb-4 px-4'} text-justify font-serif`}>
                        <span className="ml-8">This is to certify that Mr./Ms.</span>
                        <span className="inline-block border-b border-black font-bold px-2 mx-1 min-w-[200px] text-center">
                          {participantRecord.participant.full_name}
                        </span>
                        <span>with official station at</span>
                        <span className="inline-block border-b border-black font-bold px-2 mx-1 min-w-[150px] text-center">
                          {participantRecord.participant.office || '______________________'}
                        </span>
                        <span>attended the</span>
                        <span className="font-bold mx-1">{event.event_name}</span>
                        <span>held on {dateString}, at {event.venue}.</span>
                      </div>

                      <div className={`${isCompactLayout ? 'text-[11px] leading-snug mb-2 px-2' : isDenseLayout ? 'text-[12px] leading-snug mb-3 px-3' : 'text-[13px] leading-relaxed mb-4 px-4'} text-justify font-serif`}>
                        <span className="ml-8">It is further certified that during the stay of the above-mentioned individual, this office provided the following:</span>
                      </div>

                      {/* Table */}
                      <div className={`flex justify-center ${isCompactLayout ? 'mb-2' : isDenseLayout ? 'mb-3' : 'mb-4'}`}>
                        <table className={`${isCompactLayout ? 'w-[88%] text-[10px]' : isDenseLayout ? 'w-[86%] text-[11px]' : 'w-4/5 text-[12px]'} border-collapse border border-black font-serif leading-tight table-fixed`}>
                          <thead>
                            <tr>
                              <th className={`${isCompactLayout ? 'w-[32%]' : 'w-[30%]'} border border-black px-2 py-1 text-center font-bold`}>Date</th>
                              <th className="border border-black px-2 py-1 text-center font-bold">Food Inclusion</th>
                              {participantRecord.needs_accommodation && (
                                <th className={`${isCompactLayout ? 'w-[18%]' : 'w-[20%]'} border border-black px-2 py-1 text-center font-bold`}>Accommodation</th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {participantDateRows.map((dateRow) => {
                              const eventAccommodationDates = new Set(getEventAccommodationDates(event));
                              const participantAccommodationDates = participantRecord.date_accommodation.filter((date) => eventAccommodationDates.has(date));
                              const hasAccommodationOnDate = participantRecord.needs_accommodation &&
                                participantAccommodationDates.includes(dateRow.key);
                              const mealsForDate = eventFoodInclusionMap[dateRow.key] || [];

                              return (
                                <tr key={`${participantRecord.participant.participant_id}-${dateRow.key}`}>
                                  <td className={`${isCompactLayout ? 'py-0.5' : 'py-1'} border border-black px-2 text-center align-top`}>
                                    {dateRow.label}
                                  </td>
                                  <td className={`${isCompactLayout ? 'py-0.5' : 'py-1'} border border-black px-2 text-left align-top`}>
                                    {formatFoodInclusion(mealsForDate)}
                                  </td>
                                  {participantRecord.needs_accommodation && (
                                    <td className={`${isCompactLayout ? 'py-0.5' : 'py-1'} border border-black px-2 text-center align-top`}>
                                      {hasAccommodationOnDate ? 'Provided' : '-'}
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Signatory */}
                      <div className={`mt-auto text-center font-serif flex flex-col items-center ${isCompactLayout ? 'pt-2' : isDenseLayout ? 'pt-3' : 'pt-4'}`}>
                        <div className="relative inline-block">
                          {signatory?.esig_link && (
                            <img 
                              src={signatory.esig_link} 
                              alt="E-Signature" 
                              className={`absolute left-1/2 -translate-x-1/2 ${isCompactLayout ? 'bottom-3 h-12' : isDenseLayout ? 'bottom-3 h-14' : 'bottom-4 h-16'} object-contain z-0 pointer-events-none`}
                              referrerPolicy="no-referrer"
                            />
                          )}
                          <p className={`${isCompactLayout ? 'text-[12px]' : 'text-[14px]'} font-bold uppercase relative z-10`}>{signatory?.name || 'CORAZON S. VICENTE'}</p>
                          <p className={`${isCompactLayout ? 'text-[11px]' : isDenseLayout ? 'text-[12px]' : 'text-[13px]'} relative z-10`}>{signatory?.position || 'Division Chief, LGMED'}</p>
                        </div>
                      </div>

                      {/* Footer */}
                      <div className={`${isCompactLayout ? 'mt-3 text-[8px]' : isDenseLayout ? 'mt-4 text-[9px]' : 'mt-6 text-[10px]'} text-center font-serif text-slate-800 leading-tight`}>
                        <p className="italic font-bold">"Matino, Mahusay at Maasahan"</p>
                        <p>T: (088) 859-4181 E: records.dilg10@gmail.com FB: www.facebook.com/DILGX</p>
                      </div>

                    </div>

                    {/* Divider line between the two certificates on the page */}
                    {index === 0 && (
                      <div className="absolute bottom-0 left-8 right-8 border-b border-dashed border-slate-300 print:border-slate-400"></div>
                    )}
                  </div>
                )})}
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
