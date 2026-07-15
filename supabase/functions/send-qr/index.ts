import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as nodemailer from "npm:nodemailer@6.9.7";

interface SendQrRequest {
  email: string;
  qrBase64: string; // PNG image, base64 without data URL prefix
  participantName: string;
  participantCode?: string;
  eventName?: string;
  eventDate?: string;
  eventVenue?: string;
}

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
    const { email, qrBase64, participantName, participantCode, eventName, eventDate, eventVenue } = await req.json() as SendQrRequest;

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

    // Convert base64 to buffer
    const qrBuffer = new Uint8Array(
      atob(qrBase64)
        .split("")
        .map((c) => c.charCodeAt(0))
    );

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

        <!-- QR Code Block -->
        <div style="text-align: center; margin: 30px 0;">
          <div style="display: inline-block; padding: 16px; border: 2px solid #1e3a8a; border-radius: 12px; background-color: #ffffff;">
            <img src="cid:participant-qr" alt="Participant QR Code" width="220" height="220" style="display: block;" />
          </div>
          ${participantCode ? `<p style="margin: 12px 0 0 0; font-size: 13px; color: #718096; letter-spacing: 2px; font-family: monospace;">${participantCode}</p>` : ""}
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

        <p style="font-size: 14px; color: #718096; margin-bottom: 0;">If you have any questions or the QR code does not display properly, a copy is also attached to this email. You may also reply directly to this email.</p>
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

    // Send email — QR is attached once and referenced inline via cid
    await transporter.sendMail({
      from: emailUser,
      to: email,
      subject: `Your Event QR Code${eventName ? ` - ${eventName}` : ""}`,
      html: htmlBody,
      text: `Dear ${participantName || "Participant"},\n\nYour QR code for ${eventName || "the event"} is attached. Please present it at the registration desk to log your attendance.\n\nBest regards,\nEvent Management Team`,
      attachments: [
        {
          filename: `${(participantName || "participant").replace(/\s+/g, "_")}_QR.png`,
          content: qrBuffer,
          cid: "participant-qr"
        }
      ]
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
