import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aria.app',
  appName: 'ARIA',
  webDir: 'frontend/dist',
  backgroundColor: '#09090B',
  android: {
    backgroundColor: '#09090B',
    allowMixedContent: true,
    webContentsDebuggingEnabled: false,
  },
  server: {
    cleartext: true,
  },
};

export default config;
