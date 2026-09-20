import '@/shared/config/i18n';
import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'sonner';
import { QueryClientProvider } from '@tanstack/react-query';
import Clarity from '@microsoft/clarity';
import './index.css';
import LandingPage from './pages/LandingPage';
import { queryClient } from '@/shared/api/query-client';
import { trackEvent, trackScreen } from '@/shared/config/analytics';

// Microsoft Clarity (랜딩 우선): 히트맵·세션 녹화
const clarityId = import.meta.env.VITE_CLARITY_PROJECT_ID;
if (typeof clarityId === 'string' && clarityId.trim()) {
  Clarity.init(clarityId.trim());
}

const root = document.getElementById('root');

if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <React.Suspense fallback={null}>
          <Toaster position="bottom-center" richColors closeButton offset="12px" />
          <LandingPage />
        </React.Suspense>
      </QueryClientProvider>
    </React.StrictMode>
  );
}

/**
 * 랜딩 페이지 전용 GA 이벤트: 화면 뷰, 스크롤 깊이, 클릭(이탈/로그인 유도) 추적
 */
function useLandingAnalytics() {
  // 랜딩 진입 시 screen_view 1회
  useEffect(() => {
    trackScreen('landing', 'LandingPage');
  }, []);

  // 스크롤 깊이: 25%, 50%, 75%, 100% 도달 시 각 1회
  useEffect(() => {
    const reached = new Set<number>();
    const thresholds = [25, 50, 75, 100];

    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max <= 0) return;
      const pct = Math.round((window.scrollY / max) * 100);
      thresholds.forEach((t) => {
        if (pct >= t && !reached.has(t)) {
          reached.add(t);
          trackEvent('landing_scroll', { depth: t });
        }
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // 클릭 위임: data-landing-action 또는 href 기반으로 landing_click 전송
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a');
      const button = target.closest('button');
      const el = link ?? button;
      if (!el) return;

      const action =
        el.getAttribute('data-landing-action') ||
        (link?.getAttribute('href') === '/app' ? 'get_started' : null) ||
        (link?.getAttribute('href')?.startsWith('#') ? 'nav_section' : null);
      const destination = link?.getAttribute('href') ?? (button ? 'button' : '');

      if (action) {
        trackEvent('landing_click', {
          action: action,
          destination: String(destination).slice(0, 100),
        });
      }
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);
}

// 랜딩 진입점에서 훅 실행을 위해 래퍼 컴포넌트 사용
function LandingWithAnalytics() {
  useLandingAnalytics();
  return null;
}

// analytics 훅은 React 트리 안에서 실행되어야 하므로 루트에 주입
if (root) {
  const analyticsRoot = document.createElement('div');
  analyticsRoot.id = 'landing-analytics-root';
  document.body.appendChild(analyticsRoot);
  ReactDOM.createRoot(analyticsRoot).render(
    <React.StrictMode>
      <LandingWithAnalytics />
    </React.StrictMode>
  );
}
