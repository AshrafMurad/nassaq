import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import './i18n';
import { App } from './app/App';
import { AppProviders } from './app/providers';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root is missing');
}

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
);
