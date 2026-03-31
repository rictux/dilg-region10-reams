import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Event } from '../../types/database';
import { ArrowLeft, Download, Loader2, Printer, Search } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { toBlob, toPng } from 'html-to-image';
import { parseFoodInclusion } from '../../lib/eventFoodInclusion';
import CertificateOfAppearanceCard, {
  buildEventDateString,
  CertificateParticipantRecord,
  CertificateSignatory,
  getEventDateRows
} from './CertificateOfAppearanceTemplate';

type CertificateParticipant = CertificateParticipantRecord;

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


const sanitizeFileName = (value: string) => {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .trim()
    .replace(/\s+/g, '_');
};

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const renderCertificateBlob = async (node: HTMLElement, pixelRatio: number) => {
  const blob = await toBlob(node, {
    cacheBust: true,
    backgroundColor: '#ffffff',
    pixelRatio
  });

  if (blob) return blob;

  const dataUrl = await toPng(node, {
    cacheBust: true,
    backgroundColor: '#ffffff',
    pixelRatio
  });

  const response = await fetch(dataUrl);
  return response.blob();
};

const getBatchCertificatePixelRatio = () => {
  const devicePixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return Math.min(devicePixelRatio, 1.5);
};

const ZIP_UTF8_FLAG = 0x0800;
const ZIP_STORE_METHOD = 0;

const createCrc32Table = () => {
  const table = new Uint32Array(256);

  for (let i = 0; i < 256; i += 1) {
    let c = i;

    for (let j = 0; j < 8; j += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }

    table[i] = c >>> 0;
  }

  return table;
};

const CRC32_TABLE = createCrc32Table();

const calculateCrc32 = (data: Uint8Array) => {
  let crc = 0xffffffff;

  for (let i = 0; i < data.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
};

const getDosDateTime = (date = new Date()) => {
  const year = Math.max(date.getFullYear(), 1980);

  return {
    time:
      ((date.getHours() & 0x1f) << 11) |
      ((date.getMinutes() & 0x3f) << 5) |
      Math.floor(date.getSeconds() / 2),
    date:
      (((year - 1980) & 0x7f) << 9) |
      (((date.getMonth() + 1) & 0x0f) << 5) |
      (date.getDate() & 0x1f)
  };
};

const combineUint8Arrays = (chunks: Uint8Array[]) => {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return merged;
};

const getUniqueCertificateFiles = (files: Array<{ fileName: string; blob: Blob }>) => {
  const usedNames = new Set<string>();

  return files.map((file) => {
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

    return {
      ...file,
      fileName: nextFileName
    };
  });
};

const createZipBlob = async (files: Array<{ fileName: string; blob: Blob }>) => {
  const encoder = new TextEncoder();
  const normalizedFiles = getUniqueCertificateFiles(files);
  const zipChunks: Uint8Array[] = [];
  const centralDirectoryChunks: Uint8Array[] = [];
  const zipDateTime = getDosDateTime();
  let offset = 0;

  for (const file of normalizedFiles) {
    const fileNameBytes = encoder.encode(file.fileName);
    const fileBytes = new Uint8Array(await file.blob.arrayBuffer());
    const crc32 = calculateCrc32(fileBytes);

    const localHeader = new Uint8Array(30 + fileNameBytes.length);
    const localHeaderView = new DataView(localHeader.buffer);

    localHeaderView.setUint32(0, 0x04034b50, true);
    localHeaderView.setUint16(4, 20, true);
    localHeaderView.setUint16(6, ZIP_UTF8_FLAG, true);
    localHeaderView.setUint16(8, ZIP_STORE_METHOD, true);
    localHeaderView.setUint16(10, zipDateTime.time, true);
    localHeaderView.setUint16(12, zipDateTime.date, true);
    localHeaderView.setUint32(14, crc32, true);
    localHeaderView.setUint32(18, fileBytes.length, true);
    localHeaderView.setUint32(22, fileBytes.length, true);
    localHeaderView.setUint16(26, fileNameBytes.length, true);
    localHeaderView.setUint16(28, 0, true);
    localHeader.set(fileNameBytes, 30);

    zipChunks.push(localHeader, fileBytes);

    const centralHeader = new Uint8Array(46 + fileNameBytes.length);
    const centralHeaderView = new DataView(centralHeader.buffer);

    centralHeaderView.setUint32(0, 0x02014b50, true);
    centralHeaderView.setUint16(4, 20, true);
    centralHeaderView.setUint16(6, 20, true);
    centralHeaderView.setUint16(8, ZIP_UTF8_FLAG, true);
    centralHeaderView.setUint16(10, ZIP_STORE_METHOD, true);
    centralHeaderView.setUint16(12, zipDateTime.time, true);
    centralHeaderView.setUint16(14, zipDateTime.date, true);
    centralHeaderView.setUint32(16, crc32, true);
    centralHeaderView.setUint32(20, fileBytes.length, true);
    centralHeaderView.setUint32(24, fileBytes.length, true);
    centralHeaderView.setUint16(28, fileNameBytes.length, true);
    centralHeaderView.setUint16(30, 0, true);
    centralHeaderView.setUint16(32, 0, true);
    centralHeaderView.setUint16(34, 0, true);
    centralHeaderView.setUint16(36, 0, true);
    centralHeaderView.setUint32(38, 0, true);
    centralHeaderView.setUint32(42, offset, true);
    centralHeader.set(fileNameBytes, 46);

    centralDirectoryChunks.push(centralHeader);
    offset += localHeader.length + fileBytes.length;
  }

  const centralDirectory = combineUint8Arrays(centralDirectoryChunks);
  const endOfCentralDirectory = new Uint8Array(22);
  const endView = new DataView(endOfCentralDirectory.buffer);

  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, normalizedFiles.length, true);
  endView.setUint16(10, normalizedFiles.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...zipChunks, centralDirectory, endOfCentralDirectory], {
    type: 'application/zip'
  });
};

const getWindowWithDirectoryPicker = () =>
  window as Window & {
    showDirectoryPicker?: () => Promise<DirectoryPickerHandle>;
  };

const canPickDirectory = () => typeof getWindowWithDirectoryPicker().showDirectoryPicker === 'function';

const buildCertificateFileName = (fullName: string | null | undefined) =>
  `${sanitizeFileName(fullName || 'Certificate')}_Certificate_of_Appearance.png`;

const buildCertificateArchiveFileName = (event: Event) =>
  `${sanitizeFileName(event.event_name || 'Certificates')}_Certificates.zip`;

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

const buildParticipantListName = (participant: CertificateParticipant['participant']) => {
  const firstName = participant.f_name?.trim() || '';
  const lastName = participant.l_name?.trim() || '';
  const suffix = participant.suffix?.trim() || '';
  const middleInitial = participant.m_initial?.trim().replace(/\./g, '') || '';

  const lastNameSection = [lastName, suffix].filter(Boolean).join(' ').trim();
  const firstNameSection = [firstName, middleInitial ? `${middleInitial}.` : ''].filter(Boolean).join(' ').trim();

  if (lastNameSection && firstNameSection) {
    return `${lastNameSection}, ${firstNameSection}`;
  }

  return lastNameSection || firstNameSection || participant.full_name || 'Unnamed participant';
};

const CertificateOfAppearancePrint: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const previewRef = useRef<HTMLDivElement | null>(null);
  const batchPreviewRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const [event, setEvent] = useState<Event | null>(null);
  const [participants, setParticipants] = useState<CertificateParticipant[]>([]);
  const [signatory, setSignatory] = useState<CertificateSignatory>(null);
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

    return participants.filter((record) => {
      const fullName = (record.participant.full_name || '').toLowerCase();
      const displayName = buildParticipantListName(record.participant).toLowerCase();

      return fullName.includes(search) || displayName.includes(search);
    });
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
  const normalizedFiles = getUniqueCertificateFiles(files);

  for (const file of normalizedFiles) {
    const fileHandle = await directoryHandle.getFileHandle(file.fileName, { create: true });
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
        const batchPixelRatio = getBatchCertificatePixelRatio();

        for (const participantRecord of selectedDownloadParticipants) {
          const node = batchPreviewRefs.current[participantRecord.participant.participant_id];
          if (!node) continue;

          filesToSave.push({
            fileName: buildCertificateFileName(participantRecord.participant.full_name),
            blob: await renderCertificateBlob(node, batchPixelRatio)
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

        if (filesToSave.length > 1) {
          await triggerDownload(
            await createZipBlob(filesToSave),
            buildCertificateArchiveFileName(event)
          );
          return;
        }

        for (const file of getUniqueCertificateFiles(filesToSave)) {
          await triggerDownload(file.blob, file.fileName);
          await wait(350);
        }
      } else if (previewRef.current && selectedParticipant) {
        await triggerDownload(
          await renderCertificateBlob(previewRef.current, 2),
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
                        <p className="text-sm font-semibold">{buildParticipantListName(record.participant)}</p>
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
                    <CertificateOfAppearanceCard
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
              <CertificateOfAppearanceCard
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
            <CertificateOfAppearanceCard
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
