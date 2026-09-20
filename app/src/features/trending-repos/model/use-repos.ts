import { useEffect, useState } from 'react';
import type { TrendingRepository } from '@/entities/repository';
import { fetchTrendingRepositories } from '../api/repos';
import { FALLBACK_TRENDING_REPOSITORIES } from '../lib/fallback';

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
 * 첫 렌더에서 기본 목록을 내보내 뱃지 줄이 비어 보이지 않게 하고, 캐시를 읽으면 교체한다.
 */
export function useTrendingRepositories(): TrendingRepositoriesState {
  const [state, setState] = useState<TrendingRepositoriesState>({
    repositories: FALLBACK_TRENDING_REPOSITORIES,
    updatedAt: null,
    isFallback: true,
  });

  useEffect(() => {
    let active = true;

    fetchTrendingRepositories().then((snapshot) => {
      if (!active || !snapshot) return;
      setState({
        repositories: snapshot.repositories,
        updatedAt: snapshot.updatedAt,
        isFallback: false,
      });
    });

    return () => {
      active = false;
    };
  }, []);

  return state;
}
