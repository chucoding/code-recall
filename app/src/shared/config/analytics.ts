import { logEvent } from 'firebase/analytics';
import { analytics } from './firebase';

/**
 * GA4 화면 추적 (퍼널 탐색에서 단계로 사용 가능)
 */
export function trackScreen(screenName: string, screenClass?: string): void {
  if (!analytics) return;
  // GA4 권장 이벤트 screen_view; Firebase 타입 정의가 엄격해 단언 사용
  logEvent(analytics, 'screen_view' as Parameters<typeof logEvent>[1], {
    screen_name: screenName,
    ...(screenClass && { screen_class: screenClass }),
  });
}

/**
 * GA4 커스텀 이벤트 (퍼널·전환 분석용)
 */
export function trackEvent(
  name: string,
  params?: Record<string, string | number | boolean>
): void {
  if (!analytics) return;
  logEvent(analytics, name, params);
}
