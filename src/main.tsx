import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { DemoSmsProvider } from './context/DemoSmsContext';
import { SelectionProvider } from './context/SelectionContext';
import './styles/global.css';

// Tier 1 Google Maps Platform quota & auth failure listener (registered before React render)
(window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};

const origConsoleError = console.error;
console.error = (...args: unknown[]) => {
  origConsoleError.apply(console, args);
  const msg = args.map((a) => String(a)).join(' ');
  if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
};

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <HashRouter>
      <SelectionProvider>
        <DemoSmsProvider>
          <App />
        </DemoSmsProvider>
      </SelectionProvider>
    </HashRouter>
  </React.StrictMode>,
);
