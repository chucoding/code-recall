import { useQuery } from '@tanstack/react-query';
import { createQueryKeys } from '@/shared/lib/query-keys';
import type { TrendingRepository } from '@/entities/repository';
import { fetchTrendingRepositories } from '../api/repos';
import { FALLBACK_TRENDING_REPOSITORIES } from '../lib/fallback';

/** 트렌딩 목록 쿼리 키 */
export const trendingRepositoryKeys = createQueryKeys('trending-repositories', {
  list: (since: string) => [since],
});

/** `useTrendingRepositories`가 돌려주는 구독 값 */
export interface TrendingRepositoriesState {
  repositories: TrendingRepository[];
  /** 캐시 갱신 시각. 기본 목록을 보여주는 동안에는 null */
  updatedAt: Date | null;
  /** 실제 Trending 캐시가 아니라 기본 목록을 보여주는 중인지 여부 */
  isFallback: boolean;
}

/**
 * GitHub Trending 캐시 구독
 *
 * 사용처가 상위에서 목록을 받아오지 않고 직접 구독하도록 훅으로 분리했다.
 * 목록은 스케줄러가 하루 한 번만 갱신하므로 쿼리 캐시에 두어 랜딩을 오갈 때 Firestore를 다시 읽지 않는다.
 * 캐시를 읽기 전에는 기본 목록을 내보내 뱃지 줄이 비어 보이지 않게 한다.
 */
export function useTrendingRepositories(): TrendingRepositoriesState {
  const { data } = useQuery({
    queryKey: trendingRepositoryKeys.list('daily'),
    queryFn: fetchTrendingRepositories,
  });

  if (!data) {
    return {
      repositories: FALLBACK_TRENDING_REPOSITORIES,
      updatedAt: null,
      isFallback: true,
    };
  }

  return {
    repositories: data.repositories,
    updatedAt: data.updatedAt,
    isFallback: false,
  };
}
