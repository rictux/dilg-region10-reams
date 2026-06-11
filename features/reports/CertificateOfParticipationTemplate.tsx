import React from 'react';
import { format, parseISO } from 'date-fns';
import { Event, Participant } from '../../types/database';
import { CertificateSignatory } from './CertificateOfAppearanceTemplate';

export type CoPPaperSize = 'A4' | 'A5';

export type CoPParticipantRecord = {
  participant: Participant;
  log_dates: string[];
};

type CoPTemplateProps = {
  event: Event;
  participantRecord: CoPParticipantRecord;
  signatory: CertificateSignatory;
  themeUrl: string | null;
  paperSize: CoPPaperSize;
};

const MM_TO_PX = 3.7795275591;

const CERT_FONT = 'Poppins, sans-serif';

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
    const days = parsed.map(d => format(d, 'd'));
    const last = days.pop()!;
    return `${format(parsed[0], 'MMMM')} ${days.length ? days.join(', ') + ' and ' : ''}${last}, ${format(parsed[0], 'yyyy')}`;
  }

  const sameYear = parsed.every(d => d.getFullYear() === parsed[0].getFullYear());
  if (sameYear) {
    const parts = parsed.map(d => format(d, 'MMMM d'));
    const last = parts.pop()!;
    return `${parts.join(', ')} and ${last}, ${format(parsed[0], 'yyyy')}`;
  }

  const parts = parsed.map(d => format(d, 'MMMM d, yyyy'));
  const last = parts.pop()!;
  return `${parts.join(', ')} and ${last}`;
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

const DEFAULT_HEADER = 'REGION X - NORTHERN MINDANAO';

const CertificateOfParticipationCard: React.FC<CoPTemplateProps> = ({
  event,
  participantRecord,
  signatory,
  themeUrl,
  paperSize,
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
  const dateString      = formatAttendanceDates(logDates);
  const givenDateString = formatGivenDate(logDates, event.end_date || event.start_date);
  const eventName       = event.event_name || '';
  const venue           = event.venue      || '';
  const venuePrep       = /^(via|at|in)\s/i.test(venue.trim()) ? venue.trim() : `at ${venue.trim()}`;

  const logoH    = s(44);
  const subSz    = s(11.5);
  const titleSz  = s(32);
  const presTo   = s(15.6);
  const bodySz   = s(15);
  const sigSz    = s(17.6);
  const sigPosSz = s(13);

  // Auto-shrink name to fit within ~82% of the certificate width on one line
  const fullName      = participantRecord.participant.full_name || '';
  const maxNameWidth  = widthPx * 0.82;
  const baseNameSz    = s(36);
  const minNameSz     = s(18);
  const charWidthCoef = 0.58; // approximate em-ratio for bold Poppins
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

        {/* ── 1. Header: logos + org text ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: s(2) }}>
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
          <p style={{ fontSize: subSz, margin: 0, lineHeight: 1.3, letterSpacing: '0.04em' }}>
            REPUBLIC OF THE PHILIPPINES
          </p>
          <p style={{ fontSize: subSz, fontWeight: 'bold', margin: 0, lineHeight: 1.3, textAlign: 'center', letterSpacing: '0.04em' }}>
            DEPARTMENT OF THE INTERIOR AND LOCAL GOVERNMENT
          </p>
          <p style={{ fontSize: subSz, fontWeight: 'bold', margin: 0, lineHeight: 1.3, letterSpacing: '0.04em' }}>
            {header}
          </p>
          {subHeader && (
            <p style={{ fontSize: subSz, margin: 0, lineHeight: 1.3 }}>{subHeader}</p>
          )}
        </div>

        {/* ── 2. Title + "is presented to" + NAME + body ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: 0 }}>
          <h1 style={{
            fontSize: titleSz,
            fontWeight: 'bold',
            letterSpacing: '0.02em',
            margin: `0 0 ${s(8)}px`,
            lineHeight: 1.05,
            textAlign: 'center',
            whiteSpace: 'nowrap',
          }}>
            CERTIFICATE OF PARTICIPATION
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
            lineHeight: 1.05,
            textAlign: 'center',
            fontFamily: CERT_FONT,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}>
            {participantRecord.participant.full_name}
          </p>

          <div style={{
            width: '85%',
            borderBottom: `${s(1.5)}px solid #111`,
            marginTop: s(5),
            marginBottom: s(8),
          }} />

          <p style={{ fontSize: bodySz, margin: `0 0 ${s(4)}px`, lineHeight: 1.5, textAlign: 'center', width: '88%' }}>
            for having actively participated during the conduct of the{' '}
            <strong>&ldquo;{eventName}&rdquo;</strong>{' '}
            held on {dateString}, {venuePrep}.
          </p>
          <p style={{ fontSize: bodySz, margin: 0, letterSpacing: '0.01em', textAlign: 'center' }}>
            {givenDateString}
          </p>
        </div>

        {/* ── 4. Signatory ── */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
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
