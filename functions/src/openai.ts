import {onRequest} from "firebase-functions/v2/https";
import {getFlashcardPrompt} from "./prompts.js";
import {buildOpenAIChatBody, OPENAI_CHAT_COMPLETIONS_URL} from "./openai-model.js";
import {consumeAiQuota, MAX_FLASHCARD_PROMPT_CHARS, truncateForPrompt} from "./ai-guard.js";

/**
 * 앱에서 사용하는 정규화 응답 타입
 *
 * 형태는 초기 공급자였던 Clova의 응답에서 왔고, 앱이 이미 이 형태로 파싱하고 있어
 * OpenAI 응답을 여기에 맞춰 옮긴다.
 */
interface NormalizedChatCompletionResponse {
  status: {
    code: string;
    message: string;
  };
  result: {
    message: {
      role: string;
      content: string;
    };
    finishReason: string;
    created: number;
    seed: number;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  };
}

/**
 * 플래시카드 구조화 출력 스키마 (app types와 동기화)
 * OpenAI Structured Outputs로 응답 형식 보장
 */
export const FLASHCARD_RESPONSE_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "flashcard_items",
    description: "기술 면접용 플래시카드 질문·답변 목록",
    strict: true,
    schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          description: "질문과 답변 쌍 목록",
          items: {
            type: "object",
            properties: {
              question: { type: "string", description: "면접 질문" },
              answer: { type: "string", description: "기대 답변 (2~4문장)" },
              highlights: {
                type: "array",
                description: "원문에서 이 질문과 연결되는 문장/코드 라인 (정확히 일치하는 문자열 1~3개)",
                items: { type: "string" },
              },
            },
            required: ["question", "answer", "highlights"],
            additionalProperties: false,
          },
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
};

/**
 * OpenAI Chat Completions - 요청은 { text }, 프롬프트는 서버에서 조회
 * response_format으로 JSON 스키마 적용, 응답은 앱이 쓰는 형태로 정규화해 반환
 *
 * 랜딩 데모가 비로그인으로 호출하므로 `invoker: "public"`을 유지하고, 모델 호출 앞에
 * `consumeAiQuota`로 호출자별 한도와 데모 전체 상한을 검사한다.
 */
export const openaiChatCompletions = onRequest(
  {
    cors: true,
    region: "asia-northeast3",
    invoker: "public",
    // 추론 모델은 응답까지 시간이 더 걸려 기본 60초로는 모자람
    timeoutSeconds: 120,
  },
  async (req, res) => {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        res.status(500).json({error: "OpenAI API 호출 실패: OPENAI_API_KEY가 설정되지 않았습니다."});
        return;
      }

      const {text, lang} = req.body as { text?: string; lang?: 'ko' | 'en' };

      if (!text) {
        res.status(400).json({error: "text is required"});
        return;
      }

      const guard = await consumeAiQuota(req);
      if (!guard.allowed) {
        res.status(guard.status).json(guard.body);
        return;
      }

      const {text: promptText, truncated} = truncateForPrompt(text, MAX_FLASHCARD_PROMPT_CHARS);
      if (truncated) {
        console.warn(
          `본문이 상한을 넘어 잘라서 호출: 원본 ${text.length}자 → ${MAX_FLASHCARD_PROMPT_CHARS}자`
        );
      }

      const prompt = getFlashcardPrompt(lang);

      const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(buildOpenAIChatBody({
          systemPrompt: prompt,
          userContent: promptText,
          responseFormat: FLASHCARD_RESPONSE_SCHEMA,
          reasoningEffort: "low",
          // 추론 토큰이 출력 상한을 함께 쓰므로 기존 4096에서 올림
          maxCompletionTokens: 8192,
        })),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("OpenAI API error:", response.status, errorText);
        res.status(500).json({
          error: `OpenAI API 호출 실패: ${response.status} - ${errorText}`,
        });
        return;
      }

      const data = await response.json() as {
        choices?: Array<{
          message?: { content?: string };
          finish_reason?: string;
        }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
        created?: number;
      };

      const content = data.choices?.[0]?.message?.content ?? "";
      const usage = data.usage ?? {};
      const normalized: NormalizedChatCompletionResponse = {
        status: {code: "200", message: "OK"},
        result: {
          message: {role: "assistant", content},
          finishReason: data.choices?.[0]?.finish_reason ?? "stop",
          created: data.created ?? Math.floor(Date.now() / 1000),
          seed: 0,
          usage: {
            promptTokens: usage.prompt_tokens ?? 0,
            completionTokens: usage.completion_tokens ?? 0,
            totalTokens: usage.total_tokens ?? 0,
          },
        },
      };

      res.json(normalized);
    } catch (error) {
      console.error("Error calling OpenAI API:", error);
      res.status(500).json({error: "OpenAI API 호출 실패"});
    }
  }
);
