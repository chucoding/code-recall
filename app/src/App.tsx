import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Toaster } from 'sonner';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

import { auth, store } from '@/shared/config/firebase';
import { trackScreen, trackEvent } from '@/shared/config/analytics';
import FlashCardViewer from './pages/FlashCardViewer';
import PastDateReview from './pages/PastDateReview';
import Login from './pages/Login';
import Settings from './pages/Settings';
import Pricing from './pages/Pricing';
import NoDataView from './pages/NoDataView';
import Onboarding from './pages/Onboarding';
import Card from '@/shared/ui/AppCard';
import { Button } from '@/shared/ui/button';
import { useTodayFlashcards, useVisibilityDateCheck } from '@/features/flashcard';
import { useNavigationStore } from '@/shared/lib/navigationStore';
import { BookOpen, ArrowLeft, Settings as SettingsIcon, Clock } from 'lucide-react';

const App: React.FC = () => {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [isScrollAtTop, setIsScrollAtTop] = useState<boolean>(true);
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean>(false);
  const [onboardingChecked, setOnboardingChecked] = useState<boolean>(false);
  const { currentPage, navigateToSettings, navigateToFlashcard, selectedPastDate, setCurrentPage } = useNavigationStore();

  // Stripe 결제 복귀 URL (#settings?subscription=success) 시 설정 페이지로 이동
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash.includes('subscription=success')) {
      setCurrentPage('settings');
    }
  }, [setCurrentPage]);
  
  // 오늘의 플래시카드 데이터 로드 (user가 null이면 로드하지 않음)
  const { loading, hasData } = useTodayFlashcards(user);

  // 앱 재활성화 시 날짜 변경 감지 → 하루 지났으면 플래시카드 재로드 (PWA 백그라운드 대응)
  useVisibilityDateCheck(!!user);

  /* 인증 상태 감지 */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 온보딩 필요 여부 확인
  useEffect(() => {
    const checkOnboarding = async () => {
      if (!user) {
        setOnboardingChecked(true);
        return;
      }

      try {
        const userDocRef = doc(store, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);

        // 문서가 없거나, 온보딩 완료 표시가 없고 리포지토리 설정도 없으면 온보딩 필요
        if (!userDoc.exists()) {
          setNeedsOnboarding(true);
        } else {
          const data = userDoc.data();
          // onboardingCompleted가 true이거나 repositories가 있으면 온보딩 불필요
          if (data?.onboardingCompleted || (Array.isArray(data?.repositories) && data.repositories.length > 0)) {
            setNeedsOnboarding(false);
          } else {
            setNeedsOnboarding(true);
          }
        }
      } catch (error) {
        console.error('온보딩 확인 실패:', error);
        setNeedsOnboarding(false);
      } finally {
        setOnboardingChecked(true);
      }
    };

    checkOnboarding();
  }, [user]);

  // GA4 화면 추적 (퍼널 탐색용): 화면이 바뀔 때만 screen_view 전송
  const lastScreenRef = useRef<string | null>(null);
  useEffect(() => {
    let screen: string;
    if (!user) screen = 'login';
    else if (authLoading || !onboardingChecked || loading) screen = 'loading';
    else if (needsOnboarding) screen = 'onboarding';
    else if (!hasData && currentPage === 'flashcard') screen = 'no_data';
    else if (currentPage === 'flashcard') screen = 'flashcard';
    else if (currentPage === 'settings') screen = 'settings';
    else if (currentPage === 'pricing') screen = 'pricing';
    else return;

    if (lastScreenRef.current === screen) return;
    lastScreenRef.current = screen;

    trackScreen(screen, screen === 'flashcard' ? 'FlashCardViewer' : screen === 'settings' ? 'Settings' : undefined);
    if (screen === 'flashcard') trackEvent('view_flashcard');
    if (screen === 'settings') trackEvent('view_settings');
  }, [user, authLoading, onboardingChecked, loading, needsOnboarding, hasData, currentPage]);

  // 스크롤 위치 감지
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const isAtTop = scrollTop <= 10; // 10px 이하면 맨 위로 간주
      setIsScrollAtTop(isAtTop);
    };

    // 초기 스크롤 위치 체크
    handleScroll();

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 로그인되지 않은 경우
  if (!user) {
    return <Login />;
  }

  // 일반 로딩 (인증·온보딩 확인 중)
  if (authLoading || !onboardingChecked) {
    return (
      <Card>
        <div className="w-[50px] h-[50px] max-[768px]:w-10 max-[768px]:h-10 border-[3px] border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4 max-[768px]:mb-3" aria-hidden />
        <h2 className="text-xl max-[768px]:text-lg flex items-center justify-center gap-2 whitespace-nowrap">
          <BookOpen className="w-6 h-6 max-[768px]:w-5 max-[768px]:h-5 shrink-0" aria-hidden />
          {t('app.loadingAuth')}
        </h2>
      </Card>
    );
  }

  // 플래시카드 로딩 (GitHub 분석·AI 생성 중)
  if (loading) {
    return (
      <Card>
        <div className="w-[50px] h-[50px] max-[768px]:w-10 max-[768px]:h-10 border-[3px] border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4 max-[768px]:mb-3" aria-hidden />
        <h2 className="mb-2.5 text-xl max-[768px]:text-lg flex items-center justify-center gap-2">
          <BookOpen className="w-6 h-6 max-[768px]:w-5 max-[768px]:h-5 shrink-0" aria-hidden />
          {t('app.loadingFlashcards')}
        </h2>
        <p className="text-base max-[768px]:text-sm whitespace-nowrap overflow-hidden text-ellipsis">
          <span className="hidden md:inline">{t('app.analysingCommits')}</span>
          <span className="md:hidden">{t('app.analysingCommitsShort')}</span>
        </p>
        <p className="mt-2.5 text-[0.9rem] max-[768px]:text-xs opacity-80 flex items-center justify-center gap-1.5 whitespace-nowrap overflow-hidden text-ellipsis">
          <Clock className="w-4 h-4 max-[768px]:w-3 max-[768px]:h-3 shrink-0" aria-hidden />
          <span className="hidden md:inline">{t('app.mayTakeTime')}</span>
          <span className="md:hidden">{t('app.waitPatiently')}</span>
        </p>
      </Card>
    );
  }

  // 온보딩이 필요한 경우
  if (needsOnboarding) {
    return (
      <>
        <Onboarding
          onComplete={() => {
            window.location.reload();
          }}
        />
      </>
    );
  }

  // 데이터가 없는 경우 - Settings, Pricing 페이지는 허용
  if (!hasData && currentPage === 'flashcard') {
    return <NoDataView />;
  }

  // 메인 앱 렌더링
  return (
    <>
      <Toaster position="bottom-center" richColors closeButton />
      <main>
        {/* 플로팅 navbar: transparent 영역은 pointer-events-none으로 아래 콘텐츠 클릭 통과, 버튼만 pointer-events-auto (ui-ux-pro-max: Content padding, Floating navbar) */}
        <nav className={`fixed top-4 left-4 right-4 max-[768px]:top-2 max-[768px]:left-2 max-[768px]:right-2 bg-transparent z-[1000] px-5 py-3 max-[768px]:py-2 max-[768px]:px-3 flex justify-between items-center transition-all duration-300 ease-in-out pointer-events-none ${isScrollAtTop ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-5'}`}>
          <div className={isScrollAtTop ? 'pointer-events-auto' : 'pointer-events-none'}>
            {(currentPage === 'settings' || currentPage === 'pricing') && (
              <Button
                variant="outline"
                onClick={currentPage === 'pricing' ? navigateToSettings : navigateToFlashcard}
                className="bg-card/95 border-border shadow-[0_2px_8px_rgba(0,0,0,0.3)] gap-1.5 backdrop-blur-sm hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(0,0,0,0.4)]"
              >
                <ArrowLeft className="w-5 h-5 shrink-0" aria-hidden />
                {t('common.back')}
              </Button>
            )}
          </div>

          {currentPage === 'flashcard' && (
            <div className={isScrollAtTop ? 'pointer-events-auto' : 'pointer-events-none'}>
              <Button
                variant="outline"
                onClick={navigateToSettings}
                title={t('common.settings')}
                size="icon"
                className="text-[1.2rem] bg-card/95 border-border shadow-[0_2px_8px_rgba(0,0,0,0.3)] backdrop-blur-sm hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(0,0,0,0.4)]"
              >
                <SettingsIcon className="w-5 h-5" aria-hidden />
              </Button>
            </div>
          )}
        </nav>

        {/* 뷰포트 높이로 제한해 패딩+콘텐츠가 100vh를 넘지 않게 (모바일 세로 스크롤 방지) */}
        <div className="pt-16 max-[768px]:pt-12 bg-bg h-screen flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-auto">
            {currentPage === 'flashcard' && (selectedPastDate ? <PastDateReview date={selectedPastDate} /> : <FlashCardViewer />)}
            {currentPage === 'settings' && <Settings />}
            {currentPage === 'pricing' && <Pricing />}
          </div>
        </div>
      </main>
    </>
  );
};

export default App;
