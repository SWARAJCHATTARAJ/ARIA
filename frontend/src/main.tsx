import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ui/ErrorBoundary';
import './styles/index.css';
import 'katex/dist/katex.min.css';
import { registerSW } from 'virtual:pwa-register';

// Do not register the Workbox PWA service worker when running inside Capacitor or Tauri,
// so native .apk and .exe apps never serve stale cached bundles after an update.
const isNativePlatform =
  typeof window !== 'undefined' &&
  Boolean(
    (window as any).__TAURI__ ||
    (window as any).__TAURI_INTERNALS__ ||
    (window as any).Capacitor?.isNativePlatform?.() ||
    import.meta.env.VITE_BUILD_TARGET === 'native'
  );

if (!isNativePlatform && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  registerSW({
    immediate: true,
  });
} else if (isNativePlatform && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  // Actively unregister any legacy service workers that may have been cached
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
    }
  }).catch(() => {});
}

// Initialize motion scale for slow motion captures (?slow=1 sets --motion-scale: 5)
if (typeof window !== 'undefined') {
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.get('slow') === '1' || searchParams.get('slow') === 'true') {
    document.documentElement.style.setProperty('--motion-scale', '5');
  } else {
    document.documentElement.style.setProperty('--motion-scale', '1');
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary surface="Application">
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
