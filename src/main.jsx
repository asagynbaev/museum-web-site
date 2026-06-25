import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

// Global styles, loaded once and shared across every component.
import './styles/tokens.css';
import './styles/base.css';
import './styles/animations.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
