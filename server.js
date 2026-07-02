import express from 'express';
import nodemailer from 'nodemailer';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb' }));

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
  console.warn('⚠️  WARNING: EMAIL_USER or EMAIL_PASSWORD not set in .env');
  console.warn('Email functionality will not work until credentials are configured.');
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Email server is running' });
});

app.post('/api/send-certificate', async (req, res) => {
  try {
    const { email, pdfBase64, fileName, participantName } = req.body;

    if (!email || !pdfBase64 || !fileName) {
      return res.status(400).json({
        error: 'Missing required fields',
        received: { email: !!email, pdfBase64: !!pdfBase64, fileName: !!fileName }
      });
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      return res.status(500).json({
        error: 'Email credentials not configured',
        details: 'EMAIL_USER and EMAIL_PASSWORD must be set in .env file'
      });
    }

    const pdfBuffer = Buffer.from(pdfBase64, 'base64');

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Your Certificate of Appearance - ${participantName || 'Event'}`,
      text: `Dear ${participantName || 'Participant'},\n\nPlease find your Certificate of Appearance attached.\n\nBest regards,\nEvent Management Team`,
      attachments: [
        {
          filename: fileName,
          content: pdfBuffer
        }
      ]
    };

    await transporter.sendMail(mailOptions);

    console.log(`✓ Email sent to ${email}`);
    res.json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    console.error('✗ Error sending email:', error);
    res.status(500).json({
      error: 'Failed to send email',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n📧 Email server running on http://localhost:${PORT}`);
  console.log(`✓ Health check: http://localhost:${PORT}/health\n`);
});
