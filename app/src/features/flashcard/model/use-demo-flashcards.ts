import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import i18n from '@/shared/config/i18n';
import { createQueryKeys } from '@/shared/lib/query-keys';
import type { FlashCard } from '@/entities/flashcard';
import { fetchPregeneratedDemoFlashcards } from '../api/demo-cache';
import { generateDemoFlashcards } from '../lib/demoFlashcards';
import type { DemoFlashcardsErrorCode } from '../lib/demoFlashcards';
import { parseGitHubRepositoryUrl } from '../lib/github-url';

/** 데모 카드 쿼리 키 */
export const demoFlashcardKeys = createQueryKeys('demo-flashcards', {
  cards: (repositoryUrl: string, lang: 'ko' | 'en') => [repositoryUrl, lang],
});

/**
 * 쿼리 캐시에 담는 데모 카드 묶음
 *
 * 카드와 함께 출처를 남겨 요청 결과를 보고할 때 사전 캐시 적중 여부를 알 수 있게 한다.
 */
interface DemoFlashcardDeck {
  cards: FlashCard[];
  /** 사전 생성 캐시에서 읽었으면 `pregenerated`, 실시간으로 만들었으면 `generated` */
  origin: 'pregenerated' | 'generated';
}

/** 실패 사유 코드를 함께 싣는 데모 카드 적재 오류 */
class DemoFlashcardsError extends Error {
  constructor(
    message: string,
    readonly code: DemoFlashcardsErrorCode
  ) {
    super(message);
  }
}

/**
 * 데모 카드 적재
 *
 * 사전 생성 캐시를 먼저 보고, 없을 때만 실시간 생성으로 넘어간다.
 * 사용자가 `@branch`로 브랜치를 지정하면 기본 브랜치 기준인 사전 캐시와 내용이 달라지므로 건너뛴다.
 */
async function loadDemoFlashcards(repositoryUrl: string, lang: 'ko' | 'en'): Promise<DemoFlashcardDeck> {
  const parsed = parseGitHubRepositoryUrl(repositoryUrl);

  if (parsed && !parsed.branch) {
    const pregenerated = await fetchPregeneratedDemoFlashcards(parsed.owner, parsed.repo, lang);
    if (pregenerated) return { cards: pregenerated.cards, origin: 'pregenerated' };
  }

  const result = await generateDemoFlashcards(repositoryUrl, lang);
  if (!result.ok) throw new DemoFlashcardsError(result.error, result.code);
  return { cards: result.cards, origin: 'generated' };
}

/**
 * 카드 요청 결과
 *
 * 성공이면 어느 캐시에서 채워졌는지를 `cache`로 알린다.
 * `memory`는 이 화면에서 이미 받아 둔 쿼리 캐시, `pregenerated`는 사전 생성 캐시, `none`은 실시간 생성이다.
 * 실패면 `errorCode`로 사유를 알리고, 사유를 특정할 수 없는 예외는 `unknown`이다.
 */
export type DemoFlashcardsOutcome =
  | { ok: true; cache: 'memory' | 'pregenerated' | 'none'; cardCount: number }
  | { ok: false; errorCode: DemoFlashcardsErrorCode | 'unknown' };

/** `useDemoFlashcards`가 돌려주는 구독 값 */
export interface DemoFlashcardsState {
  cards: FlashCard[];
  /** 카드를 만들거나 읽어오는 중인지 여부 */
  isLoading: boolean;
  /** 실패 사유. 실패가 없으면 빈 문자열 */
  error: string;
  /** 지금 보고 있는 저장소 URL. 아직 요청 전이면 null */
  repositoryUrl: string | null;
  /** 저장소 카드를 요청. 캐시에 있으면 호출 없이 즉시 반영하고, 적재가 끝나면 결과로 이행 */
  requestCards: (repositoryUrl: string) => Promise<DemoFlashcardsOutcome>;
  /** 삭제, 되돌리기, 질문 재생성처럼 화면에서 바꾼 카드 목록을 반영 */
  replaceCards: (cards: FlashCard[]) => void;
}

/**
 * 랜딩 데모 카드 구독
 *
 * 카드 목록을 컴포넌트 상태로 들고 있으면 같은 저장소를 다시 눌렀을 때 매번 다시 만들게 되어
 * 쿼리 캐시를 단일 출처로 둔다. 화면에서 바꾼 카드도 `replaceCards`로 같은 캐시에 써서
 * 저장소를 오갔다 돌아와도 편집 결과가 유지된다.
 *
 * @param lang - 카드 언어. 언어가 바뀌면 다른 키로 취급해 따로 캐시된다
 */
export function useDemoFlashcards(lang: 'ko' | 'en'): DemoFlashcardsState {
  const queryClient = useQueryClient();
  const [repositoryUrl, setRepositoryUrl] = useState<string | null>(null);
  const queryKey = useMemo(
    () => demoFlashcardKeys.cards(repositoryUrl ?? '', lang),
    [repositoryUrl, lang]
  );

  const { data, isFetching, error } = useQuery({
    queryKey,
    queryFn: () => loadDemoFlashcards(repositoryUrl as string, lang),
    enabled: repositoryUrl !== null,
  });

  const requestCards = useCallback(
    async (nextRepositoryUrl: string): Promise<DemoFlashcardsOutcome> => {
      const nextQueryKey = demoFlashcardKeys.cards(nextRepositoryUrl, lang);
      setRepositoryUrl(nextRepositoryUrl);

      // 성공 캐시가 신선하면 호출 없이 그대로 쓰고, 실패했거나 오래된 캐시만 다시 적재한다.
      // 화면 구독보다 먼저 적재를 시작하므로 구독 쪽은 같은 요청에 합류해 중복 호출이 생기지 않는다
      const updatedAtBefore = queryClient.getQueryState(nextQueryKey)?.dataUpdatedAt;
      try {
        const deck = await queryClient.fetchQuery({
          queryKey: nextQueryKey,
          queryFn: () => loadDemoFlashcards(nextRepositoryUrl, lang),
        });
        const reused = queryClient.getQueryState(nextQueryKey)?.dataUpdatedAt === updatedAtBefore;
        return {
          ok: true,
          cache: reused ? 'memory' : deck.origin === 'pregenerated' ? 'pregenerated' : 'none',
          cardCount: deck.cards.length,
        };
      } catch (e: unknown) {
        return { ok: false, errorCode: e instanceof DemoFlashcardsError ? e.code : 'unknown' };
      }
    },
    [lang, queryClient]
  );

  const replaceCards = useCallback(
    (cards: FlashCard[]) => {
      queryClient.setQueryData<DemoFlashcardDeck>(queryKey, (previous) =>
        previous ? { ...previous, cards } : { cards, origin: 'generated' }
      );
    },
    [queryClient, queryKey]
  );

  return {
    cards: data?.cards ?? [],
    isLoading: isFetching,
    error: error ? error.message || i18n.t('errors.generic') : '',
    repositoryUrl,
    requestCards,
    replaceCards,
  };
}
