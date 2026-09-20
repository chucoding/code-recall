import { useEffect, useRef, useCallback } from 'react';
import { useNavigationStore } from '@/shared/lib/navigationStore';
import { getCurrentDate } from '@/shared/lib/date';

const DEBOUNCE_MS = 250;

export function useVisibilityDateCheck(enabled: boolean) {
  const selectedPastDate = useNavigationStore((s) => s.selectedPastDate);
  const lastLoadedDateKey = useNavigationStore((s) => s.lastLoadedDateKey);
  const triggerFlashcardReload = useNavigationStore((s) => s.triggerFlashcardReload);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkAndReloadIfNeeded = useCallback(() => {
    if (!enabled || typeof document === 'undefined' || document.visibilityState !== 'visible') {
      return;
    }
    if (selectedPastDate !== null) return;
    if (!lastLoadedDateKey) return;
    const todayKey = getCurrentDate();
    if (todayKey !== lastLoadedDateKey) {
      triggerFlashcardReload();
    }
  }, [enabled, selectedPastDate, lastLoadedDateKey, triggerFlashcardReload]);

  const debouncedCheck = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(checkAndReloadIfNeeded, DEBOUNCE_MS);
  }, [checkAndReloadIfNeeded]);

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('visibilitychange', debouncedCheck);
    window.addEventListener('pageshow', debouncedCheck);
    window.addEventListener('focus', debouncedCheck);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      document.removeEventListener('visibilitychange', debouncedCheck);
      window.removeEventListener('pageshow', debouncedCheck);
      window.removeEventListener('focus', debouncedCheck);
    };
  }, [enabled, debouncedCheck]);
}
