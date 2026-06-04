
import React from 'react';
import ReactDOM from 'react-dom/client';
import { initSentry } from './lib/sentry';
import App from './App';
import './index.css';

initSentry();
console.log('📍 main.tsx - Starting application');

// StrictMode intentionally double-invokes effects in dev (2x initial API calls).
// That is not a production loop; useOrgUsers + backend GET dedupe handle it safely.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
