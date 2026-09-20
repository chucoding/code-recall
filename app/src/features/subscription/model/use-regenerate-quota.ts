import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { store } from '@/shared/config/firebase';
import { getCurrentDate } from '@/shared/lib/date';
import type { SubscriptionTier } from '@/shared/types';
import {
  REGENERATE_QUESTION_LIMIT_FREE,
  REGENERATE_QUESTION_LIMIT_PRO,
} from '../api/subscriptionApi';

/** `useRegenerateQuota`가 돌려주는 구독 값 */
export interface RegenerateQuota {
  /** 오늘 사용한 재생성 횟수 */
  count: number;
  /** 등급별 하루 상한 */
  limit: number;
  /** 남은 횟수가 있는지 여부 */
  canRegenerate: boolean;
}

/**
 * 질문 재생성 남은 횟수 구독
 *
 * 카운터는 `users/{uid}`가 아니라 서버 전용 `regenerateCounts/{uid}`에 있다. 사용자가
 * 자기 문서를 지웠다가 다시 만드는 것만으로 한도를 초기화할 수 있어 분리했고,
 * firestore.rules는 이 컬렉션에 본인 읽기만 열어 둔다. 여기서 세는 값은 버튼을 잠그는
 * 표시용이고, 실제 차단은 서버가 429로 한다.
 *
 * @param user - 로그인 사용자. 없으면 상한만 계산해 돌려줌
 * @param tier - 구독 등급
 * @returns 오늘 사용량과 상한, 재생성 가능 여부
 */
export function useRegenerateQuota(user: User | null, tier: SubscriptionTier): RegenerateQuota {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setCount(0);
      return;
    }

    const counterRef = doc(store, 'regenerateCounts', user.uid);
    const unsubscribe = onSnapshot(
      counterRef,
      (snap) => {
        const data = snap.exists() ? snap.data() : undefined;
        // 날짜가 오늘이 아니면 서버가 0부터 다시 세므로 표시도 0으로 맞춤
        const isToday = data?.date === getCurrentDate();
        setCount(isToday && typeof data?.count === 'number' ? data.count : 0);
      },
      (err) => {
        console.error('useRegenerateQuota error:', err);
        setCount(0);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const limit = tier === 'pro' ? REGENERATE_QUESTION_LIMIT_PRO : REGENERATE_QUESTION_LIMIT_FREE;

  return { count, limit, canRegenerate: count < limit };
}
