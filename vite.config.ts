import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function smtpApiPlugin() {
  return {
    name: 'smtp-api-plugin',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const url = req.url?.split('?')[0];
        if (url === '/api/test-smtp' || url === '/api/send-report-email' || url === '/api/utang-webhook') {
          const origin = req.headers?.origin || 'http://localhost:3000';
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Vary', 'Origin');
          res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
          if (req.method === 'OPTIONS') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
          }
        }

        if (url === '/api/test-smtp' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            try {
              const { senderEmail, appPassword } = JSON.parse(body || '{}');
              if (!senderEmail || !appPassword) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Gmail address and App Password are required.' }));
                return;
              }
              const nodemailer = await import('nodemailer');
              const transporter = nodemailer.default.createTransport({
                service: 'gmail',
                auth: {
                  user: senderEmail.trim(),
                  pass: appPassword.replace(/\s+/g, ''),
                },
                connectionTimeout: 10000,
                greetingTimeout: 8000,
                socketTimeout: 12000,
              });
              await transporter.verify();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, message: 'SMTP credentials verified successfully!' }));
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ 
                success: false, 
                error: err?.message || 'Failed to authenticate with Gmail SMTP. Please check your App Password.' 
              }));
            }
          });
          return;
        }

        if (url === '/api/send-report-email' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            try {
              const { senderEmail, appPassword, recipientEmail, subject, htmlBody, attachments } = JSON.parse(body || '{}');
              if (!senderEmail || !appPassword || !recipientEmail) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Sender email, App Password, and Recipient email are required.' }));
                return;
              }
              const nodemailer = await import('nodemailer');
              const transporter = nodemailer.default.createTransport({
                service: 'gmail',
                auth: {
                  user: senderEmail.trim(),
                  pass: appPassword.replace(/\s+/g, ''),
                },
                connectionTimeout: 10000,
                greetingTimeout: 8000,
                socketTimeout: 12000,
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
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, messageId: info.messageId }));
            } catch (err: any) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ 
                success: false, 
                error: err?.message || 'Failed to send email. Check your Gmail App Password and network connection.' 
              }));
            }
          });
          return;
        }

        if (url === '/api/update-firebase-rules') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            try {
              const handlerModule = await import('./api/update-firebase-rules.js').catch(() => import('./api/update-firebase-rules.ts' as any));
              const handler = handlerModule.default;
              
              // Mock Vercel response helper
              const mockRes: any = {
                status(code: number) {
                  res.statusCode = code;
                  return this;
                },
                setHeader(name: string, value: string) {
                  res.setHeader(name, value);
                  return this;
                },
                json(data: any) {
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(data));
                  return this;
                },
                end() {
                  res.end();
                  return this;
                }
              };

              const parsedBody = body ? JSON.parse(body) : {};
              await handler({ ...req, body: parsedBody }, mockRes);
            } catch (err: any) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: err?.message || 'Server error' }));
            }
          });
          return;
        }

        if (url === '/api/utang-webhook') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            try {
              const handlerModule = await import('./api/utang-webhook.js').catch(() => import('./api/utang-webhook.ts' as any));
              const handler = handlerModule.default;
              
              const mockRes: any = {
                statusCode: 200,
                status(code: number) {
                  this.statusCode = code;
                  res.statusCode = code;
                  return this;
                },
                setHeader(name: string, value: string) {
                  res.setHeader(name, value);
                  return this;
                },
                json(data: any) {
                  res.statusCode = this.statusCode || 200;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(data));
                  return this;
                },
                end() {
                  res.end();
                  return this;
                }
              };

              const parsedBody = body ? JSON.parse(body) : {};
              await handler({ ...req, body: parsedBody }, mockRes);
            } catch (err: any) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: err?.message || 'Server error' }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      smtpApiPlugin(),
      VitePWA({
        injectRegister: null,
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg'],
        manifest: {
          id: '/',
          name: 'Sari-Sari POS',
          short_name: 'SariSari POS',
          description: 'A standalone, offline-first PWA POS system for Filipino small businesses, featuring product management, transactions, and customer credit ledger.',
          theme_color: '#ea580c',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait-primary',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
          type: 'module',
        },
      }),
    ],
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        '@': path.resolve(__dirname, './src'),
        'next/link': path.resolve(__dirname, './src/lib/router-shim.tsx'),
        'next/navigation': path.resolve(__dirname, './src/lib/router-shim.tsx'),
      },
    },
    optimizeDeps: {
      include: [
        'react',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'react-dom',
        'react-dom/client',
        'motion/react',
        'lucide-react',
        '@upstash/redis',
        'date-fns',
        'papaparse',
        'recharts',
        'clsx',
        'tailwind-merge'
      ],
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      target: 'esnext',
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'vendor-react';
            if (id.includes('node_modules/motion')) return 'vendor-motion';
            if (id.includes('node_modules/recharts')) return 'vendor-charts';
            if (id.includes('node_modules/jspdf') || id.includes('node_modules/html2canvas')) return 'vendor-pdf';
            if (id.includes('node_modules/lucide-react')) return 'vendor-icons';
          },
        },
      },
    },
  };
});
