import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'child_process';

const isNativeBuild = process.env.VITE_BUILD_TARGET === 'native' || process.env.BUILD_TARGET === 'native';

let commitHash = 'dev';
try {
  commitHash = execSync('git rev-parse --short HEAD').toString().trim();
} catch {
  commitHash = process.env.GITHUB_SHA ? process.env.GITHUB_SHA.substring(0, 7) : '2.0.0';
}
const buildDate = new Date().toISOString().split('T')[0];

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('2.0.0'),
    __BUILD_HASH__: JSON.stringify(commitHash || '2.0.0'),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
  plugins: [
    react(),
    VitePWA({
      disable: isNativeBuild,
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'apple-touch-icon-180x180.png',
        'aria-icon.svg',
        'aria-logo.svg',
        'pwa-64x64.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'maskable-icon-512x512.png'
      ],
      manifest: {
        id: '/',
        name: 'ARIA v2 — Autonomous Research & Intelligence Assistant',
        short_name: 'ARIA v2',
        description: 'Autonomous Research & Intelligence Assistant',
        theme_color: '#09090B',
        background_color: '#09090B',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png'
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: []
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) return 'vendor-react';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('@supabase')) return 'vendor-supabase';
          }
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
});
