import React from 'react';
import { format, parseISO } from 'date-fns';
import { Event, Participant } from '../../types/database';
import { CertificateSignatory } from './CertificateOfAppearanceTemplate';

export type CoPPaperSize = 'A4' | 'A5';

export type CoPParticipantRecord = {
  participant: Participant;
  log_dates: string[];
};

export type CoPTitle = 'Certificate of Participation' | 'Certificate of Appreciation' | 'Acknowledgement Receipt';

/** Default body section shown before the signatory block. */
export const DEFAULT_COP_BODY_TEXT =
  'for having actively participated during the conduct of the "{EventName}" held on {EventDate}, at {Venue}{CreditPhrase}.\nGiven this {EventDate}';

type CoPTemplateProps = {
  event: Event;
  participantRecord: CoPParticipantRecord;
  signatory: CertificateSignatory;
  themeUrl: string | null;
  paperSize: CoPPaperSize;
  title?: string;
  /** Body section template before the signatory block. */
  bodyText?: string;
  /** When set (> 0), appends "with a credit of <word> (<n>) training hours." to the body. */
  creditHours?: number | null;
};

const MM_TO_PX = 3.7795275591;

// Body copy ("for actively participating …") → Poppins
const CERT_FONT = 'Poppins, sans-serif';
// Header, participant name, signatory name & position → Helvetica
const HELVETICA_FONT = 'Helvetica, "Helvetica Neue", Arial, sans-serif';
// Title ("Certificate of Participation") → bundled Snell Roundhand (see @font-face
// in index.html); Pinyon Script / Apple Chancery are fallbacks.
const SCRIPT_FONT = '"Snell Roundhand", "Pinyon Script", "Apple Chancery", cursive';

export const PAPER_DIMS: Record<CoPPaperSize, {
  widthMm: number;
  heightMm: number;
  pdfWidthPt: number;
  pdfHeightPt: number;
}> = {
  A5: { widthMm: 210, heightMm: 148.5, pdfWidthPt: 595.28, pdfHeightPt: 419.53 },
  A4: { widthMm: 297, heightMm: 210,   pdfWidthPt: 841.89, pdfHeightPt: 595.28 },
};

export const getCoP_WidthPx  = (size: CoPPaperSize) => PAPER_DIMS[size].widthMm  * MM_TO_PX;
export const getCoP_HeightPx = (size: CoPPaperSize) => PAPER_DIMS[size].heightMm * MM_TO_PX;

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

// Spell out a whole number 0–999 (e.g. 4 → "four", 24 → "twenty-four"). Falls back to the digits.
export const numberToWords = (n: number): string => {
  if (!Number.isFinite(n) || n < 0) return String(n);
  const num = Math.floor(n);
  if (num < 20) return ONES[num];
  if (num < 100) {
    const t = TENS[Math.floor(num / 10)];
    const o = num % 10;
    return o ? `${t}-${ONES[o]}` : t;
  }
  if (num < 1000) {
    const h = `${ONES[Math.floor(num / 100)]} hundred`;
    const rest = num % 100;
    return rest ? `${h} ${numberToWords(rest)}` : h;
  }
  return String(num);
};

const getOrdinalSuffix = (n: number) => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
};

export const formatAttendanceDates = (logDates: string[]): string => {
  if (!logDates.length) return '';
  const sorted = [...logDates].sort();
  const parsed = sorted.map(d => parseISO(d));

  if (parsed.length === 1) return format(parsed[0], 'MMMM d, yyyy');

  const sameMonthYear = parsed.every(
    d => d.getMonth() === parsed[0].getMonth() && d.getFullYear() === parsed[0].getFullYear()
  );
  if (sameMonthYear) {
    const first = parsed[0];
    const last = parsed[parsed.length - 1];
    return `${format(first, 'MMMM d')}-${format(last, 'd, yyyy')}`;
  }

  const sameYear = parsed.every(d => d.getFullYear() === parsed[0].getFullYear());
  if (sameYear) {
    const first = parsed[0];
    const last = parsed[parsed.length - 1];
    return `${format(first, 'MMMM d')} - ${format(last, 'MMMM d, yyyy')}`;
  }

  const first = parsed[0];
  const last = parsed[parsed.length - 1];
  return `${format(first, 'MMMM d, yyyy')} - ${format(last, 'MMMM d, yyyy')}`;
};

export const formatGivenDate = (logDates: string[], eventEndDate: string): string => {
  const lastDate = logDates.length ? [...logDates].sort().at(-1)! : eventEndDate;
  try {
    const d = parseISO(lastDate);
    const day = d.getDate();
    return `Given this ${day}${getOrdinalSuffix(day)} day of ${format(d, 'MMMM yyyy')}.`;
  } catch {
    return '';
  }
};

export const formatEventDates = (event: Pick<Event, 'start_date' | 'end_date'>): string => {
  try {
    const start = parseISO(event.start_date);
    const end = event.end_date ? parseISO(event.end_date) : start;
    if (!event.end_date || event.start_date === event.end_date) return format(start, 'MMMM d, yyyy');
    if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
      return `${format(start, 'MMMM d')}-${format(end, 'd, yyyy')}`;
    }
    if (start.getFullYear() === end.getFullYear()) {
      return `${format(start, 'MMMM d')} - ${format(end, 'MMMM d, yyyy')}`;
    }
    return `${format(start, 'MMMM d, yyyy')} - ${format(end, 'MMMM d, yyyy')}`;
  } catch {
    return event.start_date;
  }
};

const DEFAULT_HEADER = 'REGION X - NORTHERN MINDANAO';

const CertificateOfParticipationCard: React.FC<CoPTemplateProps> = ({
  event,
  participantRecord,
  signatory,
  themeUrl,
  paperSize,
  title = 'Certificate of Participation',
  bodyText = DEFAULT_COP_BODY_TEXT,
  creditHours = null,
}) => {
  const dims     = PAPER_DIMS[paperSize];
  const scale    = paperSize === 'A4' ? 1.414 : 1;
  const widthPx  = dims.widthMm  * MM_TO_PX;
  const heightPx = dims.heightMm * MM_TO_PX;

  const s = (base: number) => Math.round(base * scale * 10) / 10;

  const header    = signatory?.header?.trim()         || DEFAULT_HEADER;
  const subHeader = signatory?.sub_header?.trim()      || '';
  const sigName   = signatory?.name?.trim()            || '';
  const sigPos    = signatory?.position?.trim()        || '';
  const postNom   = signatory?.post_nominals?.trim()   || '';

  const logDates        = participantRecord.log_dates;
  const eventName       = event.event_name || '';
  const venue           = event.venue      || '';
  const eventDateString = formatEventDates(event);
  const hasCredit       = typeof creditHours === 'number' && creditHours > 0;
  const creditPhrase    = hasCredit
    ? `with a credit of ${numberToWords(creditHours!)} (${creditHours}) training hour${creditHours === 1 ? '' : 's'}`
    : '';
  const bodyTokens: Record<string, React.ReactNode> = {
    eventName: <strong key="eventName">{eventName}</strong>,
    eventDate: eventDateString,
    venue: venue.trim(),
    creditPhrase,
    givenDate: formatGivenDate(logDates, event.end_date || event.start_date),
  };
  const bodyTemplate = bodyText.trim() || DEFAULT_COP_BODY_TEXT;
  const hasCreditToken = /\{CreditPhrase\}/i.test(bodyTemplate);
  const bodyTemplateNormalized = bodyTemplate
    .replace(/\{Venue\}\s*\{CreditPhrase\}/gi, hasCredit ? '{Venue}, {CreditPhrase}' : '{Venue}')
    .replace(/,\s*\{CreditPhrase\}/gi, hasCredit ? ', {CreditPhrase}' : '')
    .replace(/\s*\{CreditPhrase\}/gi, hasCredit ? ' {CreditPhrase}' : '');
  const bodyTemplateWithCredit = hasCredit && !hasCreditToken
    ? bodyTemplateNormalized.replace(/(\.\s*(?:\n|$))/, `, ${creditPhrase}$1`)
    : bodyTemplateNormalized;
  const bodyParts = bodyTemplateWithCredit
    .split(/(\{[A-Za-z]+\})/g)
    .map((part, index) => {
      const token = part.match(/^\{(.+)\}$/)?.[1];
      const tokenKey = token ? token.charAt(0).toLowerCase() + token.slice(1) : '';
      if (!tokenKey || !(tokenKey in bodyTokens)) return part;
      const value = bodyTokens[tokenKey];
      return React.isValidElement(value) ? React.cloneElement(value, { key: `${token}-${index}` }) : value;
    });

  const logoH    = s(44);
  const subSz    = s(11.5);
  const titleSz  = s(48);
  const presTo   = s(15.6);
  const bodySz   = s(15);
  const sigSz    = s(17.6);
  const sigPosSz = s(13);

  // Auto-shrink name to fit within ~70% of the certificate width on one line
  const fullName      = participantRecord.participant.full_name || '';
  const maxNameWidth  = widthPx * 0.70;
  const baseNameSz    = s(36);
  const minNameSz     = s(18);
  const charWidthCoef = 0.48; // approximate em-ratio for bold Poppins (conservative)
  const nameSz = fullName.length > 0
    ? Math.max(minNameSz, Math.min(baseNameSz, Math.floor(maxNameWidth / (fullName.length * charWidthCoef))))
    : baseNameSz;

  return (
    <div
      style={{
        position: 'relative',
        width: widthPx,
        height: heightPx,
        overflow: 'hidden',
        backgroundColor: '#ffffff',
        fontFamily: CERT_FONT,
        boxSizing: 'border-box',
      }}
    >
      {/* Background theme image */}
      {themeUrl && (
        <img
          src={themeUrl}
          alt=""
          crossOrigin="anonymous"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            zIndex: 0,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* ── Main content overlay ── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${s(55)}px ${s(28)}px ${s(48)}px`,
          boxSizing: 'border-box',
        }}
      >

        {/* ── 1. Header: logos + org text (Helvetica) ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: s(2), fontFamily: HELVETICA_FONT }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: s(10), marginBottom: s(2) }}>
            <img
              src="/assets/dilg_logo.png"
              alt="DILG"
              style={{ height: logoH, width: logoH, objectFit: 'contain' }}
            />
            <img
              src="/assets/bagong_pilipinas_logo.png"
              alt="Bagong Pilipinas"
              style={{ height: logoH, objectFit: 'contain' }}
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
          <p style={{ fontSize: subSz, margin: 0, lineHeight: 1.3, letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textAlign: 'center' }}>
            REPUBLIC OF THE PHILIPPINES
          </p>
          <p style={{ fontSize: subSz, fontWeight: 'bold', margin: 0, lineHeight: 1.3, textAlign: 'center', letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden' }}>
            DEPARTMENT OF THE INTERIOR AND LOCAL GOVERNMENT
          </p>
          <p style={{ fontSize: subSz, fontWeight: 'bold', margin: 0, lineHeight: 1.3, letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden' }}>
            {header}
          </p>
          {subHeader && (
            <p style={{ fontSize: subSz, margin: 0, lineHeight: 1.3 }}>{subHeader}</p>
          )}
        </div>

        {/* ── 2. Title + "is presented to" + NAME + body ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: 0 }}>
          <h1 style={{
            fontFamily: SCRIPT_FONT,
            fontSize: titleSz,
            fontWeight: 'normal',
            letterSpacing: '0.01em',
            margin: `0 0 ${s(8)}px`,
            lineHeight: 1.1,
            textAlign: 'center',
            whiteSpace: 'nowrap',
          }}>
            {title}
          </h1>

          <p style={{
            fontSize: presTo,
            fontStyle: 'italic',
            margin: `0 0 ${s(6)}px`,
            letterSpacing: '0.06em',
            lineHeight: 1,
          }}>
            is &nbsp; presented &nbsp; to
          </p>

          <p style={{
            fontSize: nameSz,
            fontWeight: 'bold',
            margin: 0,
            marginBottom: s(3),
            lineHeight: 1.2,
            textAlign: 'center',
            fontFamily: HELVETICA_FONT,
            whiteSpace: 'nowrap',
            textTransform: 'uppercase',
            paddingLeft: s(4),
            paddingRight: s(4),
            display: 'block',
          }}>
            {participantRecord.participant.full_name}
          </p>

          <div style={{
            width: '85%',
            borderBottom: `${s(1.5)}px solid #111`,
            marginTop: s(1),
            marginBottom: s(8),
          }} />

          <p style={{ fontSize: bodySz, margin: 0, lineHeight: 1.5, textAlign: 'center', width: '88%', fontFamily: CERT_FONT, whiteSpace: 'pre-wrap' }}>
            {bodyParts}
          </p>
        </div>

        {/* ── 4. Signatory (Helvetica) ── */}
        <div style={{ display: 'flex', justifyContent: 'center', fontFamily: HELVETICA_FONT }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {signatory?.esig_link ? (
              <img
                src={signatory.esig_link}
                alt="E-Signature"
                crossOrigin="anonymous"
                referrerPolicy="no-referrer"
                style={{
                  height: s(40),
                  objectFit: 'contain',
                  marginBottom: s(2),
                  pointerEvents: 'none',
                }}
              />
            ) : (
              <div style={{ height: s(40), marginBottom: s(2) }} />
            )}
            <p style={{
              fontSize: sigSz,
              fontWeight: 'bold',
              textDecoration: 'underline',
              textTransform: 'uppercase',
              margin: 0,
              textAlign: 'center',
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
            }}>
              {sigName}
              {postNom && (
                <span style={{ fontWeight: 'normal', textDecoration: 'none', textTransform: 'none', fontStyle: 'italic' }}>
                  , {postNom}
                </span>
              )}
            </p>
            <p style={{ fontSize: sigPosSz, margin: `${s(1.5)}px 0 0`, textAlign: 'center', letterSpacing: '0.02em' }}>
              {sigPos}
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default CertificateOfParticipationCard;
