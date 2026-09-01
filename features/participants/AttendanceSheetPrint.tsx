import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Event, Participant, GiveawayItem } from '../../types/database';
import { ArrowLeft, Printer, Loader2, Settings } from 'lucide-react';
import { format, parseISO, eachDayOfInterval, isBefore } from 'date-fns';
import { fetchAllSupabaseRows } from '../../lib/supabasePagination';
import { PRESENT_ATTENDANCE_STATUSES } from '../../lib/attendance';

interface ColumnSettings {
  name: boolean;
  position: boolean;
  office: boolean;
  gender: boolean;
  consent1: boolean;
  consent2: boolean;
  ageGroup: boolean;
  accommodation: boolean;
  giveaways: boolean;
  am: boolean;
  pm: boolean;
}

interface AttendanceRow {
    participant: Participant;
    giveaway_selections?: Record<string, string | boolean> | null;
    needs_accommodation?: boolean | null;
    date_accommodation?: string[] | null;
    amLog?: { time: string, status: string };
    pmLog?: { time: string, status: string };
}

type ParticipantRole = 'Secretariat' | 'Speaker' | 'Guest' | 'VIP' | 'Delegate';

const PARTICIPANT_ROLES: ParticipantRole[] = ['Secretariat', 'Speaker', 'Guest', 'VIP', 'Delegate'];

const ROWS_PER_PAGE = 22;
const COMPACT_ROW_HEIGHT_PX = 27;

const chunkArray = <T,>(arr: T[], size: number): T[][] => {
    return Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
        arr.slice(i * size, i * size + size)
    );
};

const renderCellText = (text: string | null | undefined, threshold1: number, threshold2: number) => {
    if (!text) return '';
    if (text.length > threshold2) {
        return <div className="text-[7.5px] leading-[1.05] line-clamp-2">{text}</div>;
    }
    if (text.length > threshold1) {
        return <div className="text-[9px] leading-[1.1] line-clamp-2">{text}</div>;
    }
    return <div className="text-[10px] leading-tight line-clamp-1">{text}</div>;
};

const getAttendanceGiveaways = (event: Event | null): GiveawayItem[] =>
    (event?.giveaways || []).filter((item) => item.include_in_attendance);

const getEventAccommodationDates = (event: Event, eventDates: Date[]): Set<string> => {
    if (!event.has_accommodation) return new Set<string>();
    const savedDates = (event.dates_with_accom || []).filter(Boolean);
    if (savedDates.length > 0) return new Set(savedDates);
    return new Set(eventDates.map((date) => format(date, 'yyyy-MM-dd')));
};

// Rows saved before per-date accommodation was captured carry no dates; treat
// those as booked for every accommodation date of the event.
const hasAccommodationOnDate = (
    row: Pick<AttendanceRow, 'needs_accommodation' | 'date_accommodation'>,
    dateStr: string,
    eventAccommodationDates: Set<string>,
) => {
    if (!row.needs_accommodation || !eventAccommodationDates.has(dateStr)) return false;
    const dates = (row.date_accommodation || []).filter(Boolean);
    return dates.length === 0 || dates.includes(dateStr);
};

const formatGiveawayAttendanceValue = (
    item: GiveawayItem,
    selections: Record<string, string | boolean> | null | undefined,
) => {
    const value = selections?.[item.key];
    if (item.type === 'boolean') return value ? 'Yes' : 'No';
    return typeof value === 'string' && value.trim() ? 'Yes' : 'No';
};

const breakEventName = (name: string): string[] => {
    if (name.length <= 110) return [name];

    let breakPoint = -1;
    for (let i = 100; i >= 88; i--) {
        if (name[i] === ' ') {
            breakPoint = i;
            break;
        }
    }

    if (breakPoint === -1) breakPoint = 100;

    return [name.substring(0, breakPoint).trim(), name.substring(breakPoint).trim()];
};

const AttendanceSheetPrint: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<Event | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [allLogs, setAllLogs] = useState<any[]>([]);
  const [eventDates, setEventDates] = useState<Date[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [columnSettings, setColumnSettings] = useState<ColumnSettings>({
    name: true,
    position: true,
    office: true,
    gender: true,
    consent1: true,
    consent2: true,
    ageGroup: false,
    accommodation: false,
    giveaways: false,
    am: true,
    pm: true,
  });
  const [roleFilter, setRoleFilter] = useState<ParticipantRole[]>([...PARTICIPANT_ROLES]);

  useEffect(() => {
    if (eventId) {
        sessionStorage.setItem('reports_selected_event_id', eventId);
        fetchData(parseInt(eventId));
    }
  }, [eventId]);

  const fetchData = async (id: number) => {
    try {
        const { data: eventData } = await supabase
            .from('events')
            .select('*')
            .eq('event_id', id)
            .is('deleted_at', null)
            .single();
        if (!eventData) throw new Error("Event not found");
        setEvent(eventData);

        const start = parseISO(eventData.start_date);
        const end = eventData.end_date ? parseISO(eventData.end_date) : start;
        
        let dates: Date[] = [];
        if (isBefore(end, start)) {
             dates = [start];
        } else {
             dates = eachDayOfInterval({ start, end });
        }
        setEventDates(dates);

        const logs = await fetchAllSupabaseRows<any>(() =>
            supabase
                .from('attendance_logs')
                .select('*')
                .eq('event_id', id)
                .in('scan_status', [...PRESENT_ATTENDANCE_STATUSES])
                .order('attendance_id', { ascending: true })
        );
        setAllLogs(logs);
        
        const eventParticipants = await fetchAllSupabaseRows<any>(() =>
            supabase
                .from('event_participants')
                .select('accept_photo_video, store_to_db, giveaway_selections, needs_accommodation, date_accommodation, role, participants(*)')
                .eq('event_id', id)
                .order('participant_id', { ascending: true })
        );
        const fetchedParticipants = eventParticipants.map((ep: any) => {
            if (!ep.participants) return null;
            return {
                ...ep.participants,
                accept_photo_video: ep.accept_photo_video,
                store_to_db: ep.store_to_db,
                giveaway_selections: ep.giveaway_selections,
                needs_accommodation: ep.needs_accommodation,
                date_accommodation: ep.date_accommodation,
                role: ep.role
            };
        }).filter((p: any) => p !== null);
        setParticipants(fetchedParticipants);

    } catch (e) {
        console.error("Error fetching data", e);
    } finally {
        setLoading(false);
    }
  };

  const getRowsForDate = (date: Date) => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const daysLogs = allLogs.filter(l => l.attendance_date === dateStr);
      const presentIds = new Set(daysLogs.map(l => l.participant_id));

      const rows = participants
          .filter(p => presentIds.has(p.participant_id))
          .filter(p => roleFilter.includes(((p as any).role || 'Delegate') as ParticipantRole))
          .map(p => {
              const pLogs = daysLogs.filter(l => l.participant_id === p.participant_id);
              const amLogs = pLogs.filter(l => l.action_session === 'AM').sort((a,b) => a.scan_time.localeCompare(b.scan_time));
              const pmLogs = pLogs.filter(l => l.action_session === 'PM').sort((a,b) => b.scan_time.localeCompare(a.scan_time));

              return {
                  participant: p,
                  giveaway_selections: (p as any).giveaway_selections,
                  needs_accommodation: (p as any).needs_accommodation,
                  date_accommodation: (p as any).date_accommodation,
                  amLog: amLogs.length > 0 ? { time: amLogs[0].scan_time, status: amLogs[0].scan_status } : undefined,
                  pmLog: pmLogs.length > 0 ? { time: pmLogs[pmLogs.length - 1].scan_time, status: pmLogs[pmLogs.length - 1].scan_status } : undefined,
              };
          });

      // Sorting logic: AM present first, then sort by AM time ASC
      return rows.sort((a, b) => {
          const hasAM_a = !!a.amLog;
          const hasAM_b = !!b.amLog;

          if (hasAM_a && !hasAM_b) return -1;
          if (!hasAM_a && hasAM_b) return 1;

          if (hasAM_a && hasAM_b) {
              return a.amLog!.time.localeCompare(b.amLog!.time);
          }

          return a.participant.full_name.localeCompare(b.participant.full_name);
      });
  };

  const formatLogTime = (timeStr: string) => {
      const d = new Date(timeStr.endsWith('Z') || timeStr.includes('+') ? timeStr : timeStr + 'Z');
      return format(d, 'h:mm a');
  };

  if (loading) return <div className="flex justify-center items-center h-screen"><Loader2 className="animate-spin text-blue-600" /></div>;
  if (!event) return <div>Event not found</div>;

  const visibleSessions: Array<'AM' | 'PM'> = columnSettings.am && columnSettings.pm
      ? (event.session === 'All_Day' ? ['AM', 'PM'] : [event.session])
      : (columnSettings.am ? ['AM'] : columnSettings.pm ? ['PM'] : []);
  const attendanceGiveaways = columnSettings.giveaways ? getAttendanceGiveaways(event) : [];
  const showAccommodation = !!event.has_accommodation && columnSettings.accommodation;
  const eventAccommodationDates = getEventAccommodationDates(event, eventDates);

  const optionalColumnsCount = (columnSettings.ageGroup ? 1 : 0) + (showAccommodation ? 1 : 0) + (columnSettings.giveaways ? 1 : 0) + attendanceGiveaways.length;

  const getNameWidth = () => {
    if (optionalColumnsCount === 0) return 'w-44';
    if (optionalColumnsCount === 1) return 'w-40';
    if (optionalColumnsCount === 2) return 'w-36';
    return 'w-32';
  };

  const getSessionWidth = () => {
    if (optionalColumnsCount === 0) return 'w-20';
    if (optionalColumnsCount === 1) return 'w-18';
    if (optionalColumnsCount === 2) return 'w-16';
    return 'w-14';
  };

  let totalColumnCount = 1; // No. column
  if (columnSettings.name) totalColumnCount++;
  if (columnSettings.position) totalColumnCount++;
  if (columnSettings.office) totalColumnCount++;
  if (columnSettings.gender) totalColumnCount += 2; // M/F
  if (columnSettings.ageGroup) totalColumnCount++;
  if (columnSettings.consent1) totalColumnCount++;
  if (columnSettings.consent2) totalColumnCount++;
  if (showAccommodation) totalColumnCount++;
  totalColumnCount += attendanceGiveaways.length;
  totalColumnCount += visibleSessions.length;

  return (
    <div className="min-h-screen bg-[#F5F3EE] p-8 font-serif print:p-0 print:bg-white">
        <div className="max-w-[297mm] mx-auto mb-8 flex justify-between no-print">
            <button onClick={() => navigate('/reports')} className="flex items-center gap-2 text-[#6B6860] hover:text-[#111110] font-medium">
                <ArrowLeft size={20} /> Back to Portal
            </button>
            <div className="flex items-center gap-4">
                <button onClick={() => setShowSettings(!showSettings)} className="bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-md hover:bg-gray-700">
                    <Settings size={20} /> Columns & Filters
                </button>
                <button onClick={() => window.print()} className="bg-blue-600 text-white px-6 py-2 rounded-lg flex items-center gap-2 shadow-md hover:bg-blue-700 font-bold">
                    <Printer size={20} /> Print Sheets
                </button>
            </div>
        </div>

        {showSettings && (
            <div className="max-w-[297mm] mx-auto mb-6 p-4 bg-white rounded-lg shadow-md border border-gray-300 no-print">
                <h3 className="font-bold text-sm mb-3 text-[#111110]">Column Settings</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={columnSettings.name} onChange={(e) => setColumnSettings({...columnSettings, name: e.target.checked})} className="w-4 h-4" />
                        <span className="text-sm">Name</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={columnSettings.position} onChange={(e) => setColumnSettings({...columnSettings, position: e.target.checked})} className="w-4 h-4" />
                        <span className="text-sm">Position</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={columnSettings.office} onChange={(e) => setColumnSettings({...columnSettings, office: e.target.checked})} className="w-4 h-4" />
                        <span className="text-sm">Office</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={columnSettings.gender} onChange={(e) => setColumnSettings({...columnSettings, gender: e.target.checked})} className="w-4 h-4" />
                        <span className="text-sm">Gender</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={columnSettings.ageGroup} onChange={(e) => setColumnSettings({...columnSettings, ageGroup: e.target.checked})} className="w-4 h-4" />
                        <span className="text-sm">Age Group</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={columnSettings.consent1} onChange={(e) => setColumnSettings({...columnSettings, consent1: e.target.checked})} className="w-4 h-4" />
                        <span className="text-sm">Consent 1</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={columnSettings.consent2} onChange={(e) => setColumnSettings({...columnSettings, consent2: e.target.checked})} className="w-4 h-4" />
                        <span className="text-sm">Consent 2</span>
                    </label>
                    {event.has_accommodation && (
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={columnSettings.accommodation} onChange={(e) => setColumnSettings({...columnSettings, accommodation: e.target.checked})} className="w-4 h-4" />
                            <span className="text-sm">Accommodation</span>
                        </label>
                    )}
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={columnSettings.giveaways} onChange={(e) => setColumnSettings({...columnSettings, giveaways: e.target.checked})} className="w-4 h-4" />
                        <span className="text-sm">Giveaways</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={columnSettings.am} onChange={(e) => setColumnSettings({...columnSettings, am: e.target.checked})} className="w-4 h-4" />
                        <span className="text-sm">AM Session</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={columnSettings.pm} onChange={(e) => setColumnSettings({...columnSettings, pm: e.target.checked})} className="w-4 h-4" />
                        <span className="text-sm">PM Session</span>
                    </label>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-sm text-[#111110]">Participant Type</h3>
                        <div className="flex items-center gap-2 text-xs">
                            <button onClick={() => setRoleFilter([...PARTICIPANT_ROLES])} className="text-blue-600 hover:underline">Select All</button>
                            <span className="text-gray-300">|</span>
                            <button onClick={() => setRoleFilter([])} className="text-blue-600 hover:underline">Clear</button>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {PARTICIPANT_ROLES.map((role) => (
                            <label key={role} className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={roleFilter.includes(role)}
                                    onChange={(e) => setRoleFilter(e.target.checked
                                        ? [...roleFilter, role]
                                        : roleFilter.filter(r => r !== role))}
                                    className="w-4 h-4"
                                />
                                <span className="text-sm">{role}</span>
                            </label>
                        ))}
                    </div>
                    {roleFilter.length === 0 && (
                        <p className="text-xs text-red-600 mt-2">No participant type selected — the sheet will be empty.</p>
                    )}
                </div>
            </div>
        )}

        {eventDates.map((date) => {
            const allRows = getRowsForDate(date);
            const rowChunks: AttendanceRow[][] = allRows.length > 0 ? chunkArray(allRows, ROWS_PER_PAGE) : [[]];

            return rowChunks.map((rows, chunkIndex) => (
                <div key={`${date.toISOString()}-${chunkIndex}`} className="w-[297mm] h-[210mm] mx-auto bg-white shadow-xl mb-10 print:mb-0 print:shadow-none print:w-[297mm] print:h-[210mm] print:max-w-none page-break-after relative overflow-hidden flex flex-col">
                    <div className="flex items-center pt-3 px-6 mb-0.5">
                        <div className="w-12 h-12 mr-3 flex-shrink-0 flex items-center justify-center">
                            <img src="/assets/dilg_logo.png" alt="DILG Logo" className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).src = 'https://upload.wikimedia.org/wikipedia/commons/6/6f/DILG_Seal.svg'; }} />
                        </div>
                        <div className="flex flex-col justify-center">
                            <h1 className="text-xs font-bold font-sans text-[#111110] leading-tight">DILG Region 10 - Northern Mindanao</h1>
                            <h2 className="text-lg font-black text-black tracking-wide uppercase font-sans leading-tight">ATTENDANCE SHEET</h2>
                        </div>
                    </div>
                    <div className="flex flex-col items-center justify-center text-center w-full mb-1">
                        <div className="text-[11px] leading-tight font-bold font-serif mb-0 uppercase tracking-wide max-w-[260mm]">
                            {breakEventName(event.event_name).map((line, idx) => (
                                <div key={idx}>{line}</div>
                            ))}
                        </div>
                        <div className="text-[9px] leading-tight font-sans text-[#4A4843] mt-0.5">{event.venue}</div>
                        <div className="text-[9px] leading-tight font-sans text-[#111110] mt-0.5">{format(date, 'MMMM d, yyyy')}</div>
                        {roleFilter.length !== PARTICIPANT_ROLES.length && (
                            <div className="text-[8px] leading-tight font-sans text-[#4A4843] mt-0.5 italic">
                                {roleFilter.length === 0
                                    ? 'No participant type selected'
                                    : `Participant Type: ${PARTICIPANT_ROLES.filter(r => roleFilter.includes(r)).join(', ')}`}
                            </div>
                        )}
                    </div>
                    <div className="px-6 pb-1 flex-1 min-h-0 overflow-hidden">
                        <table className="w-full text-[10px] table-fixed">
                            <thead>
                                <tr className="bg-gray-200 text-center font-bold uppercase font-sans print:bg-gray-200 print:print-color-adjust-exact">
                                    <th rowSpan={2} className="border border-black px-1 py-0.5 w-8">No.</th>
                                    {columnSettings.name && <th rowSpan={2} className="border border-black px-2 py-1 text-left w-44">NAME</th>}
                                    {columnSettings.position && <th rowSpan={2} className="border border-black px-2 py-1 w-28">POSITION</th>}
                                    {columnSettings.office && <th rowSpan={2} className="border border-black px-2 py-1 w-28">OFFICE</th>}
                                    {columnSettings.gender && <th colSpan={2} className="border border-black px-1 py-0.5 w-14">GENDER</th>}
                                    {columnSettings.ageGroup && <th rowSpan={2} className="border border-black px-1 py-0.5 w-20">AGE GROUP</th>}
                                    {columnSettings.consent1 && <th rowSpan={2} className="border border-black px-1 py-0.5 w-20 text-[6.5px] leading-[1.05] normal-case font-normal align-top">I consent to the capture of my photo, video, and audio for use in DILG publications.</th>}
                                    {columnSettings.consent2 && <th rowSpan={2} className="border border-black px-1 py-0.5 w-20 text-[6.5px] leading-[1.05] normal-case font-normal align-top">I consent to the storage of my data in the organizer’s database for future document processing.</th>}
                                    {showAccommodation && <th rowSpan={2} className="border border-black px-1 py-0.5 w-16 text-[8px] leading-[1.05]">ACCOMMODATION</th>}
                                    {columnSettings.giveaways && attendanceGiveaways.map((item) => (
                                        <th key={item.key} rowSpan={2} className="border border-black px-1 py-0.5 w-20 text-[8px] leading-[1.05]">
                                            {item.label}
                                        </th>
                                    ))}
                                    {visibleSessions.map((session) => (
                                        <th key={session} rowSpan={2} className="border border-black px-2 py-1 w-20">
                                            {session}
                                        </th>
                                    ))}
                                </tr>
                                {columnSettings.gender && (
                                    <tr className="bg-gray-200 text-center font-bold uppercase font-sans print:bg-gray-200 print:print-color-adjust-exact">
                                        <th className="border border-black px-1 py-0.5 w-7">M</th>
                                        <th className="border border-black px-1 py-0.5 w-7">F</th>
                                    </tr>
                                )}
                            </thead>
                            <tbody className="font-sans text-[10px]">
                                {rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={totalColumnCount} className="text-center py-12 text-[#7C7A72] italic">No attendance recorded for this date.</td>
                                    </tr>
                                ) : (
                                    rows.map((row, index) => {
                                        const globalIndex = chunkIndex * ROWS_PER_PAGE + index + 1;
                                        return (
                                            <tr key={row.participant.participant_id} className="text-center hover:bg-[#F5F3EE] print:hover:bg-transparent overflow-hidden" style={{ height: COMPACT_ROW_HEIGHT_PX }}>
                                                <td className="px-1 py-px border border-black">{globalIndex}</td>
                                                {columnSettings.name && <td className="px-2 py-0.5 text-left capitalize border border-black">
                                                    {renderCellText(row.participant.full_name, 25, 40)}
                                                </td>}
                                                {columnSettings.position && <td className="px-1 py-px border border-black">
                                                    {renderCellText(row.participant.position, 20, 35)}
                                                </td>}
                                                {columnSettings.office && <td className="px-1 py-px border border-black">
                                                    {renderCellText(row.participant.office, 20, 35)}
                                                </td>}
                                                {columnSettings.gender && (
                                                    <>
                                                        <td className="px-1 py-0.5 font-bold border border-black">{(row.participant.gender === 'Male' || row.participant.gender === 'M') && '✓'}</td>
                                                        <td className="px-1 py-0.5 font-bold border border-black">{(row.participant.gender === 'Female' || row.participant.gender === 'F') && '✓'}</td>
                                                    </>
                                                )}
                                                {columnSettings.ageGroup && <td className="px-1 py-0.5 border border-black">
                                                    {renderCellText((row.participant as any).age_group || '', 15, 25)}
                                                </td>}
                                                {columnSettings.consent1 && <td className="px-1 py-0.5 font-bold border border-black">{(row.participant as any).accept_photo_video ? '✓' : ''}</td>}
                                                {columnSettings.consent2 && <td className="px-1 py-0.5 font-bold border border-black">{(row.participant as any).store_to_db ? '✓' : ''}</td>}
                                                {showAccommodation && <td className="px-1 py-0.5 font-bold border border-black">{hasAccommodationOnDate(row, format(date, 'yyyy-MM-dd'), eventAccommodationDates) ? '✓' : ''}</td>}
                                                {columnSettings.giveaways && attendanceGiveaways.map((item) => (
                                                    <td key={item.key} className="px-1 py-0.5 border border-black">
                                                        {renderCellText(formatGiveawayAttendanceValue(item, row.giveaway_selections), 8, 14)}
                                                    </td>
                                                ))}
                                                {visibleSessions.map((session) => (
                                                    <td key={session} className="px-1 py-0.5 font-mono border border-black">
                                                        {session === 'AM'
                                                            ? (row.amLog ? formatLogTime(row.amLog.time) : '')
                                                            : (row.pmLog ? formatLogTime(row.pmLog.time) : '')}
                                                    </td>
                                                ))}
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="w-full shrink-0 px-6 pb-1 pt-0.5 flex flex-col text-[8px] text-[#6B6860] font-sans">
                        <div className="text-[#9A9890]">System Generated Report - Page {chunkIndex + 1} of {rowChunks.length}</div>
                    </div>
                </div>
            ));
        })}
    </div>
  );
};

export default AttendanceSheetPrint;
