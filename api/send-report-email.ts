import nodemailer from 'nodemailer';

export default async function handler(req: any, res: any) {
  // CORS & Preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid JSON request body.' });
      }
    } else if (!body) {
      const raw = await new Promise<string>((resolve, reject) => {
        let data = '';
        req.on('data', (chunk: any) => { data += chunk; });
        req.on('end', () => resolve(data));
        req.on('error', reject);
      });
      body = raw ? JSON.parse(raw) : {};
    }

    const { senderEmail, appPassword, recipientEmail, subject, htmlBody, attachments } = body || {};

    if (!senderEmail || !appPassword || !recipientEmail) {
      return res.status(400).json({
        success: false,
        error: 'Sender email, Google App Password, and Recipient email are required.'
      });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: senderEmail.trim(),
        pass: appPassword.replace(/\s+/g, ''),
      },
    });

    const mailOptions: any = {
      from: `"${senderEmail}" <${senderEmail.trim()}>`,
      to: recipientEmail.trim(),
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
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to send email. Please check your Gmail App Password and network connection.'
    });
  }
}
