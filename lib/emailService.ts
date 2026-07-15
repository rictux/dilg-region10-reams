import { supabase } from './supabase';
import QRCodeLib from 'qrcode';

export const logCertificateEmailSent = async (
  participantId: number,
  certificateType: 'CA' | 'CoP',
  eventId: number
) => {
  try {
    const columnName = certificateType === 'CA' ? 'ca_email_sent_at' : 'cop_email_sent_at';
    const { error } = await supabase
      .from('event_participants')
      .update({ [columnName]: new Date().toISOString() })
      .eq('event_id', eventId)
      .eq('participant_id', participantId);

    if (error) {
      console.error(`Failed to log email send for participant ${participantId}:`, error);
    }
  } catch (error) {
    console.error('Error logging email send:', error);
  }
};

export const sendCertificateEmail = async (
  email: string,
  pdfBlob: Blob,
  fileName: string,
  participantName: string,
  participantId?: number,
  certificateType?: 'CA' | 'CoP',
  eventName?: string,
  eventDate?: string,
  eventVenue?: string,
  eventId?: number
): Promise<{ success: boolean; error?: string }> => {
  try {
    const pdfBase64 = await blobToBase64(pdfBlob);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const functionUrl = `${supabaseUrl}/functions/v1/send-certificate`;

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        pdfBase64,
        fileName,
        participantName,
        eventName,
        eventDate,
        eventVenue,
        certificateType
      })
    });

    if (!response.ok) {
      try {
        const errorData = await response.json();
        return {
          success: false,
          error: errorData.error || errorData.details || 'Failed to send email'
        };
      } catch {
        return {
          success: false,
          error: `Server error: ${response.status} ${response.statusText}`
        };
      }
    }

    const data = await response.json();

    // Log the email send if participant ID, certificate type, and event ID provided
    if (participantId && certificateType && eventId) {
      await logCertificateEmailSent(participantId, certificateType, eventId);
    }

    return { success: true };
  } catch (error) {
    console.error('Error sending certificate email:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      success: false,
      error: errorMsg
    };
  }
};

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

// Renders the participant badge (QR in a black rounded border with the name,
// position, and office below) to a PNG data URL, mirroring the downloadable
// badge in the participant modal. Drawn at 2x the modal's dimensions.
const generateBadgePngDataUrl = async (
  qrPngDataUrl: string,
  fullName: string,
  position?: string,
  office?: string
): Promise<string> => {
  const qrImage = await loadImage(qrPngDataUrl);

  const qrSize = 320;
  const boxBorder = 8;
  const boxPadding = 24;
  const boxRadius = 24;
  const boxSize = qrSize + 2 * (boxPadding + boxBorder);
  const outerPadding = 64;
  const gapBelowBox = 48;

  const nameFont = 'bold 40px Helvetica, Arial, sans-serif';
  const positionFont = '500 32px Helvetica, Arial, sans-serif';
  const officeFont = '28px Helvetica, Arial, sans-serif';

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');

  const measure = (text: string, font: string) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  };

  const contentWidth = Math.max(
    boxSize,
    measure(fullName, nameFont),
    position ? measure(position, positionFont) : 0,
    office ? measure(office, officeFont) : 0
  );

  canvas.width = Math.ceil(contentWidth + 2 * outerPadding);
  canvas.height =
    outerPadding + boxSize + gapBelowBox +
    52 + (position ? 44 : 0) + (office ? 40 : 0) +
    outerPadding;

  // Resizing the canvas resets the context state, so styles are set from here on.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const boxX = (canvas.width - boxSize) / 2;
  const boxY = outerPadding;
  ctx.strokeStyle = '#111110';
  ctx.lineWidth = boxBorder;
  ctx.beginPath();
  ctx.roundRect(boxX + boxBorder / 2, boxY + boxBorder / 2, boxSize - boxBorder, boxSize - boxBorder, boxRadius);
  ctx.stroke();
  ctx.drawImage(qrImage, boxX + boxBorder + boxPadding, boxY + boxBorder + boxPadding, qrSize, qrSize);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  let textY = boxY + boxSize + gapBelowBox;
  ctx.fillStyle = '#111110';
  ctx.font = nameFont;
  ctx.fillText(fullName, canvas.width / 2, textY);
  textY += 52;
  if (position) {
    ctx.fillStyle = '#4B3FE4';
    ctx.font = positionFont;
    ctx.fillText(position, canvas.width / 2, textY);
    textY += 44;
  }
  if (office) {
    ctx.fillStyle = '#6B6860';
    ctx.font = officeFont;
    ctx.fillText(office, canvas.width / 2, textY);
  }

  return canvas.toDataURL('image/png');
};

export const logQrEmailSent = async (participantId: number, eventId: number) => {
  try {
    const { error } = await supabase
      .from('event_participants')
      .update({ qr_email_sent_at: new Date().toISOString() })
      .eq('event_id', eventId)
      .eq('participant_id', participantId);

    if (error) {
      console.error(`Failed to log QR email send for participant ${participantId}:`, error);
    }
  } catch (error) {
    console.error('Error logging QR email send:', error);
  }
};

export const sendQrEmail = async (
  email: string,
  qrPngDataUrl: string,
  participantName: string,
  participantId?: number,
  eventId?: number,
  eventName?: string,
  eventDate?: string,
  eventVenue?: string,
  participantPosition?: string,
  participantOffice?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Strip the "data:image/png;base64," prefix
    const qrBase64 = qrPngDataUrl.split(',')[1];

    // Compose the badge image attached to the email. If rendering fails
    // (e.g. canvas unavailable), still send the email with just the QR.
    let badgeBase64: string | undefined;
    try {
      const badgeDataUrl = await generateBadgePngDataUrl(
        qrPngDataUrl,
        participantName,
        participantPosition,
        participantOffice
      );
      badgeBase64 = badgeDataUrl.split(',')[1];
    } catch (badgeError) {
      console.error('Failed to render badge image, sending QR only:', badgeError);
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const functionUrl = `${supabaseUrl}/functions/v1/send-qr`;

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        qrBase64,
        badgeBase64,
        participantName,
        participantPosition,
        participantOffice,
        eventName,
        eventDate,
        eventVenue
      })
    });

    if (!response.ok) {
      try {
        const errorData = await response.json();
        return {
          success: false,
          error: errorData.error || errorData.details || 'Failed to send email'
        };
      } catch {
        return {
          success: false,
          error: `Server error: ${response.status} ${response.statusText}`
        };
      }
    }

    await response.json();

    // Log the email send if participant ID and event ID provided
    if (participantId && eventId) {
      await logQrEmailSent(participantId, eventId);
    }

    return { success: true };
  } catch (error) {
    console.error('Error sending QR email:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      success: false,
      error: errorMsg
    };
  }
};

// Fetches the participant's details, generates their QR code as a PNG, and emails it.
// Returns skipped: true when the participant has no email address on record.
export const sendParticipantQrById = async (
  participantId: number,
  event: { event_id: number; event_name: string; title?: string | null; venue?: string | null },
  eventDateLabel?: string
): Promise<{ success: boolean; skipped?: boolean; error?: string }> => {
  try {
    const { data: participant, error } = await supabase
      .from('participants')
      .select('participant_id, full_name, email, participant_code, position, office')
      .eq('participant_id', participantId)
      .single();

    if (error || !participant) {
      return { success: false, error: 'Participant not found' };
    }

    if (!participant.email) {
      return { success: false, skipped: true, error: 'No email address on record' };
    }

    // Generate the QR as a PNG data URL (email clients don't render SVG)
    const qrPngDataUrl = await QRCodeLib.toDataURL(participant.participant_code, {
      width: 440,
      margin: 2,
      errorCorrectionLevel: 'H'
    });

    return await sendQrEmail(
      participant.email,
      qrPngDataUrl,
      participant.full_name,
      participant.participant_id,
      event.event_id,
      event.title || event.event_name,
      eventDateLabel,
      event.venue || undefined,
      participant.position || undefined,
      participant.office || undefined
    );
  } catch (error) {
    console.error('Error sending participant QR email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
};

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      resolve(base64.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
