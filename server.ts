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
app.set('trust proxy', 1);

// Global security headers for CDN, proxy, and browser defense-in-depth
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Lightweight load-balancer & container health probe endpoints
app.get(['/healthz', '/api/health'], (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    status: 'healthy',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: Date.now(),
  });
});

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
    immutable: true,
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

app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server Error]:', err?.message || 'Unexpected error');
  if (res.headersSent) return;
  if (req.path.startsWith('/api/')) {
    res.status(500).json({ success: false, error: 'Internal server error.' });
    return;
  }
  res.status(500).send('Internal Server Error');
});

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';

const server = app.listen(port, host, () => {
  console.log(`Sari-Sari POS production server listening on http://${host}:${port}`);
});

function gracefulShutdown(signal: string) {
  console.log(`[Server] Received ${signal}, shutting down gracefully...`);
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('unhandledRejection', (reason: any) => {
  console.error('[Server UnhandledRejection]:', reason?.message || reason);
});
