import React, { useEffect, useRef, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import LandingDemo from './LandingDemo';

/** beforeinstallprompt 이벤트 타입 */
interface BeforeInstallPromptEvent extends Event {
  preventDefault(): void;
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * 랜딩 페이지 전체 (nav, hero, sections, footer)
 * index.html의 정적 콘텐츠를 React로 이전하여 i18n 적용
 */
const LandingPage: React.FC = () => {
  const { t, i18n } = useTranslation('landing');
  const [showPwaInstall, setShowPwaInstall] = useState(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  // document lang 및 meta 갱신
  useEffect(() => {
    document.documentElement.lang = i18n.language.startsWith('ko') ? 'ko' : 'en';
  }, [i18n.language]);

  // PWA Install: beforeinstallprompt 지원 시 버튼 표시
  useEffect(() => {
    const isStandalone = () =>
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true ||
      document.referrer.includes('android-app://');

    if (isStandalone()) return;

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      setShowPwaInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    const installedHandler = () => {
      deferredPromptRef.current = null;
      setShowPwaInstall(false);
    };
    window.addEventListener('appinstalled', installedHandler);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const handlePwaInstallClick = () => {
    const deferred = deferredPromptRef.current;
    if (deferred) {
      deferred.prompt();
      deferred.userChoice.then((choice) => {
        if (choice.outcome === 'accepted') deferredPromptRef.current = null;
      });
    }
  };

  return (
    <>
      <nav className="fixed top-4 left-4 right-4 z-[1000] max-w-[1200px] mx-auto bg-bg/80 backdrop-blur-xl border border-border rounded-xl shadow-lg max-[768px]:top-0 max-[768px]:left-0 max-[768px]:right-0 max-[768px]:rounded-none max-[768px]:border-x-0 max-[768px]:border-t-0">
        <input type="checkbox" id="nav-toggle" className="hidden peer" />
        <div className="py-3 px-6 flex justify-between items-center max-[480px]:px-4">
          <a href="/" className="no-underline flex items-center" aria-label="CodeRecall">
            <img src="/logo.png" alt="CodeRecall" className="h-10 max-[480px]:h-8" />
          </a>
          <div className="hidden md:flex items-center gap-6">
            <a href="#how-it-works" data-landing-action="nav_how_it_works" className="text-[0.9rem] text-text-body no-underline font-medium transition-colors duration-200 hover:text-primary">
              {t('howItWorks')}
            </a>
            <a href="#features" data-landing-action="nav_features" className="text-[0.9rem] text-text-body no-underline font-medium transition-colors duration-200 hover:text-primary">
              {t('features')}
            </a>
            <a href="/app" data-landing-action="get_started_nav" className="py-2.5 px-5 bg-primary text-bg rounded-lg text-[0.9rem] font-semibold no-underline transition-all duration-200 hover:bg-primary-dark hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(7,166,107,0.3)]">
              {t('getStarted')}
            </a>
          </div>
          <label htmlFor="nav-toggle" className="flex flex-col gap-[5px] cursor-pointer p-2 md:hidden" aria-label={t('menuOpen')}>
            <span className="block w-5 h-0.5 bg-text-body rounded" />
            <span className="block w-5 h-0.5 bg-text-body rounded" />
            <span className="block w-5 h-0.5 bg-text-body rounded" />
          </label>
        </div>
        <div className="hidden peer-checked:flex flex-col gap-1 px-6 pb-4 rounded-b-xl bg-surface/95 backdrop-blur-xl md:!hidden animate-fade-in">
          <a href="#how-it-works" data-landing-action="nav_how_it_works_mobile" className="py-2.5 text-[0.95rem] text-text-body no-underline font-medium">{t('howItWorks')}</a>
          <a href="#features" data-landing-action="nav_features_mobile" className="py-2.5 text-[0.95rem] text-text-body no-underline font-medium">{t('features')}</a>
          <a href="/app" data-landing-action="get_started_nav_mobile" className="mt-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-bg rounded-lg text-[0.9rem] font-semibold no-underline">
            {t('getStarted')}
          </a>
        </div>
      </nav>

      <main id="demo" className="min-h-[calc(100dvh-5rem)] min-h-[calc(100vh-5rem)] flex flex-col items-center justify-center pt-[88px] px-4 pb-24 max-[768px]:min-h-0 max-[768px]:py-20 max-[768px]:pt-[88px] max-[768px]:pb-16">
        <div className="w-full max-w-[640px] mx-auto text-center overflow-x-hidden md:overflow-visible">
          <h1 className="text-[1.75rem] font-bold text-text mb-2 tracking-tight max-[480px]:text-[1.4rem]">
            {t('heroTitle')}
          </h1>
          <p className="text-[0.95rem] text-text-light mb-12 max-[480px]:text-sm max-[480px]:mb-10">
            {t('heroSubtitle')}
          </p>
          <LandingDemo />
        </div>
      </main>

      <section className="py-8 px-6 bg-surface border-b border-border">
        <div className="max-w-6xl mx-auto flex items-center justify-center gap-8 flex-wrap max-[480px]:gap-4">
          <div className="flex items-center gap-2 text-text-light text-sm font-medium">
            <img src="/github-mark-white.svg" alt="" width={20} height={20} className="w-5 h-5 shrink-0" aria-hidden />
            Open Source
          </div>
          <span className="w-px h-5 bg-border max-[480px]:hidden" />
          <div className="flex items-center gap-2 text-text-light text-sm font-medium">
            <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Free to Use
          </div>
          <span className="w-px h-5 bg-border max-[480px]:hidden" />
          <div className="flex items-center gap-2 text-text-light text-sm font-medium">
            <svg className="w-5 h-5 text-[#f59e0b]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            AI-Powered
          </div>
          <span className="w-px h-5 bg-border max-[480px]:hidden" />
          <div className="flex items-center gap-2 text-text-light text-sm font-medium">
            <svg className="w-5 h-5 text-text-body" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
            PWA Ready
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-24 px-6 bg-bg max-[480px]:py-16 max-[480px]:px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 max-[480px]:mb-10">
            <h2 className="text-[2.5rem] font-bold text-text mb-4 max-[480px]:text-[1.8rem]">{t('howItWorks')}</h2>
            <p className="text-lg text-text-light max-[480px]:text-base">{t('howItWorksSub')}</p>
          </div>
          <div className="grid grid-cols-3 gap-12 max-[768px]:grid-cols-1 max-[768px]:gap-10">
            <div className="relative text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-primary/10 flex items-center justify-center">
                <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
              </div>
              <div className="inline-block mb-3 py-1 px-3 bg-primary/10 text-primary text-xs font-bold rounded-full tracking-wide uppercase">{t('step1')}</div>
              <h3 className="text-xl font-bold text-text mb-2">{t('connect')}</h3>
              <p className="text-text-light leading-relaxed"><Trans i18nKey="landing:connectDesc" components={{ br: <br /> }} /></p>
            </div>
            <div className="relative text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-primary/10 flex items-center justify-center">
                <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
              </div>
              <div className="inline-block mb-3 py-1 px-3 bg-primary/10 text-primary text-xs font-bold rounded-full tracking-wide uppercase">{t('step2')}</div>
              <h3 className="text-xl font-bold text-text mb-2">{t('generate')}</h3>
              <p className="text-text-light leading-relaxed"><Trans i18nKey="landing:generateDesc" components={{ br: <br /> }} /></p>
            </div>
            <div className="relative text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-primary/10 flex items-center justify-center">
                <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
              </div>
              <div className="inline-block mb-3 py-1 px-3 bg-primary/10 text-primary text-xs font-bold rounded-full tracking-wide uppercase">{t('step3')}</div>
              <h3 className="text-xl font-bold text-text mb-2">{t('recall')}</h3>
              <p className="text-text-light leading-relaxed"><Trans i18nKey="landing:recallDesc" components={{ br: <br /> }} /></p>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="py-24 px-6 bg-surface max-[480px]:py-16 max-[480px]:px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 max-[480px]:mb-10">
            <h2 className="text-[2.5rem] font-bold text-text mb-4 max-[480px]:text-[1.8rem]">{t('features')}</h2>
            <p className="text-lg text-text-light max-[480px]:text-base">{t('featuresSub')}</p>
          </div>
          <div className="grid grid-cols-3 gap-7 max-[768px]:grid-cols-1 max-[768px]:gap-5">
            <div className="bg-surface-light/50 rounded-2xl p-8 border border-border transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_36px_rgba(7,166,107,0.08)] hover:border-primary/30">
              <div className="w-12 h-12 mb-5 rounded-xl bg-primary/15 flex items-center justify-center">
                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
              </div>
              <h3 className="text-lg font-bold text-text mb-2">{t('aiCards')}</h3>
              <p className="text-[0.95rem] text-text-light leading-relaxed">{t('aiCardsDesc')}</p>
            </div>
            <div className="bg-surface-light/50 rounded-2xl p-8 border border-border transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_36px_rgba(7,166,107,0.08)] hover:border-primary/30">
              <div className="w-12 h-12 mb-5 rounded-xl bg-[#f59e0b]/15 flex items-center justify-center">
                <svg className="w-6 h-6 text-[#f59e0b]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
              </div>
              <h3 className="text-lg font-bold text-text mb-2">{t('spacedRepetition')}</h3>
              <p className="text-[0.95rem] text-text-light leading-relaxed">{t('spacedRepetitionDesc')}</p>
            </div>
            <div className="bg-surface-light/50 rounded-2xl p-8 border border-border transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_36px_rgba(7,166,107,0.08)] hover:border-primary/30">
              <div className="w-12 h-12 mb-5 rounded-xl bg-[#3b82f6]/15 flex items-center justify-center">
                <svg className="w-6 h-6 text-[#3b82f6]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>
              </div>
              <h3 className="text-lg font-bold text-text mb-2">{t('codeDiffReview')}</h3>
              <p className="text-[0.95rem] text-text-light leading-relaxed">{t('codeDiffReviewDesc')}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 px-6 bg-bg max-[480px]:py-16 max-[480px]:px-4">
        <div className="max-w-[640px] mx-auto text-center">
          <h2 className="text-[2.5rem] font-bold text-text mb-5 leading-tight max-[480px]:text-[1.8rem]">{t('ctaTitle')}</h2>
          <p className="text-lg text-text-light mb-10 leading-relaxed max-[480px]:text-base">
            {t('ctaSubtitle')}<br />
            {t('ctaSubtitle2')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 max-[480px]:flex-col">
            <a href="/app" data-landing-action="get_started_footer" className="inline-flex items-center gap-3 py-4 px-10 bg-primary text-bg rounded-xl text-lg font-bold no-underline transition-all duration-300 shadow-[0_8px_30px_rgba(7,166,107,0.25)] hover:bg-primary-dark hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgba(7,166,107,0.35)] max-[480px]:w-full max-[480px]:justify-center cursor-pointer">
              {t('getStartedGitHub')}
            </a>
            {showPwaInstall && (
              <button type="button" data-landing-action="pwa_install" onClick={handlePwaInstallClick} className="inline-flex items-center gap-2.5 py-4 px-8 bg-transparent text-text-body border border-border rounded-xl text-base font-semibold transition-all duration-300 hover:bg-surface hover:border-border-medium hover:text-text max-[480px]:w-full max-[480px]:justify-center cursor-pointer" aria-label={t('installApp')}>
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                {t('installApp')}
              </button>
            )}
          </div>
        </div>
      </section>

      <footer className="py-10 px-6 bg-surface border-t border-border">
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-4 max-[768px]:flex-col max-[768px]:items-center max-[768px]:text-center max-[768px]:gap-3">
          <a href="/" className="no-underline flex items-center" aria-label="CodeRecall"><img src="/logo.png" alt="CodeRecall" className="h-8 opacity-90 max-[480px]:h-6" /></a>
          <div className="flex items-center gap-6 text-text-muted text-sm max-[480px]:gap-4">
            <a href="https://github.com/chucoding" data-landing-action="footer_github" target="_blank" rel="noopener noreferrer" className="transition-colors duration-200 hover:text-text-light no-underline text-text-muted">GitHub</a>
            <a href={i18n.language.startsWith('ko') ? '/terms' : '/terms-en.html'} data-landing-action="footer_terms" className="transition-colors duration-200 hover:text-text-light no-underline text-text-muted">Terms</a>
            <a href={i18n.language.startsWith('ko') ? '/privacy' : '/privacy-en.html'} data-landing-action="footer_privacy" className="transition-colors duration-200 hover:text-text-light no-underline text-text-muted">Privacy</a>
          </div>
          <p className="text-text-muted/50 text-sm">&copy; 2026 CodeRecall</p>
        </div>
      </footer>
    </>
  );
};

export default LandingPage;
