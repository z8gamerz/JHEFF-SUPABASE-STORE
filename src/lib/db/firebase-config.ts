'use client';

const RTDB_URL_STORAGE_KEY = 'pos_firebase_rtdb_url';

function cleanUrl(raw: string): string {
  return String(raw || '')
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .trim()
    .replace(/\/$/, '');
}

export function getConfiguredRtdbUrl(): string {
  const envUrl = cleanUrl((import.meta as any).env?.VITE_FIREBASE_RTDB_URL || '');
  if (envUrl) return envUrl;
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    const stored = cleanUrl(localStorage.getItem(RTDB_URL_STORAGE_KEY) || '');
    if (stored) return stored;
  }
  return '';
}

export function setConfiguredRtdbUrl(url: string): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  const cleaned = cleanUrl(url);
  if (!cleaned) {
    localStorage.removeItem(RTDB_URL_STORAGE_KEY);
  } else {
    localStorage.setItem(RTDB_URL_STORAGE_KEY, cleaned);
  }
}

export function getFirebaseAuthToken(): string {
  if (typeof window === 'undefined') return '';
  const fromLocal =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('pos_firebase_auth_token') || localStorage.getItem('firebase_database_secret') || ''
      : '';
  const fromSession =
    typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem('pos_firebase_auth_token') || ''
      : '';
  return (
    fromLocal ||
    fromSession ||
    (import.meta as any).env?.VITE_FIREBASE_AUTH_TOKEN ||
    ''
  ).trim();
}

export function getFirebaseConsoleUrl(section: 'rules' | 'secrets' = 'rules'): string {
  const rtdbUrl = getConfiguredRtdbUrl();
  if (rtdbUrl) {
    try {
      const host = new URL(rtdbUrl).hostname;
      const projectMatch = host.match(/^([a-z0-9-]+?)(?:-default-rtdb)?\.(?:[a-z0-9-]+\.)?(?:firebasedatabase\.app|firebaseio\.com)$/i);
      if (projectMatch?.[1]) {
        const projectId = projectMatch[1];
        return section === 'secrets'
          ? `https://console.firebase.google.com/project/${projectId}/settings/serviceaccounts/databasesecrets`
          : `https://console.firebase.google.com/project/${projectId}/database/realtime-database/rules`;
      }
    } catch {}
  }
  return 'https://console.firebase.google.com/';
}
