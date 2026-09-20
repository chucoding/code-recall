import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {Request} from "firebase-functions/v2/https";
import crypto from "crypto";

/**
 * 공개 AI 함수의 호출 경계
 *
 * 랜딩 데모는 비로그인 방문자가 써야 해 `openaiChatCompletions`와 `translateFlashcards`는
 * `invoker: "public"`을 유지해야 한다. 함수 URL은 빌드 산출물에 문자열로 인라인되고
 * `https://<리전>-<프로젝트>.cloudfunctions.net/<함수이름>` 형식으로 조합도 되므로 주소를
 * 감추는 방식으로는 보호되지 않는다. 모델을 호출하기 전에 서버가 소유한 카운터로 막는다.
 *
 * 경계는 두 겹이다.
 * 1. 호출자별 일일 한도. 로그인은 uid, 비로그인은 클라이언트 IP 해시가 키
 * 2. 비로그인 호출 전체의 일일 상한
 *
 * 1번이 쓰는 IP는 `X-Forwarded-For`에서 읽어 호출자가 위조할 수 있다. 위조하면 1번은
 * 우회되지만 2번은 키와 무관한 단일 카운터라 우회되지 않아, 하루에 나갈 수 있는 모델
 * 비용의 천장이 된다. 위조 자체를 말단에서 거부하려면 App Check가 필요하고, 그쪽은
 * Firebase 콘솔의 reCAPTCHA 등록과 enforcement 설정이 함께 있어야 해 이 경계와 별도다.
 *
 * 로그인 호출에는 전체 상한을 걸지 않는다. 걸면 비로그인 호출을 쏟아부어 로그인
 * 사용자의 카드 생성까지 멈출 수 있다.
 */

/** 카운터를 두는 서버 전용 컬렉션. firestore.rules에 없어 클라이언트는 읽고 쓸 수 없음 */
const AI_USAGE_COLLECTION = "aiUsage";

/** 비로그인 IP 하나의 일일 AI 호출 상한. 랜딩 데모는 저장소 한 곳에 3회를 쓴다 */
const ANONYMOUS_DAILY_LIMIT = 30;

/** 비로그인 호출 전체의 일일 상한. IP를 위조해 위 한도를 우회해도 이 선에서 멈춤 */
const ANONYMOUS_GLOBAL_DAILY_LIMIT = 500;

/** 무료 사용자 일일 AI 호출 상한 */
const AUTHENTICATED_DAILY_LIMIT_FREE = 100;

/** Pro 사용자 일일 AI 호출 상한 */
const AUTHENTICATED_DAILY_LIMIT_PRO = 300;

/**
 * 플래시카드 생성 프롬프트에 붙일 본문 길이 상한
 *
 * 커밋 하나의 diff를 담는 자리라 정상 입력은 이 값에 한참 못 미친다. 상한이 없으면
 * 긴 본문이 그대로 붙어 입력 토큰이 제한 없이 늘어난다.
 */
export const MAX_FLASHCARD_PROMPT_CHARS = 30_000;

/** 번역 요청 한 건의 카드 수 상한 */
export const MAX_TRANSLATE_CARDS = 200;

/**
 * 번역 프롬프트에 붙일 본문 길이 상한
 *
 * 번역은 덱 전체를 한 번에 넘기므로 카드 하나짜리 생성 프롬프트보다 상한이 크다.
 */
export const MAX_TRANSLATE_PROMPT_CHARS = 120_000;

/**
 * KST 오늘 날짜
 *
 * @return {string} `YYYY-MM-DD` 형식의 날짜
 */
export function getTodayKST(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split("T")[0];
}

/**
 * 카운터 문서에서 오늘 집계를 읽음. 날짜가 다르면 0부터 다시 셈
 *
 * @param {Record<string, unknown> | undefined} data - 카운터 문서 내용
 * @param {string} today - KST 기준 오늘 날짜
 * @return {number} 오늘 누적 호출 수
 */
function readDailyCount(
  data: Record<string, unknown> | undefined,
  today: string
): number {
  if (!data || data.date !== today) return 0;
  return typeof data.count === "number" ? data.count : 0;
}

/**
 * 요청의 클라이언트 IP 해시
 *
 * Cloud Functions는 `X-Forwarded-For`의 첫 항목을 클라이언트 IP로 문서화하지만 이
 * 헤더는 호출자가 임의로 채워 보낼 수 있다. 원본 IP를 저장하지 않으려고 해시만 문서
 * ID에 쓴다.
 *
 * @param {Request} req - 들어온 요청
 * @return {string} 문서 ID로 쓰는 32자 해시
 */
function getClientIpHash(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const chain = Array.isArray(forwarded) ? forwarded.join(",") : forwarded ?? "";
  const clientIp = chain.split(",")[0]?.trim() || req.ip || "unknown";
  return crypto.createHash("sha256").update(clientIp).digest("hex").slice(0, 32);
}

/** 경계 검사 결과. 막힌 경우 호출부가 그대로 응답에 쓸 상태 코드와 본문을 담음 */
export type AiGuardResult =
  | { allowed: true; uid?: string }
  | { allowed: false; status: number; body: Record<string, unknown> };

/**
 * 로그인 사용자의 일일 한도 차감
 *
 * 카운터를 `users/{uid}`가 아니라 서버 전용 컬렉션에 두는 이유는 firestore.rules가
 * `users/{uid}`의 본인 쓰기와 삭제를 열어 두어, 거기 두면 사용자가 자기 한도를 직접
 * 지울 수 있기 때문이다. 쓸 수 있는 필드를 좁혀도 문서를 통째로 지웠다가 다시 만드는
 * 경로가 남아, 사용량은 애초에 사용자가 손댈 수 없는 컬렉션에 있어야 한다.
 *
 * @param {string} authHeader - `Bearer <ID 토큰>` 형식의 Authorization 헤더
 * @return {Promise<AiGuardResult>} 통과 여부와 막힌 경우의 응답
 */
async function consumeAuthenticatedQuota(authHeader: string): Promise<AiGuardResult> {
  const idToken = authHeader.split("Bearer ")[1];

  let uid: string;
  try {
    uid = (await getAuth().verifyIdToken(idToken)).uid;
  } catch (error) {
    console.warn("AI 호출 ID 토큰 검증 실패:", error);
    return {
      allowed: false,
      status: 401,
      body: {error: "Invalid ID token", code: "UNAUTHENTICATED"},
    };
  }

  const db = getFirestore();
  const userSnap = await db.collection("users").doc(uid).get();
  const isPro = userSnap.data()?.subscriptionTier === "pro";
  const limit = isPro ? AUTHENTICATED_DAILY_LIMIT_PRO : AUTHENTICATED_DAILY_LIMIT_FREE;

  const today = getTodayKST();
  const counterRef = db.collection(AI_USAGE_COLLECTION).doc(`user__${uid}`);

  const consumed = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(counterRef);
    const count = readDailyCount(snap.data(), today);
    if (count >= limit) return false;
    transaction.set(counterRef, {
      date: today,
      count: count + 1,
      updatedAt: new Date().toISOString(),
    });
    return true;
  });

  if (!consumed) {
    return {
      allowed: false,
      status: 429,
      body: {error: "Daily AI limit reached", code: "LIMIT_EXCEEDED", limit},
    };
  }

  return {allowed: true, uid};
}

/**
 * 비로그인 호출의 IP별 한도와 전체 상한 차감
 *
 * 두 카운터를 한 트랜잭션에서 읽고 쓴다. 따로 처리하면 동시 요청이 상한을 넘겨
 * 통과할 수 있다.
 *
 * @param {Request} req - 들어온 요청
 * @return {Promise<AiGuardResult>} 통과 여부와 막힌 경우의 응답
 */
async function consumeAnonymousQuota(req: Request): Promise<AiGuardResult> {
  const db = getFirestore();
  const today = getTodayKST();
  const callerRef = db.collection(AI_USAGE_COLLECTION).doc(`anon__${getClientIpHash(req)}`);
  const globalRef = db.collection(AI_USAGE_COLLECTION).doc("anonGlobal");

  const blockedBy = await db.runTransaction(async (transaction) => {
    const [callerSnap, globalSnap] = await transaction.getAll(callerRef, globalRef);
    const callerCount = readDailyCount(callerSnap.data(), today);
    const globalCount = readDailyCount(globalSnap.data(), today);

    if (globalCount >= ANONYMOUS_GLOBAL_DAILY_LIMIT) return "global";
    if (callerCount >= ANONYMOUS_DAILY_LIMIT) return "caller";

    const updatedAt = new Date().toISOString();
    transaction.set(callerRef, {date: today, count: callerCount + 1, updatedAt});
    transaction.set(globalRef, {date: today, count: globalCount + 1, updatedAt});
    return null;
  });

  if (blockedBy === "global") {
    // IP를 위조해 호출자별 한도를 우회한 요청까지 포함해 하루 예산을 다 쓴 상태.
    // 정상 트래픽만으로는 닿기 어려운 선이라 경고가 아니라 오류로 남긴다
    console.error("비로그인 AI 호출 전체 상한 도달");
    return {
      allowed: false,
      status: 429,
      body: {
        error: "Demo AI budget for today is exhausted",
        code: "DEMO_BUDGET_EXCEEDED",
      },
    };
  }

  if (blockedBy === "caller") {
    return {
      allowed: false,
      status: 429,
      body: {
        error: "Daily demo AI limit reached",
        code: "LIMIT_EXCEEDED",
        limit: ANONYMOUS_DAILY_LIMIT,
      },
    };
  }

  return {allowed: true};
}

/**
 * AI 호출 전 경계 검사
 *
 * Authorization 헤더가 있으면 토큰을 검증해 uid 기준 한도를, 없으면 데모 한도를
 * 적용한다. 검사를 통과한 호출은 이 시점에 카운터가 이미 차감된다.
 *
 * @param {Request} req - 들어온 요청
 * @return {Promise<AiGuardResult>} 통과 여부와 막힌 경우의 응답
 */
export async function consumeAiQuota(req: Request): Promise<AiGuardResult> {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return consumeAuthenticatedQuota(authHeader);
  }
  return consumeAnonymousQuota(req);
}

/**
 * 프롬프트에 붙일 본문을 상한까지 자름
 *
 * 거부하지 않고 자르는 이유는 큰 커밋을 넣은 정상 사용자의 카드 생성이 통째로
 * 실패하지 않게 하기 위함이다. 사전 생성 경로도 같은 방식으로 diff를 자른다.
 *
 * @param {string} text - 요청 본문에서 받은 원문
 * @param {number} maxChars - 허용할 최대 길이
 * @return {{text: string, truncated: boolean}} 자른 본문과 잘렸는지 여부
 */
export function truncateForPrompt(
  text: string,
  maxChars: number
): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return {text, truncated: false};
  return {text: text.slice(0, maxChars), truncated: true};
}
