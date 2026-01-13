import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './app/App';
import * as Sentry from '@sentry/react';
import './sentry';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<h1>Something went wrong</h1>}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>
);
