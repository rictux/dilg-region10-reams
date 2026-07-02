# Email Sending Setup Guide

## Certificates with Email Support

### ✅ Certificate of Appearance
- **Status:** Fully implemented
- **File:** `features/reports/CertificateOfAppearancePrint.tsx`
- **How it works:**
  - Click "Email" button next to Save/Print
  - Generates PDF and sends to participant email
  - Skips automatically if no email address

### ⚙️ Certificate of Participation
- **Status:** Ready to add
- **File:** `features/reports/CertificateOfParticipation.tsx`

## Adding Email to Certificate of Participation

To add email functionality to Certificate of Participation, follow the same pattern as Certificate of Appearance:

### 1. **Add Imports** (at the top of CertificateOfParticipation.tsx)
```typescript
import { Mail } from 'lucide-react';  // Add to existing lucide-react import
import { sendCertificateEmail } from '../../lib/emailService';
import { toast } from 'sonner';
```

### 2. **Add State Variables**
```typescript
const [isSendingEmails, setIsSendingEmails] = useState(false);
const [emailProgress, setEmailProgress] = useState<{ done: number; total: number } | null>(null);
```

### 3. **Add Email Handler Function**
```typescript
const handleEmailCertificates = async () => {
  if (selectedIds.length === 0 || !previewRecord) return;
  
  setIsSendingEmails(true);
  setEmailProgress({ done: 0, total: selectedIds.length });

  try {
    const selectedRecords = participants.filter(r => 
      selectedIds.includes(r.participant.participant_id)
    );

    for (const participantRecord of selectedRecords) {
      if (!participantRecord.participant.email) {
        setEmailProgress(prev => prev ? { ...prev, done: prev.done + 1 } : null);
        continue;
      }

      try {
        const node = document.getElementById(`cert-${participantRecord.participant.participant_id}`);
        if (!node) continue;

        const jpegBlob = await toJpeg(node, {
          cacheBust: true,
          backgroundColor: '#ffffff',
          pixelRatio: PIXEL_RATIO,
          quality: JPEG_QUALITY
        });
        
        const jpegBlobObj = new Blob([jpegBlob], { type: 'image/jpeg' });
        const pdfBlob = await createPdfBlob(jpegBlobObj, paperSize);
        
        const fileName = `${sanitize(participantRecord.participant.full_name || 'Certificate')}_CoP.pdf`;

        const result = await sendCertificateEmail(
          participantRecord.participant.email,
          pdfBlob,
          fileName,
          participantRecord.participant.full_name || 'Participant'
        );

        if (result.success) {
          toast.success(`Email sent to ${participantRecord.participant.email}`);
        } else {
          toast.error(`Failed to send email to ${participantRecord.participant.email}`);
        }
      } catch (error) {
        console.error('Error processing email:', error);
        toast.error(`Error processing certificate`);
      }

      setEmailProgress(prev => prev ? { ...prev, done: prev.done + 1 } : null);
    }
  } catch (error) {
    console.error('Error sending certificates:', error);
    toast.error('Unable to send certificates right now.');
  } finally {
    setIsSendingEmails(false);
    setEmailProgress(null);
  }
};
```

### 4. **Add Email Button in UI**
Add next to the existing Download/Print buttons:
```jsx
<button
  onClick={handleEmailCertificates}
  disabled={selectedIds.length === 0 || isSendingEmails}
  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
>
  <Mail size={14} />
  {isSendingEmails
    ? emailProgress
      ? `Sending ${emailProgress.done}/${emailProgress.total}...`
      : 'Sending...'
    : 'Email'}
</button>
```

## Supabase Edge Function Deployment

### Prerequisites
- Supabase CLI installed
- Logged in: `supabase login`
- Project linked: `supabase link`

### Deploy the function
```bash
# Set email credentials
supabase secrets set EMAIL_USER=dilg10.events@gmail.com
supabase secrets set EMAIL_PASSWORD="qzdn vioa ngiz tavg"

# Deploy the function
supabase functions deploy send-certificate
```

### Verify deployment
- Check Supabase Dashboard → Edge Functions
- Should show `send-certificate` as deployed

## Testing

1. **Ensure both servers running:**
   - Frontend: `npm run dev`
   - No separate backend needed (using Supabase Edge Functions)

2. **Test email sending:**
   - Certificate of Appearance: Click "Email" button
   - Should send PDF to participant's email

3. **Check email credentials:**
   - Verify `.env` has correct `EMAIL_USER` and `EMAIL_PASSWORD`
   - Gmail requires App Password (not regular password)

## Troubleshooting

| Error | Solution |
|-------|----------|
| "404 Not Found" | Edge Function not deployed. Run `supabase functions deploy send-certificate` |
| "Email credentials not configured" | Set secrets: `supabase secrets set EMAIL_USER=...` |
| Email goes to spam | Ensure Gmail App Password is used (not regular password) |
| Participant email blank | Add email to participant profile |

## Notes

- Emails are sent asynchronously via Supabase Edge Functions
- PDFs are converted to base64 for transmission (max 50MB request size)
- Progress shown via toast notifications
- Both certificate types use same `sendCertificateEmail` function
