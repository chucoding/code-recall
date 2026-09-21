import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FlashCardPlayer } from '../features/flashcard';
import type { DeleteMethod } from '../features/flashcard';
import { useDemoFlashcards } from '@/features/flashcard';
import { regenerateCardQuestionDemo } from '@/features/subscription';
import { TrendingRepoList } from '@/features/trending-repos';
import { trackEvent } from '@/shared/config/analytics';
import { FlashCardKeyboardIndicator } from '@/shared/ui/FlashCardKeyboardIndicator';
import { Info } from 'lucide-react';

const DEMO_DEVICE_ID_KEY = 'demo_device_id';

function getOrCreateDemoDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(DEMO_DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEMO_DEVICE_ID_KEY, id);
  }
  return id;
}

/**
 * 랜딩 데모 페이지
 * 플래시카드 데이터 소스: 사전 생성 캐시(Firestore) 우선, 없으면 AI에서 바로 생성.
 * 카드 목록은 컴포넌트 상태가 아니라 `useDemoFlashcards` 쿼리 캐시를 구독해
 * 같은 저장소를 다시 눌렀을 때 GitHub·AI를 다시 호출하지 않는다.
 * 로그인 후 앱 플래시카드는 Firestore에서 로드.
 */
const LandingDemo: React.FC = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('ko') ? 'ko' : 'en';
  const [repoUrl, setRepoUrl] = useState('');
  const [syncSlideIndex, setSyncSlideIndex] = useState<number | null>(null);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const cardSectionRef = useRef<HTMLDivElement>(null);
  // 뱃지가 입력란에 채운 URL. 그대로 다시 제출하면 검색이 아니라 뱃지 재요청으로 구분하기 위한 값
  const badgeFilledUrlRef = useRef<string | null>(null);
  const demoDeviceId = useMemo(getOrCreateDemoDeviceId, []);

  const { cards, isLoading, error, repositoryUrl, requestCards, replaceCards } =
    useDemoFlashcards(lang);

  // 카드가 준비되면 카드 영역으로 이동. 사전 캐시로 즉시 채워지는 경우도 같은 경로를 탄다
  const hasCards = cards.length > 0;
  useEffect(() => {
    if (!hasCards) return;
    const timer = setTimeout(() => {
      cardSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
    return () => clearTimeout(timer);
  }, [repositoryUrl, hasCards]);

  const handleDeleteCard = useCallback((index: number, method: DeleteMethod) => {
    const deletedCard = cards[index];
    const newCards = cards.filter((_, i) => i !== index);
    const newSlide = index >= newCards.length ? Math.max(0, newCards.length - 1) : index;

    replaceCards(newCards);
    setSyncSlideIndex(newSlide);

    trackEvent('landing_demo_delete_card', {
      method,
      card_index: index + 1,
      total_before: cards.length,
      total_after: newCards.length,
    });

    toast(t('flashcard.cardRemoved'), {
      action: {
        label: t('flashcard.undo'),
        onClick: () => {
          const restored = [...newCards];
          restored.splice(index, 0, deletedCard);
          replaceCards(restored);
          setSyncSlideIndex(index);
        },
      },
      duration: 5000,
    });
  }, [cards, replaceCards, t]);

  const handleRegenerateQuestion = useCallback(
    async (index: number) => {
      const card = cards[index];
      if (!card?.metadata?.rawDiff || !demoDeviceId) return;

      setRegeneratingIndex(index);
      try {
        const otherQuestions = cards
          .filter((_, i) => i !== index)
          .map((c) => c.question)
          .filter(Boolean)
          .slice(0, 10);
        const { question, highlights } = await regenerateCardQuestionDemo({
          rawDiff: card.metadata.rawDiff,
          existingQuestion: card.question,
          existingAnswer: card.answer,
          demoDeviceId,
          otherQuestions,
          lang,
        });
        const newCards = cards.map((c, i) =>
          i === index ? { ...c, question, highlights: highlights ?? c.highlights } : c
        );
        replaceCards(newCards);
        toast(t('flashcard.questionRegenerated'));
        trackEvent('landing_demo_regenerate_question', {
          card_index: index + 1,
          total_cards: cards.length,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : t('errors.regenFailed');
        if (msg.includes('한도') || msg.includes('limit')) {
          toast(
            () => (
              <div className="flex flex-col gap-2">
                <p className="font-semibold text-sm text-neutral-900">{t('flashcard.demoRegenOnce')}</p>
                <p className="text-neutral-600 text-xs leading-relaxed">
                  {t('flashcard.demoRegenLimitHint')}
                </p>
                <button
                  type="button"
                  className="mt-1 w-full py-2.5 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 active:opacity-95 transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  onClick={() => {
                    trackEvent('landing_demo_cta_limit_exceeded', {});
                    window.location.href = '/app';
                  }}
                >
                  {t('flashcard.demoRegenCta')}
                </button>
              </div>
            ),
            {
              duration: 8000,
              closeButton: false,
              style: { padding: '14px 16px', width: '290px' }, //TODO : 토스트 기본 width 없애는 방법 찾아보기
            }
          );
        } else {
          toast.error(msg);
        }
      } finally {
        setRegeneratingIndex(null);
      }
    },
    [cards, demoDeviceId, lang, replaceCards, t]
  );

  /**
   * 카드 요청과 GA4 이벤트 전송
   *
   * 검색과 뱃지를 한 탐색 보고서에서 비교할 수 있도록 두 경로 모두 `landing_demo_generate` 하나로 보내고
   * `source`로 구분한다. 요청이 끝나면 `landing_demo_generate_result`로 성공 여부와 캐시 적중을 함께 보낸다.
   *
   * @param url - 요청할 저장소 URL
   * @param params - `source`와 경로별 추가 파라미터
   */
  const runSubmit = async (
    url: string,
    params: { source: 'form'; prefilled_from_badge: boolean } | { source: 'badge'; rank: number }
  ) => {
    trackEvent('landing_demo_generate', {
      ...params,
      ...(params.source === 'badge' && { repo_url: url.slice(0, 100) }),
    });
    setSyncSlideIndex(null);

    const outcome = await requestCards(url);
    trackEvent('landing_demo_generate_result', {
      source: params.source,
      ...(outcome.ok
        ? { result: 'success', cache: outcome.cache, card_count: outcome.cardCount }
        : { result: 'failure', error_code: outcome.errorCode }),
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runSubmit(repoUrl, {
      source: 'form',
      prefilled_from_badge: repoUrl === badgeFilledUrlRef.current,
    });
  };

  const handleSelectTrendingRepo = (url: string, rank: number) => {
    setRepoUrl(url);
    badgeFilledUrlRef.current = url;
    void runSubmit(url, { source: 'badge', rank });
  };

  return (
    <>
      <form onSubmit={handleSubmit}>
        <div className="flex items-center bg-surface-light/60 backdrop-blur-md rounded-2xl border border-border shadow-[0_16px_48px_rgba(0,0,0,0.3)] overflow-hidden p-1.5 max-[768px]:flex-col max-[768px]:p-3 max-[768px]:gap-2">
          <img src="/github-mark-white.svg" alt="" width={20} height={20} className="w-5 h-5 ml-4 shrink-0 max-[768px]:hidden" aria-hidden />
          <input
            type="text"
            className="flex-1 border-0 outline-none text-base py-3.5 px-3 bg-transparent text-text min-w-0 placeholder:text-text-muted max-[768px]:w-full max-[768px]:text-center max-[768px]:py-3"
            placeholder="https://github.com/owner/repo@branch"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            disabled={isLoading}
          />
          <button
            type="submit"
            className="shrink-0 py-3.5 px-7 bg-primary text-bg rounded-xl text-[0.95rem] font-bold cursor-pointer transition-all duration-300 whitespace-nowrap min-w-[120px] flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-primary-dark hover:enabled:-translate-y-px hover:enabled:shadow-[0_6px_20px_rgba(7,166,107,0.3)] max-[768px]:w-full max-[768px]:py-3.5"
            disabled={isLoading || !repoUrl.trim()}
          >
            {isLoading ? (
              <span className="inline-block w-5 h-5 border-[3px] border-bg/30 border-t-bg rounded-full animate-spin" />
            ) : (
              'Generate Cards'
            )}
          </button>
        </div>
      </form>

      <TrendingRepoList onSelect={handleSelectTrendingRepo} disabled={isLoading} />

      {error && (
        <p className="mt-6 py-3 px-5 bg-error-bg border border-error/30 rounded-xl text-error-light text-sm animate-fade-in">
          {error}
        </p>
      )}

      {cards.length > 0 && (
        <div className="mt-14 w-full max-w-full min-w-0 overflow-x-hidden" ref={cardSectionRef}>
          <FlashCardPlayer
            cards={cards}
            keyboardShortcuts
            onSlideChange={() => setSyncSlideIndex(null)}
            onDeleteCard={handleDeleteCard}
            slideIndex={syncSlideIndex ?? undefined}
            onRegenerateQuestion={handleRegenerateQuestion}
            regeneratingIndex={regeneratingIndex}
            renderHeader={() => (
              <div className="text-center mb-10 animate-fade-up">
                <h3 className="text-2xl font-bold text-text mb-2 max-[480px]:text-xl">{t('demo.aiGeneratedTitle')}</h3>
                <p className="text-text-light text-sm mb-4">{t('demo.clickToSeeAnswer')}</p>
                <div className="flex justify-center">
                  <FlashCardKeyboardIndicator showDelete />
                </div>
              </div>
            )}
            renderFooter={() => (
              <div className="text-center mt-14 animate-fade-up">
                {cards.length === 1 && (
                  <p
                    className="mb-6 mx-auto max-w-xl text-center text-xs text-text-muted leading-relaxed flex items-center justify-center gap-1.5 flex-wrap animate-fade-in"
                    role="note"
                    aria-label={t('demo.branchGuideLabel')}
                  >
                    <Info className="w-3.5 h-3.5 shrink-0 text-text-muted" aria-hidden />
                    <span>{t('demo.branchGuide')}</span>
                  </p>
                )}
                <p
                  className="mb-8 mx-auto max-w-xl text-center text-xs text-text-muted leading-relaxed flex items-center justify-center gap-1.5 flex-wrap"
                  role="note"
                  aria-label={t('demo.demoNoteLabel')}
                >
                  <Info className="w-3.5 h-3.5 shrink-0 text-text-muted" aria-hidden />
                  <span>{t('demo.basedOnCommits')}</span>
                </p>
                <p className="text-text-body text-lg mb-5">
                  {t('demo.wantDailyFlashcards')}
                </p>
                <a
                  href="/app"
                  data-landing-action="get_started_free"
                  className="inline-flex items-center gap-2.5 py-3.5 px-8 bg-primary text-bg rounded-xl text-base font-bold no-underline transition-all duration-300 shadow-[0_8px_24px_rgba(7,166,107,0.2)] hover:-translate-y-0.5 hover:bg-primary-dark hover:shadow-[0_12px_36px_rgba(7,166,107,0.3)]"
                  onClick={() => trackEvent('landing_demo_get_started_free', { from: 'after_demo' })}
                >
                  {t('demo.getStartedFree')}
                </a>
              </div>
            )}
          />
        </div>
      )}
    </>
  );
};

export default LandingDemo;
