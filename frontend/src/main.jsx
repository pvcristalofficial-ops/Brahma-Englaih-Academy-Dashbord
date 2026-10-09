import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth';
import { ToastProvider } from './components/Toast';
import './styles.css';

try {
  const t = localStorage.getItem('bea.theme');
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
} catch { /* storage blocked */ }

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </HashRouter>
  </React.StrictMode>
);
