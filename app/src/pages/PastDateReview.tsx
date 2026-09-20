import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { toast } from 'sonner';
import { FlashCardPlayer } from '../features/flashcard';
import type { FlashCard, DeleteMethod } from '../features/flashcard';
import { auth, store } from '@/shared/config/firebase';
import { trackEvent } from '@/shared/config/analytics';
import { useNavigationStore } from '@/shared/lib/navigationStore';
import { useSubscription } from '@/features/subscription';
import {
  regenerateCardQuestion,
  REGENERATE_QUESTION_LIMIT_FREE,
  REGENERATE_QUESTION_LIMIT_PRO,
} from '@/features/subscription';
import { getCurrentDate } from '@/shared/lib/date';
import { Button } from '@/shared/ui/button';

interface PastDateReviewProps {
  date: string;
}

const PastDateReview: React.FC<PastDateReviewProps> = ({ date }) => {
  const { t, i18n } = useTranslation();
  const [user, setUser] = useState(auth.currentUser);
  const [cards, setCards] = useState<FlashCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setCurrentSlide] = useState(0);
  const [syncSlideIndex, setSyncSlideIndex] = useState<number | null>(null);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const setSelectedPastDate = useNavigationStore((s) => s.setSelectedPastDate);
  const { subscription } = useSubscription(user);

  useEffect(() => {
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }
    const ref = doc(store, 'users', user.uid, 'flashcards', date);
    const lang = i18n.language.startsWith('ko') ? 'ko' : 'en';
    getDoc(ref).then((snap) => {
      if (!snap.exists()) {
        setCards([]);
      } else {
        const d = snap.data();
        const raw = (lang === 'ko' ? d?.data_ko : d?.data_en) as FlashCard[] | undefined;
        setCards(Array.isArray(raw) && raw.length > 0 ? raw : []);
      }
      setLoading(false);
    });
  }, [date, i18n.language]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg p-5">
        <div className="w-10 h-10 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const handleDeleteCard = useCallback((index: number, method: DeleteMethod) => {
    const deletedCard = cards[index];
    const newCards = cards.filter((_, i) => i !== index);
    const newSlide = index >= newCards.length ? Math.max(0, newCards.length - 1) : index;

    setCards(newCards);
    setCurrentSlide(newSlide);
    setSyncSlideIndex(newSlide);

    const user = auth.currentUser;
    if (user) {
      const flashcardDocRef = doc(store, 'users', user.uid, 'flashcards', date);
      const lang = i18n.language.startsWith('ko') ? 'ko' : 'en';
      setDoc(flashcardDocRef, { [`data_${lang}`]: newCards }, { merge: true });

      toast(t('flashcard.cardRemoved'), {
        action: {
          label: t('flashcard.undo'),
          onClick: () => {
            const restored = [...newCards];
            restored.splice(index, 0, deletedCard);
            setCards(restored);
            setCurrentSlide(index);
            setSyncSlideIndex(index);
            setDoc(flashcardDocRef, { [`data_${lang}`]: restored }, { merge: true });
          },
        },
        duration: 5000,
      });
    }

    trackEvent('flashcard_delete', {
      method,
      card_index: index + 1,
      total_before: cards.length,
      total_after: newCards.length,
    });
  }, [cards, date, t, i18n.language]);

  const tier = subscription?.subscriptionTier === 'pro' ? 'pro' : 'free';
  const limit = tier === 'pro' ? REGENERATE_QUESTION_LIMIT_PRO : REGENERATE_QUESTION_LIMIT_FREE;
  const todayStr = getCurrentDate();
  const count =
    subscription?.lastRegenerateDate === todayStr
      ? (subscription?.regenerateCountToday ?? 0)
      : 0;
  const canRegenerateQuestion = count < limit;

  const handleRegenerateQuestion = useCallback(
    async (index: number) => {
      const card = cards[index];
      if (!card?.metadata?.rawDiff || !canRegenerateQuestion || !user) return;

      setRegeneratingIndex(index);
      try {
        const otherQuestions = cards
          .filter((_, i) => i !== index)
          .map((c) => c.question)
          .filter(Boolean)
          .slice(0, 10);
        const lang = i18n.language.startsWith('ko') ? 'ko' : 'en';
        const { question, highlights } = await regenerateCardQuestion({
          rawDiff: card.metadata.rawDiff,
          existingQuestion: card.question,
          existingAnswer: card.answer,
          flashcardDate: date,
          otherQuestions,
          lang,
        });
        const newCards = cards.map((c, i) =>
          i === index ? { ...c, question, highlights: highlights ?? c.highlights } : c
        );
        setCards(newCards);
        toast(t('flashcard.questionRegenerated'));
        trackEvent('flashcard_regenerate_question', {
          card_index: index + 1,
          total_cards: cards.length,
          tier,
          context: 'past_date',
        });
        const flashcardDocRef = doc(store, 'users', user.uid, 'flashcards', date);
        await setDoc(flashcardDocRef, { [`data_${lang}`]: newCards }, { merge: true });
      } catch (e: unknown) {
        const err = e as { response?: { status?: number; data?: { error?: string } } };
        const msg =
          err.response?.status === 429
            ? t('flashcard.regenLimitReached')
            : (err.response?.data?.error || (e instanceof Error ? e.message : t('errors.regenFailed')));
        toast.error(msg);
      } finally {
        setRegeneratingIndex(null);
      }
    },
    [cards, canRegenerateQuestion, user, date, t, i18n.language]
  );

  if (cards.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-5 text-center">
        <p className="text-muted-foreground text-[1rem] font-medium mb-1">해당 날짜에 저장된 카드가 없습니다.</p>
        <p className="text-muted-foreground text-[0.9rem] mb-6">{date}</p>
        <Button type="button" onClick={() => setSelectedPastDate(null)}>
          오늘로 돌아가기
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col bg-bg p-5 relative overflow-hidden before:content-[''] before:absolute before:-top-1/2 before:-left-1/2 before:w-[200%] before:h-[200%] before:bg-[radial-gradient(circle,rgba(7,166,107,0.04)_1px,transparent_1px)] before:bg-[length:50px_50px] before:animate-[float-bg_20s_linear_infinite] before:pointer-events-none max-[768px]:p-2.5">
      <div className="text-center mb-2 relative z-[1] flex justify-center items-center gap-3">
        <span className="text-muted-foreground text-sm">{date} 복습</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSelectedPastDate(null)}
          className="bg-card/90"
        >
          오늘로 돌아가기
        </Button>
      </div>
      <FlashCardPlayer
        cards={cards}
        keyboardShortcuts
        onSlideChange={(n) => { setCurrentSlide(n); setSyncSlideIndex(null); }}
        onDeleteCard={handleDeleteCard}
        slideIndex={syncSlideIndex ?? undefined}
        onRegenerateQuestion={handleRegenerateQuestion}
        regeneratingIndex={regeneratingIndex}
      />
    </div>
  );
};

export default PastDateReview;
