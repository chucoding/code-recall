import { useRef, useCallback } from 'react';

/**
 * 가로 스크롤 영역에서 스크롤 우선, 스크롤 끝에서만 부모(예: Slick) 스와이프 허용.
 * CodeDiffBlock/FileContentBlock 내부 overflow-x 컨테이너도 대상.
 * 터치 시 스크롤 가능하면 stopPropagation으로 부모 전파 차단.
 */
export function useScrollPriorityTouch() {
  const touchStartRef = useRef<{ x: number; scrollEl: HTMLElement | null }>({ x: 0, scrollEl: null });

  const onTouchStartCapture = useCallback((e: React.TouchEvent) => {
    const container = e.currentTarget as HTMLElement;
    let scrollEl: HTMLElement | null = null;
    let node: HTMLElement | null = e.target as HTMLElement;
    while (node && node !== container.parentElement) {
      const style = getComputedStyle(node);
      const ox = style.overflowX;
      if ((ox === 'auto' || ox === 'scroll') && node.scrollWidth > node.clientWidth) {
        scrollEl = node;
        break;
      }
      node = node.parentElement;
    }
    touchStartRef.current = { x: e.touches[0].clientX, scrollEl: scrollEl ?? container };
  }, []);

  const onTouchMoveCapture = useCallback((e: React.TouchEvent) => {
    const { x, scrollEl } = touchStartRef.current;
    if (!scrollEl) return;
    const deltaX = e.touches[0].clientX - x;
    const { scrollLeft, scrollWidth, clientWidth } = scrollEl;
    const canScrollLeft = scrollLeft > 0;
    const canScrollRight = scrollLeft < scrollWidth - clientWidth - 1;
    if (deltaX > 0 && canScrollLeft) e.stopPropagation();
    else if (deltaX < 0 && canScrollRight) e.stopPropagation();
  }, []);

  return { onTouchStartCapture, onTouchMoveCapture };
}
