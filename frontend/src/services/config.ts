import { Capacitor } from '@capacitor/core';

export const FALLBACK_PRODUCTION_API = 'https://aria.swarajchattaraj.tech';

function resolveApiBaseUrl(): string {
  const envUrl = (
    (import.meta.env.VITE_API_URL as string | undefined) ||
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
    ''
  ).trim();

  if (Capacitor.isNativePlatform()) {
    // On native mobile devices, localhost or relative paths point to the device loopback and will fail
    if (!envUrl || envUrl.startsWith('/') || envUrl.includes('localhost') || envUrl.includes('127.0.0.1')) {
      return FALLBACK_PRODUCTION_API;
    }
    return envUrl;
  }

  return envUrl || FALLBACK_PRODUCTION_API;
}

export const API_BASE_URL: string = resolveApiBaseUrl();
