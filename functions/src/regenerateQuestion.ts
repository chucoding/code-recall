import {onRequest, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {getRegenerateQuestionPrompt} from "./prompts.js";
import {buildOpenAIChatBody, OPENAI_CHAT_COMPLETIONS_URL} from "./openai-model.js";
import crypto from "crypto";

const db = getFirestore();
const LIMIT_FREE = 3;
const LIMIT_PRO = 20;
const LIMIT_DEMO = 1;

/** KST 오늘 날짜 YYYY-MM-DD */
function getTodayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split("T")[0];
}

async function getUidFromRequest(req: { headers: { authorization?: string } }): Promise<string> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new HttpsError("unauthenticated", "ID token required.");
  }
  const idToken = authHeader.split("Bearer ")[1];
  const decoded = await getAuth().verifyIdToken(idToken);
  return decoded.uid;
}

function hashDemoDeviceId(demoDeviceId: string): string {
  return crypto.createHash("sha256").update(demoDeviceId).digest("hex").slice(0, 32);
}

const FLASHCARD_RESPONSE_SCHEMA = {
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
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              answer: { type: "string" },
              highlights: {
                type: "array",
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
 * 플래시카드 질문 재생성 (로그인: Free 3회/일, Pro 20회/일 | 데모: 3회/일)
 * POST. 인증 선택 (있으면 로그인, 없으면 demoDeviceId 필수)
 * Body: { rawDiff, existingQuestion, existingAnswer, flashcardDate?, demoDeviceId? }
 */
export const regenerateCardQuestion = onRequest(
  // 추론 모델은 응답까지 시간이 더 걸려 기본 60초로는 모자람
  {cors: true, region: "asia-northeast3", invoker: "public", timeoutSeconds: 120},
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    try {
      const body = (req.body || {}) as {
        rawDiff?: string;
        existingQuestion?: string;
        existingAnswer?: string;
        flashcardDate?: string;
        demoDeviceId?: string;
        otherQuestions?: string[];
        lang?: 'ko' | 'en';
      };

      const {rawDiff, existingQuestion, existingAnswer, flashcardDate: _flashcardDate, demoDeviceId, otherQuestions, lang} = body;

      if (!rawDiff || typeof existingQuestion !== "string" || typeof existingAnswer !== "string") {
        res.status(400).json({error: "rawDiff, existingQuestion, existingAnswer are required"});
        return;
      }

      const today = getTodayKST();
      const hasAuth = !!req.headers.authorization?.startsWith("Bearer ");

      if (hasAuth) {
        // 로그인 사용자
        const uid = await getUidFromRequest(req);
        const userRef = db.collection("users").doc(uid);
        const userSnap = await userRef.get();
        if (!userSnap.exists) {
          res.status(404).json({error: "User not found"});
          return;
        }
        const data = userSnap.data()!;
        const tier = data.subscriptionTier === "pro" ? "pro" : "free";
        const limit = tier === "pro" ? LIMIT_PRO : LIMIT_FREE;
        let count = typeof data.regenerateCountToday === "number" ? data.regenerateCountToday : 0;
        const lastDate = data.lastRegenerateDate as string | undefined;

        if (lastDate !== today) count = 0;
        if (count >= limit) {
          res.status(429).json({
            error: "Daily regenerate limit reached",
            code: "LIMIT_EXCEEDED",
            limit,
          });
          return;
        }

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          res.status(500).json({error: "OPENAI_API_KEY not configured"});
          return;
        }

        const systemPrompt = getRegenerateQuestionPrompt(lang);
        const otherList = Array.isArray(otherQuestions)
          ? otherQuestions.filter((q): q is string => typeof q === "string").slice(0, 10)
          : [];
        const otherSection = otherList.length > 0
          ? `\n\n덱의 다른 질문들(이들과도 겹치지 않아야 함):\n${otherList.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
          : "";
        const userContent = `${rawDiff}\n\n---\n[질문 재생성]\n기존 질문: ${existingQuestion}\n기존 답변: ${existingAnswer}${otherSection}\n\n위 원문과 답변에 맞는, 기존 질문${otherList.length > 0 ? " 및 덱의 다른 질문들과도 다른" : "과 다른"} 새로운 면접 질문 1개를 작성해주세요. (답변은 그대로 두고, 질문과 하이라이트만 새로 작성)`;

        const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify(buildOpenAIChatBody({
            systemPrompt,
            userContent,
            responseFormat: FLASHCARD_RESPONSE_SCHEMA,
            reasoningEffort: "low",
            // 추론 토큰이 출력 상한을 함께 쓰므로 기존 2048에서 올림
            maxCompletionTokens: 4096,
          })),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error("OpenAI regenerate error:", response.status, errText);
          res.status(500).json({error: "AI 호출 실패"});
          return;
        }

        const apiData = await response.json() as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = apiData.choices?.[0]?.message?.content ?? "";
        let parsed: { items?: Array<{ question?: string; highlights?: string[] }> };
        try {
          parsed = JSON.parse(content) as { items?: Array<{ question?: string; highlights?: string[] }> };
        } catch {
          res.status(500).json({error: "AI 응답 파싱 실패"});
          return;
        }

        const item = parsed?.items?.[0];
        const question = item?.question ?? "";
        const highlights = Array.isArray(item?.highlights) ? item.highlights : [];

        await userRef.set(
          {
            regenerateCountToday: count + 1,
            lastRegenerateDate: today,
            updatedAt: new Date().toISOString(),
          },
          {merge: true}
        );

        res.status(200).json({question, highlights});
      } else {
        // 데모 (비로그인)
        if (!demoDeviceId || typeof demoDeviceId !== "string") {
          res.status(400).json({error: "demoDeviceId is required for demo mode"});
          return;
        }

        const docId = hashDemoDeviceId(demoDeviceId);
        const demoRef = db.collection("demoRegenerateCounts").doc(docId);
        const demoSnap = await demoRef.get();
        const demoData = demoSnap.exists ? demoSnap.data() : {};
        let count = typeof demoData?.count === "number" ? demoData.count : 0;
        const lastDate = demoData?.date as string | undefined;

        if (lastDate !== today) count = 0;
        if (count >= LIMIT_DEMO) {
          res.status(429).json({
            error: "Daily regenerate limit reached",
            code: "LIMIT_EXCEEDED",
            limit: LIMIT_DEMO,
          });
          return;
        }

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          res.status(500).json({error: "OPENAI_API_KEY not configured"});
          return;
        }

        const systemPrompt = getRegenerateQuestionPrompt(lang);
        const otherList = Array.isArray(otherQuestions)
          ? otherQuestions.filter((q): q is string => typeof q === "string").slice(0, 10)
          : [];
        const otherSection = otherList.length > 0
          ? `\n\n덱의 다른 질문들(이들과도 겹치지 않아야 함):\n${otherList.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
          : "";
        const userContent = `${rawDiff}\n\n---\n[질문 재생성]\n기존 질문: ${existingQuestion}\n기존 답변: ${existingAnswer}${otherSection}\n\n위 원문과 답변에 맞는, 기존 질문${otherList.length > 0 ? " 및 덱의 다른 질문들과도 다른" : "과 다른"} 새로운 면접 질문 1개를 작성해주세요. (답변은 그대로 두고, 질문과 하이라이트만 새로 작성)`;

        const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify(buildOpenAIChatBody({
            systemPrompt,
            userContent,
            responseFormat: FLASHCARD_RESPONSE_SCHEMA,
            reasoningEffort: "low",
            // 추론 토큰이 출력 상한을 함께 쓰므로 기존 2048에서 올림
            maxCompletionTokens: 4096,
          })),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error("OpenAI regenerate demo error:", response.status, errText);
          res.status(500).json({error: "AI 호출 실패"});
          return;
        }

        const apiData = await response.json() as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = apiData.choices?.[0]?.message?.content ?? "";
        let parsed: { items?: Array<{ question?: string; highlights?: string[] }> };
        try {
          parsed = JSON.parse(content) as { items?: Array<{ question?: string; highlights?: string[] }> };
        } catch {
          res.status(500).json({error: "AI 응답 파싱 실패"});
          return;
        }

        const item = parsed?.items?.[0];
        const question = item?.question ?? "";
        const highlights = Array.isArray(item?.highlights) ? item.highlights : [];

        await demoRef.set({date: today, count: count + 1, updatedAt: new Date().toISOString()}, {merge: true});

        res.status(200).json({question, highlights});
      }
    } catch (e: unknown) {
      if (e instanceof HttpsError) {
        const status = e.code === "unauthenticated" ? 401 : 403;
        res.status(status).json({error: e.message});
        return;
      }
      console.error("regenerateCardQuestion error:", e);
      res.status(500).json({error: "Regenerate failed"});
    }
  }
);
