import { Capacitor } from '@capacitor/core';

export const FALLBACK_PRODUCTION_API = 'https://20.196.152.197.sslip.io';

function resolveApiBaseUrl(): string {
  const envUrl = (
    (import.meta.env.VITE_API_URL as string | undefined) ||
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
    ''
  ).trim();

  // If explicitly configured to a real non-Vercel backend URL, honor it
  if (
    envUrl &&
    !envUrl.startsWith('/') &&
    !envUrl.includes('aria.swarajchattaraj.tech') &&
    !envUrl.includes('vercel.app')
  ) {
    if (Capacitor.isNativePlatform()) {
      if (!envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
        return envUrl;
      }
    } else {
      return envUrl;
    }
  }

  // Direct Azure VM Caddy HTTPS origin bypasses Vercel proxy entirely across Web, Android, and Windows
  return FALLBACK_PRODUCTION_API;
}

export const API_BASE_URL: string = resolveApiBaseUrl();
