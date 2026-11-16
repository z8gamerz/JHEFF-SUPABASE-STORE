const STORAGE_KEY = 'pos_api_key';

export function getPosApiKey(): string {
  if (typeof window === 'undefined') {
    return (typeof process !== 'undefined' ? process.env?.VITE_POS_API_KEY : '') || '';
  }
  const stored =
    localStorage.getItem(STORAGE_KEY) ||
    sessionStorage.getItem(STORAGE_KEY) ||
    ((import.meta as any).env?.VITE_POS_API_KEY as string | undefined) ||
    '';
  return stored.trim();
}

export function setPosApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = key.trim();
  if (!trimmed) {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, trimmed);
    sessionStorage.setItem(STORAGE_KEY, trimmed);
  }
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
