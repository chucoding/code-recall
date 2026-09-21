import {onRequest} from "firebase-functions/v2/https";
import {consumeAiQuota} from "./ai-guard.js";
import {OpenAIRequestError, requestFlashcardCompletion} from "./flashcard-generation.js";

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
 * OpenAI Chat Completions - 요청은 { text }, 프롬프트는 서버에서 조회
 * response_format으로 JSON 스키마 적용, 응답은 앱이 쓰는 형태로 정규화해 반환
 *
 * 랜딩 데모가 비로그인으로 호출하므로 `invoker: "public"`을 유지하고, 모델 호출 앞에
 * `consumeAiQuota`로 호출자별 한도와 데모 전체 상한을 검사한다.
 * 모델 호출 자체는 사전 생성 경로와 같은 `requestFlashcardCompletion`을 쓴다.
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

      const completion = await requestFlashcardCompletion(text, lang);
      const normalized: NormalizedChatCompletionResponse = {
        status: {code: "200", message: "OK"},
        result: {
          message: {role: "assistant", content: completion.content},
          finishReason: completion.finishReason,
          created: completion.created ?? Math.floor(Date.now() / 1000),
          seed: 0,
          usage: {
            promptTokens: completion.usage.prompt_tokens ?? 0,
            completionTokens: completion.usage.completion_tokens ?? 0,
            totalTokens: completion.usage.total_tokens ?? 0,
          },
        },
      };

      res.json(normalized);
    } catch (error) {
      if (error instanceof OpenAIRequestError) {
        res.status(500).json({
          error: `OpenAI API 호출 실패: ${error.status} - ${error.body}`,
        });
        return;
      }
      console.error("Error calling OpenAI API:", error);
      res.status(500).json({error: "OpenAI API 호출 실패"});
    }
  }
);
