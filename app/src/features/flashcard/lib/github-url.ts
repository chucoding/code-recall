/** 저장소 URL에서 뽑아낸 좌표 */
export interface GitHubRepositoryRef {
  owner: string;
  repo: string;
  /** `owner/repo@branch` 형태로 지정한 브랜치. 지정이 없으면 undefined */
  branch?: string;
}

/**
 * 데모 입력창에 들어온 저장소 표기를 소유자, 저장소, 브랜치로 분해
 *
 * `owner/repo`, `owner/repo@branch`, `https://github.com/owner/repo` 형태를 모두 받는다.
 *
 * @param url - 사용자가 입력했거나 트렌딩 뱃지가 넘긴 저장소 표기
 * @returns 해석에 실패하면 null
 */
export function parseGitHubRepositoryUrl(url: string): GitHubRepositoryRef | null {
  const cleaned = url.trim().replace(/\/+$/, '');

  const simpleMatch = cleaned.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:@([a-zA-Z0-9/_.-]+))?$/);
  if (simpleMatch) {
    return { owner: simpleMatch[1], repo: simpleMatch[2], branch: simpleMatch[3] || undefined };
  }

  const urlMatch = cleaned.match(/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:@([a-zA-Z0-9/_.-]+))?/);
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2], branch: urlMatch[3] || undefined };
  }

  return null;
}
