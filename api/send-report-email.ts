import nodemailer from 'nodemailer';
import { applyApiGuards, parseJsonBody, requireEnv } from './_security.js';

export default async function handler(req: any, res: any) {
  if (
    !applyApiGuards(req, res, {
      methods: 'POST, OPTIONS',
      rateKey: 'send-report-email',
      rateLimitMax: 10,
      maxBodyBytes: 2 * 1024 * 1024,
      requireAuth: true,
    })
  ) {
    return;
  }

  const parsed = await parseJsonBody(req, 2 * 1024 * 1024);
  if (!parsed.ok) {
    return res.status(parsed.status).json({ success: false, error: parsed.error });
  }

  try {
    const body = parsed.body;
    const senderEmail = (body?.senderEmail || requireEnv('SMTP_SENDER_EMAIL', 'GMAIL_USER')).trim();
    const appPassword = (body?.appPassword || requireEnv('SMTP_APP_PASSWORD', 'GMAIL_APP_PASSWORD')).replace(/\s+/g, '');
    const recipientEmail = (body?.recipientEmail || requireEnv('DEFAULT_REPORT_RECIPIENT')).trim();
    const { subject, htmlBody, attachments } = body || {};

    if (!senderEmail || !appPassword || !recipientEmail) {
      return res.status(400).json({
        success: false,
        error: 'Sender email, Google App Password, and Recipient email are required.',
      });
    }

    const mailer: any = (nodemailer as any)?.default || nodemailer;
    const createTransport = mailer.createTransport || (nodemailer as any).createTransport;

    const transporter = createTransport({
      service: 'gmail',
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: senderEmail,
        pass: appPassword,
      },
      connectionTimeout: 10000,
      greetingTimeout: 8000,
      socketTimeout: 12000,
    });

    const mailOptions: any = {
      from: `"${senderEmail}" <${senderEmail}>`,
      to: recipientEmail,
      subject: subject || 'Weekly Business Report',
      html: htmlBody,
      attachments: (Array.isArray(attachments) ? attachments : []).map((att: any) => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType || 'text/csv',
      })),
    };

    const info = await transporter.sendMail(mailOptions);
    return res.status(200).json({ success: true, messageId: info.messageId });
  } catch (err: any) {
    console.error('[API Send Report Email Error]:', err?.message || err);
    const rawMsg = String(err?.message || '');
    const isAuthFailure =
      rawMsg.includes('535') ||
      rawMsg.includes('BadCredentials') ||
      rawMsg.includes('Username and Password not accepted');

    return res.status(500).json({
      success: false,
      error: isAuthFailure
        ? 'Hindi tinanggap ng Gmail ang credentials (535 Bad Credentials). Pakisuri ang 16-character Google App Password.'
        : 'Failed to send email. Please check your Gmail App Password and network connection.',
    });
  }
}
