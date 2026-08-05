import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Event } from '../../types/database';
import {
  ArrowLeft, Check, Download, Eye, Image as ImageIcon, Loader2,
  Mail, Printer, RotateCcw, Search, Settings, SlidersHorizontal, Trash2, Upload, X,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toJpeg, getFontEmbedCSS } from 'html-to-image';
import { PRESENT_ATTENDANCE_STATUSES } from '../../lib/attendance';
import { fetchAllSupabaseRows } from '../../lib/supabasePagination';
import { sendCertificateEmail } from '../../lib/emailService';
import { toast } from 'sonner';
import { CertificateSignatory, getEventDateRows } from './CertificateOfAppearanceTemplate';
import CertificateOfParticipationCard, {
  buildAccreditationLines,
  buildCoPReferenceNumber,
  CoPAccreditationMode,
  CoPPaperSize,
  CoPParticipantRecord,
  CoPTitle,
  DEFAULT_COP_BODY_TEXT,
  DEFAULT_PRC_ACCREDITATION_SUFFIX,
  PRC_LICENSE_LINE,
  formatAttendanceDates,
  getCoP_HeightPx,
  getCoP_WidthPx,
  numberToWords,
  PAPER_DIMS,
} from './CertificateOfParticipationTemplate';
import EmailProgressModal from './EmailProgressModal';
import {
  buildCoPTourSteps,
  GuidedTour,
  TutorialButton,
} from './CertificateOfParticipationTour';
import { useAuth } from '../../contexts/AuthContext';
import { hasSeenGuide, markGuideSeen } from '../../lib/userGuides';
import {
  clampSignatureAdjustment,
  DEFAULT_SIGNATURE_ADJUSTMENT,
  isSignatureAdjusted,
  readStoredSignatureAdjustment,
  SIGNATURE_CONTROLS,
  SignatureAdjustment,
  writeStoredSignatureAdjustment,
} from '../../lib/signatureAdjustment';
import { getTransparentSignature } from '../../lib/signatureBackground';

const CERT_TITLE_OPTIONS: CoPTitle[] = [
  'Certificate of Participation',
  'Certificate of Appreciation',
  'Certificate of Completion',
];

const CERT_BODY_TEMPLATES = [
  {
    label: 'Template 1',
    text: DEFAULT_COP_BODY_TEXT,
  },
  {
    label: 'Template 2',
    text: 'for actively participating in the Learning and Development activity entitled "{EventName}" held on {EventDate}, at {Venue}, {CreditPhrase}.\n{GivenDate}',
  },
  {
    label: 'Template 3',
    text: 'for his valuable insights and contribution during the conduct of the "{EventName}" held on {EventDate}, at {Venue}.\n{GivenDate}',
  },
];

const ACCREDITATION_OPTIONS: Array<{ value: CoPAccreditationMode; label: string }> = [
  { value: 'None', label: 'None' },
  { value: 'CPD', label: 'Option 1 — CPD Provider' },
  { value: 'PRC', label: 'Option 2 — PRC Accreditation' },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type SignatoryRow = CertificateSignatory & { id: number; office_id: number };
type ThemeFile   = { name: string; url: string };
type CoPParticipantRole = 'Delegate' | 'Speaker' | 'Secretariat' | 'Guest' | 'VIP';
type CoPRoleFilter = 'All' | 'Delegate' | 'SecretariatGuest' | 'Speaker';
type CoPAttendanceFilter = 'All' | 'Complete' | 'Incomplete';
type CoPParticipant = CoPParticipantRecord & {
  registration_status: string;
  role: CoPParticipantRole;
  cop_email_sent_at: string | null;
};

const ROLE_FILTER_OPTIONS: Array<{ value: CoPRoleFilter; label: string }> = [
  { value: 'All', label: 'All' },
  { value: 'Delegate', label: 'Delegate' },
  { value: 'SecretariatGuest', label: 'Secretariat/Guest' },
  { value: 'Speaker', label: 'Speaker' },
];

const getRoleFilterValue = (role?: string | null): CoPRoleFilter => {
  if (role === 'Delegate') return 'Delegate';
  if (role === 'Speaker') return 'Speaker';
  return 'SecretariatGuest';
};

// ─── Constants ────────────────────────────────────────────────────────────────

const BATCH_SIZE    = 8;
const EXPORT_DPI    = 300;
const PIXEL_RATIO   = EXPORT_DPI / 96;
const JPEG_QUALITY  = 0.97;
const CERT_BUCKET   = 'cert_of_appearance';
const GLOBAL_SIGNATORY_ID = 10;

// ─── Pure helpers ─────────────────────────────────────────────────────────────

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const sanitize = (v: string) =>
  v.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim().replace(/\s+/g, '_');

const waitTwoPaints = () =>
  new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

// The title ("Certificate of Participation") renders in the bundled Snell Roundhand
// face (Pinyon Script is the web fallback). html-to-image bakes whatever face is
// available at capture time, so if the script font hasn't finished loading it
// silently falls back to a wider serif — which both changes the look and, with the
// title set to nowrap, pushes it off-center. Force the faces the certificate uses
// to load first.
const ensureCertFontsReady = async () => {
  try {
    const fontSet = (document as any).fonts;
    if (!fontSet?.load) return;
    await Promise.all([
      fontSet.load("400 48px 'Snell Roundhand'"),
      fontSet.load("400 48px 'Pinyon Script'"),
      fontSet.load("700 36px 'Poppins'"),
      fontSet.load("400 15px 'Poppins'"),
      fontSet.load("italic 400 15px 'Poppins'"),
    ]);
    await fontSet.ready;
  } catch {
    /* Font Loading API unavailable — fall through and let capture proceed */
  }
};

const resolveSignatureSrc = (
  srcs: Record<number, string>,
  signatory: CertificateSignatory
) => (signatory?.id ? srcs[signatory.id] : null) || signatory?.esig_link || null;

const buildListName = (p: CoPParticipantRecord['participant']) => {
  const last  = p.l_name?.trim()    || '';
  const first = p.f_name?.trim()    || '';
  const mi    = p.m_initial?.trim().replace(/\./g, '') || '';
  const suf   = p.suffix?.trim()    || '';
  const L = [last, suf].filter(Boolean).join(' ');
  const F = [first, mi ? `${mi}.` : ''].filter(Boolean).join(' ');
  if (L && F) return `${L}, ${F}`;
  return L || F || p.full_name || 'Unnamed';
};

const buildFileName = (p: CoPParticipantRecord['participant']) => {
  const parts = [p.l_name, p.suffix, p.f_name, p.m_initial?.replace(/\./g, '')]
    .map(x => sanitize(x || '')).filter(Boolean);
  return (parts.length ? parts.join('_') : sanitize(p.full_name || 'Certificate')) + '_CoP.pdf';
};

// ─── ZIP / PDF builders (same byte-level approach as CertificateOfAppearancePrint) ──

const makeCrc32Table = () => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
};
const CRC_TABLE = makeCrc32Table();
const crc32 = (d: Uint8Array) => {
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i++) c = CRC_TABLE[(c ^ d[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const getDosDateTime = () => {
  const d = new Date();
  const y = Math.max(d.getFullYear(), 1980);
  return {
    time: ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | Math.floor(d.getSeconds() / 2),
    date: (((y - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f),
  };
};
const combine = (chunks: Uint8Array[]) => {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
};
const enc = new TextEncoder();

const createZipBlob = async (files: Array<{ fileName: string; blob: Blob }>) => {
  const used = new Set<string>();
  const normalized = files.map(f => {
    const ext  = f.fileName.includes('.') ? '.' + f.fileName.split('.').pop() : '';
    const base = f.fileName.slice(0, f.fileName.length - ext.length) || 'Certificate_of_Participation';
    let name = f.fileName; let n = 1;
    while (used.has(name)) { n++; name = `${base}_${n}${ext}`; }
    used.add(name);
    return { ...f, fileName: name };
  });
  const dt = getDosDateTime();
  const zipChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;
  for (const file of normalized) {
    const nb = enc.encode(file.fileName);
    const fb = new Uint8Array(await file.blob.arrayBuffer());
    const cs = crc32(fb);
    const lh = new Uint8Array(30 + nb.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0,0x04034b50,true); lv.setUint16(4,20,true); lv.setUint16(6,0x0800,true);
    lv.setUint16(8,0,true); lv.setUint16(10,dt.time,true); lv.setUint16(12,dt.date,true);
    lv.setUint32(14,cs,true); lv.setUint32(18,fb.length,true); lv.setUint32(22,fb.length,true);
    lv.setUint16(26,nb.length,true); lh.set(nb,30);
    zipChunks.push(lh,fb);
    const ch = new Uint8Array(46 + nb.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0,0x02014b50,true); cv.setUint16(4,20,true); cv.setUint16(6,20,true);
    cv.setUint16(8,0x0800,true); cv.setUint16(10,0,true); cv.setUint16(12,dt.time,true);
    cv.setUint16(14,dt.date,true); cv.setUint32(16,cs,true); cv.setUint32(20,fb.length,true);
    cv.setUint32(24,fb.length,true); cv.setUint16(28,nb.length,true); cv.setUint32(42,offset,true);
    ch.set(nb,46); centralChunks.push(ch);
    offset += lh.length + fb.length;
  }
  const cd = combine(centralChunks);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0,0x06054b50,true); ev.setUint16(8,normalized.length,true);
  ev.setUint16(10,normalized.length,true); ev.setUint32(12,cd.length,true);
  ev.setUint32(16,offset,true);
  return new Blob([...zipChunks,cd,eocd],{type:'application/zip'});
};

const getJpegDims = (bytes: Uint8Array, fw: number, fh: number) => {
  let off = 2;
  while (off < bytes.length) {
    if (bytes[off] !== 0xff) { off++; continue; }
    const marker = bytes[off+1];
    const len = (bytes[off+2]<<8)+bytes[off+3];
    if (marker>=0xc0&&marker<=0xc3) return { height:(bytes[off+5]<<8)+bytes[off+6], width:(bytes[off+7]<<8)+bytes[off+8] };
    off += 2+len;
  }
  return { width: fw, height: fh };
};

const createPdfBlob = async (jpegBlob: Blob, paperSize: CoPPaperSize) => {
  const { pdfWidthPt: pw, pdfHeightPt: ph } = PAPER_DIMS[paperSize];
  const imageBytes = new Uint8Array(await jpegBlob.arrayBuffer());
  const fw = Math.round(getCoP_WidthPx(paperSize) * PIXEL_RATIO);
  const fh = Math.round(getCoP_HeightPx(paperSize) * PIXEL_RATIO);
  const { width: iw, height: ih } = getJpegDims(imageBytes, fw, fh);
  const content = `q\n${pw} 0 0 ${ph} 0 0 cm\n/Im0 Do\nQ\n`;
  const objects: Uint8Array[] = [
    enc.encode('<< /Type /Catalog /Pages 2 0 R >>'),
    enc.encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    enc.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`),
    enc.encode(`<< /Length ${content.length} >>\nstream\n${content}endstream`),
    combine([
      enc.encode(`<< /Type /XObject /Subtype /Image /Width ${iw} /Height ${ih} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`),
      imageBytes,
      enc.encode('\nendstream'),
    ]),
  ];
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let cur = 0;
  const push = (c: Uint8Array) => { chunks.push(c); cur += c.length; };
  push(enc.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
  objects.forEach((obj, i) => {
    offsets.push(cur);
    push(enc.encode(`${i+1} 0 obj\n`)); push(obj); push(enc.encode('\nendobj\n'));
  });
  const xrefOff = cur;
  push(enc.encode(`xref\n0 ${objects.length+1}\n`));
  push(enc.encode('0000000000 65535 f \n'));
  offsets.forEach(o => push(enc.encode(`${String(o).padStart(10,'0')} 00000 n \n`)));
  push(enc.encode(`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xrefOff}\n%%EOF`));
  return new Blob(chunks,{type:'application/pdf'});
};

const preloadImages = async (urls: Array<string|null|undefined>) => {
  const all = ['/assets/dilg_logo.png','/assets/bagong_pilipinas_logo.png',...urls].filter((u):u is string=>!!u);
  await Promise.all(all.map(async url=>{
    try {
      const img=new Image();
      img.crossOrigin='anonymous';
      img.referrerPolicy='no-referrer';
      img.src=url;
      // decode() waits until the image is fully decoded (not just fetched), so
      // html-to-image doesn't capture before the bitmap is ready to draw.
      await img.decode();
    } catch { /* missing/undecodable image — capture proceeds without it */ }
  }));
};

// ─── Settings Modal ───────────────────────────────────────────────────────────

type SettingsModalProps = {
  onClose: () => void;
  // Theme
  themes: ThemeFile[];
  themeUrl: string | null;
  onSelectTheme: (url: string | null) => void;
  onUploadTheme: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDeleteTheme: (t: ThemeFile) => void;
  isUploadingTheme: boolean;
  themeError: string | null;
  // Title
  certTitle: CoPTitle;
  onSelectTitle: (t: CoPTitle) => void;
  // Body text
  bodyText: string;
  onChangeBodyText: (v: string) => void;
  // Credit hours
  creditHours: string;
  onChangeCreditHours: (v: string) => void;
  // PRC / CPD accreditation
  showPrcLicenseNo: boolean;
  onChangeShowPrcLicenseNo: (value: boolean) => void;
  accreditationMode: CoPAccreditationMode;
  onChangeAccreditationMode: (mode: CoPAccreditationMode) => void;
  prcAccreditationSuffix: string;
  onChangePrcAccreditationSuffix: (value: string) => void;
  // Paper size
  paperSize: CoPPaperSize;
  onSelectPaperSize: (s: CoPPaperSize) => void;
  // Signatory
  signatories: SignatoryRow[];
  primarySignatory: CertificateSignatory;
  secondarySignatory: CertificateSignatory;
  onSelectPrimarySignatory: (s: SignatoryRow) => void;
  onSelectSecondarySignatory: (s: SignatoryRow | null) => void;
  includeSignature: boolean;
  onChangeIncludeSignature: (value: boolean) => void;
  onSave: () => void;
  isSaving: boolean;
};

type SignatureTarget = { id: number; name: string; role: string };

const isPartnerAgencySignatory = (signatory: CertificateSignatory) =>
  Boolean(signatory?.agency_name?.trim() || signatory?.agency_logo_url?.trim());

const isCompletePartnerAgencySignatory = (signatory: CertificateSignatory) =>
  Boolean(signatory?.agency_name?.trim() && signatory?.agency_logo_url?.trim());

const SettingsModal: React.FC<SettingsModalProps> = ({
  onClose, themes, themeUrl, onSelectTheme, onUploadTheme, onDeleteTheme,
  isUploadingTheme, themeError,
  certTitle, onSelectTitle,
  bodyText, onChangeBodyText,
  creditHours, onChangeCreditHours,
  showPrcLicenseNo, onChangeShowPrcLicenseNo,
  accreditationMode, onChangeAccreditationMode,
  prcAccreditationSuffix, onChangePrcAccreditationSuffix,
  paperSize, onSelectPaperSize, signatories, primarySignatory, secondarySignatory,
  onSelectPrimarySignatory, onSelectSecondarySignatory,
  includeSignature, onChangeIncludeSignature,
  onSave, isSaving,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const primarySignatories = signatories.filter(sig => !isPartnerAgencySignatory(sig));
  const partnerSignatories = signatories.filter(isCompletePartnerAgencySignatory);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#EDEAE2]">
          <h2 className="text-base font-bold text-[#2A2926] flex items-center gap-2">
            <Settings size={16} className="text-violet-600" /> Certificate Settings
          </h2>
          <button onClick={onClose} className="text-[#9A9890] hover:text-[#6B6860] transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-8">

          {/* ── Title ── */}
          <section data-tour="cop-settings-title">
            <h3 className="text-sm font-semibold text-[#4A4843] mb-3 flex items-center gap-2">
              <span className="text-xs font-bold border border-current px-1 rounded-sm">T</span> Certificate Title
            </h3>
            <div className="flex flex-col gap-2 sm:flex-row">
              {CERT_TITLE_OPTIONS.map(title => (
                <button
                  key={title}
                  onClick={() => onSelectTitle(title)}
                  className={`flex-1 py-3 px-4 rounded-xl border-2 text-sm font-semibold transition-all ${
                    certTitle === title
                      ? 'border-violet-500 bg-violet-50 text-violet-700'
                      : 'border-[#E0DDD4] text-[#7C7A72] hover:border-[#C5C2BA]'
                  }`}
                >
                  {title}
                </button>
              ))}
            </div>
          </section>

          {/* ── Body text ── */}
          <section data-tour="cop-settings-body">
            <h3 className="text-sm font-semibold text-[#4A4843] mb-3 flex items-center gap-2">
              <span className="text-xs font-bold border border-current px-1 rounded-sm">¶</span> Certificate Body Text
            </h3>
            <div className="mb-3 space-y-2">
              {CERT_BODY_TEMPLATES.map(template => {
                const isSelected = bodyText.trim() === template.text;
                return (
                  <button
                    key={template.label}
                    type="button"
                    onClick={() => onChangeBodyText(template.text)}
                    className={`w-full rounded-xl border-2 px-3 py-2 text-left transition-all ${
                      isSelected
                        ? 'border-violet-500 bg-violet-50 text-violet-700'
                        : 'border-[#E0DDD4] text-[#6B6860] hover:border-[#C5C2BA] hover:bg-[#F5F3EE]'
                    }`}
                  >
                    <span className="block text-xs font-semibold mb-1">{template.label}</span>
                    <span className="block whitespace-pre-line text-[11px] leading-relaxed">{template.text}</span>
                  </button>
                );
              })}
            </div>
            <textarea
              value={bodyText}
              onChange={e => onChangeBodyText(e.target.value)}
              rows={5}
              placeholder={DEFAULT_COP_BODY_TEXT}
              className="w-full px-3 py-2.5 text-sm border-2 border-[#E0DDD4] rounded-xl focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400 resize-y leading-relaxed"
            />
            <div className="flex items-center justify-between mt-2">
              <p className="text-[11px] text-[#9A9890]">
                Body text shown before the signatory. Use <span className="font-medium text-[#7C7A72]">{'{EventName}'}</span>, <span className="font-medium text-[#7C7A72]">{'{EventDate}'}</span>, <span className="font-medium text-[#7C7A72]">{'{Venue}'}</span>, <span className="font-medium text-[#7C7A72]">{'{CreditPhrase}'}</span>, and <span className="font-medium text-[#7C7A72]">{'{GivenDate}'}</span> for generated details.
              </p>
              {bodyText.trim() !== DEFAULT_COP_BODY_TEXT && (
                <button
                  type="button"
                  onClick={() => onChangeBodyText(DEFAULT_COP_BODY_TEXT)}
                  className="shrink-0 ml-3 text-xs text-[#9A9890] hover:text-[#6B6860] hover:underline"
                >
                  Reset
                </button>
              )}
            </div>
          </section>

          {/* ── Credit hours ── */}
          <section data-tour="cop-settings-credit">
            <h3 className="text-sm font-semibold text-[#4A4843] mb-3 flex items-center gap-2">
              <span className="text-xs font-bold border border-current px-1 rounded-sm">h</span> Training Credit Hours
            </h3>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={creditHours}
                onChange={e => onChangeCreditHours(e.target.value)}
                placeholder="e.g. 4"
                className="w-28 px-3 py-2.5 text-sm border-2 border-[#E0DDD4] rounded-xl focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400"
              />
              {creditHours.trim() && (
                <button
                  type="button"
                  onClick={() => onChangeCreditHours('')}
                  className="text-xs text-[#9A9890] hover:text-[#6B6860] hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
            <p className="text-[11px] text-[#9A9890] mt-2">
              Leave blank to omit. When set, the certificate reads “…with a credit of <span className="font-medium text-[#7C7A72]">{(parseInt(creditHours, 10) > 0 ? numberToWords(parseInt(creditHours, 10)) : 'N')} ({parseInt(creditHours, 10) > 0 ? parseInt(creditHours, 10) : 'N'})</span> training hours.”
            </p>
          </section>

          {/* ── PRC / CPD accreditation ── */}
          <section data-tour="cop-settings-accreditation">
            <h3 className="text-sm font-semibold text-[#4A4843] mb-3 flex items-center gap-2">
              <span className="text-xs font-bold border border-current px-1 rounded-sm">P</span> PRC / CPD Details
            </h3>

            <label className="mb-4 flex items-center justify-between gap-4 rounded-xl border-2 border-[#E0DDD4] px-4 py-3 text-sm text-[#4A4843]">
              <span>
                <span className="block font-semibold">Show “PRC License No.” line</span>
                <span className="block text-xs text-[#9A9890]">
                  Prints <span className="font-medium text-[#7C7A72]">{PRC_LICENSE_LINE}</span> under the participant’s name.
                </span>
              </span>
              <input
                type="checkbox"
                checked={showPrcLicenseNo}
                onChange={e => onChangeShowPrcLicenseNo(e.target.checked)}
                className="h-4 w-4 shrink-0 accent-violet-600"
              />
            </label>

            <p className="mb-2 text-xs font-semibold text-[#6B6860]">Accreditation line above the signatory</p>
            <div className="space-y-2">
              {ACCREDITATION_OPTIONS.map(option => {
                const isSelected = accreditationMode === option.value;
                const preview = buildAccreditationLines(option.value, prcAccreditationSuffix);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onChangeAccreditationMode(option.value)}
                    className={`w-full rounded-xl border-2 px-3 py-2 text-left transition-all ${
                      isSelected
                        ? 'border-violet-500 bg-violet-50 text-violet-700'
                        : 'border-[#E0DDD4] text-[#6B6860] hover:border-[#C5C2BA] hover:bg-[#F5F3EE]'
                    }`}
                  >
                    <span className="block text-xs font-semibold mb-1">{option.label}</span>
                    <span className="block text-[11px] leading-relaxed">
                      {preview
                        ? <><span className="font-semibold">{preview.number}</span><br />{preview.label}</>
                        : 'No accreditation line is printed.'}
                    </span>
                  </button>
                );
              })}
            </div>

            {accreditationMode === 'PRC' && (
              <div className="mt-3">
                <label htmlFor="cop-prc-suffix" className="mb-1.5 block text-xs font-semibold text-[#6B6860]">
                  PRC accreditation series
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#7C7A72]">OCE-2023-078-</span>
                  <input
                    id="cop-prc-suffix"
                    type="text"
                    value={prcAccreditationSuffix}
                    onChange={e => onChangePrcAccreditationSuffix(e.target.value)}
                    placeholder={DEFAULT_PRC_ACCREDITATION_SUFFIX}
                    className="w-32 px-3 py-2.5 text-sm border-2 border-[#E0DDD4] rounded-xl focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400"
                  />
                  {prcAccreditationSuffix.trim() !== DEFAULT_PRC_ACCREDITATION_SUFFIX && (
                    <button
                      type="button"
                      onClick={() => onChangePrcAccreditationSuffix(DEFAULT_PRC_ACCREDITATION_SUFFIX)}
                      className="text-xs text-[#9A9890] hover:text-[#6B6860] hover:underline"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-[#9A9890] mt-2">
                  Changes the last segment of the accreditation number. Leave blank to fall back to{' '}
                  <span className="font-medium text-[#7C7A72]">{DEFAULT_PRC_ACCREDITATION_SUFFIX}</span>.
                </p>
              </div>
            )}
          </section>

          {/* ── Theme ── */}
          <section data-tour="cop-settings-theme">
            <h3 className="text-sm font-semibold text-[#4A4843] mb-3 flex items-center gap-2">
              <ImageIcon size={14} className="text-violet-500" /> Certificate Theme
            </h3>

            {themeError && <p className="text-red-500 text-xs mb-2">{themeError}</p>}

            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onUploadTheme} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingTheme}
              className="mb-3 flex items-center gap-2 border border-dashed border-[#C5C2BA] hover:border-violet-400 text-[#7C7A72] hover:text-violet-600 text-xs px-4 py-2.5 rounded-lg transition-colors w-full justify-center"
            >
              {isUploadingTheme ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {isUploadingTheme ? 'Uploading…' : 'Upload New Theme Image'}
            </button>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {themes.map(theme => (
                <div
                  key={theme.name}
                  className={`relative rounded-lg overflow-hidden border-2 cursor-pointer transition-all group ${
                    themeUrl === theme.url
                      ? 'border-violet-500 ring-2 ring-violet-200'
                      : 'border-[#E0DDD4] hover:border-[#C5C2BA]'
                  }`}
                  onClick={() => onSelectTheme(theme.url)}
                >
                  <img src={theme.url} alt={theme.name} className="w-full h-40 object-cover" />
                  {themeUrl === theme.url && (
                    <div className="absolute top-1.5 right-1.5 bg-violet-600 rounded-full p-0.5">
                      <Check size={10} className="text-white" />
                    </div>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); onDeleteTheme(theme); }}
                    className="absolute top-1.5 left-1.5 bg-red-500 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={10} />
                  </button>
                  <p className="text-[10px] px-1.5 py-1 bg-white/90 truncate text-[#6B6860]">{theme.name}</p>
                </div>
              ))}
            </div>

            {themes.length === 0 && (
              <p className="text-xs text-[#9A9890] text-center py-4">No themes uploaded yet. Upload an image to use as the certificate background.</p>
            )}
          </section>

          {/* ── Paper size ── */}
          <section data-tour="cop-settings-paper">
            <h3 className="text-sm font-semibold text-[#4A4843] mb-3 flex items-center gap-2">
              <span className="text-xs font-mono border border-current px-0.5">A</span> Paper Size
            </h3>
            <div className="flex gap-3">
              {(['A4', 'A5'] as CoPPaperSize[]).map(size => (
                <button
                  key={size}
                  onClick={() => onSelectPaperSize(size)}
                  className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                    paperSize === size
                      ? 'border-violet-500 bg-violet-50 text-violet-700'
                      : 'border-[#E0DDD4] text-[#7C7A72] hover:border-[#C5C2BA]'
                  }`}
                >
                  {size}
                  <span className="block text-xs font-normal mt-0.5 opacity-70">Landscape</span>
                  <span className="block text-[10px] font-normal opacity-50">
                    {size === 'A4' ? '297 × 210 mm' : '210 × 148.5 mm'}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* ── Signatories ── */}
          <section data-tour="cop-settings-signatories">
            <h3 className="text-sm font-semibold text-[#4A4843] mb-3 flex items-center gap-2">
              <span>✍</span> Certificate Signatories
            </h3>
            <label className="mb-3 flex items-center justify-between gap-4 rounded-xl border-2 border-[#E0DDD4] px-4 py-3 text-sm text-[#4A4843]">
              <span>
                <span className="block font-semibold">Include signature image</span>
                <span className="block text-xs text-[#9A9890]">Show the uploaded e-signature on the certificate.</span>
              </span>
              <input
                type="checkbox"
                checked={includeSignature}
                onChange={e => onChangeIncludeSignature(e.target.checked)}
                className="h-4 w-4 shrink-0 accent-violet-600"
              />
            </label>
            {primarySignatories.length === 0 ? (
              <p className="text-xs text-[#9A9890]">No office signatories configured. Go to Settings to add one.</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <label htmlFor="cop-primary-signatory" className="mb-1.5 block text-xs font-semibold text-[#6B6860]">
                    Primary signatory
                  </label>
                  <select
                    id="cop-primary-signatory"
                    value={primarySignatory?.id || ''}
                    onChange={e => {
                      const selected = primarySignatories.find(sig => sig.id === Number(e.target.value));
                      if (selected) onSelectPrimarySignatory(selected);
                    }}
                    className="w-full rounded-xl border-2 border-[#E0DDD4] bg-white px-3 py-3 text-sm text-[#4A4843] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  >
                    {primarySignatories.map(sig => (
                      <option key={sig.id} value={sig.id}>
                        {sig.name}{sig.post_nominals ? `, ${sig.post_nominals}` : ''} — {sig.position}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="cop-secondary-signatory" className="mb-1.5 block text-xs font-semibold text-[#6B6860]">
                    Partner agency signatory (optional)
                  </label>
                  <select
                    id="cop-secondary-signatory"
                    value={secondarySignatory?.id || ''}
                    onChange={e => {
                      const id = Number(e.target.value);
                      onSelectSecondarySignatory(id ? partnerSignatories.find(sig => sig.id === id) || null : null);
                    }}
                    className="w-full rounded-xl border-2 border-[#E0DDD4] bg-white px-3 py-3 text-sm text-[#4A4843] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  >
                    <option value="">None — use the standard DILG certificate</option>
                    {partnerSignatories.map(sig => (
                        <option key={sig.id} value={sig.id}>
                          {sig.name} — {sig.agency_name}
                        </option>
                      ))}
                  </select>
                  {partnerSignatories.length === 0 && (
                    <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      No approved partner agency signatories are configured for this office.
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>

        </div>

        {/* Modal footer */}
        <div className="px-6 py-4 border-t border-[#EDEAE2] flex justify-end">
          <button
            data-tour="cop-settings-save"
            onClick={onSave}
            disabled={isSaving || primarySignatories.length === 0}
            className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white text-sm font-medium px-6 py-2 rounded-lg transition-colors"
          >
            {isSaving && <Loader2 size={14} className="animate-spin" />}
            {isSaving ? 'Saving…' : 'Save and close'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Signature Adjustment Panel ───────────────────────────────────────────────

type SignatureAdjustPanelProps = {
  targets: SignatureTarget[];
  adjustments: Record<number, SignatureAdjustment>;
  includeSignature: boolean;
  onChangeField: (signatoryId: number, field: keyof SignatureAdjustment, value: number) => void;
  onReset: (signatoryId: number) => void;
};

/**
 * Sits inline above the preview rather than in a dialog: calibrating a signature means
 * watching it move, which a modal would cover up.
 */
const SignatureAdjustPanel: React.FC<SignatureAdjustPanelProps> = ({
  targets, adjustments, includeSignature, onChangeField, onReset,
}) => {
  if (!includeSignature) {
    return (
      <p className="text-xs text-[#9A9890]">
        Signatures are excluded from this certificate. Turn on “Include signature image” in
        Settings to adjust them.
      </p>
    );
  }

  if (targets.length === 0) {
    return (
      <p className="text-xs text-[#9A9890]">
        The selected signatories have no e-signature image uploaded.
      </p>
    );
  }

  // With a partner signatory there are two cards to fit, so they share the row. On their
  // own, a card spans the full panel and the three sliders sit side by side instead of
  // stacking into a narrow column.
  const isSingleTarget = targets.length === 1;

  return (
    <div className={`grid gap-3 ${isSingleTarget ? 'grid-cols-1' : 'sm:grid-cols-2'}`}>
      {targets.map(target => {
        const adjustment = adjustments[target.id] ?? DEFAULT_SIGNATURE_ADJUSTMENT;
        const adjusted = isSignatureAdjusted(adjustment);

        return (
          <div key={target.id} className="rounded-xl border border-[#E0DDD4] bg-white px-4 py-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-[#4A4843]">{target.name}</p>
                <p className="truncate text-[10px] text-[#9A9890]">{target.role}</p>
              </div>
              <button
                type="button"
                onClick={() => onReset(target.id)}
                disabled={!adjusted}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#E0DDD4] bg-white px-2 py-1 text-[10px] font-medium text-[#4A4843] transition-colors hover:bg-[#F5F3EE] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCcw size={11} />
                Reset
              </button>
            </div>

            <div className={isSingleTarget ? 'grid gap-x-6 gap-y-2 sm:grid-cols-3' : 'space-y-2'}>
              {SIGNATURE_CONTROLS.map(control => (
                <div key={control.field}>
                  <div className="flex items-center justify-between text-[10px] font-medium text-[#6B6860]">
                    <label htmlFor={`cop-signature-${target.id}-${control.field}`}>
                      {control.label}
                    </label>
                    <span className="tabular-nums text-violet-600">
                      {control.format(adjustment[control.field])}
                    </span>
                  </div>
                  <input
                    id={`cop-signature-${target.id}-${control.field}`}
                    type="range"
                    min={control.limits.min}
                    max={control.limits.max}
                    step={control.limits.step}
                    value={adjustment[control.field]}
                    onChange={e => onChangeField(target.id, control.field, Number(e.target.value))}
                    className="mt-0.5 w-full accent-violet-600"
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const CertificateOfParticipation: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate    = useNavigate();
  const { user, loading: authLoading, refreshProfile } = useAuth();

  // ── data
  const [event,        setEvent]        = useState<Event | null>(null);
  const [participants, setParticipants] = useState<CoPParticipant[]>([]);
  const [signatories,  setSignatories]  = useState<SignatoryRow[]>([]);
  const [themes,       setThemes]       = useState<ThemeFile[]>([]);
  const [officeCode,   setOfficeCode]   = useState<string | null>(null);
  const [loading,      setLoading]      = useState(true);

  // ── certificate settings
  const [paperSize,          setPaperSize]          = useState<CoPPaperSize>('A4');
  const [themeUrl,           setThemeUrl]            = useState<string | null>(null);
  const [primarySignatory,   setPrimarySignatory]    = useState<CertificateSignatory>(null);
  const [secondarySignatory, setSecondarySignatory]  = useState<CertificateSignatory>(null);
  const [certTitle,          setCertTitle]           = useState<CoPTitle>('Certificate of Participation');
  const [bodyText,           setBodyText]            = useState<string>(DEFAULT_COP_BODY_TEXT);
  const [creditHours,        setCreditHours]         = useState<string>('');
  const [includeSignature,   setIncludeSignature]    = useState(true);
  const [showPrcLicenseNo,   setShowPrcLicenseNo]    = useState(false);
  const [accreditationMode,  setAccreditationMode]   = useState<CoPAccreditationMode>('None');
  const [prcAccreditationSuffix, setPrcAccreditationSuffix] = useState(DEFAULT_PRC_ACCREDITATION_SUFFIX);
  const [signatureAdjustments, setSignatureAdjustments] = useState<Record<number, SignatureAdjustment>>({});
  const [signatureSrcOverrides, setSignatureSrcOverrides] = useState<Record<number, string>>({});
  const certificateSecondarySignatory = secondarySignatory?.agency_name?.trim()
    && secondarySignatory.agency_logo_url?.trim()
    ? secondarySignatory
    : null;

  // Calibration belongs to the signatory's scanned image, so it is keyed by signatory and
  // reloaded whenever either slot changes. The 'cop' scope keeps it separate from the
  // Appearance certificate, whose layout gives the same offsets a different meaning.
  useEffect(() => {
    const loaded: Record<number, SignatureAdjustment> = {};
    if (primarySignatory?.id) {
      loaded[primarySignatory.id] = readStoredSignatureAdjustment('cop', primarySignatory.id);
    }
    if (secondarySignatory?.id) {
      loaded[secondarySignatory.id] = readStoredSignatureAdjustment('cop', secondarySignatory.id);
    }
    setSignatureAdjustments(loaded);
  }, [primarySignatory?.id, secondarySignatory?.id]);

  const handleSignatureFieldChange = (
    signatoryId: number,
    field: keyof SignatureAdjustment,
    value: number
  ) => {
    const base = signatureAdjustments[signatoryId] ?? DEFAULT_SIGNATURE_ADJUSTMENT;
    const next = clampSignatureAdjustment({ ...base, [field]: value });
    setSignatureAdjustments(current => ({ ...current, [signatoryId]: next }));
    writeStoredSignatureAdjustment('cop', signatoryId, next);
  };

  const handleResetSignature = (signatoryId: number) => {
    setSignatureAdjustments(current => ({ ...current, [signatoryId]: DEFAULT_SIGNATURE_ADJUSTMENT }));
    writeStoredSignatureAdjustment('cop', signatoryId, DEFAULT_SIGNATURE_ADJUSTMENT);
  };

  // Knock the white paper out of the scans so a theme image shows through behind them.
  // Export/print/email call this too, so a capture never races ahead of the processing and
  // bakes the untreated image into a PDF.
  const ensureTransparentSignatures = useCallback(async () => {
    const sources: Array<[number, string]> = [];
    if (primarySignatory?.id && primarySignatory.esig_link) {
      sources.push([primarySignatory.id, primarySignatory.esig_link]);
    }
    if (certificateSecondarySignatory?.id && certificateSecondarySignatory.esig_link) {
      sources.push([certificateSecondarySignatory.id, certificateSecondarySignatory.esig_link]);
    }
    if (sources.length === 0) return {} as Record<number, string>;

    const processed = await Promise.all(
      sources.map(async ([id, url]) => [id, await getTransparentSignature(url)] as const)
    );

    const next: Record<number, string> = {};
    processed.forEach(([id, src]) => { next[id] = src; });
    setSignatureSrcOverrides(next);
    return next;
  }, [
    primarySignatory?.id,
    primarySignatory?.esig_link,
    certificateSecondarySignatory?.id,
    certificateSecondarySignatory?.esig_link,
  ]);

  useEffect(() => { void ensureTransparentSignatures(); }, [ensureTransparentSignatures]);

  // Only signatories that actually contribute an image to the certificate are adjustable.
  const signatureTargets: SignatureTarget[] = [];
  if (primarySignatory?.id && primarySignatory.esig_link) {
    signatureTargets.push({
      id: primarySignatory.id,
      name: primarySignatory.name,
      role: 'Primary signatory',
    });
  }
  if (certificateSecondarySignatory?.id && certificateSecondarySignatory.esig_link) {
    signatureTargets.push({
      id: certificateSecondarySignatory.id,
      name: certificateSecondarySignatory.name,
      role: certificateSecondarySignatory.agency_name?.trim() || 'Partner agency signatory',
    });
  }

  const hasSignatureAdjustments = signatureTargets.some(target =>
    isSignatureAdjusted(signatureAdjustments[target.id] ?? DEFAULT_SIGNATURE_ADJUSTMENT)
  );

  // ── UI state
  const [search,           setSearch]           = useState('');
  const [roleFilter,       setRoleFilter]       = useState<CoPRoleFilter>('All');
  const [attendanceFilter, setAttendanceFilter] = useState<CoPAttendanceFilter>('All');
  const [selectedIds,      setSelectedIds]      = useState<number[]>([]);
  const [previewId,        setPreviewId]        = useState<number | null>(null);
  const [previewScale,     setPreviewScale]     = useState(1);
  const [isGenerating,     setIsGenerating]     = useState(false);
  const [isPrintMode,      setIsPrintMode]      = useState(false);
  const [progress,         setProgress]         = useState<{ done: number; total: number } | null>(null);
  const [isUploadingTheme, setIsUploadingTheme] = useState(false);
  const [themeError,       setThemeError]       = useState<string | null>(null);
  const [showSettings,     setShowSettings]     = useState(false);
  const [isSavingSignatories, setIsSavingSignatories] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showSignatureAdjust, setShowSignatureAdjust] = useState(false);
  const [isSendingEmails,  setIsSendingEmails]  = useState(false);
  const [emailProgress,    setEmailProgress]    = useState<{ done: number; total: number } | null>(null);
  const [showTutorial,     setShowTutorial]     = useState(false);

  // ── Tutorial
  // Steps drive the Settings modal open and closed so each setting is explained while it
  // is actually on screen.
  const tourSteps = useMemo(
    () => buildCoPTourSteps({
      openSettings: () => setShowSettings(true),
      closeSettings: () => setShowSettings(false),
    }),
    []
  );

  // Skipping counts the same as finishing: the user has decided they don't need it, and
  // the Tutorial button is always there if they change their mind.
  const handleCloseTutorial = useCallback(async () => {
    setShowTutorial(false);
    setShowSettings(false);
    if (hasSeenGuide(user, 'cop')) return;
    const updated = await markGuideSeen(user, 'cop');
    // Keep the cached profile in step so the tour doesn't reappear on the next
    // navigation, before AuthContext next refetches the row.
    if (updated) await refreshProfile();
  }, [user, refreshProfile]);

  const previewWrapperRef = useRef<HTMLDivElement>(null);
  const renderRefs        = useRef<Record<number, HTMLDivElement | null>>({});

  // ── Fetch data
  useEffect(() => {
    if (eventId) {
      sessionStorage.setItem('reports_selected_event_id', eventId);
      fetchAll(parseInt(eventId, 10));
      fetchThemes();
    }
  }, [eventId]);

  const fetchAll = async (id: number) => {
    setLoading(true);
    try {
      const { data: ev } = await supabase.from('events').select('*').eq('event_id', id).is('deleted_at', null).single();
      if (!ev) return;
      setEvent(ev);

      setOfficeCode(null);
      if (ev.organize_by) {
        const { data: officeData } = await supabase
          .from('offices')
          .select('code')
          .eq('office_id', ev.organize_by)
          .maybeSingle();
        if (officeData?.code) setOfficeCode(officeData.code);
      }

      let signatoryQuery = supabase
        .from('tbl_signatory')
        .select(`
          id,
          office_id,
          label,
          name,
          position,
          esig_link,
          agency_name,
          agency_logo_url,
          header,
          sub_header,
          address,
          website,
          footer,
          post_nominals,
          certificate_template_variant,
          is_default,
          active
        `)
        .eq('active', true)
        .order('name');

      const signatoryScope = new Set<string>([`id.eq.${GLOBAL_SIGNATORY_ID}`]);
      if (ev.organize_by != null) signatoryScope.add(`office_id.eq.${ev.organize_by}`);
      if (ev.cop_primary_signatory_id != null) signatoryScope.add(`id.eq.${ev.cop_primary_signatory_id}`);
      if (ev.cop_secondary_signatory_id != null) signatoryScope.add(`id.eq.${ev.cop_secondary_signatory_id}`);
      signatoryQuery = signatoryQuery.or(Array.from(signatoryScope).join(','));

      const { data: sigs, error: signatoryError } = await signatoryQuery;
      if (signatoryError) {
        console.error('Error loading certificate signatories:', signatoryError);
        setSignatories([]);
        setPrimarySignatory(null);
        setSecondarySignatory(null);
        toast.error('Unable to load certificate signatories.');
      } else {
        const scopedSignatories = (sigs ?? []) as SignatoryRow[];
        const officeSignatories = scopedSignatories.filter(sig => !isPartnerAgencySignatory(sig));
        const partnerSignatories = scopedSignatories.filter(isCompletePartnerAgencySignatory);
        setSignatories(scopedSignatories);
        const savedPrimary = officeSignatories.find(sig => sig.id === ev.cop_primary_signatory_id);
        const defaultSignatory = savedPrimary
          ?? officeSignatories.find(sig => sig.id === GLOBAL_SIGNATORY_ID)
          ?? officeSignatories.find(sig => sig.is_default)
          ?? officeSignatories[0]
          ?? null;
        const savedSecondary = partnerSignatories.find(
          sig => sig.id === ev.cop_secondary_signatory_id
        ) ?? null;
        setPrimarySignatory(defaultSignatory);
        setSecondarySignatory(savedSecondary);
      }

      const logs = await fetchAllSupabaseRows<any>(() =>
        supabase
          .from('attendance_logs')
          .select('attendance_id, participant_id, attendance_date')
          .eq('event_id', id)
          .in('scan_status', [...PRESENT_ATTENDANCE_STATUSES])
          .order('attendance_id', { ascending: true })
      );

      const logsByPid = new Map<number, Set<string>>();
      logs.forEach(log => {
        if (!log.participant_id || !log.attendance_date) return;
        if (!logsByPid.has(log.participant_id)) logsByPid.set(log.participant_id, new Set());
        logsByPid.get(log.participant_id)!.add(log.attendance_date);
      });

      const loggedParticipantIds = Array.from(logsByPid.keys());
      if (loggedParticipantIds.length === 0) {
        setParticipants([]);
        setSelectedIds([]);
        setPreviewId(null);
        return;
      }

      const epData = await fetchAllSupabaseRows<any>(() =>
        supabase
          .from('event_participants')
          .select('participant_id, registration_status, role, cop_email_sent_at, participants (*)')
          .eq('event_id', id)
          .eq('registration_status', 'Registered')
          .in('participant_id', loggedParticipantIds)
          .order('participant_id', { ascending: true })
      );

      const normalized: CoPParticipant[] = epData
        .map((r: any) => ({
          participant: Array.isArray(r.participants) ? r.participants[0] : r.participants,
          log_dates: Array.from(logsByPid.get(r.participant_id) || []).sort(),
          registration_status: r.registration_status,
          role: (r.role as CoPParticipantRole) || 'Delegate',
          cop_email_sent_at: r.cop_email_sent_at ?? null,
        }))
        .filter((r): r is CoPParticipant => !!r.participant && r.log_dates.length > 0)
        .sort((a, b) =>
          (a.participant.l_name || '').localeCompare(b.participant.l_name || '') ||
          (a.participant.full_name || '').localeCompare(b.participant.full_name || '')
        );

      setParticipants(normalized);
      setSelectedIds(normalized.map(r => r.participant.participant_id));
      setPreviewId(normalized[0]?.participant.participant_id ?? null);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPrimarySignatory = (signatory: SignatoryRow) => {
    setPrimarySignatory(signatory);
    if (secondarySignatory?.id === signatory.id) {
      setSecondarySignatory(null);
    }
  };

  const handleSelectSecondarySignatory = (signatory: SignatoryRow | null) => {
    if (signatory?.id === primarySignatory?.id) return;
    setSecondarySignatory(signatory);
  };

  const handleSaveSignatories = async () => {
    if (!event || !primarySignatory?.id) {
      toast.error('Select a primary signatory before saving.');
      return;
    }

    if (secondarySignatory && (
      !secondarySignatory.agency_name?.trim()
      || !secondarySignatory.agency_logo_url?.trim()
    )) {
      toast.error('The partner signatory requires an agency name and agency logo.');
      return;
    }

    setIsSavingSignatories(true);
    try {
      const signatoryIds = {
        cop_primary_signatory_id: primarySignatory.id,
        cop_secondary_signatory_id: secondarySignatory?.id ?? null,
      };
      const { error } = await supabase
        .from('events')
        .update(signatoryIds)
        .eq('event_id', event.event_id);

      if (error) throw error;

      setEvent(current => current ? { ...current, ...signatoryIds } : current);
      setShowSettings(false);
      toast.success(secondarySignatory
        ? 'Primary and partner signatories saved for this event.'
        : 'Primary signatory saved for this event.');
    } catch (error: any) {
      console.error('Error saving Certificate of Participation signatories:', error);
      toast.error(error?.message || 'Unable to save the event signatories.');
    } finally {
      setIsSavingSignatories(false);
    }
  };

  const fetchThemes = async () => {
    const { data } = await supabase.storage.from(CERT_BUCKET).list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
    if (!data) return;
    const themesData = data
      .filter(f => f.name !== '.emptyFolderPlaceholder')
      .map(f => ({
        name: f.name,
        url: supabase.storage.from(CERT_BUCKET).getPublicUrl(f.name).data.publicUrl,
      }));
    setThemes(themesData);
    if (themesData.length > 0) {
      setThemeUrl(themesData[0].url);
    }
  };

  // Offer the walkthrough the first time this user opens the page — once it has been
  // finished or skipped, it is reachable from the Tutorial button.
  useEffect(() => {
    if (loading || authLoading || !event) return;
    if (!hasSeenGuide(user, 'cop')) setShowTutorial(true);
  }, [loading, authLoading, event, user]);

  // ── Preview scale
  useEffect(() => {
    const el = previewWrapperRef.current;
    if (!el) return;
    const update = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setPreviewScale(Math.min(1, w / getCoP_WidthPx(paperSize)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [paperSize, previewId]);

  const roleFilteredParticipants = useMemo(
    () => participants.filter(r => roleFilter === 'All' || getRoleFilterValue(r.role) === roleFilter),
    [participants, roleFilter]
  );

  const requiredAttendanceDates = useMemo(
    () => event ? getEventDateRows(event).map(row => row.key) : [],
    [event]
  );

  const completedParticipantIds = useMemo(() => {
    const completedIds = new Set<number>();
    if (requiredAttendanceDates.length === 0) return completedIds;

    participants.forEach(record => {
      const attendedDates = new Set(record.log_dates);
      if (requiredAttendanceDates.every(date => attendedDates.has(date))) {
        completedIds.add(record.participant.participant_id);
      }
    });

    return completedIds;
  }, [participants, requiredAttendanceDates]);

  const attendanceFilteredParticipants = useMemo(() => {
    if (attendanceFilter === 'All') return roleFilteredParticipants;

    const shouldBeComplete = attendanceFilter === 'Complete';
    return roleFilteredParticipants.filter(record =>
      completedParticipantIds.has(record.participant.participant_id) === shouldBeComplete
    );
  }, [attendanceFilter, completedParticipantIds, roleFilteredParticipants]);

  const roleCounts = useMemo(() => {
    const counts: Record<CoPRoleFilter, number> = {
      All: participants.length,
      Delegate: 0,
      SecretariatGuest: 0,
      Speaker: 0,
    };

    participants.forEach(record => {
      counts[getRoleFilterValue(record.role)] += 1;
    });

    return counts;
  }, [participants]);

  // ── Filtered list
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return attendanceFilteredParticipants.filter(r =>
      !q ||
      r.participant.full_name?.toLowerCase().includes(q) ||
      buildListName(r.participant).toLowerCase().includes(q)
    );
  }, [attendanceFilteredParticipants, search]);

  useEffect(() => {
    setPreviewId(current => {
      if (current && filtered.some(r => r.participant.participant_id === current)) return current;
      return filtered[0]?.participant.participant_id ?? null;
    });
  }, [filtered]);

  const previewRecord = useMemo(
    () => participants.find(r => r.participant.participant_id === previewId) ?? null,
    [participants, previewId]
  );

  // Per-participant reference number (office-date-eventcode-series), assigned in the
  // sorted participant order. Empty unless the event has an event code and an office code.
  const referenceByPid = useMemo(() => {
    const map = new Map<number, string>();
    if (!event) return map;
    participants.forEach((record, index) => {
      const ref = buildCoPReferenceNumber(event, officeCode, index + 1);
      if (ref) map.set(record.participant.participant_id, ref);
    });
    return map;
  }, [participants, event, officeCode]);

  // ── Selection
  const toggleSelect = (id: number) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const filterBySearch = (records: CoPParticipant[]) => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter(record =>
      record.participant.full_name?.toLowerCase().includes(q)
      || buildListName(record.participant).toLowerCase().includes(q)
    );
  };

  const selectAll = () => {
    setAttendanceFilter('All');
    setSelectedIds(filterBySearch(roleFilteredParticipants).map(record => record.participant.participant_id));
  };

  const applyAttendanceFilter = (nextFilter: CoPAttendanceFilter) => {
    const candidates = nextFilter === 'All'
      ? roleFilteredParticipants
      : roleFilteredParticipants.filter(record =>
          completedParticipantIds.has(record.participant.participant_id) === (nextFilter === 'Complete')
        );

    setAttendanceFilter(nextFilter);
    setSelectedIds(filterBySearch(candidates).map(record => record.participant.participant_id));
  };

  const clearAll = () => {
    setAttendanceFilter('All');
    setSelectedIds([]);
  };

  const handleRoleFilterChange = (nextRole: CoPRoleFilter) => {
    const candidates = participants.filter(record =>
      nextRole === 'All' || getRoleFilterValue(record.role) === nextRole
    );
    const attendanceCandidates = attendanceFilter === 'All'
      ? candidates
      : candidates.filter(record =>
          completedParticipantIds.has(record.participant.participant_id) === (attendanceFilter === 'Complete')
        );

    setRoleFilter(nextRole);
    setSelectedIds(filterBySearch(attendanceCandidates).map(record => record.participant.participant_id));
  };

  // ── Upload theme
  const handleThemeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setThemeError('Please upload an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { setThemeError('Image must be under 5 MB.'); return; }
    setThemeError(null);
    setIsUploadingTheme(true);
    try {
      const ext  = file.name.split('.').pop() ?? 'png';
      const path = `theme_${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(CERT_BUCKET).upload(path, file, { upsert: false });
      if (error) throw error;
      await fetchThemes();
      setThemeUrl(supabase.storage.from(CERT_BUCKET).getPublicUrl(path).data.publicUrl);
    } catch (err: any) {
      setThemeError(err?.message ?? 'Upload failed.');
    } finally {
      setIsUploadingTheme(false);
      e.target.value = '';
    }
  };

  const handleDeleteTheme = async (theme: ThemeFile) => {
    if (!confirm(`Delete theme "${theme.name}"?`)) return;
    await supabase.storage.from(CERT_BUCKET).remove([theme.name]);
    if (themeUrl === theme.url) setThemeUrl(null);
    await fetchThemes();
  };

  // ── Shared download trigger
  const triggerDownload = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ── Export
  const handleExport = async () => {
    if (!event || !selectedIds.length) return;
    const queue = participants.filter(r => selectedIds.includes(r.participant.participant_id));
    setIsPrintMode(false);
    setIsGenerating(true);
    setProgress({ done: 0, total: queue.length });
    try {
      const signatureSrcs = await ensureTransparentSignatures();
      await preloadImages([
        themeUrl,
        includeSignature ? resolveSignatureSrc(signatureSrcs, primarySignatory) : null,
        includeSignature ? resolveSignatureSrc(signatureSrcs, certificateSecondarySignatory) : null,
        certificateSecondarySignatory?.agency_logo_url,
      ]);
      await ensureCertFontsReady();
      await waitTwoPaints();
      let fontEmbedCSS: string | undefined;
      const files: Array<{ fileName: string; blob: Blob }> = [];
      for (let i = 0; i < queue.length; i += BATCH_SIZE) {
        const batch = queue.slice(i, i + BATCH_SIZE);
        await waitTwoPaints();
        await wait(80);
        for (const record of batch) {
          const pid = record.participant.participant_id;
          const ref = renderRefs.current[pid];
          if (!ref) continue;
          if (fontEmbedCSS === undefined) {
            try { fontEmbedCSS = await getFontEmbedCSS(ref); } catch { fontEmbedCSS = ''; }
          }
          const dataUrl = await toJpeg(ref, { cacheBust: true, backgroundColor: '#ffffff', pixelRatio: PIXEL_RATIO, quality: JPEG_QUALITY, fontEmbedCSS: fontEmbedCSS || undefined });
          const jpegBlob = await (await fetch(dataUrl)).blob();
          files.push({ fileName: buildFileName(record.participant), blob: await createPdfBlob(jpegBlob, paperSize) });
          setProgress(p => p ? { ...p, done: p.done + 1 } : null);
        }
        if (i + BATCH_SIZE < queue.length) await wait(120);
      }
      if (!files.length) return;
      if (files.length === 1) {
        triggerDownload(files[0].blob, files[0].fileName);
      } else {
        triggerDownload(await createZipBlob(files), `${sanitize(event.event_name || 'Certificates')}_CoP.zip`);
      }
    } catch (err: any) {
      alert('Export failed: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  };

  // ── Print
  const handlePrint = async () => {
    if (!event || !selectedIds.length) return;
    const queue = participants.filter(r => selectedIds.includes(r.participant.participant_id));
    setIsPrintMode(true);
    setIsGenerating(true);
    setProgress({ done: 0, total: queue.length });
    try {
      const signatureSrcs = await ensureTransparentSignatures();
      await preloadImages([
        themeUrl,
        includeSignature ? resolveSignatureSrc(signatureSrcs, primarySignatory) : null,
        includeSignature ? resolveSignatureSrc(signatureSrcs, certificateSecondarySignatory) : null,
        certificateSecondarySignatory?.agency_logo_url,
      ]);
      await ensureCertFontsReady();
      await waitTwoPaints();
      let fontEmbedCSS: string | undefined;
      const dataUrls: string[] = [];
      for (let i = 0; i < queue.length; i += BATCH_SIZE) {
        const batch = queue.slice(i, i + BATCH_SIZE);
        await waitTwoPaints();
        await wait(80);
        for (const record of batch) {
          const pid = record.participant.participant_id;
          const ref = renderRefs.current[pid];
          if (!ref) continue;
          if (fontEmbedCSS === undefined) {
            try { fontEmbedCSS = await getFontEmbedCSS(ref); } catch { fontEmbedCSS = ''; }
          }
          const dataUrl = await toJpeg(ref, { cacheBust: true, backgroundColor: '#ffffff', pixelRatio: 2, quality: 0.95, fontEmbedCSS: fontEmbedCSS || undefined });
          dataUrls.push(dataUrl);
          setProgress(p => p ? { ...p, done: p.done + 1 } : null);
        }
        if (i + BATCH_SIZE < queue.length) await wait(80);
      }
      if (!dataUrls.length) return;

      const isA5 = paperSize === 'A5';
      const printWin = window.open('', '_blank');
      if (!printWin) { alert('Pop-up blocked. Please allow pop-ups for this site to use Print.'); return; }

      let printHtml: string;
      if (isA5) {
        // Group A5 certs into pairs for A4 pages (2 A5 landscape certs per A4 page)
        const pages: string[] = [];
        for (let i = 0; i < dataUrls.length; i += 2) {
          const cert1 = dataUrls[i];
          const cert2 = dataUrls[i + 1];
          pages.push(
            `<div class="page">` +
            `<img src="${cert1}" class="cert" />` +
            (cert2 ? `<img src="${cert2}" class="cert" />` : '') +
            `</div>`
          );
        }
        printHtml =
          `<!DOCTYPE html><html><head><style>` +
          `*{margin:0;padding:0;box-sizing:border-box}html,body{background:#fff;width:210mm;height:297mm}body{font-size:0}` +
          `@page{size:210mm 297mm;margin:0}` +
          `.page{width:210mm;height:297mm;overflow:hidden;page-break-after:always;display:flex;flex-direction:column}.page:last-child{page-break-after:auto}` +
          `.cert{width:210mm;height:148.5mm;display:block}` +
          `</style></head><body>` +
          pages.join('') +
          `<script>window.onload=function(){window.print();window.onafterprint=function(){window.close();}}</script>` +
          `</body></html>`;
      } else {
        // A4: One cert per page
        const pageSizeCss = '297mm 210mm';
        printHtml =
          `<!DOCTYPE html><html><head><style>` +
          `*{margin:0;padding:0;box-sizing:border-box}html,body{background:#fff;width:297mm;height:210mm}body{font-size:0}` +
          `@page{size:${pageSizeCss};margin:0}` +
          `.p{width:297mm;height:210mm;overflow:hidden;page-break-after:always}.p:last-child{page-break-after:auto}` +
          `.p img{width:297mm;height:210mm;display:block;object-fit:fill}` +
          `</style></head><body>` +
          dataUrls.map(u => `<div class="p"><img src="${u}"/></div>`).join('') +
          `<script>window.onload=function(){window.print();window.onafterprint=function(){window.close();}}</script>` +
          `</body></html>`;
      }
      printWin.document.write(printHtml);
      printWin.document.close();
    } catch (err: any) {
      alert('Print failed: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsGenerating(false);
      setIsPrintMode(false);
      setProgress(null);
    }
  };

  // ── Email
  const handleEmailCertificates = async () => {
    if (!event || !selectedIds.length) return;
    const queue = participants.filter(r => selectedIds.includes(r.participant.participant_id));

    setIsSendingEmails(true);
    setEmailProgress({ done: 0, total: queue.length });

    try {
      const signatureSrcs = await ensureTransparentSignatures();
      await preloadImages([
        themeUrl,
        includeSignature ? resolveSignatureSrc(signatureSrcs, primarySignatory) : null,
        includeSignature ? resolveSignatureSrc(signatureSrcs, certificateSecondarySignatory) : null,
        certificateSecondarySignatory?.agency_logo_url,
      ]);
      await ensureCertFontsReady();
      await waitTwoPaints();
      let fontEmbedCSS: string | undefined;

      for (let i = 0; i < queue.length; i += BATCH_SIZE) {
        const batch = queue.slice(i, i + BATCH_SIZE);
        await waitTwoPaints();
        await wait(80);

        for (const record of batch) {
          if (!record.participant.email) {
            setEmailProgress(p => p ? { ...p, done: p.done + 1 } : null);
            continue;
          }

          try {
            const pid = record.participant.participant_id;
            const ref = renderRefs.current[pid];
            if (!ref) {
              setEmailProgress(p => p ? { ...p, done: p.done + 1 } : null);
              continue;
            }

            if (fontEmbedCSS === undefined) {
              try { fontEmbedCSS = await getFontEmbedCSS(ref); } catch { fontEmbedCSS = ''; }
            }

            const dataUrl = await toJpeg(ref, { cacheBust: true, backgroundColor: '#ffffff', pixelRatio: PIXEL_RATIO, quality: JPEG_QUALITY, fontEmbedCSS: fontEmbedCSS || undefined });
            const jpegBlob = await (await fetch(dataUrl)).blob();
            const pdfBlob = await createPdfBlob(jpegBlob, paperSize);
            const fileName = buildFileName(record.participant);

            const result = await sendCertificateEmail(
              record.participant.email,
              pdfBlob,
              fileName,
              record.participant.full_name || 'Participant',
              record.participant.participant_id,
              'CoP',
              event.event_name,
              formatEventDate(event),
              event.venue || 'To be announced',
              event.event_id
            );

            if (result.success) {
              toast.success(`Email sent to ${record.participant.email}`);
            } else {
              toast.error(`Failed to send email to ${record.participant.email}`);
            }
          } catch (error) {
            console.error('Error processing email:', error);
            toast.error(`Error processing certificate for ${record.participant.full_name}`);
          }

          setEmailProgress(p => p ? { ...p, done: p.done + 1 } : null);
        }
        if (i + BATCH_SIZE < queue.length) await wait(120);
      }
    } catch (err: any) {
      toast.error('Email sending failed: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsSendingEmails(false);
      setEmailProgress(null);
      if (eventId) {
        await fetchAll(parseInt(eventId, 10));
      }
    }
  };

  const formatEventDate = (ev: Event) => {
    try {
      const s = parseISO(ev.start_date);
      const e = ev.end_date ? parseISO(ev.end_date) : s;
      if (ev.start_date === ev.end_date || !ev.end_date) return format(s, 'MMM. d, yyyy');
      if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear())
        return `${format(s, 'MMM. d')}-${format(e, 'd, yyyy')}`;
      return `${format(s, 'MMM. d')} - ${format(e, 'MMM. d, yyyy')}`;
    } catch { return ev.start_date; }
  };

  // ── Loading / not found guards
  if (loading) return (
    <div className="h-screen flex items-center justify-center">
      <Loader2 className="animate-spin text-violet-600" size={32} />
    </div>
  );
  if (!event) return (
    <div className="h-screen flex items-center justify-center text-[#7C7A72] text-sm">Event not found.</div>
  );

  const creditHoursNum = (() => {
    const n = parseInt(creditHours, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();

  const bodyTextResolved = bodyText.trim() || DEFAULT_COP_BODY_TEXT;

  const selectedCount  = selectedIds.length;
  const completedCount = completedParticipantIds.size;
  const renderFarm     = participants.filter(r => selectedIds.includes(r.participant.participant_id));

  return (
    <div className="flex min-h-screen flex-col overflow-y-auto bg-[#F5F3EE] md:h-screen md:overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 flex-col items-stretch justify-between gap-3 border-b border-[#E0DDD4] bg-white px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/reports')}
            className="flex items-center gap-1.5 text-[#7C7A72] hover:text-[#2A2926] transition-colors text-sm font-medium shrink-0"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <div className="w-px h-5 bg-[#E0DDD4] shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] text-[#9A9890] leading-none mb-0.5">Certificate of Participation</p>
            <p className="text-sm font-semibold text-[#2A2926] truncate leading-tight">{event.event_name}</p>
            <p className="text-[11px] text-[#9A9890] leading-none mt-0.5">{formatEventDate(event)}</p>
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:items-center">
          {/* Tutorial button */}
          <TutorialButton onClick={() => setShowTutorial(true)} />

          {/* Settings button */}
          <button
            data-tour="cop-settings-button"
            onClick={() => setShowSettings(true)}
            className="flex items-center justify-center gap-1.5 text-[#6B6860] hover:text-violet-700 hover:bg-violet-50 border border-[#E0DDD4] hover:border-violet-300 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <Settings size={15} /> Settings
          </button>

          {/* Print button */}
          <button
            data-tour="cop-print-button"
            onClick={handlePrint}
            disabled={isGenerating || selectedCount === 0}
            className="flex items-center justify-center gap-2 bg-[#6B6860] hover:bg-[#4A4843] disabled:bg-[#C5C2BA] disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {isGenerating && isPrintMode ? (
              <><Loader2 size={15} className="animate-spin" />{progress ? `${progress.done}/${progress.total}` : 'Preparing…'}</>
            ) : (
              <><Printer size={15} /> Print {selectedCount > 0 ? `(${selectedCount})` : ''}</>
            )}
          </button>

          {/* Export button */}
          <button
            data-tour="cop-export-button"
            onClick={handleExport}
            disabled={isGenerating || selectedCount === 0}
            className="flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:bg-[#C5C2BA] disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {isGenerating && !isPrintMode ? (
              <><Loader2 size={15} className="animate-spin" />{progress ? `${progress.done}/${progress.total}` : 'Preparing…'}</>
            ) : (
              <><Download size={15} /> Export {selectedCount > 0 ? `(${selectedCount})` : ''}</>
            )}
          </button>

          {/* Email button */}
          <button
            data-tour="cop-email-button"
            onClick={handleEmailCertificates}
            disabled={isSendingEmails || selectedCount === 0}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-[#C5C2BA] disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {isSendingEmails ? (
              <><Loader2 size={15} className="animate-spin" />{emailProgress ? `${emailProgress.done}/${emailProgress.total}` : 'Sending…'}</>
            ) : (
              <><Mail size={15} /> Email {selectedCount > 0 ? `(${selectedCount})` : ''}</>
            )}
          </button>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="block flex-1 md:flex md:min-h-0 md:overflow-hidden">

        {/* ── Left panel: Participants only ── */}
        <div className="flex w-full shrink-0 flex-col overflow-visible bg-white md:w-72 md:overflow-hidden md:border-r md:border-[#E0DDD4]">
          {/* List header */}
          <div className="px-4 py-3 border-b border-[#EDEAE2]">
            <div data-tour="cop-attendance-filter" className="mb-2.5 flex items-center gap-1 text-[10px]">
              <button
                type="button"
                aria-pressed={attendanceFilter === 'All' && selectedIds.length > 0}
                onClick={selectAll}
                className={`${attendanceFilter === 'All' && selectedIds.length > 0 ? 'font-semibold text-violet-700' : 'text-violet-600'} hover:underline`}
              >
                Select All
              </button>
              <span className="text-[#C5C2BA]">·</span>
              <button
                type="button"
                aria-pressed={attendanceFilter === 'Complete'}
                onClick={() => applyAttendanceFilter('Complete')}
                className={`${attendanceFilter === 'Complete' ? 'font-semibold text-emerald-700' : 'text-violet-600'} hover:underline`}
                title="Show only participants with attendance on every event date"
              >
                Complete
              </button>
              <span className="text-[#C5C2BA]">·</span>
              <button
                type="button"
                aria-pressed={attendanceFilter === 'Incomplete'}
                onClick={() => applyAttendanceFilter('Incomplete')}
                className={`${attendanceFilter === 'Incomplete' ? 'font-semibold text-amber-700' : 'text-violet-600'} hover:underline`}
                title="Show only participants missing attendance on one or more event dates"
              >
                Incomplete
              </button>
              <span className="text-[#C5C2BA]">·</span>
              <button type="button" onClick={clearAll} className="text-[#9A9890] hover:text-[#6B6860] hover:underline">Unselect</button>
            </div>

            <div data-tour="cop-role-filter" className="mb-2.5 grid grid-cols-2 gap-1.5">
              {ROLE_FILTER_OPTIONS.map(option => {
                const isActive = roleFilter === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleRoleFilterChange(option.value)}
                    className={`min-w-0 rounded-md border px-2 py-1.5 text-left transition-colors ${
                      isActive
                        ? 'border-violet-300 bg-violet-50 text-violet-700'
                        : 'border-[#E0DDD4] bg-white text-[#7C7A72] hover:border-[#C5C2BA] hover:bg-[#F5F3EE]'
                    }`}
                  >
                    <span className="block truncate text-[10px] font-semibold leading-tight">{option.label}</span>
                    <span className={`text-[10px] leading-tight ${isActive ? 'text-violet-500' : 'text-[#9A9890]'}`}>
                      {roleCounts[option.value]} names
                    </span>
                  </button>
                );
              })}
            </div>

            <div data-tour="cop-search" className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9A9890]" />
              <input
                type="text"
                placeholder="Search…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-7 pr-7 py-1.5 text-xs border border-[#E0DDD4] rounded-md focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9A9890] hover:text-[#6B6860]">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Stats bar */}
          <div className="px-4 py-1.5 bg-[#F5F3EE] border-b border-[#EDEAE2]">
            <p className="text-[10px] text-[#9A9890]">
              {selectedCount} selected · {filtered.length} visible · {completedCount} completed
            </p>
          </div>

          {/* List */}
          <div data-tour="cop-participant-list" className="flex-1 overflow-visible md:overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-xs text-[#9A9890] text-center py-10">
                {attendanceFilter === 'Complete'
                  ? 'No participants have completed attendance for every event date.'
                  : attendanceFilter === 'Incomplete'
                    ? 'No participants have incomplete attendance for this event.'
                    : 'No participants found.'}
              </p>
            )}
            {filtered.map(record => {
              const pid         = record.participant.participant_id;
              const isSelected  = selectedIds.includes(pid);
              const isPreviewing = previewId === pid;
              const hasLogs     = record.log_dates.length > 0;

              return (
                <div
                  key={pid}
                  className={`flex items-start gap-2.5 px-3 py-2.5 border-b border-[#F5F3EE] cursor-pointer transition-colors ${
                    isPreviewing ? 'bg-violet-50' : 'hover:bg-[#F5F3EE]'
                  }`}
                  onClick={() => setPreviewId(pid)}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={e => { e.stopPropagation(); toggleSelect(pid); }}
                    onClick={e => e.stopPropagation()}
                    className="mt-0.5 accent-violet-600 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-xs font-medium leading-snug truncate ${isPreviewing ? 'text-violet-700' : 'text-[#4A4843]'}`}>
                        {buildListName(record.participant)}
                      </p>
                      {record.cop_email_sent_at && (
                        <div className="rounded-full bg-blue-100 p-1 text-blue-700 shrink-0" title="Email sent">
                          <Mail size={11} />
                        </div>
                      )}
                    </div>
                    <p className="truncate text-[10px] leading-snug text-[#9A9890] mt-0.5">
                      {record.participant.office || '—'}
                    </p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setPreviewId(pid); setShowPreviewModal(true); }}
                    className="mt-0.5 hidden shrink-0 text-[#C5C2BA] transition-colors hover:text-violet-500 md:block"
                    title="Full preview"
                  >
                    <Eye size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right panel: Live preview ── */}
        <div className="hidden flex-1 flex-col items-center justify-start overflow-auto bg-[#EDEAE2] p-6 md:flex">
          {/* Settings summary strip */}
          <div className="flex items-center gap-3 mb-4 text-xs text-[#7C7A72] bg-white border border-[#E0DDD4] rounded-lg px-4 py-2 w-full max-w-4xl">
            <span className="font-medium text-[#6B6860] truncate">
              {certTitle}
            </span>
            <span className="text-[#C5C2BA]">·</span>
            <span className="font-medium text-[#6B6860]">
              {paperSize} Landscape
            </span>
            <span className="text-[#C5C2BA]">·</span>
            <span>{creditHoursNum ? `${creditHoursNum} credit hr${creditHoursNum === 1 ? '' : 's'}` : 'No credit hrs'}</span>
            <span className="text-[#C5C2BA]">·</span>
            <span>{themeUrl ? 'Theme applied' : 'Plain white'}</span>
            <span className="text-[#C5C2BA]">·</span>
            <span className="truncate">{primarySignatory?.name || 'No signatory'}</span>
            {certificateSecondarySignatory && (
              <>
                <span>·</span>
                <span className="truncate">Partner: {certificateSecondarySignatory.agency_name || certificateSecondarySignatory.name}</span>
              </>
            )}
            <span className="text-[#C5C2BA]">/</span>
            <span>{includeSignature ? 'Signature included' : 'Signature excluded'}</span>
            <button
              data-tour="cop-signature-adjust"
              onClick={() => setShowSignatureAdjust(current => !current)}
              className={`ml-auto shrink-0 font-medium flex items-center gap-1 ${
                showSignatureAdjust ? 'text-violet-700' : 'text-violet-600 hover:underline'
              }`}
              title="Resize and reposition the e-signature"
            >
              <SlidersHorizontal size={12} /> Adjustment
              {hasSignatureAdjustments && (
                <span className="h-1.5 w-1.5 rounded-full bg-violet-600" title="Calibrated" />
              )}
            </button>
          </div>

          {showSignatureAdjust && (
            <div className="mb-3 w-full max-w-4xl rounded-xl border border-[#E0DDD4] bg-[#F5F3EE] p-3">
              <SignatureAdjustPanel
                targets={signatureTargets}
                adjustments={signatureAdjustments}
                includeSignature={includeSignature}
                onChangeField={handleSignatureFieldChange}
                onReset={handleResetSignature}
              />
            </div>
          )}

          {previewRecord ? (
            <div ref={previewWrapperRef} className="w-full max-w-4xl">
              <div
                data-tour="cop-preview"
                style={{
                  transformOrigin: 'top left',
                  transform: `scale(${previewScale})`,
                  width: getCoP_WidthPx(paperSize),
                  height: getCoP_HeightPx(paperSize),
                  boxShadow: '0 4px 32px rgba(0,0,0,0.15)',
                }}
              >
                <CertificateOfParticipationCard
                  event={event}
                  participantRecord={previewRecord}
                  primarySignatory={primarySignatory}
                  secondarySignatory={certificateSecondarySignatory}
                  themeUrl={themeUrl}
                  paperSize={paperSize}
                  title={certTitle}
                  bodyText={bodyTextResolved}
                  creditHours={creditHoursNum}
                  includeSignature={includeSignature}
                  showPrcLicenseNo={showPrcLicenseNo}
                  accreditationMode={accreditationMode}
                  prcAccreditationSuffix={prcAccreditationSuffix}
                  signatureAdjustments={signatureAdjustments}
                  signatureSrcOverrides={signatureSrcOverrides}
                  referenceNumber={referenceByPid.get(previewRecord.participant.participant_id) ?? null}
                />
              </div>
              {/* Spacer so the panel scrolls to reveal the full cert */}
              <div style={{ height: Math.round(getCoP_HeightPx(paperSize) * previewScale) }} />
            </div>
          ) : (
            <p className="text-sm text-[#9A9890] mt-16">Select a participant on the left to preview their certificate.</p>
          )}
        </div>
      </div>

      {/* ── Off-screen render farm ── */}
      <div style={{ position: 'fixed', top: -99999, left: -99999, pointerEvents: 'none', zIndex: -1 }}>
        {renderFarm.map(record => {
          const pid = record.participant.participant_id;
          return (
            <div key={pid} ref={el => { renderRefs.current[pid] = el; }} style={{ display: 'inline-block' }}>
              <CertificateOfParticipationCard
                event={event}
                participantRecord={record}
                primarySignatory={primarySignatory}
                secondarySignatory={certificateSecondarySignatory}
                themeUrl={themeUrl}
                paperSize={paperSize}
                title={certTitle}
                bodyText={bodyTextResolved}
                creditHours={creditHoursNum}
                includeSignature={includeSignature}
                showPrcLicenseNo={showPrcLicenseNo}
                accreditationMode={accreditationMode}
                prcAccreditationSuffix={prcAccreditationSuffix}
                signatureAdjustments={signatureAdjustments}
                signatureSrcOverrides={signatureSrcOverrides}
                referenceNumber={referenceByPid.get(record.participant.participant_id) ?? null}
              />
            </div>
          );
        })}
      </div>

      {/* ── Settings Modal ── */}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          themes={themes}
          themeUrl={themeUrl}
          onSelectTheme={setThemeUrl}
          onUploadTheme={handleThemeUpload}
          onDeleteTheme={handleDeleteTheme}
          isUploadingTheme={isUploadingTheme}
          themeError={themeError}
          certTitle={certTitle}
          onSelectTitle={setCertTitle}
          bodyText={bodyText}
          onChangeBodyText={setBodyText}
          creditHours={creditHours}
          onChangeCreditHours={setCreditHours}
          showPrcLicenseNo={showPrcLicenseNo}
          onChangeShowPrcLicenseNo={setShowPrcLicenseNo}
          accreditationMode={accreditationMode}
          onChangeAccreditationMode={setAccreditationMode}
          prcAccreditationSuffix={prcAccreditationSuffix}
          onChangePrcAccreditationSuffix={setPrcAccreditationSuffix}
          paperSize={paperSize}
          onSelectPaperSize={setPaperSize}
          signatories={signatories}
          primarySignatory={primarySignatory}
          secondarySignatory={secondarySignatory}
          onSelectPrimarySignatory={handleSelectPrimarySignatory}
          onSelectSecondarySignatory={handleSelectSecondarySignatory}
          includeSignature={includeSignature}
          onChangeIncludeSignature={setIncludeSignature}
          onSave={handleSaveSignatories}
          isSaving={isSavingSignatories}
        />
      )}

      {/* ── Full Preview Modal ── */}
      {showPreviewModal && previewRecord && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowPreviewModal(false)}>
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowPreviewModal(false)} className="absolute -top-8 right-0 text-white/80 hover:text-white">
              <X size={20} />
            </button>
            <div style={{
              transformOrigin: 'top left',
              transform: `scale(${Math.min(1, (window.innerWidth - 48) / getCoP_WidthPx(paperSize))})`,
              width: getCoP_WidthPx(paperSize),
              height: getCoP_HeightPx(paperSize),
              boxShadow: '0 8px 48px rgba(0,0,0,0.4)',
            }}>
              <CertificateOfParticipationCard
                event={event}
                participantRecord={previewRecord}
                primarySignatory={primarySignatory}
                secondarySignatory={certificateSecondarySignatory}
                themeUrl={themeUrl}
                paperSize={paperSize}
                title={certTitle}
                bodyText={bodyTextResolved}
                creditHours={creditHoursNum}
                includeSignature={includeSignature}
                showPrcLicenseNo={showPrcLicenseNo}
                accreditationMode={accreditationMode}
                prcAccreditationSuffix={prcAccreditationSuffix}
                signatureAdjustments={signatureAdjustments}
                signatureSrcOverrides={signatureSrcOverrides}
                referenceNumber={referenceByPid.get(previewRecord.participant.participant_id) ?? null}
              />
            </div>
          </div>
        </div>
      )}

      <EmailProgressModal isOpen={isSendingEmails} progress={emailProgress} />

      {/* ── Step-by-step tutorial ── */}
      <GuidedTour isOpen={showTutorial} steps={tourSteps} onClose={handleCloseTutorial} />

    </div>
  );
};

export default CertificateOfParticipation;

