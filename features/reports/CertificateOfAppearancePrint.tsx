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

type DirectoryFileWriter = {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
};

type DirectoryFileHandle = {
  createWritable: () => Promise<DirectoryFileWriter>;
};

type DirectoryPickerHandle = {
  getFileHandle: (
    name: string,
    options?: {
      create?: boolean;
    }
  ) => Promise<DirectoryFileHandle>;
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

type CertificateLayoutMode = 'default' | 'dense' | 'compact' | 'ultraCompact';

const getCertificateLayoutMode = (rowCount: number): CertificateLayoutMode => {
  if (rowCount >= 7) return 'ultraCompact';
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

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const dataUrlToBlob = async (dataUrl: string) => {
  const response = await fetch(dataUrl);
  return response.blob();
};

const getWindowWithDirectoryPicker = () =>
  window as Window & {
    showDirectoryPicker?: () => Promise<DirectoryPickerHandle>;
  };

const canPickDirectory = () => typeof getWindowWithDirectoryPicker().showDirectoryPicker === 'function';

const buildCertificateFileName = (fullName: string | null | undefined) =>
  `${sanitizeFileName(fullName || 'Certificate')}_Certificate_of_Appearance.png`;

const buildCertificateDateSerialSegment = (event: Event) => {
  try {
    const startDate = parseISO(event.start_date);
    const endDate = event.end_date ? parseISO(event.end_date) : startDate;

    if (event.end_date && event.start_date !== event.end_date) {
      if (startDate.getMonth() === endDate.getMonth() && startDate.getFullYear() === endDate.getFullYear()) {
        return `${format(startDate, 'yyyy-MMM-dd')}-${format(endDate, 'dd')}`;
      }

      if (startDate.getFullYear() === endDate.getFullYear()) {
        return `${format(startDate, 'yyyy-MMM-dd')}-${format(endDate, 'MMM-dd')}`;
      }

      return `${format(startDate, 'yyyy-MMM-dd')}-${format(endDate, 'yyyy-MMM-dd')}`;
    }

    return format(startDate, 'yyyy-MMM-dd');
  } catch {
    return event.start_date;
  }
};

const buildCertificateSerialNumber = (
  event: Event,
  officeCode: string | null,
  participantOrder: number
) => {
  const serialCode = event.event_serial?.trim();
  const normalizedOfficeCode = officeCode?.trim();

  if (!serialCode || !normalizedOfficeCode) return null;

  return [
    normalizedOfficeCode,
    buildCertificateDateSerialSegment(event),
    serialCode,
    String(participantOrder).padStart(2, '0')
  ].join('-');
};

type CertificateCardProps = {
  event: Event;
  participantRecord: CertificateParticipant;
  signatory: Signatory;
  dateString: string;
  eventFoodInclusionMap: Record<string, string[]>;
  certificateSerialNumber?: string | null;
  showDivider?: boolean;
};

const CertificateCard: React.FC<CertificateCardProps> = ({
  event,
  participantRecord,
  signatory,
  dateString,
  eventFoodInclusionMap,
  certificateSerialNumber,
  showDivider = false
}) => {
  const participantDateRows = getParticipantDateRows(event, participantRecord);
  const layoutMode = getCertificateLayoutMode(participantDateRows.length);
  const isDenseLayout = layoutMode !== 'default';
  const isCompactLayout = layoutMode === 'compact' || layoutMode === 'ultraCompact';
  const isUltraCompactLayout = layoutMode === 'ultraCompact';
  const eventAccommodationDates = new Set(getEventAccommodationDates(event));
  const cardPaddingClass = isUltraCompactLayout
    ? 'px-5 pt-2 pb-3'
    : isCompactLayout
      ? 'px-6 pt-2.5 pb-4'
      : isDenseLayout
        ? 'px-7 pt-3 pb-5'
        : 'px-8 pt-4 pb-6';
  const serialTextClass = isUltraCompactLayout ? 'text-[8px]' : isCompactLayout ? 'text-[9px]' : isDenseLayout ? 'text-[10px]' : 'text-[11px]';
  const qrWrapperClass = isUltraCompactLayout ? 'bottom-0.5' : isDenseLayout ? 'bottom-1' : 'bottom-0';
  const qrSize = isUltraCompactLayout ? 32 : isCompactLayout ? 38 : isDenseLayout ? 42 : 48;
  const qrCaptionClass = isUltraCompactLayout
    ? 'mt-0.5 text-[7px] max-w-[60px]'
    : isCompactLayout
      ? 'mt-1 text-[8px] max-w-[72px]'
      : isDenseLayout
        ? 'mt-1 text-[8px] max-w-[80px]'
        : 'mt-1 text-[9px] max-w-[88px]';
  const headerBlockClass = isUltraCompactLayout ? 'mb-0.5' : isCompactLayout ? 'mb-1' : isDenseLayout ? 'mb-1.5' : 'mb-2';
  const headerLogoRowClass = isUltraCompactLayout ? 'mb-0.5 gap-1.5' : isCompactLayout ? 'mb-1 gap-2' : 'mb-1 gap-3';
  const dilgLogoClass = isUltraCompactLayout ? 'w-8 h-8' : isCompactLayout ? 'w-10 h-10' : isDenseLayout ? 'w-12 h-12' : 'w-14 h-14';
  const bagongPilipinasLogoClass = isUltraCompactLayout ? 'h-8 max-w-[40px]' : isCompactLayout ? 'h-10 max-w-[48px]' : isDenseLayout ? 'h-12 max-w-[58px]' : 'h-14 max-w-[68px]';
  const headerSmallTextClass = isUltraCompactLayout ? 'text-[8px]' : isCompactLayout ? 'text-[9px]' : isDenseLayout ? 'text-[10px]' : 'text-[11px]';
  const headerMediumTextClass = isUltraCompactLayout ? 'text-[9px]' : isCompactLayout ? 'text-[10px]' : isDenseLayout ? 'text-[11px]' : 'text-[12px]';
  const titleClass = isUltraCompactLayout
    ? 'text-[13px] mb-0.5 tracking-[0.24em]'
    : isCompactLayout
      ? 'text-[14px] mb-1 tracking-[0.26em]'
      : isDenseLayout
        ? 'text-[15px] mb-1.5 tracking-[0.3em]'
        : 'text-[17px] mb-2 tracking-[0.34em]';
  const bodyTextClass = isUltraCompactLayout
    ? 'text-[10px] leading-tight mb-1 px-1'
    : isCompactLayout
      ? 'text-[10px] leading-tight mb-1.5 px-2'
      : isDenseLayout
        ? 'text-[11px] leading-snug mb-2 px-3'
        : 'text-[12px] leading-snug mb-3 px-4';
  const paragraphIndentClass = isUltraCompactLayout ? 'ml-4' : 'ml-8';
  const participantNameClass = isUltraCompactLayout
    ? 'inline-block border-b border-black font-bold px-1.5 mx-1 min-w-[160px] text-center'
    : 'inline-block border-b border-black font-bold px-2 mx-1 min-w-[200px] text-center';
  const officeClass = isUltraCompactLayout
    ? 'inline-block border-b border-black font-bold px-1.5 mx-1 min-w-[120px] text-center'
    : 'inline-block border-b border-black font-bold px-2 mx-1 min-w-[150px] text-center';
  const tableWrapperClass = isUltraCompactLayout ? 'mb-1' : isCompactLayout ? 'mb-1.5' : isDenseLayout ? 'mb-2' : 'mb-3';
  const tableClass = isUltraCompactLayout
    ? 'w-[92%] text-[8px]'
    : isCompactLayout
      ? 'w-[88%] text-[9px]'
      : isDenseLayout
        ? 'w-[86%] text-[10px]'
        : 'w-4/5 text-[11px]';
  const dateColumnWidthClass = isUltraCompactLayout ? 'w-[34%]' : isCompactLayout ? 'w-[32%]' : 'w-[30%]';
  const accommodationColumnWidthClass = isUltraCompactLayout ? 'w-[19%]' : isCompactLayout ? 'w-[18%]' : 'w-[20%]';
  const tableCellPaddingClass = isUltraCompactLayout ? 'px-1.5' : 'px-2';
  const tableHeaderPaddingClass = isUltraCompactLayout ? 'py-0.5' : 'py-1';
  const tableBodyPaddingClass = isUltraCompactLayout ? 'py-px' : isCompactLayout ? 'py-0.5' : 'py-1';
  const bottomSectionClass = isUltraCompactLayout ? 'pt-1 gap-1.5' : isCompactLayout ? 'pt-1.5 gap-2' : isDenseLayout ? 'pt-2 gap-2.5' : 'pt-3 gap-3';
  const signatoryWrapperClass = isUltraCompactLayout ? 'pt-0' : isCompactLayout ? 'pt-0.5' : isDenseLayout ? 'pt-1' : 'pt-1.5';
  const signatureImageClass = isUltraCompactLayout ? 'bottom-3.5 h-9' : isCompactLayout ? 'bottom-4 h-10' : isDenseLayout ? 'bottom-4.5 h-12' : 'bottom-5 h-14';
  const signatoryNameClass = isUltraCompactLayout ? 'text-[11px]' : isCompactLayout ? 'text-[12px]' : 'text-[14px]';
  const signatoryPositionClass = isUltraCompactLayout ? 'text-[10px]' : isCompactLayout ? 'text-[11px]' : isDenseLayout ? 'text-[12px]' : 'text-[13px]';
  const footerClass = isUltraCompactLayout ? 'text-[6px]' : isCompactLayout ? 'text-[7px]' : isDenseLayout ? 'text-[8px]' : 'text-[9px]';
  const footerImageClass = isUltraCompactLayout ? 'mb-0.5 h-3.5' : isCompactLayout ? 'mb-0.5 h-5' : isDenseLayout ? 'mb-0.5 h-6' : 'mb-1 h-7';

  return (
    <div
      className={`relative box-border flex h-[148.5mm] w-full flex-col overflow-hidden bg-white ${cardPaddingClass}`}
    >
      <div className="relative flex flex-1 flex-col justify-start">
        {certificateSerialNumber && (
          <p
            className={`absolute right-0 top-0 text-right font-medium text-slate-800 ${serialTextClass}`}
          >
            {certificateSerialNumber}
          </p>
        )}

        <div className={`absolute right-0 flex flex-col items-center text-center ${qrWrapperClass}`}>
          <QRCode
            value={`${window.location.origin}/lookup?participant=${participantRecord.participant.participant_id}`}
            size={qrSize}
          />
          <p className={`font-medium text-slate-700 leading-tight ${qrCaptionClass}`}>
            Scan to verify
          </p>
        </div>

        <div className={`text-center ${headerBlockClass}`}>
          <div className={`flex items-center justify-center ${headerLogoRowClass}`}>
            <img
              src="/assets/dilg_logo.png"
              alt="DILG Logo"
              className={`${dilgLogoClass} object-contain`}
            />
            <img
              src="/assets/bagong_pilipinas_logo.png"
              alt="Bagong Pilipinas Logo"
              className={`${bagongPilipinasLogoClass} object-contain`}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
          <p className={`${headerSmallTextClass} font-serif leading-tight`}>Republic of the Philippines</p>
          <p className={`${headerMediumTextClass} font-bold font-serif leading-tight`}>DEPARTMENT OF THE INTERIOR AND LOCAL GOVERNMENT</p>
          <p className={`${headerMediumTextClass} font-bold font-serif leading-tight`}>REGION X - NORTHERN MINDANAO</p>
          <p className={`${headerSmallTextClass} font-serif leading-tight`}>Km 3 Fr. W.F. Masterson Avenue, Upper Carmen, Cagayan de Oro City</p>
          <p className={`${headerSmallTextClass} font-serif text-blue-600 underline leading-tight`}>www.region10.dilg.gov.ph</p>
        </div>

        <h2 className={`${titleClass} font-bold text-center font-serif`}>
          CERTIFICATE OF APPEARANCE
        </h2>

        <div className={`${bodyTextClass} text-justify font-serif`}>
          <span className={paragraphIndentClass}>This is to certify that Mr./Ms.</span>
          <span className={participantNameClass}>
            {participantRecord.participant.full_name}
          </span>
          <span>with official station at</span>
          <span className={officeClass}>
            {participantRecord.participant.office || '______________________'}
          </span>
          <span>attended the</span>
          <span className="font-bold mx-1">{event.event_name}</span>
          <span>held on {dateString}, at {event.venue}.</span>
        </div>

        <div className={`${bodyTextClass} text-justify font-serif`}>
          <span className={paragraphIndentClass}>It is further certified that during the stay of the above-mentioned individual, this office provided the following:</span>
        </div>

        <div className={`flex justify-center ${tableWrapperClass}`}>
          <table className={`${tableClass} border-collapse border border-black font-serif leading-tight table-fixed`}>
            <thead>
              <tr>
                <th className={`${dateColumnWidthClass} border border-black ${tableCellPaddingClass} ${tableHeaderPaddingClass} text-center font-bold`}>Date</th>
                <th className={`border border-black ${tableCellPaddingClass} ${tableHeaderPaddingClass} text-center font-bold`}>Food Inclusion</th>
                {participantRecord.needs_accommodation && (
                  <th className={`${accommodationColumnWidthClass} border border-black ${tableCellPaddingClass} ${tableHeaderPaddingClass} text-center font-bold`}>Accommodation</th>
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
                    <td className={`${tableBodyPaddingClass} border border-black ${tableCellPaddingClass} text-center align-top`}>
                      {dateRow.label}
                    </td>
                    <td className={`${tableBodyPaddingClass} border border-black ${tableCellPaddingClass} text-center align-top`}>
                      {formatFoodInclusion(mealsForDate)}
                    </td>
                    {participantRecord.needs_accommodation && (
                      <td className={`${tableBodyPaddingClass} border border-black ${tableCellPaddingClass} text-center align-top`}>
                        {hasAccommodationOnDate ? 'Provided' : '-'}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className={`mt-auto flex flex-col items-center text-center font-serif ${bottomSectionClass}`}>
          <div className={`flex flex-col items-center ${signatoryWrapperClass}`}>
            <div className="relative inline-block">
              {signatory?.esig_link && (
                <img
                  src={signatory.esig_link}
                  alt="E-Signature"
                  className={`absolute left-1/2 -translate-x-1/2 ${signatureImageClass} object-contain z-0 pointer-events-none`}
                  referrerPolicy="no-referrer"
                />
              )}
              <p className={`${signatoryNameClass} font-bold uppercase relative z-10`}>{signatory?.name || 'CORAZON S. VICENTE'}</p>
              <p className={`${signatoryPositionClass} relative z-10`}>{signatory?.position || 'Division Chief, LGMED'}</p>
            </div>
          </div>

          <div className={`${footerClass} text-center text-slate-800 leading-tight`}>
            <img
              src="/assets/intensity.png"
              alt="Intensity tagline"
              className={`mx-auto object-contain ${footerImageClass}`}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            <p className="italic font-bold">"Matino, Mahusay at Maasahan"</p>
            <p>T: (088) 859-4181 E: records.dilg10@gmail.com FB: www.facebook.com/DILGX</p>
          </div>
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
  const batchPreviewRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const [event, setEvent] = useState<Event | null>(null);
  const [participants, setParticipants] = useState<CertificateParticipant[]>([]);
  const [signatory, setSignatory] = useState<Signatory>(null);
  const [officeCode, setOfficeCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [participantSearch, setParticipantSearch] = useState('');
  const [selectedParticipantId, setSelectedParticipantId] = useState<number | null>(null);
  const [isSavingCertificate, setIsSavingCertificate] = useState(false);
  const [selectedDownloadIds, setSelectedDownloadIds] = useState<number[]>([]);

  useEffect(() => {
    if (eventId && user) {
      fetchData(parseInt(eventId, 10));
    }
  }, [eventId, user]);

  useEffect(() => {
    if (participants.length === 0) {
      setSelectedParticipantId(null);
      setSelectedDownloadIds([]);
      return;
    }

    setSelectedParticipantId((current) => {
      if (current && participants.some((record) => record.participant.participant_id === current)) {
        return current;
      }

      return participants[0].participant.participant_id;
    });

    setSelectedDownloadIds((current) =>
      current.filter((participantId) =>
        participants.some((record) => record.participant.participant_id === participantId)
      )
    );
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
      setSignatory(null);
      setOfficeCode(null);

      if (eventData.organize_by) {
        const { data: sigData } = await supabase
          .from('tbl_signatory')
          .select('*')
          .eq('office_id', eventData.organize_by)
          .maybeSingle();

        if (sigData) {
          setSignatory(sigData);
        }

        const { data: officeData } = await supabase
          .from('offices')
          .select('code')
          .eq('office_id', eventData.organize_by)
          .maybeSingle();

        if (officeData?.code) {
          setOfficeCode(officeData.code);
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

  const selectedDownloadParticipants = useMemo(
    () =>
      participants.filter((record) =>
        selectedDownloadIds.includes(record.participant.participant_id)
      ),
    [participants, selectedDownloadIds]
  );

  const printParticipants = useMemo(() => {
    if (selectedDownloadParticipants.length > 0) return selectedDownloadParticipants;
    return selectedParticipant ? [selectedParticipant] : [];
  }, [selectedDownloadParticipants, selectedParticipant]);

  const dateString = useMemo(() => (event ? buildEventDateString(event) : ''), [event]);

  const eventFoodInclusionMap = useMemo(() => {
    if (!event) return {};

    return parseFoodInclusion(
      event.food_inclusion || [],
      getEventDateRows(event).map((row) => row.key)
    );
  }, [event]);

  const chunkedPrintParticipants = useMemo(() => {
    const chunks: CertificateParticipant[][] = [];
    for (let i = 0; i < printParticipants.length; i += 2) {
      chunks.push(printParticipants.slice(i, i + 2));
    }
    return chunks;
  }, [printParticipants]);

  const participantOrderById = useMemo(() => {
    const orderMap = new Map<number, number>();
    participants.forEach((record, index) => {
      orderMap.set(record.participant.participant_id, index + 1);
    });
    return orderMap;
  }, [participants]);

  const handlePrint = () => {
    if (printParticipants.length === 0) return;
    window.print();
  };

  const triggerDownload = async (blob: Blob, fileName: string) => {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = objectUrl;
    link.download = fileName;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();

    await wait(150);

    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  };

  const writeCertificatesToDirectory = async (
    directoryHandle: DirectoryPickerHandle,
    files: Array<{ fileName: string; blob: Blob }>
  ) => {
    const usedNames = new Set<string>();

    for (const file of files) {
      const fileNameParts = file.fileName.split('.');
      const extension = fileNameParts.length > 1 ? `.${fileNameParts.pop()}` : '';
      const baseName = fileNameParts.join('.') || 'Certificate_of_Appearance';

      let nextFileName = file.fileName;
      let duplicateCount = 1;

      while (usedNames.has(nextFileName)) {
        duplicateCount += 1;
        nextFileName = `${baseName}_${duplicateCount}${extension}`;
      }

      usedNames.add(nextFileName);

      const fileHandle = await directoryHandle.getFileHandle(nextFileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(file.blob);
      await writable.close();
    }
  };

  const handleSaveCertificate = async () => {
    if (selectedDownloadParticipants.length === 0 && (!previewRef.current || !selectedParticipant)) return;

    setIsSavingCertificate(true);
    try {
      if (selectedDownloadParticipants.length > 0) {
        const filesToSave: Array<{ fileName: string; blob: Blob }> = [];

        for (const participantRecord of selectedDownloadParticipants) {
          const node = batchPreviewRefs.current[participantRecord.participant.participant_id];
          if (!node) continue;

          const dataUrl = await toPng(node, {
            cacheBust: true,
            backgroundColor: '#ffffff',
            pixelRatio: 2
          });

          filesToSave.push({
            fileName: buildCertificateFileName(participantRecord.participant.full_name),
            blob: await dataUrlToBlob(dataUrl)
          });
        }

        if (filesToSave.length === 0) return;

        if (canPickDirectory()) {
          const directoryHandle = await getWindowWithDirectoryPicker().showDirectoryPicker?.();

          if (directoryHandle) {
            await writeCertificatesToDirectory(directoryHandle, filesToSave);
            return;
          }
        }

        for (const file of filesToSave) {
          await triggerDownload(file.blob, file.fileName);
          await wait(350);
        }
      } else if (previewRef.current && selectedParticipant) {
        const dataUrl = await toPng(previewRef.current, {
          cacheBust: true,
          backgroundColor: '#ffffff',
          pixelRatio: 2
        });

        await triggerDownload(
          await dataUrlToBlob(dataUrl),
          buildCertificateFileName(selectedParticipant.participant.full_name)
        );
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      console.error('Error saving certificate', error);
      alert('Unable to save the certificate right now.');
    } finally {
      setIsSavingCertificate(false);
    }
  };

  const toggleDownloadSelection = (participantId: number) => {
    setSelectedDownloadIds((current) =>
      current.includes(participantId)
        ? current.filter((id) => id !== participantId)
        : [...current, participantId]
    );
  };

  const handleSelectAll = () => {
    setSelectedDownloadIds((current) => {
      const next = new Set(current);
      filteredParticipants.forEach((record) => next.add(record.participant.participant_id));
      return Array.from(next);
    });
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
    <div className="flex h-screen flex-col overflow-hidden bg-slate-100 print:block print:min-h-screen print:h-auto print:overflow-visible print:bg-white">
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
                disabled={(!selectedParticipant && selectedDownloadParticipants.length === 0) || isSavingCertificate}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download size={16} />
                {isSavingCertificate ? 'Saving...' : 'Save Certificate'}
              </button>
              <button
                onClick={handlePrint}
                disabled={printParticipants.length === 0}
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

      <div className="print:hidden mx-auto grid w-full max-w-7xl flex-1 min-h-0 gap-6 overflow-hidden px-4 py-6 sm:px-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:px-8">
        <aside className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-slate-700">Search Participant</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={participantSearch}
                onChange={(e) => setParticipantSearch(e.target.value)}
                placeholder="Type participant name..."
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-14 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              {participantSearch && (
                <button
                  type="button"
                  onClick={() => setParticipantSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500 transition-colors hover:text-indigo-600"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="mb-3 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Participants</span>
            <span>{filteredParticipants.length}</span>
          </div>

          <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <div className="font-medium text-slate-500">
                {selectedDownloadParticipants.length} Selected
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  disabled={filteredParticipants.length === 0}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDownloadIds([])}
                  disabled={selectedDownloadParticipants.length === 0}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Clear All
                </button>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {filteredParticipants.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                No participant matched your search.
              </div>
            ) : (
              filteredParticipants.map((record) => {
                const isSelected = selectedParticipant?.participant.participant_id === record.participant.participant_id;
                const isMarkedForDownload = selectedDownloadIds.includes(record.participant.participant_id);

                return (
                  <div
                    key={record.participant.participant_id}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                      isSelected
                        ? 'border-indigo-200 bg-indigo-50 text-indigo-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isMarkedForDownload}
                        onChange={() => toggleDownloadSelection(record.participant.participant_id)}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => setSelectedParticipantId(record.participant.participant_id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="text-sm font-semibold">{record.participant.full_name}</p>
                        <p className="mt-1 text-[11px] text-slate-500">{record.participant.office || 'No office indicated'}</p>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        <section className="flex min-w-0 min-h-0 flex-col gap-4 overflow-hidden">
          {selectedParticipant ? (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-sm font-semibold text-slate-800">{selectedParticipant.participant.full_name}</p>
                <p className="text-sm text-slate-500">{selectedParticipant.participant.office || 'No office indicated'}</p>
              </div>

              <div className="preview-scroll-area min-h-0 flex-1 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm sm:p-4">
                <div className="mx-auto w-fit overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md">
                  <div ref={previewRef} className="w-[210mm] bg-white">
                    <CertificateCard
                      event={event}
                      participantRecord={selectedParticipant}
                      signatory={signatory}
                      dateString={dateString}
                      eventFoodInclusionMap={eventFoodInclusionMap}
                      certificateSerialNumber={buildCertificateSerialNumber(
                        event,
                        officeCode,
                        participantOrderById.get(selectedParticipant.participant.participant_id) || 1
                      )}
                    />
                  </div>
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
        {chunkedPrintParticipants.map((pair, pageIndex) => (
          <div
            key={pageIndex}
            className={`${pageIndex < chunkedPrintParticipants.length - 1 ? 'page-break-after-always ' : ''}relative flex h-[297mm] w-[210mm] flex-col overflow-hidden bg-white`}
          >
            {pair.map((participantRecord, index) => (
              <CertificateCard
                key={participantRecord.participant.participant_id}
                event={event}
                participantRecord={participantRecord}
                signatory={signatory}
                dateString={dateString}
                eventFoodInclusionMap={eventFoodInclusionMap}
                certificateSerialNumber={buildCertificateSerialNumber(
                  event,
                  officeCode,
                  participantOrderById.get(participantRecord.participant.participant_id) || 1
                )}
                showDivider={index === 0}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="pointer-events-none fixed left-[-10000px] top-0 z-[-1] print:hidden">
        {selectedDownloadParticipants.map((participantRecord) => (
          <div
            key={`download-${participantRecord.participant.participant_id}`}
            ref={(node) => {
              batchPreviewRefs.current[participantRecord.participant.participant_id] = node;
            }}
            className="mb-4 w-[210mm] bg-white"
          >
            <CertificateCard
              event={event}
              participantRecord={participantRecord}
              signatory={signatory}
              dateString={dateString}
              eventFoodInclusionMap={eventFoodInclusionMap}
              certificateSerialNumber={buildCertificateSerialNumber(
                event,
                officeCode,
                participantOrderById.get(participantRecord.participant.participant_id) || 1
              )}
            />
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

        .preview-scroll-area {
          scrollbar-width: none;
        }

        .preview-scroll-area::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default CertificateOfAppearancePrint;
