import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js', { scope: './' })
      .then(reg => {
        console.log('[SW] Online:', reg.scope);
        // Force update check on every load
        reg.update();
      })
      .catch(err => console.warn('[SW] Offline support disabled:', err.message));
  });
}

// Boot-time Cache Pruning
const pruneOldCaches = async () => {
    try {
        const activeCache = 'sarai-os-v11';
        const keys = await caches.keys();
        for (const key of keys) {
            if (key !== activeCache) {
                console.log('[System] Pruning legacy cache:', key);
                await caches.delete(key);
            }
        }
    } catch (e) {
        console.error("Cache prune failed", e);
    }
};
pruneOldCaches();

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
  </React.StrictMode>
);