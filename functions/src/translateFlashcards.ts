import {onRequest} from "firebase-functions/v2/https";
import {getTranslateFlashcardsPrompt} from "./prompts.js";
import {buildOpenAIChatBody, OPENAI_CHAT_COMPLETIONS_URL} from "./openai-model.js";
import {consumeAiQuota, MAX_TRANSLATE_CARDS, MAX_TRANSLATE_PROMPT_CHARS} from "./ai-guard.js";

interface FlashCardInput {
  question: string;
  answer: string;
  highlights?: string[];
  metadata?: Record<string, unknown>;
}

const TRANSLATE_RESPONSE_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "translated_items",
    description: "번역된 Q&A 쌍 목록",
    strict: true,
    schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              answer: { type: "string" },
            },
            required: ["question", "answer"],
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
 * 플래시카드 Q&A 번역 (배치)
 * POST { cards: FlashCardInput[], targetLang: 'ko' | 'en' }
 * 반환: { cards: FlashCardInput[] } (question, answer만 번역, highlights/metadata 유지)
 *
 * 모델 호출 앞에 `consumeAiQuota`로 호출자별 한도를 검사하고, 카드 수와 본문 길이에
 * 상한을 둔다. 결과를 색인으로 원본 카드에 되돌려 붙이므로 본문을 잘라 카드 수가
 * 어긋나게 만들 수 없어, 상한을 넘으면 자르지 않고 거부한다.
 */
export const translateFlashcards = onRequest(
  {
    cors: true,
    region: "asia-northeast3",
    invoker: "public",
    // 추론 모델은 응답까지 시간이 더 걸려 기본 60초로는 모자람
    timeoutSeconds: 120,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        res.status(500).json({error: "OPENAI_API_KEY가 설정되지 않았습니다."});
        return;
      }

      const body = (req.body || {}) as { cards?: FlashCardInput[]; targetLang?: "ko" | "en" };
      const {cards, targetLang} = body;

      if (!Array.isArray(cards) || cards.length === 0 || !targetLang || !["ko", "en"].includes(targetLang)) {
        res.status(400).json({error: "cards (배열, 비어있지 않음)와 targetLang ('ko' | 'en') 필수"});
        return;
      }

      if (cards.length > MAX_TRANSLATE_CARDS) {
        res.status(413).json({
          error: `cards는 한 번에 ${MAX_TRANSLATE_CARDS}건까지 번역합니다.`,
          code: "PAYLOAD_TOO_LARGE",
        });
        return;
      }

      const pairs = cards.map((c) => ({question: c?.question ?? "", answer: c?.answer ?? ""}));
      const userContent = JSON.stringify(pairs);

      if (userContent.length > MAX_TRANSLATE_PROMPT_CHARS) {
        res.status(413).json({
          error: `번역할 본문이 ${MAX_TRANSLATE_PROMPT_CHARS}자를 넘습니다.`,
          code: "PAYLOAD_TOO_LARGE",
        });
        return;
      }

      const guard = await consumeAiQuota(req);
      if (!guard.allowed) {
        res.status(guard.status).json(guard.body);
        return;
      }

      const prompt = getTranslateFlashcardsPrompt(targetLang);

      const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(buildOpenAIChatBody({
          systemPrompt: prompt,
          userContent,
          responseFormat: TRANSLATE_RESPONSE_SCHEMA,
          // 번역은 정해진 문장을 옮기는 작업이라 추론을 켜도 결과가 달라지지 않음
          reasoningEffort: "none",
          maxCompletionTokens: 8192,
        })),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("OpenAI translate error:", response.status, errorText);
        res.status(500).json({error: `번역 API 호출 실패: ${response.status}`});
        return;
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content ?? "{}";

      let parsed: { items?: Array<{ question: string; answer: string }> };
      try {
        parsed = JSON.parse(content) as { items?: Array<{ question: string; answer: string }> };
      } catch {
        console.error("Translate response parse error:", content);
        res.status(500).json({error: "번역 응답 파싱 실패"});
        return;
      }

      const translated = parsed?.items ?? [];
      if (translated.length !== cards.length) {
        console.warn("Translate length mismatch:", translated.length, "vs", cards.length);
      }

      const result = cards.map((card, i) => {
        const t = translated[i];
        return {
          ...card,
          question: t?.question ?? card.question,
          answer: t?.answer ?? card.answer,
        };
      });

      res.json({cards: result});
    } catch (error) {
      console.error("translateFlashcards error:", error);
      res.status(500).json({error: "번역 처리 중 오류가 발생했습니다."});
    }
  }
);
