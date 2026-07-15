import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as nodemailer from "npm:nodemailer@6.9.7";

interface SendQrRequest {
  email: string;
  qrBase64: string; // PNG image, base64 without data URL prefix
  badgeBase64?: string; // Full badge PNG (QR + name/position/office), base64 without data URL prefix
  participantName: string;
  participantPosition?: string;
  participantOffice?: string;
  eventName?: string;
  eventDate?: string;
  eventVenue?: string;
}

const base64ToBytes = (base64: string): Uint8Array =>
  new Uint8Array(
    atob(base64)
      .split("")
      .map((c) => c.charCodeAt(0))
  );

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const { email, qrBase64, badgeBase64, participantName, participantPosition, participantOffice, eventName, eventDate, eventVenue } = await req.json() as SendQrRequest;

    // Validate required fields
    if (!email || !qrBase64) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields",
          received: { email: !!email, qrBase64: !!qrBase64 }
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // Get email credentials from environment
    const emailUser = Deno.env.get("EMAIL_USER");
    const emailPassword = Deno.env.get("EMAIL_PASSWORD");

    if (!emailUser || !emailPassword) {
      return new Response(
        JSON.stringify({
          error: "Email credentials not configured",
          details: "EMAIL_USER and EMAIL_PASSWORD must be set in Supabase secrets"
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // Create email transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: emailUser,
        pass: emailPassword
      }
    });

    // Convert base64 payloads to buffers
    const qrBuffer = base64ToBytes(qrBase64);
    const badgeBuffer = badgeBase64 ? base64ToBytes(badgeBase64) : null;

    // Build HTML email body with the QR embedded inline via cid
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333333; line-height: 1.6;">
  <div style="background-color: #f8f9fa; padding: 40px 20px;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); border: 1px solid #e9ecef;">

      <!-- Header Banner -->
      <div style="background-color: #1e3a8a; padding: 30px; text-align: center;">
        <h2 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 600; letter-spacing: 0.5px;">Your Event QR Code</h2>
      </div>

      <!-- Email Content Body -->
      <div style="padding: 40px 30px;">
        <p style="margin-top: 0; font-size: 16px;">Dear <strong>${participantName || "Participant"}</strong>,</p>

        <p style="font-size: 15px; color: #4a5568;">You are registered for the event below. Please present this QR code at the registration/attendance desk to log your attendance. You may show it on your phone or print this email.</p>

        <!-- Participant Badge Block (mirrors the downloadable badge design) -->
        <div style="text-align: center; margin: 30px 0;">
          <div style="display: inline-block; padding: 32px; background-color: #ffffff; text-align: center;">
            <div style="display: inline-block; padding: 12px; border: 4px solid #111110; border-radius: 12px; background-color: #ffffff;">
              <img src="cid:participant-qr" alt="Participant QR Code" width="200" height="200" style="display: block;" />
            </div>
            <h2 style="margin: 24px 0 0 0; font-size: 20px; font-weight: bold; color: #111110;">${participantName || "Participant"}</h2>
            ${participantPosition ? `<p style="margin: 2px 0 0 0; font-size: 16px; font-weight: 500; color: #4B3FE4;">${participantPosition}</p>` : ""}
            ${participantOffice ? `<p style="margin: 4px 0 0 0; font-size: 14px; color: #6B6860;">${participantOffice}</p>` : ""}
          </div>
        </div>

        <!-- Event Details Card Block -->
        <div style="background-color: #f1f5f9; border-left: 4px solid #1e3a8a; padding: 20px; margin: 25px 0; border-radius: 0 6px 6px 0;">
          <h4 style="margin: 0 0 10px 0; color: #1e3a8a; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Event Information</h4>
          <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
            <tr>
              <td style="padding: 4px 0; color: #718096; width: 80px; font-weight: 500;">Event:</td>
              <td style="padding: 4px 0; color: #1a202c; font-weight: bold;">${eventName || "N/A"}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #718096; font-weight: 500;">Date:</td>
              <td style="padding: 4px 0; color: #1a202c;">${eventDate || "N/A"}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #718096; font-weight: 500;">Venue:</td>
              <td style="padding: 4px 0; color: #1a202c;">${eventVenue || "N/A"}</td>
            </tr>
          </table>
        </div>

        <p style="font-size: 14px; color: #718096; margin-bottom: 0;">If you have any questions or the QR code does not display properly, your participant badge is also attached to this email. You may also reply directly to this email.</p>
      </div>

      <!-- Footer -->
      <div style="background-color: #fafafa; padding: 20px 30px; text-align: center; border-top: 1px solid #edf2f7; font-size: 13px; color: #a0aec0;">
        <p style="margin: 0; font-weight: 500;">Best regards,</p>
        <p style="margin: 5px 0 0 0; color: #4a5568; font-weight: bold;">The Event Management Team</p>
        <p style="margin: 15px 0 0 0; font-size: 11px; color: #cbd5e0;">This is an automated system notification.</p>
      </div>

    </div>
  </div>
</body>
</html>
    `;

    // Send email — QR is attached once and referenced inline via cid;
    // the full badge image is attached separately when provided.
    const safeName = (participantName || "participant").replace(/\s+/g, "_");
    const attachments: Array<{ filename: string; content: Uint8Array; cid?: string }> = [
      {
        filename: `${safeName}_QR.png`,
        content: qrBuffer,
        cid: "participant-qr"
      }
    ];
    if (badgeBuffer) {
      attachments.push({
        filename: `${safeName}_Badge.png`,
        content: badgeBuffer
      });
    }

    await transporter.sendMail({
      from: emailUser,
      to: email,
      subject: `Your Event QR Code${eventName ? ` - ${eventName}` : ""}`,
      html: htmlBody,
      text: `Dear ${participantName || "Participant"},\n\nYour QR code for ${eventName || "the event"} is attached${badgeBuffer ? " along with your participant badge" : ""}. Please present it at the registration desk to log your attendance.\n\nBest regards,\nEvent Management Team`,
      attachments
    });

    return new Response(
      JSON.stringify({ success: true, message: "Email sent successfully" }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  } catch (error) {
    console.error("Error sending email:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to send email",
        details: error instanceof Error ? error.message : String(error)
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
});
