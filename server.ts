import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dispatchApiHandler } from './api/_adapter.ts';
import qstashHandler from './api/qstash.ts';
import utangWebhookHandler from './api/utang-webhook.ts';
import testSmtpHandler from './api/test-smtp.ts';
import sendReportEmailHandler from './api/send-report-email.ts';
import updateFirebaseRulesHandler from './api/update-firebase-rules.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, 'dist');

const app = express();
app.disable('x-powered-by');

// Mount API routes directly BEFORE express.static so raw request streams
// pass cleanly through each handler's applyApiGuards & parseJsonBody limits.
app.all('/api/qstash', (req, res) => {
  void dispatchApiHandler(qstashHandler, req, res);
});
app.all('/api/utang-webhook', (req, res) => {
  void dispatchApiHandler(utangWebhookHandler, req, res);
});
app.all('/api/test-smtp', (req, res) => {
  void dispatchApiHandler(testSmtpHandler, req, res);
});
app.all('/api/send-report-email', (req, res) => {
  void dispatchApiHandler(sendReportEmailHandler, req, res);
});
app.all('/api/update-firebase-rules', (req, res) => {
  void dispatchApiHandler(updateFirebaseRulesHandler, req, res);
});

app.use('/api', (_req, res) => {
  res.status(404).json({ success: false, error: 'API route not found.' });
});

app.use(
  express.static(distDir, {
    index: false,
    maxAge: '1y',
    setHeaders(res, filePath) {
      if (
        filePath.endsWith('index.html') ||
        filePath.endsWith('sw.js') ||
        filePath.endsWith('registerSW.js') ||
        filePath.endsWith('manifest.webmanifest')
      ) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    },
  })
);

app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(distDir, 'index.html'));
});

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';

app.listen(port, host, () => {
  console.log(`Sari-Sari POS production server listening on http://${host}:${port}`);
});
