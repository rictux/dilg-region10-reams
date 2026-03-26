import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Event, Participant } from '../../types/database';
import { ArrowLeft, Download, Loader2, Printer, Search } from 'lucide-react';
import { eachDayOfInterval, format, parseISO } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import QRCode from 'react-qr-code';
import { toPng } from 'html-to-image';
import { parseFoodInclusion } from '../../lib/eventFoodInclusion';

type CertificateParticipant = {
  participant: Participant;
  needs_accommodation: boolean;
  date_accommodation: string[];
  log_dates: string[];
};

type Signatory = {
  name: string;
  position: string;
  esig_link: string;
} | null;

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
    return [
      {
        key: selectedEvent.start_date,
        label: selectedEvent.start_date
      }
    ];
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

const getCertificateLayoutMode = (rowCount: number) => {
  if (rowCount >= 5) return 'compact';
  if (rowCount >= 4) return 'dense';
  return 'default';
};

const formatFoodInclusion = (meals: string[]) => {
  return meals.length > 0 ? meals.join(', ') : '-';
};

const buildEventDateString = (event: Event) => {
  const startDate = parseISO(event.start_date);
  const endDate = event.end_date ? parseISO(event.end_date) : startDate;

  if (event.end_date && event.start_date !== event.end_date) {
    if (startDate.getMonth() === endDate.getMonth() && startDate.getFullYear() === endDate.getFullYear()) {
      return `${format(startDate, 'MMMM d')}-${format(endDate, 'd, yyyy')}`;
    }

    if (startDate.getFullYear() === endDate.getFullYear()) {
      return `${format(startDate, 'MMMM d')} - ${format(endDate, 'MMMM d, yyyy')}`;
    }

    return `${format(startDate, 'MMMM d, yyyy')} - ${format(endDate, 'MMMM d, yyyy')}`;
  }

  return format(startDate, 'MMMM d, yyyy');
};

const sanitizeFileName = (value: string) => {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .trim()
    .replace(/\s+/g, '_');
};

type CertificateCardProps = {
  event: Event;
  participantRecord: CertificateParticipant;
  signatory: Signatory;
  dateString: string;
  eventFoodInclusionMap: Record<string, string[]>;
  preview?: boolean;
  showDivider?: boolean;
};

const CertificateCard: React.FC<CertificateCardProps> = ({
  event,
  participantRecord,
  signatory,
  dateString,
  eventFoodInclusionMap,
  preview = false,
  showDivider = false
}) => {
  const participantDateRows = getParticipantDateRows(event, participantRecord);
  const layoutMode = getCertificateLayoutMode(participantDateRows.length);
  const isDenseLayout = layoutMode !== 'default';
  const isCompactLayout = layoutMode === 'compact';
  const eventAccommodationDates = new Set(getEventAccommodationDates(event));

  return (
    <div
      className={`flex h-[148.5mm] flex-col relative box-border overflow-hidden bg-white ${
        preview ? 'w-[210mm] max-w-full rounded-xl border border-slate-200 shadow-md' : 'w-full'
      } ${
        isCompactLayout ? 'px-6 pt-3 pb-5' : isDenseLayout ? 'px-7 pt-4 pb-6' : 'px-8 pt-5 pb-8'
      }`}
    >
      <div className={`relative flex flex-1 flex-col ${isDenseLayout ? 'justify-start' : 'justify-center'}`}>
        <div className={`absolute right-0 flex flex-col items-center text-center ${isDenseLayout ? 'bottom-1' : 'bottom-0'}`}>
          <QRCode
            value={`${window.location.origin}/lookup?participant=${participantRecord.participant.participant_id}`}
            size={isCompactLayout ? 42 : isDenseLayout ? 46 : 52}
          />
          <p className={`mt-2 font-medium text-slate-700 leading-tight ${isCompactLayout ? 'text-[8px] max-w-[78px]' : 'text-[9px] max-w-[90px]'}`}>
            Scan to verify
          </p>
        </div>

        <div className={`text-center ${isCompactLayout ? 'mb-1.5' : isDenseLayout ? 'mb-2' : 'mb-3'}`}>
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

        <h2 className={`${isCompactLayout ? 'text-[15px] mb-1.5 tracking-[0.28em]' : isDenseLayout ? 'text-base mb-2 tracking-[0.32em]' : 'text-lg mb-3 tracking-[0.4em]'} font-bold text-center font-serif`}>
          CERTIFICATE OF APPEARANCE
        </h2>

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

        <div className={`flex justify-center ${isCompactLayout ? 'mb-2' : isDenseLayout ? 'mb-3' : 'mb-4'}`}>
          <table className={`${isCompactLayout ? 'w-[88%] text-[9px]' : isDenseLayout ? 'w-[86%] text-[10px]' : 'w-4/5 text-[11px]'} border-collapse border border-black font-serif leading-tight table-fixed`}>
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
                const hasAccommodationOnDate =
                  participantRecord.needs_accommodation &&
                  participantRecord.date_accommodation
                    .filter((date) => eventAccommodationDates.has(date))
                    .includes(dateRow.key);
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

        <div className={`${isCompactLayout ? 'mt-3 text-[8px]' : isDenseLayout ? 'mt-4 text-[9px]' : 'mt-6 text-[10px]'} text-center font-serif text-slate-800 leading-tight`}>
          <p className="italic font-bold">"Matino, Mahusay at Maasahan"</p>
          <p>T: (088) 859-4181 E: records.dilg10@gmail.com FB: www.facebook.com/DILGX</p>
        </div>
      </div>

      {showDivider && (
        <div className="absolute bottom-0 left-8 right-8 border-b border-dashed border-slate-300 print:border-slate-400"></div>
      )}
    </div>
  );
};

const CertificateOfAppearancePrint: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const previewRef = useRef<HTMLDivElement | null>(null);

  const [event, setEvent] = useState<Event | null>(null);
  const [participants, setParticipants] = useState<CertificateParticipant[]>([]);
  const [signatory, setSignatory] = useState<Signatory>(null);
  const [loading, setLoading] = useState(true);
  const [participantSearch, setParticipantSearch] = useState('');
  const [selectedParticipantId, setSelectedParticipantId] = useState<number | null>(null);
  const [isSavingCertificate, setIsSavingCertificate] = useState(false);

  useEffect(() => {
    if (eventId && user) {
      fetchData(parseInt(eventId, 10));
    }
  }, [eventId, user]);

  useEffect(() => {
    if (participants.length === 0) {
      setSelectedParticipantId(null);
      return;
    }

    setSelectedParticipantId((current) => {
      if (current && participants.some((record) => record.participant.participant_id === current)) {
        return current;
      }

      return participants[0].participant.participant_id;
    });
  }, [participants]);

  const fetchData = async (id: number) => {
    try {
      const { data: eventData } = await supabase
        .from('events')
        .select('*')
        .eq('event_id', id)
        .single();

      if (!eventData) throw new Error('Event not found');
      setEvent(eventData);

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

      const { data: logs } = await supabase
        .from('attendance_logs')
        .select('participant_id, attendance_date')
        .eq('event_id', id);

      if (!logs) {
        setParticipants([]);
        return;
      }

      const uniqueParticipantIds = Array.from(new Set(logs.map((log) => log.participant_id)));
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
      console.error('Error fetching data', e);
    } finally {
      setLoading(false);
    }
  };

  const filteredParticipants = useMemo(() => {
    const search = participantSearch.trim().toLowerCase();
    if (!search) return participants;

    return participants.filter((record) =>
      (record.participant.full_name || '').toLowerCase().includes(search)
    );
  }, [participantSearch, participants]);

  useEffect(() => {
    if (filteredParticipants.length === 0) return;

    if (!filteredParticipants.some((record) => record.participant.participant_id === selectedParticipantId)) {
      setSelectedParticipantId(filteredParticipants[0].participant.participant_id);
    }
  }, [filteredParticipants, selectedParticipantId]);

  const selectedParticipant = useMemo(() => {
    if (filteredParticipants.length === 0) return null;

    return (
      filteredParticipants.find((record) => record.participant.participant_id === selectedParticipantId) ||
      filteredParticipants[0]
    );
  }, [filteredParticipants, selectedParticipantId]);

  const dateString = useMemo(() => (event ? buildEventDateString(event) : ''), [event]);

  const eventFoodInclusionMap = useMemo(() => {
    if (!event) return {};

    return parseFoodInclusion(
      event.food_inclusion || [],
      getEventDateRows(event).map((row) => row.key)
    );
  }, [event]);

  const chunkedParticipants = useMemo(() => {
    const chunks: CertificateParticipant[][] = [];
    for (let i = 0; i < participants.length; i += 2) {
      chunks.push(participants.slice(i, i + 2));
    }
    return chunks;
  }, [participants]);

  const handlePrint = () => {
    window.print();
  };

  const handleSaveCertificate = async () => {
    if (!previewRef.current || !selectedParticipant) return;

    setIsSavingCertificate(true);
    try {
      const dataUrl = await toPng(previewRef.current, {
        cacheBust: true,
        backgroundColor: '#ffffff',
        pixelRatio: 2
      });

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${sanitizeFileName(selectedParticipant.participant.full_name || 'Certificate')}_Certificate_of_Appearance.png`;
      link.click();
    } catch (error) {
      console.error('Error saving certificate', error);
      alert('Unable to save the certificate right now.');
    } finally {
      setIsSavingCertificate(false);
    }
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

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="print:hidden w-full border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/reports')}
                className="rounded-full p-2 transition-colors hover:bg-slate-100"
              >
                <ArrowLeft size={20} className="text-slate-600" />
              </button>
              <div>
                <h1 className="text-lg font-bold text-slate-800">Certificate of Appearance</h1>
                <p className="text-sm text-slate-500">
                  {event.event_name} • {participants.length} participant{participants.length === 1 ? '' : 's'} with attendance logs
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleSaveCertificate}
                disabled={!selectedParticipant || isSavingCertificate}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download size={16} />
                {isSavingCertificate ? 'Saving...' : 'Save Certificate'}
              </button>
              <button
                onClick={handlePrint}
                disabled={participants.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Printer size={16} />
                Print Certificates
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Preview mode shows one certificate at a time. Printing still arranges certificates in pairs, with two certificates on each A4 page.
          </div>
        </div>
      </div>

      <div className="print:hidden mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:px-8">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-slate-700">Search Participant</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={participantSearch}
                onChange={(e) => setParticipantSearch(e.target.value)}
                placeholder="Type participant name..."
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          <div className="mb-3 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Participants</span>
            <span>{filteredParticipants.length}</span>
          </div>

          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {filteredParticipants.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                No participant matched your search.
              </div>
            ) : (
              filteredParticipants.map((record) => {
                const isSelected = selectedParticipant?.participant.participant_id === record.participant.participant_id;

                return (
                  <button
                    key={record.participant.participant_id}
                    type="button"
                    onClick={() => setSelectedParticipantId(record.participant.participant_id)}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                      isSelected
                        ? 'border-indigo-200 bg-indigo-50 text-indigo-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:bg-slate-50'
                    }`}
                  >
                    <p className="font-semibold">{record.participant.full_name}</p>
                    <p className="mt-1 text-xs text-slate-500">{record.participant.office || 'No office indicated'}</p>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="flex min-w-0 flex-col gap-4">
          {selectedParticipant ? (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-sm font-semibold text-slate-800">{selectedParticipant.participant.full_name}</p>
                <p className="text-sm text-slate-500">{selectedParticipant.participant.office || 'No office indicated'}</p>
              </div>

              <div className="overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm sm:p-4">
                <div ref={previewRef} className="mx-auto w-fit">
                  <CertificateCard
                    event={event}
                    participantRecord={selectedParticipant}
                    signatory={signatory}
                    dateString={dateString}
                    eventFoodInclusionMap={eventFoodInclusionMap}
                    preview
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-slate-500 shadow-sm">
              Select a participant to preview the certificate.
            </div>
          )}
        </section>
      </div>

      <div className="hidden print:flex print:w-full print:flex-col print:items-center">
        {chunkedParticipants.map((pair, pageIndex) => (
          <div
            key={pageIndex}
            className="page-break-after-always relative flex h-[297mm] w-[210mm] flex-col overflow-hidden bg-white"
          >
            {pair.map((participantRecord, index) => (
              <CertificateCard
                key={participantRecord.participant.participant_id}
                event={event}
                participantRecord={participantRecord}
                signatory={signatory}
                dateString={dateString}
                eventFoodInclusionMap={eventFoodInclusionMap}
                showDivider={index === 0}
              />
            ))}
          </div>
        ))}
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
