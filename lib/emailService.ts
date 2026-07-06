import { supabase } from './supabase';

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
