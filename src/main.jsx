import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { AdminPage } from './components/AdminPage.jsx';
import { TicketPage } from './components/TicketPage.jsx';
import { LanguageProvider } from './i18n/LanguageProvider.jsx';

// Global styles, loaded once and shared across every component.
import './styles/tokens.css';
import './styles/base.css';
import './styles/animations.css';

// Маршрутов на сайте всего два — проверка билета по QR из письма и служебная
// касса. Роутер ради них тащить незачем: хватает разбора pathname.
const path = window.location.pathname;
const ticketCode = /^\/ticket\/([A-Za-z0-9-]{1,32})\/?$/.exec(path)?.[1];
const isAdmin = /^\/admin\/?$/.test(path);

function Route() {
  if (ticketCode) return <TicketPage code={ticketCode.toUpperCase()} />;
  if (isAdmin) return <AdminPage />;
  return <App />;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <Route />
    </LanguageProvider>
  </React.StrictMode>
);
