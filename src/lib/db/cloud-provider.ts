'use client';

import { getConfiguredRtdbUrl } from './firebase-config';

export type CloudProvider = 'firebase' | 'supabase';
export type SupabaseConnectionMode = 'direct' | 'proxy';

const PROVIDER_STORAGE_KEY = 'pos_cloud_provider';
const SUPABASE_URL_STORAGE_KEY = 'pos_supabase_url';
const SUPABASE_ANON_KEY_STORAGE_KEY = 'pos_supabase_anon_key';
const SUPABASE_MODE_STORAGE_KEY = 'pos_supabase_mode';

function cleanStr(raw: unknown): string {
  return String(raw || '')
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .trim();
}

function cleanUrl(raw: unknown): string {
  return cleanStr(raw).replace(/\/$/, '');
}

/**
 * Inspects a JWT (if formatted as 3 dot-separated segments) to prevent
 * accidentally storing a Supabase `service_role` secret in browser storage.
 */
export function isServiceRoleJwt(key: string): boolean {
  const trimmed = cleanStr(key);
  const parts = trimmed.split('.');
  if (parts.length !== 3) return false;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json =
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('utf8');
    const payload = JSON.parse(json);
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

export function getCloudProvider(): CloudProvider {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    const stored = cleanStr(localStorage.getItem(PROVIDER_STORAGE_KEY));
    if (stored === 'supabase') return 'supabase';
    if (stored === 'firebase') return 'firebase';
  }
  const envProvider = cleanStr((import.meta as any).env?.VITE_CLOUD_PROVIDER);
  return envProvider === 'supabase' ? 'supabase' : 'firebase';
}

export function setCloudProvider(provider: CloudProvider): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  localStorage.setItem(PROVIDER_STORAGE_KEY, provider);
  if (provider === 'firebase') {
    localStorage.removeItem('supabase_sync_error');
  } else {
    localStorage.removeItem('firebase_sync_error');
  }
  window.dispatchEvent(
    new CustomEvent('pos_cloud_provider_changed', { detail: { provider } })
  );
}

export function getConfiguredSupabaseUrl(): string {
  const envUrl = cleanUrl((import.meta as any).env?.VITE_SUPABASE_URL || '');
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    const stored = cleanUrl(localStorage.getItem(SUPABASE_URL_STORAGE_KEY) || '');
    if (stored) return stored;
  }
  return envUrl;
}

export function setConfiguredSupabaseUrl(url: string): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  const cleaned = cleanUrl(url);
  if (!cleaned) {
    localStorage.removeItem(SUPABASE_URL_STORAGE_KEY);
  } else {
    localStorage.setItem(SUPABASE_URL_STORAGE_KEY, cleaned);
  }
}

export function getSupabaseAnonKey(): string {
  if (typeof window !== 'undefined') {
    const fromLocal =
      typeof localStorage !== 'undefined'
        ? cleanStr(localStorage.getItem(SUPABASE_ANON_KEY_STORAGE_KEY) || '')
        : '';
    if (fromLocal) return fromLocal;
    const fromSession =
      typeof sessionStorage !== 'undefined'
        ? cleanStr(sessionStorage.getItem(SUPABASE_ANON_KEY_STORAGE_KEY) || '')
        : '';
    if (fromSession) return fromSession;
  }
  return cleanStr(
    (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
      (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
      ''
  );
}

export function setSupabaseAnonKey(key: string): void {
  const cleaned = cleanStr(key);
  if (cleaned && isServiceRoleJwt(cleaned)) {
    throw new Error(
      'Security block: Never enter a Supabase service_role key in the browser. Use your public anon/publishable key or configure SUPABASE_SERVICE_ROLE_KEY on the server for Proxy mode.'
    );
  }
  if (typeof window === 'undefined') return;
  if (!cleaned) {
    localStorage.removeItem(SUPABASE_ANON_KEY_STORAGE_KEY);
    sessionStorage.removeItem(SUPABASE_ANON_KEY_STORAGE_KEY);
  } else {
    localStorage.setItem(SUPABASE_ANON_KEY_STORAGE_KEY, cleaned);
    sessionStorage.setItem(SUPABASE_ANON_KEY_STORAGE_KEY, cleaned);
  }
}

export function getSupabaseMode(): SupabaseConnectionMode {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    const stored = cleanStr(localStorage.getItem(SUPABASE_MODE_STORAGE_KEY));
    if (stored === 'proxy') return 'proxy';
  }
  return 'direct';
}

export function setSupabaseMode(mode: SupabaseConnectionMode): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  localStorage.setItem(SUPABASE_MODE_STORAGE_KEY, mode);
}

export function isCloudSyncConfigured(): boolean {
  const provider = getCloudProvider();
  if (provider === 'supabase') {
    if (getSupabaseMode() === 'proxy') return true;
    return Boolean(getConfiguredSupabaseUrl() && getSupabaseAnonKey());
  }
  return Boolean(getConfiguredRtdbUrl());
}
