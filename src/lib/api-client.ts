const STORAGE_KEY = 'pos_api_key';

export function getPosApiKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(STORAGE_KEY) || '';
}

export function setPosApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  if (!key) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, key.trim());
}

export function apiHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra || {});
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const key = getPosApiKey();
  if (key) headers.set('X-POS-API-Key', key);
  return headers;
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: apiHeaders(init.headers),
  });
}
