import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import i18n from '@/shared/config/i18n';
import { createQueryKeys } from '@/shared/lib/query-keys';
import type { FlashCard } from '@/entities/flashcard';
import { fetchPregeneratedDemoFlashcards } from '../api/demo-cache';
import { generateDemoFlashcards } from '../lib/demoFlashcards';
import { parseGitHubRepositoryUrl } from '../lib/github-url';

/** 데모 카드 쿼리 키 */
export const demoFlashcardKeys = createQueryKeys('demo-flashcards', {
  cards: (repositoryUrl: string, lang: 'ko' | 'en') => [repositoryUrl, lang],
});

/**
 * 데모 카드 적재
 *
 * 사전 생성 캐시를 먼저 보고, 없을 때만 실시간 생성으로 넘어간다.
 * 사용자가 `@branch`로 브랜치를 지정하면 기본 브랜치 기준인 사전 캐시와 내용이 달라지므로 건너뛴다.
 */
async function loadDemoFlashcards(repositoryUrl: string, lang: 'ko' | 'en'): Promise<FlashCard[]> {
  const parsed = parseGitHubRepositoryUrl(repositoryUrl);

  if (parsed && !parsed.branch) {
    const pregenerated = await fetchPregeneratedDemoFlashcards(parsed.owner, parsed.repo, lang);
    if (pregenerated) return pregenerated.cards;
  }

  const result = await generateDemoFlashcards(repositoryUrl, lang);
  if (!result.ok) throw new Error(result.error);
  return result.cards;
}

/** `useDemoFlashcards`가 돌려주는 구독 값 */
export interface DemoFlashcardsState {
  cards: FlashCard[];
  /** 카드를 만들거나 읽어오는 중인지 여부 */
  isLoading: boolean;
  /** 실패 사유. 실패가 없으면 빈 문자열 */
  error: string;
  /** 지금 보고 있는 저장소 URL. 아직 요청 전이면 null */
  repositoryUrl: string | null;
  /** 저장소 카드를 요청. 캐시에 있으면 호출 없이 즉시 반영 */
  requestCards: (repositoryUrl: string) => void;
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

  const { data, isFetching, error, refetch } = useQuery({
    queryKey,
    queryFn: () => loadDemoFlashcards(repositoryUrl as string, lang),
    enabled: repositoryUrl !== null,
  });

  const requestCards = useCallback(
    (nextRepositoryUrl: string) => {
      if (nextRepositoryUrl !== repositoryUrl) {
        setRepositoryUrl(nextRepositoryUrl);
        return;
      }
      // 같은 저장소를 다시 누른 경우. 성공 캐시는 그대로 쓰고, 실패했을 때만 다시 시도한다
      if (error) void refetch();
    },
    [error, refetch, repositoryUrl]
  );

  const replaceCards = useCallback(
    (cards: FlashCard[]) => {
      queryClient.setQueryData(queryKey, cards);
    },
    [queryClient, queryKey]
  );

  return {
    cards: data ?? [],
    isLoading: isFetching,
    error: error ? error.message || i18n.t('errors.generic') : '',
    repositoryUrl,
    requestCards,
    replaceCards,
  };
}
