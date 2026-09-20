/**
 * OpenAI Chat Completions 공용 설정
 *
 * 모델과 요청 파라미터를 호출부마다 따로 적어 두면 모델을 바꿀 때 한 곳이 빠진 채 남는다.
 * 모델 이름과 요청 본문 형태는 이 파일에서만 정한다.
 *
 * GPT-5 계열 추론 모델은 temperature와 top_p를 값과 무관하게 거부하고,
 * max_tokens 대신 max_completion_tokens를 받는다. 응답의 깊이는 reasoning_effort로 조절한다.
 */

/** 모든 OpenAI 호출이 쓰는 모델 */
export const OPENAI_MODEL = "gpt-5.6-luna";

/** Chat Completions 엔드포인트 */
export const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

/** 추론 강도. 낮을수록 빠르고 저렴하며, 높을수록 응답 품질이 올라감 */
export type OpenAIReasoningEffort = "none" | "low" | "medium" | "high";

/** response_format에 넣는 Structured Outputs 스키마 */
export interface OpenAIResponseFormat {
  type: "json_schema";
  json_schema: unknown;
}

/** Chat Completions 요청 본문 구성 값 */
export interface OpenAIChatBodyParams {
  /** system 역할로 넣을 프롬프트 */
  systemPrompt: string;
  /** user 역할로 넣을 본문 */
  userContent: string;
  /** Structured Outputs 스키마 */
  responseFormat: OpenAIResponseFormat;
  /** 추론 강도 */
  reasoningEffort: OpenAIReasoningEffort;
  /** 추론 토큰까지 포함한 출력 상한 */
  maxCompletionTokens: number;
}

/**
 * Chat Completions 요청 본문 생성
 *
 * @param {OpenAIChatBodyParams} params - 프롬프트와 모델 파라미터
 * @return {Record<string, unknown>} fetch 본문에 그대로 넣는 요청 객체
 */
export function buildOpenAIChatBody(
  params: OpenAIChatBodyParams
): Record<string, unknown> {
  return {
    model: OPENAI_MODEL,
    messages: [
      {role: "system", content: params.systemPrompt},
      {role: "user", content: params.userContent},
    ],
    reasoning_effort: params.reasoningEffort,
    max_completion_tokens: params.maxCompletionTokens,
    response_format: params.responseFormat,
  };
}
