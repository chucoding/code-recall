import {getFlashcardPrompt} from "./prompts.js";
import {buildOpenAIChatBody, OPENAI_CHAT_COMPLETIONS_URL} from "./openai-model.js";
import {MAX_FLASHCARD_PROMPT_CHARS, truncateForPrompt} from "./ai-guard.js";

/**
 * 플래시카드 생성 공용 단계
 *
 * 카드를 만드는 경로는 세 가지다. 앱이 호출하는 실시간 생성(`openaiChatCompletions`),
 * 랜딩 데모 사전 생성(`demo-flashcards.ts`), 사용자 사전 생성(`flashcard-pregeneration.ts`).
 * 세 경로는 실행 시점과 커밋 선택, 저장 위치가 달라 그 부분은 각자 두고, GitHub 조회와
 * diff 구성, AI 호출처럼 같아야 하는 단계만 여기에 모은다. 따로 두면 모델이나 프롬프트를
 * 바꿀 때 한 경로만 바뀐 채 남는다.
 */

/** 카드 언어 */
export type FlashcardLang = "ko" | "en";

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

/** GitHub Commits API 응답의 커밋 한 건. 목록 조회에는 `files`가 없고 상세 조회에만 있음 */
export interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author?: { name: string; date: string };
  };
  files?: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
    raw_url?: string;
  }>;
}

/** 토큰이 만료되거나 권한이 없어 재시도해도 소용없는 GitHub 오류 */
export class GitHubAuthError extends Error {}

/** 토큰 없이 공개 저장소를 조회할 때 보내는 User-Agent. 데모 사전 생성이 씀 */
const ANONYMOUS_USER_AGENT = "CodeRecall-DemoBot/1.0 (+https://coderecall.app)";

/**
 * GitHub API GET 요청
 *
 * 토큰이 있으면 사용자 권한으로, 없으면 공개 저장소만 조회한다.
 *
 * @param {string} path - `https://api.github.com` 뒤에 붙일 경로
 * @param {string} [githubToken] - 사용자 GitHub 토큰
 * @return {Promise<T>} 응답 본문
 */
export async function fetchGitHub<T>(path: string, githubToken?: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      "Accept": "application/vnd.github.v3+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(githubToken ?
        {"Authorization": `Bearer ${githubToken}`} :
        {"User-Agent": ANONYMOUS_USER_AGENT}),
    },
  });

  if (response.status === 401) {
    throw new GitHubAuthError("GitHub 토큰이 만료되었거나 유효하지 않음");
  }
  if (!response.ok) {
    throw new Error(`GitHub API 호출 실패 (${response.status}): ${path}`);
  }
  return response.json() as Promise<T>;
}

/**
 * 저장소 기본 브랜치 조회. 조회가 실패하면 undefined
 *
 * 브랜치를 모르면 GitHub가 기본 브랜치로 조회하므로 실패해도 카드 생성은 이어진다.
 * 토큰 무효만은 이후 조회도 모두 실패하므로 그대로 던진다.
 *
 * @param {string} repoFullName - `owner/repo`
 * @param {string} [githubToken] - 사용자 GitHub 토큰
 * @return {Promise<string | undefined>} 기본 브랜치
 */
export async function fetchDefaultBranch(
  repoFullName: string,
  githubToken?: string
): Promise<string | undefined> {
  try {
    const repo = await fetchGitHub<{ default_branch?: string }>(`/repos/${repoFullName}`, githubToken);
    return typeof repo.default_branch === "string" && repo.default_branch ? repo.default_branch : undefined;
  } catch (error) {
    if (error instanceof GitHubAuthError) throw error;
    console.warn(`기본 브랜치 조회 실패: ${repoFullName}`, error);
    return undefined;
  }
}

/**
 * 커밋 상세 조회. 파일 목록과 patch가 여기에만 담김
 *
 * @param {string} repoFullName - `owner/repo`
 * @param {string} sha - 커밋 SHA
 * @param {string} [githubToken] - 사용자 GitHub 토큰
 * @return {Promise<GitHubCommit>} 커밋 상세
 */
export function fetchCommitDetail(
  repoFullName: string,
  sha: string,
  githubToken?: string
): Promise<GitHubCommit> {
  return fetchGitHub<GitHubCommit>(`/repos/${repoFullName}/commits/${sha}`, githubToken);
}

/** diff 마크다운 구성 옵션. 생략한 상한은 적용하지 않음 */
export interface CommitDiffOptions {
  /** 커밋 메시지를 첫 줄만 쓸지 여부 */
  subjectOnly?: boolean;
  /** 담을 파일 수 상한 */
  maxFiles?: number;
  /** 파일 하나의 patch 길이 상한 */
  maxPatchLength?: number;
}

/**
 * 커밋 상세를 diff 마크다운으로 변환
 *
 * 카드 뒷면 Diff 보기와 AI 입력에 쓴다. 앱 `formatCodeDiff`와 같은 형식이다.
 *
 * @param {GitHubCommit} commit - 파일 목록이 포함된 커밋 상세
 * @param {CommitDiffOptions} [options] - 메시지와 크기 상한
 * @return {string | null} diff 마크다운. 변경 파일이 없으면 null
 */
export function formatCommitDiff(commit: GitHubCommit, options: CommitDiffOptions = {}): string | null {
  if (!commit.files?.length) return null;

  const message = options.subjectOnly ? commit.commit.message.split("\n")[0] : commit.commit.message;
  const diffParts: string[] = [];
  diffParts.push(`## ${message}\n`);
  diffParts.push(`Commit: ${commit.sha.substring(0, 7)}\n`);

  for (const file of commit.files.slice(0, options.maxFiles)) {
    diffParts.push(`\n### ${file.filename}`);
    diffParts.push(`**Status**: ${file.status} | **Changes**: +${file.additions} -${file.deletions}\n`);

    if (file.patch) {
      diffParts.push("```diff");
      diffParts.push(file.patch.slice(0, options.maxPatchLength));
      diffParts.push("```\n");
    }
  }

  return diffParts.join("\n");
}

/** OpenAI 응답이 실패 상태일 때. 실시간 생성 경로가 상태 코드와 본문을 응답에 그대로 싣는다 */
export class OpenAIRequestError extends Error {
  /**
   * @param {number} status - OpenAI 응답 상태 코드
   * @param {string} body - OpenAI 응답 본문
   */
  constructor(readonly status: number, readonly body: string) {
    super(`OpenAI 호출 실패: ${status}`);
  }
}

/** 플래시카드 생성 호출 결과. 실시간 생성 경로가 앱 응답 형태로 옮길 값까지 담음 */
export interface FlashcardCompletion {
  /** 구조화 출력 JSON 문자열 */
  content: string;
  finishReason: string;
  created?: number;
  usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/**
 * diff로 플래시카드 생성 모델 호출
 *
 * 본문은 상한까지 잘라서 보낸다. 거부하지 않고 자르는 이유는 큰 커밋 하나 때문에
 * 카드 생성이 통째로 실패하지 않게 하기 위함이다.
 *
 * @param {string} content - diff 마크다운
 * @param {FlashcardLang} [lang] - 카드 언어
 * @return {Promise<FlashcardCompletion>} 모델 응답
 */
export async function requestFlashcardCompletion(
  content: string,
  lang?: FlashcardLang
): Promise<FlashcardCompletion> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");

  const {text, truncated} = truncateForPrompt(content, MAX_FLASHCARD_PROMPT_CHARS);
  if (truncated) {
    console.warn(
      `본문이 상한을 넘어 잘라서 호출: 원본 ${content.length}자 → ${MAX_FLASHCARD_PROMPT_CHARS}자`
    );
  }

  const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildOpenAIChatBody({
      systemPrompt: getFlashcardPrompt(lang),
      userContent: text,
      responseFormat: FLASHCARD_RESPONSE_SCHEMA,
      // 실시간 생성은 앱이 응답을 기다리고, 데모 사전 생성은 스케줄러 한 번에 저장소 10곳을
      // 순차 처리해 실행 시간 540초 안에 들어와야 함
      reasoningEffort: "low",
      // 추론 토큰이 출력 상한을 함께 쓰므로 기존 4096에서 올림
      maxCompletionTokens: 8192,
    })),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("OpenAI API error:", response.status, errorText);
    throw new OpenAIRequestError(response.status, errorText);
  }

  const data = await response.json() as {
    choices?: Array<{
      message?: { content?: string };
      finish_reason?: string;
    }>;
    usage?: FlashcardCompletion["usage"];
    created?: number;
  };

  return {
    content: data.choices?.[0]?.message?.content ?? "",
    finishReason: data.choices?.[0]?.finish_reason ?? "stop",
    created: data.created,
    usage: data.usage ?? {},
  };
}

/** AI가 만든 질문과 답변 한 쌍 */
export interface FlashcardItem {
  question: string;
  answer: string;
  highlights?: string[];
}

/**
 * 구조화 출력에서 형식이 맞는 질문과 답변만 추출
 *
 * @param {string} content - 모델이 반환한 JSON 문자열
 * @return {FlashcardItem[]} 질문과 답변 목록. 비었거나 형식이 틀리면 빈 배열
 */
export function parseFlashcardItems(content: string): FlashcardItem[] {
  if (!content) return [];

  const parsed = JSON.parse(content) as {
    items?: Array<{ question?: unknown; answer?: unknown; highlights?: unknown }>;
  };

  return (parsed.items ?? []).flatMap((item) => {
    if (typeof item?.question !== "string" || typeof item?.answer !== "string") return [];
    const highlights = Array.isArray(item.highlights) ?
      item.highlights.filter((h): h is string => typeof h === "string" && h.length > 0) :
      undefined;
    return [{question: item.question, answer: item.answer, ...(highlights ? {highlights} : {})}];
  });
}

/**
 * diff에서 질문과 답변 목록 생성
 *
 * @param {string} content - diff 마크다운
 * @param {FlashcardLang} lang - 카드 언어
 * @return {Promise<FlashcardItem[]>} 질문과 답변 목록
 */
export async function generateFlashcardItems(
  content: string,
  lang: FlashcardLang
): Promise<FlashcardItem[]> {
  const completion = await requestFlashcardCompletion(content, lang);
  return parseFlashcardItems(completion.content);
}
