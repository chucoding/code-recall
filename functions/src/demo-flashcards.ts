import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {getFlashcardPrompt} from "./prompts.js";
import {FLASHCARD_RESPONSE_SCHEMA} from "./openai.js";

/**
 * 랜딩 데모 플래시카드 사전 생성
 *
 * 데모 카드는 GitHub 커밋 조회와 AI 생성을 거쳐 한 번 만드는 데 수 초가 걸려,
 * 방문자가 트렌딩 뱃지를 누를 때마다 같은 계산을 반복하면 대기 시간이 그대로 남는다.
 * 트렌딩 Top 10은 스케줄러가 목록을 수집할 때 카드까지 미리 만들어 Firestore에 저장하고,
 * 랜딩은 그 문서를 읽기만 한다.
 */

/** Firestore에 사전 생성 카드를 저장하는 컬렉션 */
const DEMO_FLASHCARD_COLLECTION = "demoFlashcards";

/** 사전 생성 대상 언어 */
const DEMO_LANGUAGES: Array<"ko" | "en"> = ["ko", "en"];

/** 저장소당 카드로 만들 최근 커밋 수. 랜딩 데모 문구(최근 커밋 3개)와 맞춤 */
const DEMO_COMMIT_COUNT = 3;

/** 문서 한 건에 담을 파일 수 상한 */
const MAX_FILES_PER_COMMIT = 10;

/** 파일 하나의 diff 저장 상한. Firestore 문서 1MB 제한에 걸리지 않도록 자름 */
const MAX_PATCH_LENGTH = 4000;

/** 이 크기를 넘는 문서는 저장하지 않고 건너뜀 (Firestore 문서 상한 1MB 대비 여유) */
const MAX_DOCUMENT_BYTES = 900_000;

const OPENAI_MODEL = "gpt-4o-mini";

/** 앱 `FileChange`와 같은 형태 */
interface DemoFileChange {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  raw_url?: string;
}

/** 앱 `FlashCard`와 같은 형태 */
interface DemoFlashcard {
  question: string;
  answer: string;
  metadata: {
    commitMessage: string;
    repositoryFullName: string;
    branch?: string;
    rawDiff?: string;
    files?: DemoFileChange[];
  };
}

/** GitHub Commits API 응답의 커밋 한 건 */
interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
  files?: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch?: string;
    raw_url?: string;
  }>;
}

const GITHUB_HEADERS = {
  "Accept": "application/vnd.github.v3+json",
  "User-Agent": "CodeRecall-DemoBot/1.0 (+https://coderecall.app)",
};

/** 저장소 기본 브랜치 조회. 실패하면 undefined */
async function fetchDefaultBranch(owner: string, repo: string): Promise<string | undefined> {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: GITHUB_HEADERS,
  });
  if (!response.ok) return undefined;

  const data = await response.json() as { default_branch?: string };
  return typeof data.default_branch === "string" && data.default_branch ? data.default_branch : undefined;
}

/** 최근 커밋을 파일 목록까지 포함해 조회 */
async function fetchRecentCommits(owner: string, repo: string, branch?: string): Promise<GitHubCommit[]> {
  const shaParam = branch ? `&sha=${encodeURIComponent(branch)}` : "";
  const listResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits?per_page=${DEMO_COMMIT_COUNT}${shaParam}`,
    {headers: GITHUB_HEADERS}
  );
  if (!listResponse.ok) {
    throw new Error(`GitHub 커밋 목록 조회 실패: ${listResponse.status}`);
  }

  const commits = await listResponse.json() as GitHubCommit[];

  return Promise.all(
    commits.slice(0, DEMO_COMMIT_COUNT).map(async (commit) => {
      const detailResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/commits/${commit.sha}`,
        {headers: GITHUB_HEADERS}
      );
      // 상세 조회가 막히면 파일 정보 없는 목록 항목으로 카드를 만든다
      return detailResponse.ok ? await detailResponse.json() as GitHubCommit : commit;
    })
  );
}

/** AI에 넘길 커밋 요약 본문 구성 */
function buildAnswerContent(commit: GitHubCommit): string {
  const message = commit.commit.message.split("\n")[0];
  const filesInfo = commit.files ?
    commit.files
      .slice(0, 5)
      .map((file) => `- \`${file.filename}\` (+${file.additions} -${file.deletions})`)
      .join("\n") :
    "_파일 정보 없음_";
  const patchPreview = commit.files
    ?.filter((file) => file.patch)
    .slice(0, 2)
    .map((file) => `### ${file.filename}\n\`\`\`diff\n${file.patch?.slice(0, 400)}\n\`\`\``)
    .join("\n\n");

  return `## ${message}\n\n**변경된 파일:**\n${filesInfo}${
    patchPreview ? `\n\n**코드 변경 미리보기:**\n\n${patchPreview}` : ""
  }`;
}

/** 카드 뒷면 Diff 보기에 쓰는 원문 diff 구성 */
function buildRawDiff(commit: GitHubCommit): string | undefined {
  if (!commit.files?.length) return undefined;

  const parts: string[] = [
    `## ${commit.commit.message.split("\n")[0]}\n`,
    `Commit: ${commit.sha.substring(0, 7)}\n`,
  ];

  for (const file of commit.files.slice(0, MAX_FILES_PER_COMMIT)) {
    parts.push(`\n### ${file.filename}`);
    parts.push(`**Status**: ${file.status} | **Changes**: +${file.additions} -${file.deletions}\n`);
    if (file.patch) {
      parts.push("```diff");
      parts.push(file.patch.slice(0, MAX_PATCH_LENGTH));
      parts.push("```\n");
    }
  }

  return parts.join("\n");
}

/** 카드 메타데이터에 담을 파일 변경 목록 구성 */
function toFileChanges(commit: GitHubCommit, owner: string, repo: string): DemoFileChange[] {
  if (!commit.files?.length) return [];

  return commit.files.slice(0, MAX_FILES_PER_COMMIT).map((file) => ({
    filename: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    changes: file.additions + file.deletions,
    ...(file.patch && {patch: file.patch.slice(0, MAX_PATCH_LENGTH)}),
    raw_url: file.raw_url ?? `https://raw.githubusercontent.com/${owner}/${repo}/${commit.sha}/${file.filename}`,
  }));
}

/** OpenAI에서 질문·답변 1쌍 생성. 실패하면 null */
async function generateQuestionAnswer(
  answerContent: string,
  lang: "ko" | "en"
): Promise<{ question: string; answer: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        {role: "system", content: getFlashcardPrompt(lang)},
        {role: "user", content: answerContent},
      ],
      temperature: 0.5,
      max_tokens: 4096,
      // 실시간 생성 경로(openaiChatCompletions)와 같은 스키마를 써서 카드 형태를 맞춤
      response_format: FLASHCARD_RESPONSE_SCHEMA,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI 호출 실패: ${response.status}`);
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;

  const parsed = JSON.parse(content) as { items?: Array<{ question?: string; answer?: string }> };
  const first = parsed.items?.[0];
  if (typeof first?.question === "string" && typeof first?.answer === "string") {
    return {question: first.question, answer: first.answer};
  }
  return null;
}

/** 커밋 목록에서 한 언어의 카드 목록 생성. 카드를 하나도 못 만들면 빈 배열 */
async function buildFlashcards(
  commits: GitHubCommit[],
  owner: string,
  repo: string,
  branch: string | undefined,
  lang: "ko" | "en"
): Promise<DemoFlashcard[]> {
  const repositoryFullName = `${owner}/${repo}`;

  const cards = await Promise.all(
    commits.map(async (commit) => {
      // 커밋 한 건이 실패해도 나머지 카드는 살린다
      const pair = await generateQuestionAnswer(buildAnswerContent(commit), lang).catch((error) => {
        console.warn(`데모 카드 생성 실패: ${repositoryFullName} ${commit.sha.substring(0, 7)} (${lang})`, error);
        return null;
      });
      if (!pair) return null;

      const rawDiff = buildRawDiff(commit);
      const files = toFileChanges(commit, owner, repo);

      const card: DemoFlashcard = {
        question: pair.question,
        answer: pair.answer,
        metadata: {
          commitMessage: commit.commit.message.split("\n")[0],
          repositoryFullName,
          ...(branch && {branch}),
          ...(rawDiff && {rawDiff}),
          ...(files.length > 0 && {files}),
        },
      };
      return card;
    })
  );

  return cards.filter((card): card is DemoFlashcard => card !== null);
}

/**
 * 사전 생성 문서 ID 생성
 *
 * Firestore 문서 ID에는 `/`를 쓸 수 없어 `owner/repo` 대신 `__`로 잇는다.
 * 읽는 쪽(app의 `toDemoFlashcardCacheId`)과 형식이 같아야 한다.
 */
export function toDemoFlashcardCacheId(owner: string, repo: string, lang: "ko" | "en"): string {
  return `${owner}__${repo}__${lang}`;
}

/**
 * 저장소 한 건의 데모 카드를 언어별로 만들어 Firestore에 저장
 *
 * @param owner - 저장소 소유자
 * @param repo - 저장소 이름
 * @returns 저장에 성공한 문서 수
 */
async function pregenerateRepository(owner: string, repo: string): Promise<number> {
  const branch = await fetchDefaultBranch(owner, repo);
  const commits = await fetchRecentCommits(owner, repo, branch);

  if (commits.length === 0) {
    console.warn(`데모 사전 생성 건너뜀: ${owner}/${repo}에 커밋이 없음`);
    return 0;
  }

  const firestore = getFirestore();
  let savedCount = 0;

  for (const lang of DEMO_LANGUAGES) {
    const cards = await buildFlashcards(commits, owner, repo, branch, lang);
    if (cards.length === 0) {
      console.warn(`데모 사전 생성 실패: ${owner}/${repo} (${lang}) 카드를 만들지 못함`);
      continue;
    }

    const document = {
      repositoryFullName: `${owner}/${repo}`,
      lang,
      ...(branch && {branch}),
      cards,
    };

    const documentBytes = Buffer.byteLength(JSON.stringify(document), "utf8");
    if (documentBytes > MAX_DOCUMENT_BYTES) {
      // 저장하면 Firestore 문서 상한에 걸리므로, 방문자는 이 저장소만 실시간 생성 경로를 탄다
      console.warn(
        `데모 사전 생성 건너뜀: ${owner}/${repo} (${lang}) 문서가 ${documentBytes}바이트로 너무 큼`
      );
      continue;
    }

    await firestore
      .doc(`${DEMO_FLASHCARD_COLLECTION}/${toDemoFlashcardCacheId(owner, repo, lang)}`)
      .set({...document, updatedAt: Timestamp.now()});
    savedCount += 1;
  }

  return savedCount;
}

/**
 * 트렌딩 목록의 저장소마다 데모 카드를 미리 만들어 저장
 *
 * 한 저장소가 실패해도 나머지는 계속 만든다. OpenAI 속도 제한을 피하려고 저장소는 순차 처리하고,
 * 저장소 안에서만 커밋 단위로 병렬 호출한다.
 *
 * @param repositories - 트렌딩 목록의 저장소 좌표
 */
export async function pregenerateDemoFlashcards(
  repositories: Array<{ owner: string; name: string }>
): Promise<void> {
  let savedCount = 0;

  for (const repository of repositories) {
    try {
      savedCount += await pregenerateRepository(repository.owner, repository.name);
    } catch (error) {
      console.error(`데모 사전 생성 실패: ${repository.owner}/${repository.name}`, error);
    }
  }

  console.log(`데모 카드 사전 생성 완료: ${savedCount}건`);
}

/**
 * 이번 트렌딩 목록에 없는 사전 생성 문서 삭제
 *
 * 트렌딩은 매일 바뀌어 정리하지 않으면 다시 쓰이지 않을 문서가 계속 쌓인다.
 *
 * @param repositories - 이번에 수집한 트렌딩 저장소 좌표
 */
export async function removeStaleDemoFlashcards(
  repositories: Array<{ owner: string; name: string }>
): Promise<void> {
  const keepIds = new Set(
    repositories.flatMap((repository) =>
      DEMO_LANGUAGES.map((lang) => toDemoFlashcardCacheId(repository.owner, repository.name, lang))
    )
  );

  const snapshot = await getFirestore().collection(DEMO_FLASHCARD_COLLECTION).get();
  const staleDocs = snapshot.docs.filter((document) => !keepIds.has(document.id));

  if (staleDocs.length === 0) return;

  const batch = getFirestore().batch();
  staleDocs.forEach((document) => batch.delete(document.ref));
  await batch.commit();

  console.log(`오래된 데모 카드 ${staleDocs.length}건 삭제`);
}
