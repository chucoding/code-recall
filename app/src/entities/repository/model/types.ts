export interface FileChange {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  raw_url?: string;
  blob_url?: string;
}

export interface CommitDetail {
  sha: string;
  commit: {
    message: string;
  };
  files: FileChange[];
}

export interface Branch {
  name: string;
  protected: boolean;
}

/** GitHub Trending 상위 저장소 한 건 */
export interface TrendingRepository {
  owner: string;
  name: string;
  fullName: string;
  url: string;
  description: string;
  /** 주 사용 언어. 표기가 없는 저장소는 null */
  language: string | null;
  /** GitHub이 언어에 부여한 색상 (예: #3178c6). 표기가 없으면 null */
  languageColor: string | null;
  /** 해당 기간에 늘어난 스타 수 */
  starsToday: number;
}
