import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { TicketPage } from './components/TicketPage.jsx';
import { LanguageProvider } from './i18n/LanguageProvider.jsx';

// Global styles, loaded once and shared across every component.
import './styles/tokens.css';
import './styles/base.css';
import './styles/animations.css';

// Единственный «маршрут» на сайте — проверка билета по QR из письма.
// Роутер ради одного адреса тащить незачем: хватает разбора pathname.
const ticketCode = /^\/ticket\/([A-Za-z0-9-]{1,32})\/?$/.exec(window.location.pathname)?.[1];

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      {ticketCode ? <TicketPage code={ticketCode.toUpperCase()} /> : <App />}
    </LanguageProvider>
  </React.StrictMode>
);
