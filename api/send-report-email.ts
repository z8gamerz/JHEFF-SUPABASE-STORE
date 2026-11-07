import nodemailer from 'nodemailer';
import { applyCors, requireEnv, requireApiAuth, rateLimit, clampBodySize } from './_security';

function getSmtpAuth(body: any): { user: string; pass: string } | null {
  // Prefer server-configured credentials; fall back to request only when server env is unset.
  const envUser = requireEnv('SMTP_SENDER_EMAIL', 'GMAIL_SENDER_EMAIL');
  const envPass = requireEnv('SMTP_APP_PASSWORD', 'GMAIL_APP_PASSWORD');
  if (envUser && envPass) return { user: envUser.trim(), pass: envPass.replace(/\s+/g, '') };

  const senderEmail = typeof body?.senderEmail === 'string' ? body.senderEmail.trim() : '';
  const appPassword = typeof body?.appPassword === 'string' ? body.appPassword : '';
  if (!senderEmail || !appPassword) return null;
  return { user: senderEmail, pass: appPassword.replace(/\s+/g, '') };
}

async function parseBody(req: any): Promise<any> {
  if (req.body) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }
    return req.body;
  }

  // If stream is still readable and unconsumed
  if (req.readable && !req.complete) {
    return new Promise((resolve) => {
      let data = '';
      const timer = setTimeout(() => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          resolve({});
        }
      }, 1000);

      req.on('data', (chunk: any) => { data += chunk; });
      req.on('end', () => {
        clearTimeout(timer);
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          resolve({});
        }
      });
      req.on('error', () => {
        clearTimeout(timer);
        resolve({});
      });
    });
  }

  return {};
}

export default async function handler(req: any, res: any) {
  if (!applyCors(req, res, 'POST, OPTIONS', 'Content-Type, Authorization, X-POS-API-Key')) return;
  if (req.method === 'OPTIONS') return res.status(200).json({ success: true });
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  if (!rateLimit(req, res, { key: 'send-report-email', limit: 10, windowMs: 60 * 60_000 })) return;
  if (!requireApiAuth(req, res)) return;

  try {
    const body = await parseBody(req);
    if (!clampBodySize(body, 5_000_000)) {
      return res.status(413).json({ success: false, error: 'Request body too large.' });
    }
    const { recipientEmail, subject, htmlBody, attachments } = body || {};
    const auth = getSmtpAuth(body);

    if (!auth || !recipientEmail) {
      return res.status(400).json({
        success: false,
        error: 'SMTP credentials (server env or request) and recipient email are required.'
      });
    }

    const to = String(recipientEmail).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return res.status(400).json({ success: false, error: 'Invalid recipient email.' });
    }
    const safeAttachments = Array.isArray(attachments) ? attachments.slice(0, 10) : [];

    const mailer: any = (nodemailer as any)?.default || nodemailer;
    const createTransport = mailer.createTransport || (nodemailer as any).createTransport;

    const transporter = createTransport({
      service: 'gmail',
      auth,
      connectionTimeout: 10000,
      greetingTimeout: 8000,
      socketTimeout: 12000,
    });

    const mailOptions: any = {
      from: `"POS Report" <${auth.user}>`,
      to,
      subject: String(subject || 'Weekly Business Report').slice(0, 200),
      html: htmlBody,
      attachments: safeAttachments.map((att: any) => ({
        filename: String(att?.filename || 'report.csv').slice(0, 120),
        content: att?.content,
        contentType: att?.contentType || 'text/csv',
      })),
    };

    const info = await transporter.sendMail(mailOptions);
    return res.status(200).json({ success: true, messageId: info.messageId });
  } catch (err: any) {
    console.error('[API Send Report Email Error]:', err?.message || err);
    return res.status(500).json({
      success: false,
      error: 'Failed to send email. Check SMTP configuration and network connection.'
    });
  }
}

