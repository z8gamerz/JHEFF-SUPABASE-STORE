import fs from 'fs';
import path from 'path';

function patchFile(filePath, search, replacement) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(search)) {
    const updated = content.replace(search, replacement);
    fs.writeFileSync(filePath, updated, 'utf8');
    console.log(`[patch] Patched ${filePath}`);
  } else {
    console.log(`[patch] Already patched or pattern not found in ${filePath}`);
  }
}

// 1. Patch Vite client.mjs
const viteClientPath = path.resolve('node_modules/vite/dist/client/client.mjs');
patchFile(
  viteClientPath,
  'ws.send(JSON.stringify(data));',
  'if (typeof ws !== "undefined" && ws && ws.readyState === 1) { ws.send(JSON.stringify(data)); }'
);

// 2. Patch vite-plugin-pwa chunks
const pwaFiles = [
  'node_modules/vite-plugin-pwa/dist/chunk-I2Z7IWCN.js',
  'node_modules/vite-plugin-pwa/dist/index.cjs',
  'node_modules/vite-plugin-pwa/dist/index.js'
];

pwaFiles.forEach((rel) => {
  const p = path.resolve(rel);
  patchFile(
    p,
    "import.meta.hot.send('${DEV_READY_NAME}');",
    "try { import.meta.hot?.send?.('${DEV_READY_NAME}')?.catch?.(() => {}); } catch (e) {}"
  );
});

console.log('[patch] Patch complete.');
