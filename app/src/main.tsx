import '@/shared/config/i18n';
import React from 'react';
import ReactDOM from 'react-dom/client';
import Clarity from '@microsoft/clarity';
import App from './app/App';
import './index.css';

// Microsoft Clarity (히트맵·세션 녹화): 프로젝트 ID가 있을 때만 초기화
const clarityId = import.meta.env.VITE_CLARITY_PROJECT_ID;
if (typeof clarityId === 'string' && clarityId.trim()) {
  Clarity.init(clarityId.trim());
}

// PWA Service Worker 등록
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/firebase-messaging-sw.js').catch(() => {});
  });
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <React.Suspense fallback={null}>
      <App />
    </React.Suspense>
  </React.StrictMode>
);
