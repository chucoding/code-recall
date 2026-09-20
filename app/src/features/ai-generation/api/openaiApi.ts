import { AI_REQUEST_TIMEOUT_MS } from '@/shared/api/ai-timeout';
import { getAuthHeader } from '@/shared/api/auth-header';
import type { ChatCompletionResponse, FlashcardStructuredOutput } from '@/shared/types';

const FUNCTIONS_URL = import.meta.env.PROD
  ? import.meta.env.VITE_FUNCTIONS_URL_PROD
  : '/api';

export async function chatCompletions(text: string, options?: { lang?: 'ko' | 'en' }): Promise<ChatCompletionResponse> {
  // 서버가 호출자별 일일 한도를 uid로 세므로 로그인 상태면 토큰을 함께 보낸다.
  // 토큰 조회에 걸리는 시간이 호출 제한 시간을 깎지 않도록 타이머보다 먼저 받는다
  const authHeader = await getAuthHeader();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${FUNCTIONS_URL}/openaiChatCompletions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ text, lang: options?.lang }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`AI API 호출 시간 초과 (${AI_REQUEST_TIMEOUT_MS / 1000}초)`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`AI API 호출 실패 (${response.status}): ${errorText}`);
  }

  return response.json();
}

export type { FlashcardStructuredOutput };
