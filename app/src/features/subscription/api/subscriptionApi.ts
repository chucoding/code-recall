import { AI_REQUEST_TIMEOUT_MS } from '@/shared/api/ai-timeout';
import { apiClient } from '@/shared/api/apiClient';

export type PriceId = 'monthly' | 'yearly';

export const REGENERATE_QUESTION_LIMIT_FREE = 3;
export const REGENERATE_QUESTION_LIMIT_PRO = 20;

/**
 * Stripe Checkout 세션 생성 후 리다이렉트 URL 반환
 */
export async function createCheckoutSession(priceId: PriceId, returnUrlBase?: string): Promise<{ url: string }> {
  const { data } = await apiClient.post<{ url: string }>('/createCheckoutSession', {
    priceId,
    returnUrlBase: returnUrlBase || (typeof window !== 'undefined' ? window.location.origin : ''),
  });
  return data;
}

export interface RegenerateCardQuestionParams {
  rawDiff: string;
  existingQuestion: string;
  existingAnswer: string;
  flashcardDate: string;
  otherQuestions?: string[];
  lang?: 'ko' | 'en';
}

export interface RegenerateCardQuestionDemoParams {
  rawDiff: string;
  existingQuestion: string;
  existingAnswer: string;
  demoDeviceId: string;
  otherQuestions?: string[];
  lang?: 'ko' | 'en';
}

export interface RegenerateCardQuestionResult {
  question: string;
  highlights?: string[];
}

export async function regenerateCardQuestion(
  params: RegenerateCardQuestionParams
): Promise<RegenerateCardQuestionResult> {
  // apiClient는 GitHub 프록시용 공용 인스턴스라 제한 시간이 15초. AI 재생성은 그보다 오래 걸리므로 이 호출에만 연장
  const { data } = await apiClient.post<RegenerateCardQuestionResult>('/regenerateCardQuestion', params, {
    timeout: AI_REQUEST_TIMEOUT_MS,
  });
  return data;
}

const FUNCTIONS_URL = import.meta.env.PROD
  ? import.meta.env.VITE_FUNCTIONS_URL_PROD
  : '/api';

export async function regenerateCardQuestionDemo(
  params: RegenerateCardQuestionDemoParams
): Promise<RegenerateCardQuestionResult> {
  const res = await fetch(`${FUNCTIONS_URL}/regenerateCardQuestion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || `재생성 실패 (${res.status})`);
  }
  return res.json();
}
