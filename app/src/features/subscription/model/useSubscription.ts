import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { store } from '@/shared/config/firebase';
import type { UserSubscription, SubscriptionTier } from '@/shared/types';

const DEFAULT_TIER: SubscriptionTier = 'free';

export function useSubscription(user: User | null) {
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!user) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    const userRef = doc(store, 'users', user.uid);
    const unsubscribe = onSnapshot(
      userRef,
      (snap) => {
        if (!snap.exists()) {
          setSubscription({ subscriptionTier: DEFAULT_TIER });
          setLoading(false);
          return;
        }
        const data = snap.data();
        setSubscription({
          subscriptionTier: (data.subscriptionTier === 'pro' ? 'pro' : 'free') as SubscriptionTier,
          subscriptionPeriodEnd: data.subscriptionPeriodEnd ?? null,
          stripeCustomerId: data.stripeCustomerId ?? null,
          regenerateCountToday: typeof data.regenerateCountToday === 'number' ? data.regenerateCountToday : 0,
          lastRegenerateDate: data.lastRegenerateDate ?? null,
          preferredPushHour: typeof data.preferredPushHour === 'number' ? data.preferredPushHour : null,
          preferredPushTimezone: typeof data.preferredPushTimezone === 'string' ? data.preferredPushTimezone : null,
        });
        setLoading(false);
      },
      (err) => {
        console.error('useSubscription error:', err);
        setSubscription({ subscriptionTier: DEFAULT_TIER });
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  return { subscription, loading };
}
