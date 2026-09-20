import type { TrendingRepository } from '@/entities/repository';

/**
 * Trending 캐시를 읽지 못했을 때 보여줄 기본 목록
 *
 * 랜딩 첫 화면에서 뱃지 줄이 비어 보이지 않도록 하는 용도이며,
 * 캐시를 읽으면 즉시 실제 Trending 목록으로 대체된다.
 */
export const FALLBACK_TRENDING_REPOSITORIES: TrendingRepository[] = [
  {
    owner: 'ollama',
    name: 'ollama',
    fullName: 'ollama/ollama',
    url: 'https://github.com/ollama/ollama',
    description: 'Get up and running with large language models locally.',
    language: 'Go',
    languageColor: '#00ADD8',
    starsToday: 0,
  },
  {
    owner: 'vercel',
    name: 'next.js',
    fullName: 'vercel/next.js',
    url: 'https://github.com/vercel/next.js',
    description: 'The React Framework.',
    language: 'TypeScript',
    languageColor: '#3178c6',
    starsToday: 0,
  },
  {
    owner: 'facebook',
    name: 'react',
    fullName: 'facebook/react',
    url: 'https://github.com/facebook/react',
    description: 'The library for web and native user interfaces.',
    language: 'JavaScript',
    languageColor: '#f1e05a',
    starsToday: 0,
  },
  {
    owner: 'microsoft',
    name: 'vscode',
    fullName: 'microsoft/vscode',
    url: 'https://github.com/microsoft/vscode',
    description: 'Visual Studio Code.',
    language: 'TypeScript',
    languageColor: '#3178c6',
    starsToday: 0,
  },
  {
    owner: 'langchain-ai',
    name: 'langchain',
    fullName: 'langchain-ai/langchain',
    url: 'https://github.com/langchain-ai/langchain',
    description: 'Build context-aware reasoning applications.',
    language: 'Python',
    languageColor: '#3572A5',
    starsToday: 0,
  },
  {
    owner: 'rust-lang',
    name: 'rust',
    fullName: 'rust-lang/rust',
    url: 'https://github.com/rust-lang/rust',
    description: 'Empowering everyone to build reliable and efficient software.',
    language: 'Rust',
    languageColor: '#dea584',
    starsToday: 0,
  },
];
