import nodemailer from 'nodemailer';

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
  // CORS & Preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const body = await parseBody(req);
    const senderEmail = (body?.senderEmail || process.env.SMTP_SENDER_EMAIL || process.env.GMAIL_USER || '').trim();
    const appPassword = (body?.appPassword || process.env.SMTP_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
    const recipientEmail = (body?.recipientEmail || process.env.DEFAULT_REPORT_RECIPIENT || '').trim();
    const { subject, htmlBody, attachments } = body || {};

    if (!senderEmail || !appPassword || !recipientEmail) {
      return res.status(400).json({
        success: false,
        error: 'Sender email, Google App Password, and Recipient email are required.'
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
      attachments: (attachments || []).map((att: any) => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType || 'text/csv',
      })),
    };

    const info = await transporter.sendMail(mailOptions);
    return res.status(200).json({ success: true, messageId: info.messageId });
  } catch (err: any) {
    console.error('[API Send Report Email Error]:', err);
    let errorDetail = err?.message || 'Failed to send email. Please check your Gmail App Password and network connection.';
    if (errorDetail.includes('535') || errorDetail.includes('BadCredentials') || errorDetail.includes('Username and Password not accepted')) {
      errorDetail = 'Hindi tinanggap ng Gmail ang credentials (535 Bad Credentials). Pakisuri ang 16-character Google App Password.';
    }
    return res.status(500).json({
      success: false,
      error: errorDetail
    });
  }
}

