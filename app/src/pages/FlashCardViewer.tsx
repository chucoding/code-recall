import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

const MOBILE_BREAKPOINT = 768;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    setIsMobile(m.matches);
    const handler = () => setIsMobile(m.matches);
    m.addEventListener('change', handler);
    return () => m.removeEventListener('change', handler);
  }, []);
  return isMobile;
}
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { toast } from 'sonner';

import { FlashCardPlayer } from '../features/flashcard';
import type { DeleteMethod } from '../features/flashcard';
import type { FlashCard } from '../features/flashcard';
import { auth, store } from '@/shared/config/firebase';
import { trackEvent } from '@/shared/config/analytics';
import { useNavigationStore } from '@/shared/lib/navigationStore';
import { useSubscription } from '@/features/subscription';
import { getCurrentDate, shuffleArray } from '@/shared/lib/date';
import {
  regenerateCardQuestion,
  REGENERATE_QUESTION_LIMIT_FREE,
  REGENERATE_QUESTION_LIMIT_PRO,
} from '@/features/subscription';
import { Shuffle } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { FlashCardKeyboardIndicator } from '@/shared/ui/FlashCardKeyboardIndicator';

/**
 * 로그인 사용자 전용 플래시카드 뷰어
 * 데이터 소스: Firestore (users/{uid}/flashcards/{오늘날짜}). 데모는 LandingDemo + lib/demoFlashcards.
 * 진입 시 1회 셔플, "덱 셔플" 버튼으로 순서 재섞기.
 */
const FlashCardViewer: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [user, setUser] = useState(auth.currentUser);
  const [cards, setCards] = useState<FlashCard[]>([]);
  const [shuffleKey, setShuffleKey] = useState(0);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [syncSlideIndex, setSyncSlideIndex] = useState<number | null>(null);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const isMobile = useIsMobile();
  const flashcardReloadTrigger = useNavigationStore((s) => s.flashcardReloadTrigger);
  const { subscription } = useSubscription(user);

  useEffect(() => {
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const todayDate = getCurrentDate();
    const flashcardDocRef = doc(store, 'users', user.uid, 'flashcards', todayDate);
    const lang = i18n.language.startsWith('ko') ? 'ko' : 'en';

    getDoc(flashcardDocRef).then((snapshot) => {
      if (snapshot.exists()) {
        const d = snapshot.data();
        const raw = (lang === 'ko' ? d?.data_ko : d?.data_en) as FlashCard[] | undefined;
        setCards(Array.isArray(raw) && raw.length > 0 ? shuffleArray(raw) : []);
      } else {
        setCards([]);
      }
    });
  }, [flashcardReloadTrigger, i18n.language]);

  const handleShuffleDeck = useCallback(() => {
    setCards((prev) => shuffleArray(prev));
    setShuffleKey((k) => k + 1);
  }, []);

  const handleDeleteCard = useCallback((index: number, method: DeleteMethod) => {
    const deletedCard = cards[index];
    const newCards = cards.filter((_, i) => i !== index);
    const newSlide = index >= newCards.length ? Math.max(0, newCards.length - 1) : index;

    setCards(newCards);
    setCurrentSlide(newSlide);
    setSyncSlideIndex(newSlide);

    const user = auth.currentUser;
    if (user) {
      const todayDate = getCurrentDate();
      const flashcardDocRef = doc(store, 'users', user.uid, 'flashcards', todayDate);
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
            const lang = i18n.language.startsWith('ko') ? 'ko' : 'en';
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
  }, [cards, t, i18n.language]);

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
          flashcardDate: getCurrentDate(),
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
        });
        const flashcardDocRef = doc(store, 'users', user.uid, 'flashcards', getCurrentDate());
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
    [cards, canRegenerateQuestion, user, t, i18n.language]
  );

  if (cards.length === 0) {
    return null;
  }

    const indicatorPillClass =
      'items-center justify-center bg-card py-2 px-[18px] rounded-full shadow-[0_8px_20px_rgba(0,0,0,0.3)] text-[0.85rem] font-semibold text-primary backdrop-blur-[10px] border border-border';

  return (
    <div className="min-h-full flex flex-col bg-bg p-5 relative overflow-hidden before:content-[''] before:absolute before:-top-1/2 before:-left-1/2 before:w-[200%] before:h-[200%] before:bg-[radial-gradient(circle,rgba(7,166,107,0.04)_1px,transparent_1px)] before:bg-[length:50px_50px] before:animate-[float-bg_20s_linear_infinite] before:pointer-events-none max-[768px]:p-2.5 max-[768px]:justify-center">
      {/* 모바일: 인디케이터+셔플+카드 영역을 한 블록으로 묶어 세로 가운데 배치 */}
      <div className="flex flex-col max-[768px]:flex-shrink-0 max-[768px]:w-full">
        {/* 데스크톱: 키보드 안내 + 셔플 | 모바일: 인디케이터 + 셔플 한 줄 (설정 버튼은 App nav에 있음) */}
        <div className="flex flex-wrap justify-center gap-3 mb-2 relative z-[100] max-[768px]:gap-2 max-[768px]:justify-between max-[768px]:items-center max-[768px]:mb-3 shrink-0">
          <FlashCardKeyboardIndicator showDelete />
          {/* 모바일만: 인디케이터 + 셔플 한 줄 (동일 pill 스타일로 조화). 데스크톱에서는 hidden만 적용되도록 inline-flex는 768 이하에서만 */}
          <span className={`hidden max-[768px]:inline-flex max-[768px]:order-first ${indicatorPillClass}`} aria-live="polite">
            {currentSlide + 1} / {cards.length}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleShuffleDeck}
            aria-label={t('flashcard.deckShuffleAria')}
            className="inline-flex items-center gap-2 rounded-[20px] bg-card/90 backdrop-blur-sm max-[768px]:order-last"
          >
            <Shuffle className="w-5 h-5 shrink-0" aria-hidden />
            <span>{t('flashcard.deckShuffle')}</span>
          </Button>
        </div>

        <FlashCardPlayer
          key={shuffleKey}
          cards={cards}
          keyboardShortcuts
          onSlideChange={(n) => { setCurrentSlide(n); setSyncSlideIndex(null); }}
          onDeleteCard={handleDeleteCard}
          slideIndex={syncSlideIndex ?? undefined}
          renderIndicator={isMobile ? () => null : undefined}
          onRegenerateQuestion={handleRegenerateQuestion}
          regeneratingIndex={regeneratingIndex}
        />
      </div>
    </div>
  );
};

export default FlashCardViewer;
