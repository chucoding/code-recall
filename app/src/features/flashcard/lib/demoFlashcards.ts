/**
 * 랜딩 데모 전용 플래시카드 생성
 *
 * 데이터 소스: GitHub Public API + AI (chatCompletions) 만 사용.
 * Firebase/Firestore 미사용. 저장 없이 매 요청마다 AI에서 바로 생성.
 *
 * 반대로 로그인 사용자 플래시카드는 useTodayFlashcards + Firestore 사용.
 */

import i18n from '@/shared/config/i18n';
import { chatCompletions } from '@/features/ai-generation';
import type { FlashcardStructuredOutput } from '@/shared/types';
import type { FlashCard } from '@/entities/flashcard';
import type { FileChange } from '@/entities/repository';
import { parseGitHubRepositoryUrl } from './github-url';

/** GitHub Commits API 응답의 커밋 한 건 (public API) */
export interface DemoCommitData {
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

function buildAnswerContent(commit: DemoCommitData): string {
  const message = commit.commit.message.split('\n')[0];
  const filesInfo = commit.files
    ? commit.files
        .slice(0, 5)
        .map((f) => `- \`${f.filename}\` (+${f.additions} -${f.deletions})`)
        .join('\n')
    : '_파일 정보 없음_';
  const patchPreview = commit.files
    ?.filter((f) => f.patch)
    .slice(0, 2)
    .map((f) => `### ${f.filename}\n\`\`\`diff\n${f.patch?.slice(0, 400)}\n\`\`\``)
    .join('\n\n');
  return `## ${message}\n\n**변경된 파일:**\n${filesInfo}${patchPreview ? `\n\n**코드 변경 미리보기:**\n\n${patchPreview}` : ''}`;
}

function buildRawDiff(commit: DemoCommitData): string | null {
  if (!commit.files?.length) return null;
  const message = commit.commit.message.split('\n')[0];
  const parts: string[] = [];
  parts.push(`## ${message}\n`);
  parts.push(`Commit: ${commit.sha.substring(0, 7)}\n`);
  for (const file of commit.files) {
    parts.push(`\n### ${file.filename}`);
    parts.push(`**Status**: ${file.status} | **Changes**: +${file.additions} -${file.deletions}\n`);
    if (file.patch) {
      parts.push('```diff');
      parts.push(file.patch);
      parts.push('```\n');
    }
  }
  return parts.join('\n');
}

function buildFallbackQuestion(commit: DemoCommitData, lang?: 'ko' | 'en'): string {
  const message = commit.commit.message.split('\n')[0];
  const locale = lang === 'en' ? 'en-US' : 'ko-KR';
  const date = new Date(commit.commit.author.date).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const suffix = i18n.t('demo.fallbackQuestionSuffix', { lng: lang || 'ko' });
  return `${date}\n\n"${message}"\n\n${suffix}`;
}

/** 예시 답변 플로팅용: AI 실패 시 보여줄 짧은 평문 (마크다운 아님) */
function buildFallbackAnswer(commit: DemoCommitData, lang?: 'ko' | 'en'): string {
  const message = commit.commit.message.split('\n')[0];
  const lng = lang || 'ko';
  const fileList = commit.files?.length
    ? commit.files.slice(0, 5).map((f) => f.filename).join(', ')
    : i18n.t('demo.noFileInfo', { lng });
  const commitLabel = i18n.t('demo.fallbackAnswerCommit', { lng });
  const filesLabel = i18n.t('demo.fallbackAnswerFiles', { lng });
  return `${commitLabel} ${message}\n${filesLabel} ${fileList}`;
}

/** 데모 전용: AI에서 질문·답변 1쌍 생성 (items[0].question, items[0].answer). 예시 답변은 평문으로 표시되므로 answer 사용 */
async function fetchDemoFlashcardFromAI(answerContent: string, lang?: 'ko' | 'en'): Promise<{ question: string; answer: string } | null> {
  const result = await chatCompletions(answerContent, { lang });
  const parsed = JSON.parse(result.result.message.content) as FlashcardStructuredOutput;
  const first = parsed?.items?.[0];
  if (first && typeof first.question === 'string' && typeof first.answer === 'string') {
    return { question: first.question, answer: first.answer };
  }
  return null;
}

const FILE_STATUSES: FileChange['status'][] = ['added', 'modified', 'removed', 'renamed'];
function toFileChangeStatus(s: string): FileChange['status'] {
  const lower = s?.toLowerCase() ?? '';
  if (FILE_STATUSES.includes(lower as FileChange['status'])) return lower as FileChange['status'];
  return 'modified';
}

function toFileChangeList(
  files: DemoCommitData['files'],
  owner: string,
  repo: string,
  sha: string
): FileChange[] {
  if (!files?.length) return [];
  return files.map((f) => ({
    filename: f.filename,
    status: toFileChangeStatus(f.status),
    additions: f.additions,
    deletions: f.deletions,
    changes: f.additions + f.deletions,
    patch: f.patch,
    raw_url: f.raw_url ?? `https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${f.filename}`,
  }));
}

async function getDefaultBranch(owner: string, repo: string): Promise<string | undefined> {
  try {
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (!repoRes.ok) return undefined;
    const repoData = (await repoRes.json()) as { default_branch?: string };
    return typeof repoData.default_branch === 'string' && repoData.default_branch.length > 0
      ? repoData.default_branch
      : undefined;
  } catch {
    return undefined;
  }
}

export type GenerateDemoFlashcardsResult =
  | { ok: true; cards: FlashCard[] }
  | { ok: false; error: string };

export async function generateDemoFlashcards(repoUrl: string, lang?: 'ko' | 'en'): Promise<GenerateDemoFlashcardsResult> {
  const lng = lang || (i18n.language.startsWith('ko') ? 'ko' : 'en');

  const parsed = parseGitHubRepositoryUrl(repoUrl);
  if (!parsed) {
    return { ok: false, error: i18n.t('demo.invalidRepoUrl', { lng }) };
  }

  const resolvedBranch = parsed.branch || await getDefaultBranch(parsed.owner, parsed.repo);
  const shaParam = resolvedBranch ? `&sha=${encodeURIComponent(resolvedBranch)}` : '';
  const commitsRes = await fetch(
    `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/commits?per_page=3${shaParam}`,
    { headers: { Accept: 'application/vnd.github.v3+json' } }
  );
  if (!commitsRes.ok) {
    if (commitsRes.status === 404) {
      return { ok: false, error: i18n.t('demo.repoNotFound', { lng }) };
    }
    return { ok: false, error: i18n.t('demo.githubApiFailed', { lng }) };
  }

  const commits: DemoCommitData[] = await commitsRes.json();
  if (commits.length === 0) {
    return { ok: false, error: i18n.t('demo.noCommits', { lng }) };
  }

  const detailedCommits = await Promise.all(
    commits.slice(0, 3).map(async (commit) => {
      try {
        const detailRes = await fetch(
          `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/commits/${commit.sha}`,
          { headers: { Accept: 'application/vnd.github.v3+json' } }
        );
        if (detailRes.ok) return (await detailRes.json()) as DemoCommitData;
      } catch {
        // fallback to list item
      }
      return commit;
    })
  );

  const answerContents = detailedCommits.map(buildAnswerContent);
  const aiPairs = await Promise.all(
    answerContents.map(async (content, i) => {
      try {
        const pair = await fetchDemoFlashcardFromAI(content, lang);
        if (pair) return pair;
      } catch {
        // fallback
      }
      const commit = detailedCommits[i];
      return {
        question: buildFallbackQuestion(commit, lang),
        answer: buildFallbackAnswer(commit, lang),
      };
    })
  );

  const repositoryFullName = `${parsed.owner}/${parsed.repo}`;
  const cards: FlashCard[] = detailedCommits.map((commit, i) => {
    const rawDiff = buildRawDiff(commit);
    const files = toFileChangeList(commit.files, parsed.owner, parsed.repo, commit.sha);
    return {
      question: aiPairs[i].question,
      answer: aiPairs[i].answer,
      metadata: {
        commitMessage: commit.commit.message.split('\n')[0],
        repositoryFullName,
        branch: resolvedBranch,
        ...(rawDiff && { rawDiff }),
        ...(files.length > 0 && { files }),
      },
    };
  });

  return { ok: true, cards };
}
