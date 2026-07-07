import React from 'react';
import QRCode from 'react-qr-code';
import { differenceInCalendarDays, eachDayOfInterval, format, parseISO } from 'date-fns';
import { Event, Participant } from '../../types/database';

export type CertificateTemplateVariant = 'with_serial' | 'without_serial';

export const DEFAULT_CERTIFICATE_TEMPLATE_VARIANT: CertificateTemplateVariant = 'with_serial';

export type CertificateParticipantRecord = {
  participant: Participant;
  needs_accommodation: boolean;
  date_accommodation: string[];
  log_dates: string[];
};

export type CertificateSignatory = {
  id?: number;
  label?: string | null;
  name: string;
  position: string;
  esig_link: string;
  header?: string | null;
  sub_header?: string | null;
  address?: string | null;
  website?: string | null;
  footer?: string | null;
  post_nominals?: string | null;
  certificate_template_variant?: CertificateTemplateVariant | null;
  is_default?: boolean | null;
} | null;

type CertificateCardProps = {
  event: Event;
  participantRecord: CertificateParticipantRecord;
  signatory: CertificateSignatory;
  dateString: string;
  eventFoodInclusionMap: Record<string, string[]>;
  certificateSerialNumber?: string | null;
  templateVariant?: CertificateTemplateVariant | null;
  showDivider?: boolean;
};

type CertificateLayoutMode = 'default' | 'dense' | 'compact' | 'ultraCompact';

export const resolveCertificateTemplateVariant = (
  variant?: string | null
): CertificateTemplateVariant =>
  variant === 'without_serial' ? 'without_serial' : DEFAULT_CERTIFICATE_TEMPLATE_VARIANT;

export const getEventDateRows = (selectedEvent: Event) => {
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

export const buildEventDateString = (event: Event) => {
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

const getParticipantDateRows = (selectedEvent: Event, participantRecord: CertificateParticipantRecord) => {
  const logDateSet = new Set(participantRecord.log_dates);
  return getEventDateRows(selectedEvent).filter((row) => logDateSet.has(row.key));
};

const getCertificateLayoutMode = (tableRowCount: number): CertificateLayoutMode => {
  if (tableRowCount >= 7) return 'ultraCompact';
  if (tableRowCount >= 6) return 'compact';
  if (tableRowCount >= 5) return 'dense';
  return 'default';
};

const formatFoodInclusion = (meals: string[]) => {
  return meals.length > 0 ? meals.join(', ') : '-';
};

type CertificateTableRow = {
  key: string;
  label: string;
  meals: string[];
  hasAccommodation: boolean;
};

// Enumerates grouped dates, e.g. "June 22, 23, 24, and 25, 2026"; the month is
// repeated only when it changes (e.g. "June 29, 30, and July 1, 2026").
const formatDateListLabel = (keys: string[]) => {
  const dates = keys.map((key) => parseISO(key));
  const parts = dates.map((date, index) => {
    const previous = dates[index - 1];
    const monthChanged =
      !previous ||
      date.getMonth() !== previous.getMonth() ||
      date.getFullYear() !== previous.getFullYear();
    return monthChanged ? format(date, 'MMMM d') : format(date, 'd');
  });
  const list =
    parts.length === 2
      ? `${parts[0]} and ${parts[1]}`
      : `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
  return `${list}, ${format(dates[dates.length - 1], 'yyyy')}`;
};

const buildCertificateTableRows = (
  event: Event,
  participantRecord: CertificateParticipantRecord,
  eventFoodInclusionMap: Record<string, string[]>,
  eventAccommodationDates: Set<string>
): CertificateTableRow[] => {
  const baseRows: CertificateTableRow[] = getParticipantDateRows(event, participantRecord).map((row) => ({
    key: row.key,
    label: row.label,
    meals: eventFoodInclusionMap[row.key] || [],
    hasAccommodation:
      participantRecord.needs_accommodation &&
      participantRecord.date_accommodation
        .filter((date) => eventAccommodationDates.has(date))
        .includes(row.key)
  }));

  // Keep one row per day for short tables; only collapse when the table would
  // otherwise crowd the certificate (more than 3 rows).
  if (baseRows.length <= 3) return baseRows;

  const groups: CertificateTableRow[][] = [];
  baseRows.forEach((row) => {
    const currentGroup = groups[groups.length - 1];
    const previousRow = currentGroup?.[currentGroup.length - 1];
    const isConsecutiveDay =
      !!previousRow && differenceInCalendarDays(parseISO(row.key), parseISO(previousRow.key)) === 1;
    const hasSameInclusions =
      !!previousRow &&
      previousRow.meals.join('|') === row.meals.join('|') &&
      previousRow.hasAccommodation === row.hasAccommodation;

    if (previousRow && isConsecutiveDay && hasSameInclusions) {
      currentGroup.push(row);
    } else {
      groups.push([row]);
    }
  });

  return groups.map((group) => {
    const first = group[0];
    if (group.length === 1) return first;
    const last = group[group.length - 1];
    return {
      ...first,
      key: `${first.key}_${last.key}`,
      label: formatDateListLabel(group.map((row) => row.key))
    };
  });
};

const DEFAULT_CERTIFICATE_HEADER = 'REGION X - NORTHERN MINDANAO';

const CertificateOfAppearanceCard: React.FC<CertificateCardProps> = ({
  event,
  participantRecord,
  signatory,
  dateString,
  eventFoodInclusionMap,
  certificateSerialNumber,
  templateVariant,
  showDivider = false
}) => {
  const eventAccommodationDates = new Set(getEventAccommodationDates(event));
  const tableRows = buildCertificateTableRows(event, participantRecord, eventFoodInclusionMap, eventAccommodationDates);
  const tableRowCount = tableRows.length + 1;
  const layoutMode = getCertificateLayoutMode(tableRowCount);
  const isDenseLayout = layoutMode !== 'default';
  const isCompactLayout = layoutMode === 'compact' || layoutMode === 'ultraCompact';
  const isUltraCompactLayout = layoutMode === 'ultraCompact';
  const selectedTemplateVariant = resolveCertificateTemplateVariant(templateVariant ?? signatory?.certificate_template_variant);
  const shouldShowSerialNumber = selectedTemplateVariant === 'with_serial' && !!certificateSerialNumber;
  const certificateHeader = signatory?.header?.trim() || DEFAULT_CERTIFICATE_HEADER;
  const certificateSubHeader = signatory?.sub_header?.trim() || '';
  const certificateAddress = signatory?.address?.trim() || '';
  const certificateWebsite = signatory?.website?.trim() || '';
  const certificateFooter = signatory?.footer?.trim() || '';
  const signatoryName = signatory?.name?.trim() || 'CORAZON S. VICENTE';
  const signatoryPostNominals = signatory?.post_nominals?.trim() || '';
  const cardPaddingClass = isUltraCompactLayout
    ? 'px-5 pt-2 pb-3'
    : isCompactLayout
      ? 'px-6 pt-2.5 pb-3.5'
      : isDenseLayout
        ? 'px-7 pt-3 pb-4.5'
        : 'px-8 pt-4 pb-5';
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
  const subHeaderClass = isUltraCompactLayout
    ? 'text-[10px] mt-1 mb-0.5'
    : isCompactLayout
      ? 'text-[11px] mt-1.5 mb-0.5'
      : isDenseLayout
        ? 'text-[12px] mt-2 mb-1'
        : 'text-[13px] mt-2.5 mb-1';
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
  const supportingTextClass = isUltraCompactLayout
    ? 'text-[10px] leading-tight mb-0.5 px-1'
    : isCompactLayout
      ? 'text-[10px] leading-tight mb-0.5 px-2'
      : isDenseLayout
        ? 'text-[11px] leading-snug mb-1 px-3'
        : 'text-[12px] leading-snug mb-1.5 px-4';
  const tableAreaClass = 'flex min-h-0 flex-1 flex-col';
  const preTableSpacerClass = isUltraCompactLayout
    ? 'min-h-0'
    : isCompactLayout
      ? 'min-h-0'
      : isDenseLayout
        ? 'min-h-0'
        : 'min-h-0';
  const postTableSpacerClass = isUltraCompactLayout
    ? 'min-h-[0.5mm] flex-[0.04]'
    : isCompactLayout
      ? 'min-h-[1mm] flex-[0.08]'
      : isDenseLayout
        ? 'min-h-[1.5mm] flex-[0.14]'
        : 'min-h-[3mm] flex-[0.24]';
  const paragraphIndentClass = isUltraCompactLayout ? 'ml-4' : 'ml-8';
  const participantNameClass = isUltraCompactLayout
    ? 'inline-block border-b border-black font-bold px-1.5 mx-1 min-w-[160px] text-center'
    : 'inline-block border-b border-black font-bold px-2 mx-1 min-w-[200px] text-center';
  const officeClass = isUltraCompactLayout
    ? 'inline-block border-b border-black font-bold px-1.5 mx-1 min-w-[120px] text-center'
    : 'inline-block border-b border-black font-bold px-2 mx-1 min-w-[150px] text-center';
  const tableWrapperClass = isUltraCompactLayout ? '' : isCompactLayout ? '' : isDenseLayout ? '' : '';
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
  const bottomSectionClass = isUltraCompactLayout ? 'pt-0.5 gap-1' : isCompactLayout ? 'pt-0.5 gap-1.5' : isDenseLayout ? 'pt-1 gap-2' : 'pt-1.5 gap-2';
  const signatoryWrapperClass = isUltraCompactLayout ? 'pt-0' : isCompactLayout ? 'pt-0.5' : isDenseLayout ? 'pt-1' : 'pt-1.5';
  const signatureImageClass = isUltraCompactLayout ? 'bottom-4 h-10' : isCompactLayout ? 'bottom-5 h-12' : isDenseLayout ? 'bottom-5 h-14' : 'bottom-6 h-16';
  const signatoryNameClass = isUltraCompactLayout ? 'text-[11px]' : isCompactLayout ? 'text-[12px]' : 'text-[14px]';
  const signatoryPositionClass = isUltraCompactLayout ? 'text-[10px]' : isCompactLayout ? 'text-[11px]' : isDenseLayout ? 'text-[12px]' : 'text-[13px]';
  const footerClass = isUltraCompactLayout ? 'text-[6px]' : isCompactLayout ? 'text-[7px]' : isDenseLayout ? 'text-[8px]' : 'text-[9px]';
  const disclaimerClass = isUltraCompactLayout ? 'text-[5px]' : isCompactLayout ? 'text-[6px]' : isDenseLayout ? 'text-[7px]' : 'text-[8px]';
  const footerImageClass = isUltraCompactLayout ? 'mb-0.5 h-3.5' : isCompactLayout ? 'mb-0.5 h-5' : isDenseLayout ? 'mb-0.5 h-6' : 'mb-1 h-7';

  return (
    <div
      className={`relative box-border flex h-[148.5mm] w-full flex-col overflow-hidden bg-white ${cardPaddingClass}`}
    >
      <div className="relative flex flex-1 flex-col justify-start">
        {shouldShowSerialNumber && (
          <p
            className={`absolute right-0 top-0 text-right font-medium text-[#2A2926] ${serialTextClass}`}
          >
            {certificateSerialNumber}
          </p>
        )}

        <div className={`absolute right-0 flex flex-col items-center text-center ${qrWrapperClass}`}>
          <QRCode
            value={`${window.location.origin}/lookup?participant=${participantRecord.participant.participant_id}`}
            size={qrSize}
          />
          <p className={`font-medium text-[#4A4843] leading-tight ${qrCaptionClass}`}>
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
          <p className={`${headerMediumTextClass} font-bold font-serif leading-tight`}>{certificateHeader}</p>
          {certificateAddress && (
            <p className={`${headerSmallTextClass} font-serif leading-tight`}>{certificateAddress}</p>
          )}
          {certificateWebsite && (
            <p className={`${headerSmallTextClass} font-serif text-blue-600 underline leading-tight`}>{certificateWebsite}</p>
          )}
        </div>

        {certificateSubHeader && (
          <p className={`${subHeaderClass} text-center font-serif font-bold uppercase tracking-[0.08em] text-[#2A2926]`}>
            {certificateSubHeader}
          </p>
        )}

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
          <span>at {event.venue}.</span>
        </div>

        <div className={`${supportingTextClass} text-justify font-serif`}>
          <span className={paragraphIndentClass}>It is further certified that during the stay of the above-mentioned individual, this office provided the following:</span>
        </div>

        <div className={tableAreaClass}>
          <div className={preTableSpacerClass} />

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
                {tableRows.map((row) => (
                  <tr key={`${participantRecord.participant.participant_id}-${row.key}`}>
                    <td className={`${tableBodyPaddingClass} border border-black ${tableCellPaddingClass} text-center align-top`}>
                      {row.label}
                    </td>
                    <td className={`${tableBodyPaddingClass} border border-black ${tableCellPaddingClass} text-center align-top`}>
                      {formatFoodInclusion(row.meals)}
                    </td>
                    {participantRecord.needs_accommodation && (
                      <td className={`${tableBodyPaddingClass} border border-black ${tableCellPaddingClass} text-center align-top`}>
                        {row.hasAccommodation ? 'Provided' : '-'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={postTableSpacerClass} />
        </div>

        <div className={`shrink-0 flex flex-col items-center text-center font-serif ${bottomSectionClass}`}>
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
              <p className={`${signatoryNameClass} relative z-10`}>
                <span className="font-bold uppercase">{signatoryName}</span>
                {signatoryPostNominals && (
                  <span className="ml-1 font-normal normal-case italic">, {signatoryPostNominals}</span>
                )}
              </p>
              <p className={`${signatoryPositionClass} relative z-10`}>{signatory?.position || 'Division Chief, LGMED'}</p>
            </div>
          </div>

          <div className={`${footerClass} shrink-0 text-center text-[#2A2926] leading-tight`}>
            <img
              src="/assets/intensity.png"
              alt="Intensity tagline"
              className={`mx-auto object-contain ${footerImageClass}`}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            <p className="italic font-bold">"Matino, Mahusay at Maasahan"</p>
            <p>{certificateFooter}</p>
          </div>
          <p className={`${disclaimerClass} w-full mt-1 italic text-[#7C7A72] text-left leading-tight`}>
            This document is system-generated and digitally signed. It does not require a wet signature or the Department's official stamp to be considered valid.
          </p>
        </div>
      </div>

      {showDivider && (
        <div className="absolute bottom-0 left-8 right-8 border-b border-dashed border-[#C5C2BA] print:border-[#9A9890]"></div>
      )}
    </div>
  );
};

export default CertificateOfAppearanceCard;
