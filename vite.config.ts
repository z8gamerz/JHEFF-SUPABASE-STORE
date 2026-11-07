import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { config as loadDotenv } from 'dotenv';

function smtpApiPlugin() {
  return {
    name: 'smtp-api-plugin',
    configureServer(server: any) {
      // Load server env for local API handlers (Vercel injects env in production).
      try { loadDotenv({ path: path.resolve(process.cwd(), '.env') }); } catch {}
      try { loadDotenv({ path: path.resolve(process.cwd(), '.env.local'), override: true }); } catch {}

      const createMockRes = (res: any) => {
        const mock: any = {
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
          end(data?: any) {
            if (data !== undefined) res.end(data);
            else res.end();
            return this;
          },
        };
        return mock;
      };

      const delegate = async (modulePath: string, req: any, res: any, body: string) => {
        const mod = await server.ssrLoadModule(modulePath);
        const handler = mod?.default;
        if (typeof handler !== 'function') throw new Error(`No default handler: ${modulePath}`);
        const parsedBody = body ? JSON.parse(body) : {};
        await handler({ ...req, body: parsedBody, query: req.query || {} }, createMockRes(res));
      };

      server.middlewares.use(async (req: any, res: any, next: any) => {
        const url = (req.url || '').split('?')[0];
        const isApi =
          url === '/api/test-smtp' ||
          url === '/api/send-report-email' ||
          url === '/api/update-firebase-rules' ||
          url === '/api/utang-webhook';
        if (!isApi) return next();

        if (req.method === 'OPTIONS') {
          // Let handlers apply CORS; minimal fallback.
          const origin = req.headers?.origin || '';
          if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-POS-API-Key');
          res.setHeader('Vary', 'Origin');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
          return;
        }

        let body = '';
        req.on('data', (chunk: any) => { body += chunk; });
        req.on('end', async () => {
          try {
            if (url === '/api/test-smtp') return await delegate('/api/test-smtp.ts', req, res, body);
            if (url === '/api/send-report-email') return await delegate('/api/send-report-email.ts', req, res, body);
            if (url === '/api/update-firebase-rules') return await delegate('/api/update-firebase-rules.ts', req, res, body);
            if (url === '/api/utang-webhook') return await delegate('/api/utang-webhook.ts', req, res, body);
            next();
          } catch (err: any) {
            console.error('[vite api plugin]', err);
            if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err?.message || 'Server error' }));
          }
        });
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
