import {onSchedule} from "firebase-functions/v2/scheduler";
import {onTaskDispatched} from "firebase-functions/v2/tasks";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {getFunctions} from "firebase-admin/functions";
import {fitFlashcardDeckToBudget, FlashcardData, FlashcardFileChange} from "./flashcard-deck-size.js";
import {
  fetchCommitDetail,
  fetchDefaultBranch,
  fetchGitHub,
  FlashcardLang,
  formatCommitDiff,
  generateFlashcardItems,
  GitHubAuthError,
  GitHubCommit,
} from "./flashcard-generation.js";
import {
  getDateInTimezone,
  getDayRangeInTimezone,
  getHourInTimezone,
  isValidTimezone,
  subtractDays,
} from "./timezone.js";

/**
 * 오늘의 플래시카드 사전 생성
 *
 * 앱을 켤 때 브라우저가 저장소와 날짜마다 GitHub 조회와 AI 생성을 순차로 기다려 첫 화면이
 * 느렸다. 사용자 타임존의 자정이 지나면 서버가 그날 덱을 미리 만들어
 * `users/{uid}/flashcards/{YYYY-MM-DD}`에 저장하고, 앱은 그 문서를 읽기만 한다.
 *
 * 구조는 두 단계다.
 * 1. 매시 정각 스케줄러가 지금 자정을 지난 타임존의 최근 활동 사용자를 골라 태스크를 넣음
 * 2. 태스크 함수가 사용자 한 명씩 덱을 생성해 저장
 *
 * 사용자 수가 늘어도 스케줄러 실행 시간은 대상 선정에만 쓰이고, OpenAI 동시 호출 수는
 * 태스크 큐의 동시 실행 상한으로 조절한다.
 *
 * 비용은 최근 활동 사용자로 대상을 좁혀 막는다. 유휴 계정은 사전 생성하지 않고, 그 사용자가
 * 다시 앱을 열면 기존처럼 앱이 즉석에서 생성한다. 사전 생성이 실패한 경우도 같은 경로로 이어진다.
 */

const REGION = "asia-northeast3";

/** 태스크 함수 이름. 큐 경로에 그대로 쓰므로 export 이름과 같아야 함 */
const TASK_FUNCTION_NAME = "pregenerateUserFlashcards";

/** 사전 생성을 시작하는 사용자 로컬 시. 0시가 지나야 "어제 커밋"이 확정됨 */
const PREGENERATION_LOCAL_HOUR = 0;

/** 사전 생성 대상이 되는 최근 활동 기간 */
const ACTIVE_WITHIN_MS = 7 * 24 * 60 * 60 * 1000;

/** `getAuth().getUsers` 한 번에 조회할 수 있는 사용자 수 상한 */
const AUTH_LOOKUP_BATCH_SIZE = 100;

/** 태스크 큐 동시 실행 상한. 태스크 하나가 AI를 최대 15번 병렬 호출하므로 OpenAI 속도 제한에 맞춰 낮게 둠 */
const MAX_CONCURRENT_TASKS = 5;

/** 앱 `useTodayFlashcards`와 같은 등급별 복습 간격 */
const DATES_AGO_FREE = [1, 7];
const DATES_AGO_PRO = [1, 7, 30];

/** 태스크 본문 */
interface PregenerationTask {
  uid: string;
  dateKey: string;
}

/** Firestore users.repositories 항목 */
interface UserRepository {
  fullName: string;
  url: string;
  branch?: string;
}

/**
 * 사전 생성에 필요한 사용자 설정 추출
 *
 * `timezone`과 `language`는 앱이 열릴 때 함께 기록한다. 둘 중 하나라도 없으면 새 앱을 한 번도
 * 열지 않은 사용자라, 언어를 추정해 틀린 덱을 만들기보다 대상에서 뺀다.
 *
 * @param {Record<string, unknown> | undefined} data - users 문서 내용
 * @return {{timezone: string, language: FlashcardLang, repositories: UserRepository[]} | null}
 *   사전 생성 대상이 아니면 null
 */
function readPregenerationSettings(data: Record<string, unknown> | undefined): {
  timezone: string;
  language: FlashcardLang;
  repositories: UserRepository[];
} | null {
  if (!data) return null;
  const {timezone, language, repositories} = data;
  if (typeof timezone !== "string" || !isValidTimezone(timezone)) return null;
  if (language !== "ko" && language !== "en") return null;
  if (!Array.isArray(repositories) || repositories.length === 0) return null;
  return {timezone, language, repositories: repositories as UserRepository[]};
}

/**
 * 최근 활동 사용자만 남김
 *
 * 활동 시각은 Auth의 토큰 갱신 시각을 쓴다. 앱을 열어 둔 동안 한 시간마다 갱신되므로
 * 별도 필드를 쓰지 않고도 앱 사용 여부를 알 수 있다.
 *
 * @param {string[]} uids - 후보 사용자
 * @param {Date} now - 기준 시각
 * @return {Promise<Set<string>>} 최근 활동한 사용자
 */
async function filterActiveUids(uids: string[], now: Date): Promise<Set<string>> {
  const active = new Set<string>();

  for (let i = 0; i < uids.length; i += AUTH_LOOKUP_BATCH_SIZE) {
    const batch = uids.slice(i, i + AUTH_LOOKUP_BATCH_SIZE).map((uid) => ({uid}));
    const {users} = await getAuth().getUsers(batch);
    for (const user of users) {
      const lastActive = user.metadata.lastRefreshTime ?? user.metadata.lastSignInTime;
      if (lastActive && now.getTime() - new Date(lastActive).getTime() <= ACTIVE_WITHIN_MS) {
        active.add(user.uid);
      }
    }
  }

  return active;
}

/**
 * 매시 정각, 자정을 지난 타임존의 최근 활동 사용자마다 사전 생성 태스크 등록
 *
 * 태스크 ID를 `uid-날짜`로 고정해, 스케줄러가 재시도돼도 같은 날 덱을 두 번 만들지 않는다.
 */
export const scheduleFlashcardPregeneration = onSchedule(
  {
    schedule: "0 * * * *", // 매시 정각 (24회/일로 전 타임존 커버)
    timeZone: "Asia/Seoul",
    region: REGION,
  },
  async (event) => {
    const now =
      typeof event?.scheduleTime === "string" ?
        new Date(event.scheduleTime) :
        new Date();

    const snapshot = await getFirestore()
      .collection("users")
      .where("language", "in", ["ko", "en"])
      .select("timezone", "language", "repositories")
      .get();

    const candidates: PregenerationTask[] = [];
    snapshot.forEach((docSnap) => {
      const settings = readPregenerationSettings(docSnap.data());
      if (!settings) return;
      if (getHourInTimezone(now, settings.timezone) !== PREGENERATION_LOCAL_HOUR) return;
      candidates.push({uid: docSnap.id, dateKey: getDateInTimezone(now, settings.timezone)});
    });

    if (candidates.length === 0) {
      console.log("플래시카드 사전 생성 대상 없음");
      return;
    }

    const activeUids = await filterActiveUids(candidates.map((task) => task.uid), now);
    const tasks = candidates.filter((task) => activeUids.has(task.uid));

    const queue = getFunctions().taskQueue(`locations/${REGION}/functions/${TASK_FUNCTION_NAME}`);
    let enqueuedCount = 0;

    for (const task of tasks) {
      try {
        await queue.enqueue(task, {id: `${task.uid}-${task.dateKey}`});
        enqueuedCount += 1;
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === "functions/task-already-exists") continue;
        console.error(`플래시카드 사전 생성 태스크 등록 실패: ${task.uid}`, error);
      }
    }

    console.log(
      `플래시카드 사전 생성 태스크 ${enqueuedCount}건 등록 ` +
      `(후보 ${candidates.length}명, 최근 활동 ${tasks.length}명)`
    );
  }
);

/**
 * 하루치 커밋 중 변경 파일이 있는 첫 커밋 조회. 앱 `getGithubData`와 같은 선택 규칙
 *
 * @param {string} repoFullName - `owner/repo`
 * @param {string | undefined} branch - 조회할 브랜치
 * @param {{since: Date, until: Date}} range - 조회 구간
 * @param {string} githubToken - 사용자 GitHub 토큰
 * @return {Promise<{content: string, commit: GitHubCommit} | null>} 커밋이 없으면 null
 */
async function findCommitDiff(
  repoFullName: string,
  branch: string | undefined,
  range: { since: Date; until: Date },
  githubToken: string
): Promise<{ content: string; commit: GitHubCommit } | null> {
  const params = new URLSearchParams({
    since: range.since.toISOString(),
    until: range.until.toISOString(),
  });
  if (branch) params.set("sha", branch);

  const commits = await fetchGitHub<GitHubCommit[]>(
    `/repos/${repoFullName}/commits?${params.toString()}`,
    githubToken
  );

  for (const commit of commits) {
    const detail = await fetchCommitDetail(repoFullName, commit.sha, githubToken);
    const content = formatCommitDiff(detail);
    if (content) return {content, commit: detail};
  }

  return null;
}

/**
 * 사용자 한 명의 오늘 덱 생성
 *
 * 앱은 저장소와 날짜를 순차로 처리했지만, 여기서는 사용자 안에서 병렬로 처리한다.
 * 카드 순서는 앱과 같게 저장소, 날짜 순으로 맞춘다.
 *
 * @param {object} params - 생성 조건
 * @param {UserRepository[]} params.repositories - 대상 저장소
 * @param {number[]} params.datesAgo - 복습 간격
 * @param {string} params.dateKey - 사용자 타임존 기준 오늘
 * @param {string} params.timezone - 사용자 타임존
 * @param {FlashcardLang} params.language - 카드 언어
 * @param {string} params.githubToken - 사용자 GitHub 토큰
 * @return {Promise<{deck: FlashcardData[], failedCount: number}>} 생성한 덱과 실패한 조합 수
 */
async function buildDeck(params: {
  repositories: UserRepository[];
  datesAgo: number[];
  dateKey: string;
  timezone: string;
  language: FlashcardLang;
  githubToken: string;
}): Promise<{ deck: FlashcardData[]; failedCount: number }> {
  const {repositories, datesAgo, dateKey, timezone, language, githubToken} = params;
  let failedCount = 0;

  const perRepository = await Promise.all(repositories.map(async (repository) => {
    // 설정에 브랜치가 없으면 기본 브랜치를 조회하고, 조회가 실패하면 GitHub 기본값으로 조회
    const branch = repository.branch?.trim() || await fetchDefaultBranch(repository.fullName, githubToken);

    const perDate = await Promise.all(datesAgo.map(async (daysAgo) => {
      try {
        const range = getDayRangeInTimezone(subtractDays(dateKey, daysAgo), timezone);
        const found = await findCommitDiff(repository.fullName, branch, range, githubToken);
        if (!found) return [];

        const pairs = await generateFlashcardItems(found.content, language);
        const files: FlashcardFileChange[] | undefined = found.commit.files;
        return pairs.map((pair): FlashcardData => ({
          ...pair,
          metadata: {
            commitMessage: found.commit.commit.message,
            files,
            rawDiff: found.content,
            repositoryFullName: repository.fullName,
            ...(branch ? {branch} : {}),
          },
        }));
      } catch (error) {
        if (error instanceof GitHubAuthError) throw error;
        failedCount += 1;
        console.error(`사전 생성 실패: ${repository.fullName} ${daysAgo}일 전`, error);
        return [];
      }
    }));

    return perDate.flat();
  }));

  return {deck: perRepository.flat(), failedCount};
}

/**
 * 사용자 한 명의 오늘 덱을 생성해 저장
 *
 * 이미 오늘 문서에 덱이 있으면(사용자가 자정 직후 앱을 열어 앱이 먼저 만든 경우) 건너뛴다.
 * 생성 중 앱이 먼저 저장하는 경우도 있어 저장은 트랜잭션에서 다시 확인한다.
 *
 * 모든 조합이 실패하면 예외를 던져 태스크 큐가 재시도하게 하고, 커밋이 없어 카드가
 * 비었거나 토큰이 무효하면 재시도하지 않는다.
 */
export const pregenerateUserFlashcards = onTaskDispatched<PregenerationTask>(
  {
    region: REGION,
    retryConfig: {
      maxAttempts: 3,
      minBackoffSeconds: 120,
    },
    rateLimits: {
      maxConcurrentDispatches: MAX_CONCURRENT_TASKS,
    },
    // 저장소 5곳 × 날짜 3개를 병렬로 돌려도 AI 응답이 느리면 수 분이 걸림
    timeoutSeconds: 540,
  },
  async (req) => {
    const {uid, dateKey} = req.data;
    const db = getFirestore();

    const userSnap = await db.collection("users").doc(uid).get();
    const userData = userSnap.data();
    const settings = readPregenerationSettings(userData);
    const githubToken = userData?.githubToken;
    if (!settings || typeof githubToken !== "string" || !githubToken) {
      console.log(`사전 생성 건너뜀: ${uid} 설정 없음`);
      return;
    }

    const flashcardRef = db.collection("users").doc(uid).collection("flashcards").doc(dateKey);
    const deckField = `data_${settings.language}`;
    const hasDeck = (data: Record<string, unknown> | undefined) =>
      Boolean(data) && ["data_ko", "data_en"].some((field) => {
        const deck = data?.[field];
        return Array.isArray(deck) && deck.length > 0;
      });

    if (hasDeck((await flashcardRef.get()).data())) {
      console.log(`사전 생성 건너뜀: ${uid} ${dateKey} 덱이 이미 있음`);
      return;
    }

    const datesAgo = userData?.subscriptionTier === "pro" ? DATES_AGO_PRO : DATES_AGO_FREE;

    let result: { deck: FlashcardData[]; failedCount: number };
    try {
      result = await buildDeck({
        repositories: settings.repositories,
        datesAgo,
        dateKey,
        timezone: settings.timezone,
        language: settings.language,
        githubToken,
      });
    } catch (error) {
      if (error instanceof GitHubAuthError) {
        console.warn(`사전 생성 건너뜀: ${uid} GitHub 토큰 무효`);
        return;
      }
      throw error;
    }

    const {deck, failedCount} = result;
    const attemptCount = settings.repositories.length * datesAgo.length;
    if (deck.length === 0) {
      if (failedCount === attemptCount) {
        throw new Error(`사전 생성 전체 실패: ${uid} ${dateKey}`);
      }
      console.log(`사전 생성 결과 없음: ${uid} ${dateKey} 해당 날짜 커밋 없음`);
      return;
    }

    const fitted = fitFlashcardDeckToBudget(deck);
    const saved = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(flashcardRef);
      if (hasDeck(snap.data())) return false;
      transaction.set(flashcardRef, {[deckField]: fitted}, {merge: true});
      return true;
    });

    console.log(
      saved ?
        `사전 생성 저장: ${uid} ${dateKey} 카드 ${fitted.length}장 (실패 ${failedCount}건)` :
        `사전 생성 폐기: ${uid} ${dateKey} 앱이 먼저 저장함`
    );
  }
);
