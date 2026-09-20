import { useCallback, useRef } from 'react';

const SWIPE_UP_THRESHOLD_PX = 80;
const SWIPE_MAX_DURATION_MS = 400;

/**
 * 위로 스와이프 제스처를 감지하여 삭제 콜백 호출.
 * 모바일(768px 이하)에서만 활성화. 스크롤 영역에서는 사용하지 않음.
 */
export function useSwipeUpToDelete(
  onSwipeUp: () => void,
  enabled: boolean
) {
  const touchStartRef = useRef<{ y: number; t: number } | null>(null);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return;
      touchStartRef.current = {
        y: e.touches[0].clientY,
        t: Date.now(),
      };
    },
    [enabled]
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || !touchStartRef.current) return;
      const start = touchStartRef.current;
      const endY = e.changedTouches[0].clientY;
      const deltaY = start.y - endY;
      const duration = Date.now() - start.t;
      touchStartRef.current = null;

      if (deltaY >= SWIPE_UP_THRESHOLD_PX && duration <= SWIPE_MAX_DURATION_MS) {
        onSwipeUp();
      }
    },
    [enabled, onSwipeUp]
  );

  return { onTouchStart, onTouchEnd };
}
