import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Initialize motion scale for slow motion captures (?slow=1 sets --motion-scale: 5)
if (typeof window !== 'undefined') {
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.get('slow') === '1' || searchParams.get('slow') === 'true') {
    document.documentElement.style.setProperty('--motion-scale', '5');
  } else {
    document.documentElement.style.setProperty('--motion-scale', '1');
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
