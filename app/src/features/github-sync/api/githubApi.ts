import { apiClient } from '@/shared/api/apiClient';
import type { Repository } from '@/shared/types';
import type { Branch, CommitDetail } from '@/entities/repository';

interface Commit {
  sha: string;
  commit: {
    message: string;
    author: {
      date: string;
    };
  };
}

interface MarkdownResponse {
  content: string;
}

export async function getCommits(
  since: Date,
  until: Date,
  repositoryFullName?: string,
  branch?: string
): Promise<Commit[]> {
  const params: Record<string, string> = {
    since: since.toISOString(),
    until: until.toISOString(),
  };
  if (repositoryFullName) params.repositoryFullName = repositoryFullName;
  if (branch) params.branch = branch;

  const response = await apiClient.get('/getCommits', { params });
  return response.data;
}

export async function getFilename(
  sha: string,
  repositoryFullName?: string
): Promise<CommitDetail> {
  const params: Record<string, string> = { commit_sha: sha };
  if (repositoryFullName) params.repositoryFullName = repositoryFullName;

  const response = await apiClient.get('/getFilename', { params });
  return response.data;
}

export async function getMarkdown(
  filename: string,
  repositoryFullName?: string
): Promise<string> {
  const params: Record<string, string> = { filename };
  if (repositoryFullName) params.repositoryFullName = repositoryFullName;

  const response = await apiClient.get('/getMarkdown', { params });
  const data: MarkdownResponse = response.data;
  return data.content;
}

export async function getFileContent(rawUrl: string): Promise<string> {
  const response = await apiClient.get<MarkdownResponse>('/getFileContent', {
    params: { raw_url: rawUrl }
  });
  return response.data.content;
}

export async function getRepositories(): Promise<Repository[]> {
  const response = await apiClient.get('/getRepositories');
  return response.data;
}

export async function getBranches(owner: string, repo: string): Promise<Branch[]> {
  const response = await apiClient.get('/getBranches', {
    params: { owner, repo }
  });
  return response.data;
}
