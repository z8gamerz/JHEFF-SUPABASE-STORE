import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { initErrorTracker } from './lib/utils/error-tracker';
import App from './App.tsx';
import './index.css';

// Initialize global runtime error & survival tracking
initErrorTracker();

// Automatically register PWA service worker with auto-update
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
