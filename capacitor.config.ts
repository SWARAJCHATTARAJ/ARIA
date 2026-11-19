import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aria.app',
  appName: 'ARIA',
  webDir: 'frontend/dist',
  backgroundColor: '#050811',
  android: {
    backgroundColor: '#050811',
    allowMixedContent: true,
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: 'https',
    cleartext: true,
    allowNavigation: [
      'aria.swarajchattaraj.tech',
      '*.supabase.co',
      'github.com',
      '*.github.com',
      'api.github.com',
    ],
  },
};

export default config;
