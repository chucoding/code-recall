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
 *
 * 스케줄러가 한 시각을 놓쳐도 그날 사전 생성이 통째로 빠지지 않도록 대상을 자정 한 시각이
 * 아니라 새벽 구간으로 잡고, 그날 처리를 마친 사용자는 서버 전용 컬렉션에 기록해 다음
 * 시각부터 건너뛴다. 끝나지 않은 사용자는 구간 안의 다음 정각에 다시 태스크를 받는다.
 */

const REGION = "asia-northeast3";

/** 태스크 함수 이름. 큐 경로에 그대로 쓰므로 export 이름과 같아야 함 */
const TASK_FUNCTION_NAME = "pregenerateUserFlashcards";

/** 사전 생성 구간의 시작 시(로컬). 0시가 지나야 "어제 커밋"이 확정됨 */
const PREGENERATION_START_HOUR = 0;

/**
 * 사전 생성 구간의 끝 시(로컬, 미포함)
 *
 * 스케줄러가 몇 시각 연속으로 실패해도 사용자가 일어나기 전에 따라잡을 수 있는 폭으로 잡는다.
 * 넓힐수록 끝나지 않는 사용자의 재시도가 늘어난다.
 */
const PREGENERATION_END_HOUR = 6;

/**
 * 사용자별 사전 생성 완료 기록 컬렉션
 *
 * firestore.rules에 없어 클라이언트는 읽고 쓸 수 없다. 덱 문서만으로는 "커밋이 없어 만들
 * 카드가 없음"과 "아직 안 만듦"을 구분할 수 없어 따로 둔다.
 */
const PREGENERATION_STATUS_COLLECTION = "flashcardPregeneration";

/** Firestore `getAll` 한 번에 읽을 완료 기록 수 */
const STATUS_LOOKUP_BATCH_SIZE = 100;

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
  /** 태스크를 넣은 사용자 로컬 시. 태스크 ID에만 씀 */
  localHour: number;
}

/**
 * 그날 사전 생성을 끝낸 사유
 *
 * - `saved`: 덱을 저장함
 * - `exists`: 앱이 먼저 덱을 만들어 둠
 * - `empty`: 해당 날짜 커밋이 없어 만들 카드가 없음
 * - `unavailable`: GitHub 토큰 무효 등 재시도해도 바뀌지 않는 설정 문제
 */
type PregenerationOutcome = "saved" | "exists" | "empty" | "unavailable";

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
 * 완료 기록 문서 참조
 *
 * @param {string} uid - 사용자
 * @return {FirebaseFirestore.DocumentReference} 완료 기록 문서
 */
function statusRef(uid: string): FirebaseFirestore.DocumentReference {
  return getFirestore().collection(PREGENERATION_STATUS_COLLECTION).doc(uid);
}

/**
 * 그날 사전 생성을 이미 끝낸 사용자만 골라냄
 *
 * @param {PregenerationTask[]} tasks - 후보 태스크
 * @return {Promise<Set<string>>} 이미 끝낸 사용자
 */
async function findCompletedUids(tasks: PregenerationTask[]): Promise<Set<string>> {
  const completed = new Set<string>();

  for (let i = 0; i < tasks.length; i += STATUS_LOOKUP_BATCH_SIZE) {
    const batch = tasks.slice(i, i + STATUS_LOOKUP_BATCH_SIZE);
    const snaps = await getFirestore().getAll(...batch.map((task) => statusRef(task.uid)));
    snaps.forEach((snap, index) => {
      if (snap.data()?.dateKey === batch[index].dateKey) completed.add(batch[index].uid);
    });
  }

  return completed;
}

/**
 * 그날 사전 생성을 끝냈다고 기록
 *
 * @param {string} uid - 사용자
 * @param {string} dateKey - 사용자 타임존 기준 오늘
 * @param {PregenerationOutcome} outcome - 끝낸 사유
 */
async function markCompleted(uid: string, dateKey: string, outcome: PregenerationOutcome): Promise<void> {
  await statusRef(uid).set({dateKey, outcome, updatedAt: new Date().toISOString()});
}

/**
 * 매시 정각, 로컬 새벽 구간에 든 최근 활동 사용자 중 그날 처리를 끝내지 않은 사용자마다 태스크 등록
 *
 * 태스크 ID는 `uid-날짜-h시각`이다. 같은 시각의 재시도는 ID가 겹쳐 중복 등록되지 않고,
 * 다음 시각에는 새 ID로 다시 들어가 앞 시각에 놓친 사용자를 따라잡는다.
 *
 * 등록이 하나라도 실패하면 마지막에 예외를 던져 Cloud Scheduler가 이 시각을 다시 실행하게 한다.
 * 이미 등록된 태스크는 ID가 같아 건너뛰므로 다시 실행해도 안전하다.
 */
export const scheduleFlashcardPregeneration = onSchedule(
  {
    schedule: "0 * * * *", // 매시 정각 (24회/일로 전 타임존 커버)
    timeZone: "Asia/Seoul",
    region: REGION,
    // 다음 정각 전에 끝나도록 짧은 간격으로 재시도
    retryCount: 3,
    minBackoffSeconds: 60,
    maxRetrySeconds: 1800,
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
      const localHour = getHourInTimezone(now, settings.timezone);
      if (localHour < PREGENERATION_START_HOUR || localHour >= PREGENERATION_END_HOUR) return;
      candidates.push({
        uid: docSnap.id,
        dateKey: getDateInTimezone(now, settings.timezone),
        localHour,
      });
    });

    if (candidates.length === 0) {
      console.log("플래시카드 사전 생성 대상 없음");
      return;
    }

    const completedUids = await findCompletedUids(candidates);
    const pending = candidates.filter((task) => !completedUids.has(task.uid));
    const activeUids = await filterActiveUids(pending.map((task) => task.uid), now);
    const tasks = pending.filter((task) => activeUids.has(task.uid));

    const queue = getFunctions().taskQueue(`locations/${REGION}/functions/${TASK_FUNCTION_NAME}`);
    let enqueuedCount = 0;
    let failedCount = 0;

    for (const task of tasks) {
      try {
        await queue.enqueue(task, {id: `${task.uid}-${task.dateKey}-h${task.localHour}`});
        enqueuedCount += 1;
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === "functions/task-already-exists") continue;
        failedCount += 1;
        console.error(`플래시카드 사전 생성 태스크 등록 실패: ${task.uid}`, error);
      }
    }

    console.log(
      `플래시카드 사전 생성 태스크 ${enqueuedCount}건 등록 ` +
      `(후보 ${candidates.length}명, 완료 ${completedUids.size}명, 최근 활동 ${tasks.length}명, ` +
      `실패 ${failedCount}건)`
    );

    if (failedCount > 0) {
      throw new Error(`플래시카드 사전 생성 태스크 ${failedCount}건 등록 실패`);
    }
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
 * 결과가 정해진 경우(저장, 이미 있음, 커밋 없음, 설정 문제)는 완료 기록을 남겨 스케줄러가
 * 다음 시각부터 건너뛰게 한다. 일시 오류로 카드를 하나도 못 만들면 기록 없이 예외를 던져
 * 태스크 큐가 재시도하게 하고, 그래도 실패하면 구간 안의 다음 정각에 새 태스크로 다시 시도한다.
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

    // 앞 시각의 태스크가 재시도 끝에 처리를 마친 뒤 다음 시각 태스크가 도착한 경우
    if ((await statusRef(uid).get()).data()?.dateKey === dateKey) {
      console.log(`사전 생성 건너뜀: ${uid} ${dateKey} 이미 처리함`);
      return;
    }

    const userSnap = await db.collection("users").doc(uid).get();
    const userData = userSnap.data();
    const settings = readPregenerationSettings(userData);
    const githubToken = userData?.githubToken;
    if (!settings || typeof githubToken !== "string" || !githubToken) {
      console.log(`사전 생성 건너뜀: ${uid} 설정 없음`);
      await markCompleted(uid, dateKey, "unavailable");
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
      await markCompleted(uid, dateKey, "exists");
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
        await markCompleted(uid, dateKey, "unavailable");
        return;
      }
      throw error;
    }

    const {deck, failedCount} = result;
    if (deck.length === 0) {
      // 일부만 실패했어도 실패한 조합에 커밋이 있었을 수 있어 "커밋 없음"으로 확정하지 않음
      if (failedCount > 0) {
        throw new Error(`사전 생성 실패: ${uid} ${dateKey} (실패 ${failedCount}건)`);
      }
      console.log(`사전 생성 결과 없음: ${uid} ${dateKey} 해당 날짜 커밋 없음`);
      await markCompleted(uid, dateKey, "empty");
      return;
    }

    const fitted = fitFlashcardDeckToBudget(deck);
    const saved = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(flashcardRef);
      if (hasDeck(snap.data())) return false;
      transaction.set(flashcardRef, {[deckField]: fitted}, {merge: true});
      return true;
    });
    await markCompleted(uid, dateKey, saved ? "saved" : "exists");

    console.log(
      saved ?
        `사전 생성 저장: ${uid} ${dateKey} 카드 ${fitted.length}장 (실패 ${failedCount}건)` :
        `사전 생성 폐기: ${uid} ${dateKey} 앱이 먼저 저장함`
    );
  }
);
