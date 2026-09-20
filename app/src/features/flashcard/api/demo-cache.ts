import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { store } from '@/shared/config/firebase';
import type { FlashCard } from '@/entities/flashcard';

/**
 * 랜딩 데모 사전 생성 캐시 조회
 *
 * 데모 카드는 GitHub 커밋 조회와 AI 생성을 거쳐 한 번 만드는 데 수 초가 걸린다.
 * 트렌딩 Top 10은 Cloud Functions(refreshTrendingRepos)가 매일 미리 만들어 두므로
 * 랜딩은 그 문서를 먼저 읽고, 없을 때만 실시간 생성으로 넘어간다.
 */

const DEMO_FLASHCARD_COLLECTION = 'demoFlashcards';

/** 사전 생성 캐시 한 건 */
export interface DemoFlashcardSnapshot {
  cards: FlashCard[];
  /** 사전 생성 시각. 값이 없으면 null */
  updatedAt: Date | null;
}

/**
 * 사전 생성 문서 ID 생성
 *
 * Firestore 문서 ID에는 `/`를 쓸 수 없어 `owner/repo` 대신 `__`로 잇는다.
 * 생성 측(Cloud Functions)과 규칙이 같아야 하므로 양쪽에서 동일한 형식을 쓴다.
 *
 * @param owner - 저장소 소유자
 * @param repo - 저장소 이름
 * @param lang - 카드 언어
 */
export function toDemoFlashcardCacheId(owner: string, repo: string, lang: 'ko' | 'en'): string {
  return `${owner}__${repo}__${lang}`;
}

/**
 * 사전 생성된 데모 카드 조회
 *
 * @param owner - 저장소 소유자
 * @param repo - 저장소 이름
 * @param lang - 카드 언어
 * @returns 캐시가 없거나 읽기에 실패하면 null
 */
export async function fetchPregeneratedDemoFlashcards(
  owner: string,
  repo: string,
  lang: 'ko' | 'en'
): Promise<DemoFlashcardSnapshot | null> {
  try {
    const snapshot = await getDoc(
      doc(store, DEMO_FLASHCARD_COLLECTION, toDemoFlashcardCacheId(owner, repo, lang))
    );
    if (!snapshot.exists()) return null;

    const data = snapshot.data() as { cards?: FlashCard[]; updatedAt?: Timestamp };
    if (!Array.isArray(data.cards) || data.cards.length === 0) return null;

    return {
      cards: data.cards,
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
    };
  } catch {
    // 규칙 변경이나 네트워크 실패로 못 읽어도 실시간 생성으로 이어져야 함
    return null;
  }
}
