import { auth } from '@/shared/config/firebase';

/**
 * 로그인 상태면 Firebase ID 토큰 헤더 반환
 *
 * 공개 AI 함수는 비로그인 랜딩 데모도 호출하므로 토큰을 필수로 두지 않는다. 서버는
 * 토큰이 있으면 uid 기준 일일 한도, 없으면 데모 한도를 적용하므로, 로그인 사용자의
 * 호출이 데모 몫을 쓰지 않도록 토큰이 있을 때는 반드시 실어 보낸다.
 *
 * `apiClient`는 GitHub 프록시 전용 axios 인스턴스라 같은 일을 인터셉터로 하지만,
 * AI 호출은 제한 시간과 오류 처리를 따로 두어 `fetch`를 쓰므로 헤더만 따로 만든다.
 *
 * @returns Authorization 헤더가 담긴 객체. 비로그인이거나 토큰 조회가 실패하면 빈 객체
 */
export async function getAuthHeader(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};

  try {
    return { Authorization: `Bearer ${await user.getIdToken()}` };
  } catch (error) {
    console.error('Firebase ID Token 가져오기 실패:', error);
    return {};
  }
}
