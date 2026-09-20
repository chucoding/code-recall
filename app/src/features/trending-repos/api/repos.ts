import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { store } from '@/shared/config/firebase';
import type { TrendingRepository } from '@/entities/repository';

/**
 * GitHub Trending 캐시 조회
 *
 * GitHub은 Trending 공식 API가 없고 브라우저에서는 CORS로 페이지를 직접 읽을 수 없다.
 * Cloud Functions(refreshTrendingRepos)가 매일 수집해 둔 Firestore 문서만 읽는다.
 * 랜딩은 비로그인 화면이라 이 문서는 firestore.rules에서 공개 읽기로 열어 두었다.
 */

const TRENDING_COLLECTION = 'meta';
const TRENDING_DOCUMENT = 'trendingRepos';

/** Firestore에 저장된 Trending 캐시 한 건 */
export interface TrendingSnapshot {
  repositories: TrendingRepository[];
  /** 캐시를 갱신한 시각. 값이 없으면 null */
  updatedAt: Date | null;
}

/**
 * Trending 캐시 문서를 읽어 반환
 *
 * @returns 캐시가 없거나 읽기에 실패하면 null
 */
export async function fetchTrendingRepositories(): Promise<TrendingSnapshot | null> {
  try {
    const snapshot = await getDoc(doc(store, TRENDING_COLLECTION, TRENDING_DOCUMENT));
    if (!snapshot.exists()) return null;

    const data = snapshot.data() as { repos?: TrendingRepository[]; updatedAt?: Timestamp };
    if (!Array.isArray(data.repos) || data.repos.length === 0) return null;

    return {
      repositories: data.repos,
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
    };
  } catch {
    // 네트워크 실패나 규칙 변경으로 읽지 못해도 랜딩은 기본 목록으로 계속 동작해야 함
    return null;
  }
}
