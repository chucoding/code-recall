import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Slider from 'react-slick';
import CodeDiffBlock from '@/shared/ui/CodeDiffBlock';
import FileContentBlock from '@/shared/ui/FileContentBlock';
import { getFileContent, getMarkdown } from '@/features/github-sync';
import { formatFileErrorForUser } from '@/features/flashcard/lib/formatError';
import { useScrollPriorityTouch } from '@/shared/lib/useScrollPriorityTouch';
import { useSwipeUpToDelete } from '@/shared/lib/useSwipeUpToDelete';
import type { FlashCard } from '@/entities/flashcard';
import { trackEvent } from '@/shared/config/analytics';
import { Sparkles, GitBranch, GitCompare, FileText, WifiOff, RefreshCw, Trash2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';

import 'slick-carousel/slick/slick.css';
import 'slick-carousel/slick/slick-theme.css';

type BackViewMode = 'diff' | 'file';

/** AI 답변 플로팅 블록: 하단 고정, 코드/파일 토글과 무관하게 항상 노출 */
function AIAnswerFloatingBlock({ answer }: { answer: string }) {
  const { t } = useTranslation();
  return (
    <div
      className="fc-answer-floating shrink-0 border-t border-slate-200 bg-slate-50/95 backdrop-blur-sm rounded-b-3xl"
      role="region"
      aria-label={t('flashcard.exampleAnswer')}
    >
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200">
        <span className="flex items-center justify-center w-6 h-6 rounded-xl bg-primary/10 text-primary" aria-hidden>
          <Sparkles className="w-3.5 h-3.5" aria-hidden />
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t('flashcard.exampleAnswer')}</span>
      </div>
      <div className="fc-answer-body px-4 py-3 text-sm text-slate-700 leading-relaxed whitespace-pre-line max-h-[140px] overflow-y-auto">
        {answer}
      </div>
    </div>
  );
}

export type DeleteMethod = 'button' | 'swipe' | 'keyboard';

export interface FlashCardPlayerProps {
  cards: FlashCard[];
  keyboardShortcuts?: boolean;
  renderHeader?: () => React.ReactNode;
  renderFooter?: () => React.ReactNode;
  /** 슬라이드 변경 시 호출 (모바일에서 상단 인디케이터 연동용) */
  onSlideChange?: (index: number) => void;
  /** 제공 시 기본 인디케이터 대신 사용 (모바일에서 뷰어와 한 줄로 묶을 때) */
  renderIndicator?: (current: number, total: number) => React.ReactNode;
  /** 현재 카드 삭제 (index, method). 제공 시 삭제 버튼·스와이프·키보드 활성화 */
  onDeleteCard?: (index: number, method: DeleteMethod) => void;
  /** 삭제 후 부모가 동기화할 슬라이드 인덱스 */
  slideIndex?: number;
  /** 질문 재생성 (index). 제공 시 재생성 버튼 표시 (rawDiff 있을 때만) */
  onRegenerateQuestion?: (index: number) => void | Promise<void>;
  /** 재생성 중인 카드 인덱스 (버튼 비활성화용) */
  regeneratingIndex?: number | null;
}

const MOBILE_BREAKPOINT = 768;

const FlashCardPlayer: React.FC<FlashCardPlayerProps> = ({
  cards,
  keyboardShortcuts = false,
  renderHeader,
  renderFooter,
  onSlideChange,
  renderIndicator,
  onDeleteCard,
  slideIndex,
  onRegenerateQuestion,
  regeneratingIndex,
}) => {
  const { t } = useTranslation();
  const [isMobile, setIsMobile] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [backViewMode, setBackViewMode] = useState<BackViewMode>('diff');

  useEffect(() => {
    const m = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    setIsMobile(m.matches);
    const h = () => setIsMobile(m.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, []);

  const handleDelete = useCallback(
    (method: DeleteMethod) => {
      if (regeneratingIndex === currentSlide) return;
      onDeleteCard?.(currentSlide, method);
    },
    [onDeleteCard, currentSlide, regeneratingIndex]
  );

  const swipeHandlers = useSwipeUpToDelete(() => handleDelete('swipe'), Boolean(onDeleteCard && isMobile));
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileFetchTrigger, setFileFetchTrigger] = useState(0);
  const lastFetchedUrlRef = useRef<string | null>(null);
  const sliderRef = useRef<Slider>(null);
  const { onTouchStartCapture, onTouchMoveCapture } = useScrollPriorityTouch();

  const next = () => {
    setFlipped(false);
    sliderRef.current?.slickNext();
  };

  const previous = () => {
    setFlipped(false);
    sliderRef.current?.slickPrev();
  };

  const flipCard = () => {
    setFlipped((prev) => {
      if (!prev) {
        trackEvent('flashcard_flip', {
          card_index: currentSlide + 1,
          total_cards: cards.length,
        });
      }
      return !prev;
    });
  };

  useEffect(() => {
    if (!keyboardShortcuts) return;

    const handleKeyPress = (e: KeyboardEvent) => {
      const isOnRegeneratingCard = regeneratingIndex === currentSlide;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (target?.closest('[role="tablist"]') || target?.getAttribute('role') === 'tab') {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          if (currentSlide > 0) previous();
          break;
        case 'ArrowRight':
          if (currentSlide < cards.length - 1) next();
          break;
        case 'ArrowUp':
        case 'ArrowDown':
        case ' ':
          if (isOnRegeneratingCard) return;
          e.preventDefault();
          flipCard();
          break;
        case 'Delete':
        case 'Backspace':
          if (isOnRegeneratingCard) return;
          if (onDeleteCard && cards.length > 0) {
            e.preventDefault();
            onDeleteCard(currentSlide, 'keyboard');
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [keyboardShortcuts, currentSlide, cards.length, flipped, onDeleteCard, regeneratingIndex]);

  useEffect(() => {
    if (slideIndex != null && slideIndex !== currentSlide) {
      sliderRef.current?.slickGoTo(slideIndex);
      setCurrentSlide(slideIndex);
    }
  }, [slideIndex]);

  // 질문 재생성 시 새 질문 확인을 위해 질문면으로 플립 (토스트가 먼저 보이도록 약간 지연)
  const prevQuestionRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const q = cards[currentSlide]?.question;
    if (prevQuestionRef.current !== undefined && prevQuestionRef.current !== q) {
      const t = setTimeout(() => setFlipped(false), 180);
      prevQuestionRef.current = q;
      return () => clearTimeout(t);
    }
    prevQuestionRef.current = q;
  }, [cards, currentSlide]);

  const card = cards[currentSlide];
  const metadata = card?.metadata;
  const files = metadata?.files ?? [];
  const hasFilesArray = files.length > 0;
  const legacyFilename = metadata?.filename;
  const hasFileView = hasFilesArray || Boolean(legacyFilename);
  const effectiveFiles = hasFilesArray
    ? files
    : legacyFilename
      ? [{ filename: legacyFilename, raw_url: undefined as string | undefined }]
      : [];
  const hasFiles = effectiveFiles.length > 0;
  const safeFileIndex = hasFiles ? Math.min(selectedFileIndex, effectiveFiles.length - 1) : 0;
  const currentFile = effectiveFiles[safeFileIndex];
  const currentFilename = currentFile?.filename ?? legacyFilename ?? '';
  const currentRawUrl = currentFile && 'raw_url' in currentFile ? (currentFile as { raw_url?: string }).raw_url : undefined;

  useEffect(() => {
    if (hasFiles && selectedFileIndex >= effectiveFiles.length) setSelectedFileIndex(0);
  }, [hasFiles, effectiveFiles.length, selectedFileIndex]);

  useEffect(() => {
    if (!flipped || !card || backViewMode !== 'file' || !hasFiles || !currentFilename) return;
    const fetchKey = currentRawUrl ?? currentFilename;
    if (lastFetchedUrlRef.current === fetchKey && fileContent !== null) return;

    let cancelled = false;
    lastFetchedUrlRef.current = fetchKey;
    setFileLoading(true);
    setFileError(null);
    const fetchPromise = currentRawUrl
      ? getFileContent(currentRawUrl)
      : getMarkdown(currentFilename, card?.metadata?.repositoryFullName);
    fetchPromise
      .then((content) => {
        if (!cancelled) {
          setFileContent(content);
          setFileError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const rawMsg = err?.message ?? '파일을 불러올 수 없습니다.';
          setFileError(formatFileErrorForUser(rawMsg));
          setFileContent(null);
        }
      })
      .finally(() => {
        if (!cancelled) setFileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [flipped, currentSlide, backViewMode, safeFileIndex, cards, hasFiles, fileContent, currentFilename, currentRawUrl, fileFetchTrigger]);

  const handleFileRetry = () => {
    lastFetchedUrlRef.current = null;
    setFileError(null);
    setFileContent(null);
    setFileFetchTrigger((t) => t + 1);
  };

  if (cards.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes fc-flip-in {
          0% { opacity: 0.7; transform: scale(0.98); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes fc-slide-down {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fc-player .slick-list { z-index: 1; overflow: visible; }
        /* 스크롤 영역에서 가로 스크롤 우선: 터치 시 스와이프 대신 스크롤 처리 (모바일) */
        .fc-scroll-area,
        .fc-card .overflow-x-auto,
        .fc-card pre { touch-action: pan-x pan-y; }
        .fc-player .slick-track { display: flex; align-items: center; }
        .fc-player .slick-dots { position: relative; bottom: -28px; }
        .fc-player .slick-dots li { margin: 0 6px; }
        .fc-player .slick-dots li button:before {
          font-size: 11px; color: rgba(255, 255, 255, 0.45);
          transition: all 0.3s ease;
        }
        .fc-player .slick-dots li.slick-active button:before {
          color: white; transform: scale(1.3);
        }
        .fc-player .slick-dots li button:hover:before {
          color: rgba(255, 255, 255, 0.8);
        }
        .fc-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          border-radius: inherit;
          padding: 2px;
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.25), rgba(51, 65, 85, 0.2));
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask-composite: exclude;
          -webkit-mask-composite: xor;
          pointer-events: none;
        }
        .fc-card::-webkit-scrollbar { width: 7px; }
        .fc-card::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.04); border-radius: 10px; }
        .fc-card::-webkit-scrollbar-thumb { background: rgba(34, 197, 94, 0.28); border-radius: 10px; }
        .fc-card::-webkit-scrollbar-thumb:hover { background: rgba(34, 197, 94, 0.45); }
        .fc-card.flipped .markdown-body {
          width: 100%; padding: 2rem; box-sizing: border-box;
          background: white; text-align: left;
          overflow: visible;
        }
        .fc-card .github-diff-container { margin: 12px 0; border: 1px solid rgb(226 232 240); border-radius: 12px; }
        .fc-card .code-diff-content { margin: 12px 0; }
        .fc-card .fc-diff-code {
          display: block !important;
          width: max-content !important;
          min-width: 100%;
        }
        .fc-card .fc-diff-code mark { display: inline; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
        @media (max-width: 768px) {
          .fc-card.flipped .markdown-body { padding: 1.5rem; font-size: 0.95rem; }
        }
        @media (max-width: 480px) {
          .fc-card.flipped .markdown-body { padding: 1rem; font-size: 0.9rem; }
        }
        .fc-answer-floating .fc-answer-body::-webkit-scrollbar { width: 5px; }
        .fc-answer-floating .fc-answer-body::-webkit-scrollbar-track { background: rgba(0,0,0,0.04); border-radius: 10px; }
        .fc-answer-floating .fc-answer-body::-webkit-scrollbar-thumb { background: rgba(34, 197, 94, 0.25); border-radius: 10px; }
        @media (prefers-reduced-motion: reduce) {
          .fc-card { transition: none; }
          .fc-card.flipped { animation: none; }
          .fc-player .slick-dots li button:before { transition: none; }
        }
      `}</style>

      {renderHeader?.()}

      {renderIndicator ? (
        renderIndicator(currentSlide, cards.length) ?? <div className="mb-4" aria-hidden />
      ) : (
        <div className="text-center mb-4">
          <span className="inline-block bg-surface py-2.5 px-[22px] rounded-full shadow-[0_8px_20px_rgba(0,0,0,0.3)] text-[0.95rem] font-semibold text-primary backdrop-blur-[10px] border border-border animate-[fc-slide-down_0.5s_ease-out] max-[768px]:py-2 max-[768px]:px-[18px] max-[768px]:text-[0.85rem]">
            {currentSlide + 1} / {cards.length}
          </span>
        </div>
      )}

      <div className="fc-player flex-1 flex flex-col min-h-0 max-w-[1200px] mx-auto w-full relative z-10">
        <div className="flex-1 min-h-0 flex flex-col">
          <Slider
            ref={sliderRef}
            dots
            arrows={false}
            swipe
            infinite={false}
            beforeChange={(_, next) => {
              setFlipped(false);
              setBackViewMode('diff');
              setSelectedFileIndex(0);
              setFileContent(null);
              setFileError(null);
              lastFetchedUrlRef.current = null;
              setCurrentSlide(next);
              onSlideChange?.(next);
            }}
            appendDots={(dots) => (
              <div style={{ top: '10px' }}>
                <ul style={{ padding: '0px' }}>{dots}</ul>
              </div>
            )}
          >
            {cards.map((card, i) => {
              const isFlipped = flipped && currentSlide === i;

              return (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  aria-label={isFlipped ? t('flashcard.viewFront') : t('flashcard.viewBack')}
                  aria-busy={regeneratingIndex === i}
                  className={`fc-card flex !flex items-center justify-center text-2xl text-center min-h-[50vh] max-h-[80vh] m-3 bg-white border-none rounded-3xl overflow-auto transition-all duration-300 shadow-[0_20px_60px_rgba(0,0,0,0.4),0_0_0_1px_rgba(34,197,94,0.25)] relative antialiased cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 max-[768px]:min-h-[40vh] max-[768px]:max-h-[75vh] max-[768px]:m-2 max-[768px]:text-xl max-[768px]:rounded-[20px] max-[480px]:min-h-[35vh] max-[480px]:max-h-[70vh] max-[480px]:m-[5px] max-[480px]:text-base max-[480px]:rounded-4 ${isFlipped ? 'flipped items-start justify-start text-left shadow-[0_25px_70px_rgba(0,0,0,0.5),0_0_0_1px_rgba(34,197,94,0.3)] overflow-hidden animate-[fc-flip-in_0.3s_ease-out]' : ''}`}
                  onClick={() => {
                    if (regeneratingIndex === i) return;
                    flipCard();
                  }}
                  onKeyDown={(e) => {
                    if (regeneratingIndex === i) return;
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      flipCard();
                    }
                  }}
                  {...(!isFlipped && onDeleteCard ? { onTouchStart: swipeHandlers.onTouchStart, onTouchEnd: swipeHandlers.onTouchEnd } : {})}
                >
                  {regeneratingIndex === i && (
                    <div
                      className="absolute inset-0 z-10 flex items-center justify-center rounded-3xl bg-white/90 backdrop-blur-sm animate-pulse motion-reduce:animate-none"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                      role="status"
                      aria-live="polite"
                      aria-label={t('flashcard.regenerating')}
                    >
                      <div className="flex flex-col items-center gap-3 text-slate-700">
                        <span className="flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 text-primary">
                          <Sparkles className="w-6 h-6" aria-hidden />
                        </span>
                        <span className="text-sm font-medium">{t('flashcard.regenerating')}</span>
                      </div>
                    </div>
                  )}
                  {isFlipped ? (
                    <div className="fc-card-back w-full h-full flex flex-col min-h-0">
                      <div
                        className="shrink-0"
                        onClick={(e) => e.stopPropagation()}
                        {...(onDeleteCard && isMobile ? { onTouchStart: swipeHandlers.onTouchStart, onTouchEnd: swipeHandlers.onTouchEnd } : {})}
                      >
                      <div
                        className="fc-back-header flex items-center justify-between gap-2 p-2 border-b border-slate-200 bg-slate-50 rounded-t-3xl"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div
                          className="flex shrink-0 items-center gap-1"
                          role="tablist"
                          aria-label={t('flashcard.backViewMode')}
                        >
                          <button
                            type="button"
                            role="tab"
                            aria-selected={backViewMode === 'diff'}
                            aria-label={t('flashcard.viewDiff')}
                            title={t('flashcard.viewDiff')}
                            className={`fc-tab flex items-center justify-center gap-1.5 w-9 h-9 sm:min-w-[88px] sm:w-auto sm:py-2 sm:px-3 rounded-xl text-sm font-medium transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${backViewMode === 'diff' ? 'bg-primary text-white shadow-sm' : 'bg-transparent text-slate-800 hover:bg-slate-100'}`}
                            onClick={() => setBackViewMode('diff')}
                          >
                            <GitCompare className="w-4 h-4 shrink-0" aria-hidden />
                            <span className="hidden sm:inline">{t('flashcard.viewDiff')}</span>
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={backViewMode === 'file'}
                            aria-label={t('flashcard.viewFile')}
                            title={t('flashcard.viewFile')}
                            disabled={!hasFileView}
                            className={`fc-tab flex items-center justify-center gap-1.5 w-9 h-9 sm:min-w-[88px] sm:w-auto sm:py-2 sm:px-3 rounded-xl text-sm font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${backViewMode === 'file' ? 'bg-primary text-white shadow-sm' : 'bg-transparent text-slate-800 hover:bg-slate-100'} ${hasFileView ? 'cursor-pointer' : ''}`}
                            onClick={() => hasFileView && setBackViewMode('file')}
                          >
                            <FileText className="w-4 h-4 shrink-0" aria-hidden />
                            <span className="hidden sm:inline">{t('flashcard.viewFile')}</span>
                          </button>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {onRegenerateQuestion && card.metadata?.rawDiff && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); onRegenerateQuestion(i); }}
                              aria-label={t('flashcard.regenerateQuestion')}
                              title={t('flashcard.regenerateQuestion')}
                              disabled={regeneratingIndex === i}
                              className="flex items-center justify-center gap-1.5 w-9 h-9 sm:min-w-[88px] sm:w-auto sm:py-2 sm:px-3 rounded-xl text-sm font-medium transition-colors duration-200 bg-transparent text-slate-800 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            >
                              <Sparkles className="w-4 h-4 shrink-0" aria-hidden />
                              <span className="hidden sm:inline">{t('flashcard.regenerateQuestion')}</span>
                            </button>
                          )}
                          {onDeleteCard && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); onDeleteCard(i, 'button'); }}
                              aria-label={t('flashcard.removeCard')}
                              title={t('flashcard.removeCard')}
                              className="flex items-center justify-center min-w-[44px] min-h-[44px] w-9 h-9 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-rose-600 transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                            >
                              <Trash2 className="w-4 h-4 shrink-0" aria-hidden />
                            </button>
                          )}
                        </div>
                      </div>
                      <div
                        className="fc-highlight-guide flex items-center gap-1.5 px-3 py-1.5 border-b border-slate-100 bg-amber-50/60 text-slate-600 text-[11px] shrink-0"
                        onClick={(e) => e.stopPropagation()}
                        aria-hidden
                      >
                        <span className="inline-block w-3 h-3 rounded-sm bg-amber-100/90 border border-amber-200/80" />
                        <span>{t('flashcard.highlightHint')}</span>
                      </div>
                      </div>
                      <div className="fc-back-content flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
                        {backViewMode === 'file' && hasFileView && (
                          <div
                            className="shrink-0 px-3 py-2 border-b border-slate-200 bg-white space-y-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {card.metadata?.repositoryFullName && (
                              <a
                                href={`https://github.com/${card.metadata.repositoryFullName}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-[0.75rem] font-mono text-slate-600 no-underline transition-colors duration-200 hover:text-slate-800 hover:underline"
                                aria-label={t('flashcard.openRepoOnGitHub', { repo: card.metadata.repositoryFullName })}
                                title={t('flashcard.openRepoOnGitHub', { repo: card.metadata.repositoryFullName })}
                              >
                                <img src="/github-mark.svg" alt="" width={14} height={14} className="w-3.5 h-3.5 shrink-0" aria-hidden />
                                <span className="truncate max-w-full">{card.metadata.repositoryFullName}</span>
                              </a>
                            )}
                            {hasFilesArray && effectiveFiles.length > 1 ? (
                              <Select
                                value={String(safeFileIndex)}
                                onValueChange={(value) => {
                                  setSelectedFileIndex(Number(value));
                                  lastFetchedUrlRef.current = null;
                                }}
                              >
                                <SelectTrigger
                                  className="h-8 w-full max-w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:ring-primary focus:ring-offset-1"
                                  onClick={(e) => e.stopPropagation()}
                                  aria-label={t('flashcard.selectFile')}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent onClick={(e) => e.stopPropagation()}>
                                  {effectiveFiles.map((f, i) => (
                                    <SelectItem key={i} value={String(i)} title={f.filename}>
                                      <span className="truncate block max-w-[240px]">{f.filename}</span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-xs text-slate-500 truncate block" title={currentFilename}>
                                {currentFilename}
                              </span>
                            )}
                          </div>
                        )}
                        <div
                          className="fc-scroll-area flex-1 min-h-0 overflow-auto"
                          onTouchStartCapture={onTouchStartCapture}
                          onTouchMoveCapture={onTouchMoveCapture}
                        >
                          {backViewMode === 'diff' ? (
                            card.metadata?.rawDiff ? (
                              <CodeDiffBlock diffContent={card.metadata.rawDiff} highlightStrings={card.highlights} />
                            ) : (
                              <div className="p-6 text-slate-500 text-sm">{t('flashcard.noDiffContent')}</div>
                            )
                          ) : fileLoading ? (
                            <div className="p-6 text-slate-500 text-sm">{t('flashcard.loadingFile')}</div>
                          ) : fileError ? (
                            <div
                              className="flex flex-col items-center justify-center gap-4 p-6 text-center"
                              onClick={(e) => e.stopPropagation()}
                              role="alert"
                            >
                              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 text-amber-600" aria-hidden>
                                <WifiOff className="w-6 h-6" aria-hidden />
                              </div>
                              <p className="text-sm text-slate-700 leading-relaxed">{fileError}</p>
                              <button
                                type="button"
                                onClick={handleFileRetry}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-primary text-white hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-colors duration-200 cursor-pointer"
                                aria-label={t('flashcard.retry')}
                              >
                                <RefreshCw className="w-4 h-4 shrink-0" aria-hidden />
                                {t('flashcard.retry')}
                              </button>
                            </div>
                          ) : fileContent !== null ? (
                            <FileContentBlock content={fileContent} filename={currentFilename} highlightStrings={card.highlights} />
                          ) : (
                            <div className="p-6 text-slate-500 text-sm">{t('flashcard.noFileInfo')}</div>
                          )}
                        </div>
                      </div>
                      {/* 하단 플로팅: Diff/파일 보기 토글과 무관하게 항상 노출 */}
                      <AIAnswerFloatingBlock answer={card.answer} />
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col min-h-0">
                      <div
                        className="fc-front-header flex items-center justify-between gap-2 p-2 border-b border-slate-200 bg-slate-50 rounded-t-3xl"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="min-w-0 flex items-center gap-1.5 overflow-hidden">
                          {card.metadata?.repositoryFullName && (
                            <span className="inline-flex min-w-0 items-center gap-1.5 h-9 px-2 rounded-lg bg-white border border-slate-200 text-[0.75rem] font-mono text-slate-600">
                              <img src="/github-mark.svg" alt="" width={14} height={14} className="w-3.5 h-3.5 shrink-0" aria-hidden />
                              <span className="truncate max-w-[180px] sm:max-w-[260px]" title={card.metadata.repositoryFullName}>
                                {card.metadata.repositoryFullName}
                              </span>
                            </span>
                          )}
                          {card.metadata?.branch && (
                            <span className="inline-flex min-w-0 items-center gap-1.5 h-9 px-2 rounded-lg bg-white border border-slate-200 text-[0.75rem] font-mono text-slate-600">
                              <GitBranch className="w-3.5 h-3.5 shrink-0" aria-hidden />
                              <span className="truncate max-w-[110px] sm:max-w-[180px]" title={card.metadata.branch}>
                                {card.metadata.branch}
                              </span>
                            </span>
                          )}
                        </div>
                        {onDeleteCard && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onDeleteCard(i, 'button'); }}
                            aria-label={t('flashcard.removeCard')}
                            title={t('flashcard.removeCard')}
                            className="flex shrink-0 items-center justify-center min-w-[44px] min-h-[44px] w-9 h-9 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-rose-600 transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                          >
                            <Trash2 className="w-4 h-4 shrink-0" aria-hidden />
                          </button>
                        )}
                      </div>
                      <div className="flex-1 min-h-0 flex flex-col items-center justify-center w-full p-4 sm:p-8 text-center">
                        <span className="inline-block mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                          {t('flashcard.question')}
                        </span>
                        <p className="text-[1.6rem] font-semibold text-[#1D232B] leading-[1.7] break-words [word-break:keep-all] whitespace-pre-line max-[768px]:text-[1.3rem] max-[480px]:text-[1.15rem]">
                          {card.question}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </Slider>
        </div>
      </div>

      {renderFooter?.()}
    </>
  );
};

export default FlashCardPlayer;
