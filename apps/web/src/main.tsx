import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useRegisterSW } from 'virtual:pwa-register/react';
import './styles.css';
import './components.css';
import { App } from './app';

let pwaUpdateTimer: number | undefined;
let pwaVisibilityHandler: (() => void) | undefined;

function PwaUpdatePrompt() {
  const locale = window.localStorage.getItem('hal-locale') === 'en' ? 'en' : 'cs';
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW({
    onRegisteredSW(_serviceWorkerUrl, registration) {
      if (!registration) return;
      void registration.update();
      if (pwaUpdateTimer) window.clearInterval(pwaUpdateTimer);
      pwaUpdateTimer = window.setInterval(() => void registration.update(), 60 * 60_000);
      if (pwaVisibilityHandler) document.removeEventListener('visibilitychange', pwaVisibilityHandler);
      pwaVisibilityHandler = () => { if (document.visibilityState === 'visible') void registration.update(); };
      document.addEventListener('visibilitychange', pwaVisibilityHandler);
    }
  });

  if (!needRefresh) return null;
  return <aside className="pwa-update" role="status" aria-live="polite">
    <span className="pwa-update-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7v5h-5"/><path d="M19 12a7 7 0 1 0-2 5"/></svg>
    </span>
    <div>
      <strong>{locale === 'cs' ? 'Nová verze je připravena' : 'A new version is ready'}</strong>
      <small>{locale === 'cs' ? 'Aktualizace proběhne bez odhlášení.' : 'Update without signing out.'}</small>
    </div>
    <button type="button" onClick={() => void updateServiceWorker(true)}>{locale === 'cs' ? 'Aktualizovat nyní' : 'Update now'}</button>
    <button type="button" className="pwa-update-close" onClick={() => setNeedRefresh(false)} aria-label={locale === 'cs' ? 'Skrýt upozornění' : 'Dismiss notification'}>×</button>
  </aside>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /><PwaUpdatePrompt /></StrictMode>);
