import { QueryClient } from '@tanstack/react-query';

/**
 * 앱 전역 QueryClient
 *
 * 랜딩 데모는 GitHub API와 AI를 거쳐 카드를 만들어 한 번 호출에 수 초가 걸린다.
 * 같은 저장소를 다시 눌렀을 때 재호출하지 않도록 기본값을 캐시 우선으로 둔다.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 데모 카드와 트렌딩 목록 모두 하루 단위로만 바뀌므로 세션 중에는 재요청하지 않음
      staleTime: 60 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      // 저장소 없음이나 AI 한도 초과는 재시도해도 같은 실패라 대기 시간만 늘어남
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});
