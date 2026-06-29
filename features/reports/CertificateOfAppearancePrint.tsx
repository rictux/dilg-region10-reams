import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Event } from '../../types/database';
import { ArrowLeft, Download, FileSpreadsheet, Hash, Info, Loader2, Printer, Search } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { toJpeg } from 'html-to-image';
import * as XLSX from 'xlsx';
import { PRESENT_ATTENDANCE_STATUSES } from '../../lib/attendance';
import { parseFoodInclusion } from '../../lib/eventFoodInclusion';
import { fetchAllSupabaseRows } from '../../lib/supabasePagination';
import CertificateOfAppearanceCard, {
  buildEventDateString,
  CertificateParticipantRecord,
  CertificateSignatory,
  getEventDateRows
} from './CertificateOfAppearanceTemplate';

type CertificateParticipant = CertificateParticipantRecord & {
  ca_serial_no: number | null;
  role: 'Delegate' | 'Speaker' | 'Secretariat' | 'Guest' | 'VIP';
  need_ca: boolean | null;
};

type CertificateSignatoryRow = NonNullable<CertificateSignatory> & {
  id: number;
  office_id?: number | null;
  active?: boolean | null;
  sort_order?: number | null;
};

const isDelegateRole = (role: CertificateParticipant['role']) => role === 'Delegate';

const sanitizeFileName = (value: string) => {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .trim()
    .replace(/\s+/g, '_');
};

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const renderCertificateJpegBlob = async (node: HTMLElement, pixelRatio: number, quality: number) => {
  const dataUrl = await toJpeg(node, {
    cacheBust: true,
    backgroundColor: '#ffffff',
    pixelRatio,
    quality
  });

  const response = await fetch(dataUrl);
  return response.blob();
};

const BATCH_RENDER_SIZE = 10;
const CERTIFICATE_EXPORT_DPI = 300;
const CERTIFICATE_EXPORT_PIXEL_RATIO = CERTIFICATE_EXPORT_DPI / 96;
const CERTIFICATE_EXPORT_JPEG_QUALITY = 0.98;
const CERT_WIDTH_PX = (210 / 25.4) * 96;
const CERT_HEIGHT_PX = (148.5 / 25.4) * 96;
const PDF_A5_LANDSCAPE_WIDTH_PT = 595.28;
const PDF_A5_LANDSCAPE_HEIGHT_PT = 419.53;

const preloadCertificateAssets = async (extraUrls: Array<string | null | undefined>) => {
  const urls = [
    '/assets/dilg_logo.png',
    '/assets/bagong_pilipinas_logo.png',
    '/assets/intensity.png',
    ...extraUrls
  ].filter((url): url is string => !!url);

  await Promise.all(
    urls.map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = url;
        })
    )
  );
};

const waitForNextPaint = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });

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

const appendAscii = (chunks: Uint8Array[], value: string) => {
  chunks.push(new TextEncoder().encode(value));
};

const getJpegDimensions = (bytes: Uint8Array) => {
  let offset = 2;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) + bytes[offset + 3];

    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: (bytes[offset + 5] << 8) + bytes[offset + 6],
        width: (bytes[offset + 7] << 8) + bytes[offset + 8]
      };
    }

    offset += 2 + length;
  }

  return {
    width: Math.round(CERT_WIDTH_PX * CERTIFICATE_EXPORT_PIXEL_RATIO),
    height: Math.round(CERT_HEIGHT_PX * CERTIFICATE_EXPORT_PIXEL_RATIO)
  };
};

const createPdfBlobFromJpeg = async (jpegBlob: Blob) => {
  const imageBytes = new Uint8Array(await jpegBlob.arrayBuffer());
  const imageDimensions = getJpegDimensions(imageBytes);
  const pageWidth = PDF_A5_LANDSCAPE_WIDTH_PT;
  const pageHeight = PDF_A5_LANDSCAPE_HEIGHT_PT;
  const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`;
  const objects: Uint8Array[] = [
    new TextEncoder().encode('<< /Type /Catalog /Pages 2 0 R >>'),
    new TextEncoder().encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    new TextEncoder().encode(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`
    ),
    new TextEncoder().encode(`<< /Length ${content.length} >>\nstream\n${content}endstream`),
    combineUint8Arrays([
      new TextEncoder().encode(
        `<< /Type /XObject /Subtype /Image /Width ${imageDimensions.width} /Height ${imageDimensions.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`
      ),
      imageBytes,
      new TextEncoder().encode('\nendstream')
    ])
  ];

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let currentOffset = 0;

  const push = (chunk: Uint8Array) => {
    chunks.push(chunk);
    currentOffset += chunk.length;
  };

  push(new TextEncoder().encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));

  objects.forEach((object, index) => {
    offsets.push(currentOffset);
    push(new TextEncoder().encode(`${index + 1} 0 obj\n`));
    push(object);
    push(new TextEncoder().encode('\nendobj\n'));
  });

  const xrefOffset = currentOffset;
  appendAscii(chunks, `xref\n0 ${objects.length + 1}\n`);
  appendAscii(chunks, '0000000000 65535 f \n');
  offsets.forEach((offset) => {
    appendAscii(chunks, `${String(offset).padStart(10, '0')} 00000 n \n`);
  });
  appendAscii(
    chunks,
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  );

  return new Blob(chunks, { type: 'application/pdf' });
};

const buildCertificateFileName = (
  participant: {
    f_name?: string | null;
    l_name?: string | null;
    m_initial?: string | null;
    suffix?: string | null;
    full_name?: string | null;
  },
  extension: 'png' | 'jpg' | 'pdf' = 'pdf'
) => {
  const parts = [
    participant.l_name,
    participant.suffix,
    participant.f_name,
    participant.m_initial?.replace(/\./g, '')
  ]
    .map((part) => sanitizeFileName(part || ''))
    .filter(Boolean);

  const baseName = parts.length > 0
    ? parts.join('_')
    : sanitizeFileName(participant.full_name || 'Certificate');

  return `${baseName}_CA.${extension}`;
};

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
  const previewWrapperRef = useRef<HTMLDivElement | null>(null);

  const A4_WIDTH_PX = CERT_WIDTH_PX;

  const [previewScale, setPreviewScale] = useState(1);
  const [event, setEvent] = useState<Event | null>(null);
  const [participants, setParticipants] = useState<CertificateParticipant[]>([]);
  const [signatory, setSignatory] = useState<CertificateSignatory>(null);
  const [signatories, setSignatories] = useState<CertificateSignatoryRow[]>([]);
  const [selectedSignatoryId, setSelectedSignatoryId] = useState<number | ''>('');
  const [officeCode, setOfficeCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [participantSearch, setParticipantSearch] = useState('');
  const [showMissingSerialOnly, setShowMissingSerialOnly] = useState(false);
  const [showWantsCaOnly, setShowWantsCaOnly] = useState(false);
  const [selectedParticipantId, setSelectedParticipantId] = useState<number | null>(null);
  const [isSavingCertificate, setIsSavingCertificate] = useState(false);
  const [isGeneratingSerials, setIsGeneratingSerials] = useState(false);
  const [selectedDownloadIds, setSelectedDownloadIds] = useState<number[]>([]);
  const [renderingParticipantIds, setRenderingParticipantIds] = useState<number[]>([]);
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number } | null>(null);
  const [printQueue, setPrintQueue] = useState<CertificateParticipant[]>([]);
  const [printPhase, setPrintPhase] = useState<'idle' | 'generating' | 'opening'>('idle');
  const [printProgress, setPrintProgress] = useState<{ done: number; total: number } | null>(null);
  const isPreparingPrint = printPhase !== 'idle';

  useEffect(() => {
    if (eventId && user) {
      sessionStorage.setItem('reports_selected_event_id', eventId);
      fetchData(parseInt(eventId, 10));
    }
  }, [eventId, user]);

  useEffect(() => {
    const wrapper = previewWrapperRef.current;
    if (!wrapper) return;

    const update = () => {
      const width = wrapper.getBoundingClientRect().width;
      if (width <= 0) return;
      setPreviewScale(Math.min(1, width / A4_WIDTH_PX));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [A4_WIDTH_PX, selectedParticipantId, participants.length]);

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
        .is('deleted_at', null)
        .single();

      if (!eventData) throw new Error('Event not found');
      setEvent(eventData);
      setSignatory(null);
      setSignatories([]);
      setSelectedSignatoryId('');
      setOfficeCode(null);

      if (eventData.organize_by) {
        const { data: sigData, error: signatoryError } = await supabase
          .from('tbl_signatory')
          .select('*')
          .eq('office_id', eventData.organize_by)
          .eq('active', true)
          .order('is_default', { ascending: false })
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true });

        if (signatoryError) throw signatoryError;

        const officeSignatories = (sigData || []) as CertificateSignatoryRow[];
        setSignatories(officeSignatories);

        const savedSignatoryId = sessionStorage.getItem(`coa_signatory_${eventData.organize_by}`);
        const selectedSignatory =
          officeSignatories.find((item) => String(item.id) === savedSignatoryId) ||
          officeSignatories.find((item) => item.is_default) ||
          officeSignatories[0] ||
          null;

        if (selectedSignatory) {
          setSelectedSignatoryId(selectedSignatory.id);
          setSignatory(selectedSignatory);
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

      const logs = await fetchAllSupabaseRows<any>(() =>
        supabase
          .from('attendance_logs')
          .select('attendance_id, participant_id, attendance_date')
          .eq('event_id', id)
          .in('scan_status', [...PRESENT_ATTENDANCE_STATUSES])
          .order('attendance_id', { ascending: true })
      );

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

      const participantsData = await fetchAllSupabaseRows<any>(() =>
        supabase
          .from('event_participants')
          .select(`
            participant_id,
            needs_accommodation,
            date_accommodation,
            ca_serial_no,
            role,
            need_ca,
            participants (*)
          `)
          .eq('event_id', id)
          .in('participant_id', uniqueParticipantIds)
          .order('participant_id', { ascending: true })
      );

      const normalizedParticipants = participantsData
        .map((record: any) => ({
          participant: Array.isArray(record.participants) ? (record.participants[0] || null) : record.participants,
          needs_accommodation: !!record.needs_accommodation,
          date_accommodation: (record.date_accommodation || []).filter(Boolean),
          log_dates: Array.from(logDatesByParticipant.get(record.participant_id) || []).sort(),
          ca_serial_no: record.ca_serial_no ?? null,
          role: (record.role as CertificateParticipant['role']) || 'Delegate',
          need_ca: record.need_ca ?? null
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
    let workingParticipants = showMissingSerialOnly
      ? participants.filter((record: CertificateParticipant) => record.ca_serial_no == null)
      : participants;

    if (showWantsCaOnly) {
      workingParticipants = workingParticipants.filter(
        (record: CertificateParticipant) => !!record.need_ca
      );
    }

    if (!search) return workingParticipants;

    return workingParticipants.filter((record: CertificateParticipant) => {
      const fullName = (record.participant.full_name || '').toLowerCase();
      const displayName = buildParticipantListName(record.participant).toLowerCase();

      return fullName.includes(search) || displayName.includes(search);
    });
  }, [participantSearch, participants, showMissingSerialOnly, showWantsCaOnly]);

  const missingSerialCount = useMemo(
    () => participants.filter((record: CertificateParticipant) => record.ca_serial_no == null).length,
    [participants]
  );

  const wantsCaCount = useMemo(
    () => participants.filter((record: CertificateParticipant) => !!record.need_ca).length,
    [participants]
  );

  const groupedParticipants = useMemo(() => {
    const delegates: CertificateParticipant[] = [];
    const others: CertificateParticipant[] = [];

    filteredParticipants.forEach((record: CertificateParticipant) => {
      if (isDelegateRole(record.role)) {
        delegates.push(record);
      } else {
        others.push(record);
      }
    });

    return { delegates, others };
  }, [filteredParticipants]);

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

  const handleSelectSignatory = (id: number | '') => {
    setSelectedSignatoryId(id);

    const selected = signatories.find((item) => item.id === id) || null;
    setSignatory(selected);

    if (event?.organize_by && id) {
      sessionStorage.setItem(`coa_signatory_${event.organize_by}`, String(id));
    }
  };

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

  const chunkedPrintQueue = useMemo(() => {
    const chunks: CertificateParticipant[][] = [];
    for (let i = 0; i < printQueue.length; i += 2) {
      chunks.push(printQueue.slice(i, i + 2));
    }
    return chunks;
  }, [printQueue]);

  const requiresReferenceCode = useMemo(() => !!event?.event_serial?.trim(), [event]);

  const serialByParticipantId = useMemo(() => {
    const serialMap = new Map<number, number>();
    participants.forEach((record) => {
      if (record.ca_serial_no != null) {
        serialMap.set(record.participant.participant_id, record.ca_serial_no);
      }
    });
    return serialMap;
  }, [participants]);

  const resolveCertificateSerial = (participantRecord: CertificateParticipant) => {
    const storedSerial = serialByParticipantId.get(participantRecord.participant.participant_id);
    if (!event || !storedSerial) return null;
    return buildCertificateSerialNumber(event, officeCode, storedSerial);
  };

  const issuedSerialParticipants = useMemo(
    () =>
      participants
        .filter((record: CertificateParticipant) => record.ca_serial_no != null)
        .sort((a, b) => (a.ca_serial_no || 0) - (b.ca_serial_no || 0)),
    [participants]
  );

  const pendingSerialAssignments = useMemo<number[]>(() => {
    if (!requiresReferenceCode) return [];
    return selectedDownloadParticipants
      .filter((record: CertificateParticipant) => record.ca_serial_no == null)
      .map((record: CertificateParticipant) => record.participant.participant_id);
  }, [requiresReferenceCode, selectedDownloadParticipants]);

  const assignPendingSerials = async () => {
    if (!eventId || pendingSerialAssignments.length === 0) return true;

    try {
      const { error } = await supabase.rpc('assign_ca_serials', {
        p_event_id: parseInt(eventId, 10),
        p_participant_ids: pendingSerialAssignments
      });

      if (error) throw error;

      await fetchData(parseInt(eventId, 10));
      return true;
    } catch (error: any) {
      console.error('Error assigning CA reference numbers', error);
      const detail = error?.message || error?.details || error?.hint || 'Unknown error';
      alert(`Unable to assign reference numbers: ${detail}`);
      return false;
    }
  };

  const handleGenerateSerials = async () => {
    if (pendingSerialAssignments.length === 0) return;
    setIsGeneratingSerials(true);
    try {
      await assignPendingSerials();
    } finally {
      setIsGeneratingSerials(false);
    }
  };

  const buildExportParticipantName = (participant: CertificateParticipant['participant']) => {
    const lastName = participant.l_name?.trim() || '';
    const suffix = participant.suffix?.trim() || '';
    const firstName = participant.f_name?.trim() || '';
    const middleName = participant.m_initial?.trim() || '';
    const lastNameSection = [lastName, suffix].filter(Boolean).join(' ');
    const firstNameSection = [firstName, middleName].filter(Boolean).join(' ');

    if (lastNameSection && firstNameSection) return `${lastNameSection}, ${firstNameSection}`;
    return lastNameSection || firstNameSection || participant.full_name || 'Unnamed participant';
  };

  const handleExportSerials = () => {
    if (!event || issuedSerialParticipants.length === 0) return;

    const rows = issuedSerialParticipants.map((record: CertificateParticipant) => ({
      'Participant Name': buildExportParticipantName(record.participant),
      Gender: record.participant.gender || '',
      Position: record.participant.position || '',
      Office: record.participant.office || '',
      'Serial Number': resolveCertificateSerial(record) || String(record.ca_serial_no).padStart(2, '0')
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 34 },
      { wch: 12 },
      { wch: 28 },
      { wch: 36 },
      { wch: 34 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'CA Serials');
    XLSX.writeFile(workbook, `${sanitizeFileName(event.event_name || 'Event')}_CA_Serials.xlsx`);
  };

  const handlePrint = async () => {
    if (printParticipants.length === 0) return;

    if (requiresReferenceCode && pendingSerialAssignments.length > 0) {
      const assigned = await assignPendingSerials();
      if (!assigned) return;
    }

    setPrintPhase('generating');
    setPrintProgress({ done: 0, total: printParticipants.length });

    try {
      await preloadCertificateAssets([signatory?.esig_link]);

      for (let i = 0; i < printParticipants.length; i += BATCH_RENDER_SIZE) {
        const nextSlice = printParticipants.slice(
          0,
          Math.min(i + BATCH_RENDER_SIZE, printParticipants.length)
        );
        setPrintQueue(nextSlice);
        await waitForNextPaint();
        setPrintProgress({ done: nextSlice.length, total: printParticipants.length });
      }

      setPrintPhase('opening');
      setPrintProgress(null);
      await waitForNextPaint();
      await wait(50);
      window.print();
    } catch (error) {
      console.error('Error preparing print job', error);
      alert('Unable to prepare the print preview right now.');
    } finally {
      setPrintPhase('idle');
      setPrintProgress(null);
    }
  };

  useEffect(() => {
    const handleAfterPrint = () => {
      setPrintQueue([]);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

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

  const handleSaveCertificate = async () => {
    if (selectedDownloadParticipants.length === 0 && (!previewRef.current || !selectedParticipant)) return;

    setIsSavingCertificate(true);
    try {
      if (requiresReferenceCode && pendingSerialAssignments.length > 0) {
        const assigned = await assignPendingSerials();
        if (!assigned) return;
      }

      if (selectedDownloadParticipants.length > 0) {
        const filesToSave: Array<{ fileName: string; blob: Blob }> = [];

        await preloadCertificateAssets([signatory?.esig_link]);
        setSaveProgress({ done: 0, total: selectedDownloadParticipants.length });

        for (let i = 0; i < selectedDownloadParticipants.length; i += BATCH_RENDER_SIZE) {
          const batch = selectedDownloadParticipants.slice(i, i + BATCH_RENDER_SIZE);
          const batchIds = batch.map((record: CertificateParticipant) => record.participant.participant_id);

          setRenderingParticipantIds(batchIds);
          await waitForNextPaint();

          for (const participantRecord of batch) {
            const node = batchPreviewRefs.current[participantRecord.participant.participant_id];
            if (!node) continue;

            const jpegBlob = await renderCertificateJpegBlob(
              node,
              CERTIFICATE_EXPORT_PIXEL_RATIO,
              CERTIFICATE_EXPORT_JPEG_QUALITY
            );
            filesToSave.push({
              fileName: buildCertificateFileName(participantRecord.participant, 'pdf'),
              blob: await createPdfBlobFromJpeg(jpegBlob)
            });

            setSaveProgress({ done: filesToSave.length, total: selectedDownloadParticipants.length });
          }

          batchIds.forEach((id: number) => {
            delete batchPreviewRefs.current[id];
          });
        }

        setRenderingParticipantIds([]);

        if (filesToSave.length === 0) return;

        if (filesToSave.length > 1) {
          await triggerDownload(
            await createZipBlob(filesToSave),
            buildCertificateArchiveFileName(event)
          );
          return;
        }

        const [singleFile] = getUniqueCertificateFiles(filesToSave);
        await triggerDownload(singleFile.blob, singleFile.fileName);
      } else if (previewRef.current && selectedParticipant) {
        const jpegBlob = await renderCertificateJpegBlob(
          previewRef.current,
          CERTIFICATE_EXPORT_PIXEL_RATIO,
          CERTIFICATE_EXPORT_JPEG_QUALITY
        );
        await triggerDownload(
          await createPdfBlobFromJpeg(jpegBlob),
          buildCertificateFileName(selectedParticipant.participant)
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
      setRenderingParticipantIds([]);
      setSaveProgress(null);
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
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/reports')}
              className="shrink-0 rounded-full p-2 transition-colors hover:bg-slate-100"
              title="Back to Reports"
            >
              <ArrowLeft size={18} className="text-slate-600" />
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h1 className="text-base font-bold text-slate-800 whitespace-nowrap">
                  Certificate of Appearance
                </h1>
                <span className="hidden text-slate-300 sm:inline">·</span>
                <span className="truncate text-sm text-slate-600" title={event.event_name}>
                  {event.event_name}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                {participants.length} participant{participants.length === 1 ? '' : 's'} with attendance logs
              </p>
            </div>

            <div className="hidden shrink-0 items-center gap-2 md:flex">
              {signatories.length > 0 && (
                <select
                  value={selectedSignatoryId}
                  onChange={(e) => handleSelectSignatory(e.target.value ? Number(e.target.value) : '')}
                  className="max-w-[220px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  title="Select certificate signatory"
                >
                  {signatories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label || item.name}{item.is_default ? ' (Default)' : ''}
                    </option>
                  ))}
                </select>
              )}
              {requiresReferenceCode && (
                <button
                  onClick={handleGenerateSerials}
                  disabled={pendingSerialAssignments.length === 0 || isGeneratingSerials}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Hash size={14} />
                  {isGeneratingSerials ? 'Assigning...' : 'Assign Reference'}
                  {pendingSerialAssignments.length > 0 && !isGeneratingSerials && (
                    <span className="rounded-full bg-emerald-200 px-1.5 text-[10px] font-bold leading-4">
                      {pendingSerialAssignments.length}
                    </span>
                  )}
                </button>
              )}
              <button
                onClick={handleSaveCertificate}
                disabled={(!selectedParticipant && selectedDownloadParticipants.length === 0) || isSavingCertificate}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download size={14} />
                {isSavingCertificate
                  ? saveProgress
                    ? `Saving ${saveProgress.done}/${saveProgress.total}...`
                    : 'Saving...'
                  : 'Save'}
              </button>
              <button
                onClick={handlePrint}
                disabled={printParticipants.length === 0 || isPreparingPrint}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Printer size={14} />
                {printPhase === 'opening'
                  ? 'Opening print preview...'
                  : printPhase === 'generating'
                    ? printProgress
                      ? `Generating ${printProgress.done}/${printProgress.total}...`
                      : 'Generating...'
                    : 'Print'}
              </button>
              {requiresReferenceCode && issuedSerialParticipants.length > 0 && (
                <button
                  onClick={handleExportSerials}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800 transition-colors hover:bg-sky-100"
                >
                  <FileSpreadsheet size={14} />
                  Export
                </button>
              )}
            </div>
          </div>

          {/* Mobile-only button row (below md breakpoint) */}
          <div className="mt-3 flex flex-wrap items-center gap-2 md:hidden">
            {signatories.length > 0 && (
              <select
                value={selectedSignatoryId}
                onChange={(e) => handleSelectSignatory(e.target.value ? Number(e.target.value) : '')}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                title="Select certificate signatory"
              >
                {signatories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label || item.name}{item.is_default ? ' (Default)' : ''}
                  </option>
                ))}
              </select>
            )}
            {requiresReferenceCode && (
              <button
                onClick={handleGenerateSerials}
                disabled={pendingSerialAssignments.length === 0 || isGeneratingSerials}
                className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Hash size={14} />
                {isGeneratingSerials ? 'Assigning...' : 'Assign Reference'}
                {pendingSerialAssignments.length > 0 && !isGeneratingSerials && (
                  <span className="rounded-full bg-emerald-200 px-1.5 text-[10px] font-bold leading-4">
                    {pendingSerialAssignments.length}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={handleSaveCertificate}
              disabled={(!selectedParticipant && selectedDownloadParticipants.length === 0) || isSavingCertificate}
              className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download size={14} />
              {isSavingCertificate
                ? saveProgress
                  ? `Saving ${saveProgress.done}/${saveProgress.total}...`
                  : 'Saving...'
                : 'Save'}
            </button>
            <button
              onClick={handlePrint}
              disabled={printParticipants.length === 0 || isPreparingPrint}
              className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Printer size={14} />
              {printPhase === 'opening'
                ? 'Opening print preview...'
                : printPhase === 'generating'
                  ? printProgress
                    ? `Generating ${printProgress.done}/${printProgress.total}...`
                    : 'Generating...'
                  : 'Print'}
            </button>
            {requiresReferenceCode && issuedSerialParticipants.length > 0 && (
              <button
                onClick={handleExportSerials}
                className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800 transition-colors hover:bg-sky-100"
              >
                <FileSpreadsheet size={14} />
                Export
              </button>
            )}
          </div>

          {requiresReferenceCode && (
            <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <Info size={14} className="mt-0.5 shrink-0" />
              <span>
                This event uses reference coding. Tick participant(s) and click{' '}
                <span className="font-semibold">Assign Reference</span> before saving or printing.
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="print:hidden mx-auto grid w-full max-w-[1600px] flex-1 min-h-0 gap-6 overflow-hidden px-4 py-6 sm:px-6 lg:grid-cols-[520px_minmax(0,1fr)] lg:px-8">
        <aside className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={participantSearch}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setParticipantSearch(e.target.value)}
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
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex flex-wrap items-center gap-1.5">
                {requiresReferenceCode && (
                  <button
                    type="button"
                    onClick={() => setShowMissingSerialOnly((current) => !current)}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      showMissingSerialOnly
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Hash size={12} />
                    No Serial
                    <span
                      className={`rounded-full px-1.5 text-[10px] font-bold leading-4 ${
                        showMissingSerialOnly
                          ? 'bg-emerald-200 text-emerald-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {missingSerialCount}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowWantsCaOnly((current) => !current)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    showWantsCaOnly
                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Wants CA
                  <span
                    className={`rounded-full px-1.5 text-[10px] font-bold leading-4 ${
                      showWantsCaOnly
                        ? 'bg-amber-200 text-amber-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {wantsCaCount}
                  </span>
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <span className="px-1 text-[11px] font-medium text-slate-500">
                  {selectedDownloadParticipants.length} Selected
                </span>
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

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {filteredParticipants.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                No participant matched your filters.
              </div>
            ) : (
              ([
                {
                  label: 'Guests, Speakers, Secretariat & VIP',
                  records: groupedParticipants.others,
                  labelClass: 'text-violet-700',
                  countClass: 'bg-violet-100 text-violet-700',
                  barClass: 'bg-violet-500'
                },
                {
                  label: 'Delegates',
                  records: groupedParticipants.delegates,
                  labelClass: 'text-sky-700',
                  countClass: 'bg-sky-100 text-sky-700',
                  barClass: 'bg-sky-500'
                }
              ] as const).map((group) => {
                if (group.records.length === 0) return null;

                return (
                  <div key={group.label} className="space-y-2">
                    <div className={`flex items-center justify-between gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide ${group.labelClass}`}>
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={`inline-block h-3 w-1 rounded-full ${group.barClass}`} />
                        <span className="truncate">{group.label}</span>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${group.countClass}`}>
                        {group.records.length}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {group.records.map((record: CertificateParticipant) => {
                        const isSelected = selectedParticipant?.participant.participant_id === record.participant.participant_id;
                        const isMarkedForDownload = selectedDownloadIds.includes(record.participant.participant_id);

                        return (
                          <div
                            key={record.participant.participant_id}
                            className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                              isSelected
                                ? 'border-indigo-200 bg-indigo-50 text-indigo-900'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                checked={isMarkedForDownload}
                                onChange={() => toggleDownloadSelection(record.participant.participant_id)}
                                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                              />
                              <button
                                type="button"
                                onClick={() => setSelectedParticipantId(record.participant.participant_id)}
                                className="min-w-0 flex-1 text-left"
                              >
                                <div className="flex items-start justify-between gap-1.5">
                                  <p className="truncate text-xs font-semibold">{buildParticipantListName(record.participant)}</p>
                                  <div className="flex shrink-0 items-center gap-1">
                                    {record.need_ca && (
                                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700" title="Participant requested a Certificate of Appearance">
                                        Wants CA
                                      </span>
                                    )}
                                    {requiresReferenceCode && record.ca_serial_no != null && (
                                      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
                                        #{String(record.ca_serial_no).padStart(2, '0')}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <p className="mt-0.5 truncate text-[10px] text-slate-500">{record.participant.office || 'No office indicated'}</p>
                              </button>
                            </div>
                          </div>
                        );
                      })}
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
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-800">{selectedParticipant.participant.full_name}</p>
                  {selectedParticipant.need_ca && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      Wants CA
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-500">{selectedParticipant.participant.office || 'No office indicated'}</p>
              </div>

              <div className="preview-scroll-area min-h-0 flex-1 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm sm:p-4">
                <div ref={previewWrapperRef} className="mx-auto" style={{ maxWidth: A4_WIDTH_PX }}>
                  <div
                    className="mx-auto overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md"
                    style={{
                      width: A4_WIDTH_PX * previewScale,
                      height: CERT_HEIGHT_PX * previewScale
                    }}
                  >
                    <div
                      style={{
                        width: A4_WIDTH_PX,
                        transform: `scale(${previewScale})`,
                        transformOrigin: 'top left'
                      }}
                    >
                      <CertificateOfAppearanceCard
                        event={event}
                        participantRecord={selectedParticipant}
                        signatory={signatory}
                        dateString={dateString}
                        eventFoodInclusionMap={eventFoodInclusionMap}
                        certificateSerialNumber={resolveCertificateSerial(selectedParticipant)}
                      />
                    </div>
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
        {chunkedPrintQueue.map((pair: CertificateParticipant[], pageIndex: number) => (
          <div
            key={pageIndex}
            className={`${pageIndex < chunkedPrintQueue.length - 1 ? 'page-break-after-always ' : ''}relative flex h-[297mm] w-[210mm] flex-col overflow-hidden bg-white`}
          >
            {pair.map((participantRecord, index) => (
              <CertificateOfAppearanceCard
                key={participantRecord.participant.participant_id}
                event={event}
                participantRecord={participantRecord}
                signatory={signatory}
                dateString={dateString}
                eventFoodInclusionMap={eventFoodInclusionMap}
                certificateSerialNumber={resolveCertificateSerial(participantRecord)}
                showDivider={index === 0}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="pointer-events-none fixed left-[-10000px] top-0 z-[-1] print:hidden">
        {selectedParticipant && (
          <div ref={previewRef} className="mb-4 w-[210mm] bg-white">
            <CertificateOfAppearanceCard
              event={event}
              participantRecord={selectedParticipant}
              signatory={signatory}
              dateString={dateString}
              eventFoodInclusionMap={eventFoodInclusionMap}
              certificateSerialNumber={resolveCertificateSerial(selectedParticipant)}
            />
          </div>
        )}
        {participants
          .filter((record: CertificateParticipant) =>
            renderingParticipantIds.includes(record.participant.participant_id)
          )
          .map((participantRecord: CertificateParticipant) => (
            <div
              key={`download-${participantRecord.participant.participant_id}`}
              ref={(node: HTMLDivElement | null) => {
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
                certificateSerialNumber={resolveCertificateSerial(participantRecord)}
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
