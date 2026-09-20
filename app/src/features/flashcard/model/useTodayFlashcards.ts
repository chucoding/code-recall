import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { store } from '@/shared/config/firebase';
import { chatCompletions, translateFlashcards as translateFlashcardsApi } from '@/features/ai-generation';
import type { FlashcardStructuredOutput, SubscriptionTier } from '@/shared/types';
import { getCommits, getFilename, getRepositories, type CommitDetail, type FileChange } from '@/features/github-sync';
import { getCurrentDate } from '@/shared/lib/date';
import { useNavigationStore } from '@/shared/lib/navigationStore';
import { useSubscription } from '@/features/subscription';
import type { FlashCardData } from '@/entities/flashcard';

const DATES_AGO_FREE = [1, 7];
const DATES_AGO_PRO = [1, 7, 30];

function getDeckByLang(
  docData: Record<string, unknown> | undefined,
  lang: 'ko' | 'en'
): FlashCardData[] | undefined {
  if (!docData) return undefined;
  const arr = lang === 'ko' ? docData.data_ko : docData.data_en;
  if (Array.isArray(arr) && arr.length > 0) return arr as FlashCardData[];
  return undefined;
}

export function useTodayFlashcards(user: User | null) {
  const { i18n } = useTranslation();
  const [loading, setLoading] = useState<boolean>(true);
  const [hasData, setHasData] = useState<boolean>(false);
  const flashcardReloadTrigger = useNavigationStore((state) => state.flashcardReloadTrigger);
  const setLastLoadedDateKey = useNavigationStore((state) => state.setLastLoadedDateKey);
  const { subscription } = useSubscription(user);
  const tier: SubscriptionTier = subscription?.subscriptionTier === 'pro' ? 'pro' : 'free';
  const datesAgo = tier === 'pro' ? DATES_AGO_PRO : DATES_AGO_FREE;

  useEffect(() => {
    if (!user) {
      setLoading(false);
      setHasData(false);
      return;
    }

    const loadFlashcards = async () => {
      try {
        setLoading(true);
        const todayDate = getCurrentDate();
        const flashcardDocRef = doc(store, 'users', user.uid, 'flashcards', todayDate);

        const userDocRef = doc(store, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        const repositories = userDoc.exists() ? (userDoc.data()?.repositories as Array<{ fullName: string; url: string; branch?: string }> | undefined) : undefined;
        if (!Array.isArray(repositories) || repositories.length === 0) {
          setLastLoadedDateKey(null);
          setLoading(false);
          setHasData(false);
          return;
        }

        const currentLang = i18n.language.startsWith('ko') ? 'ko' : 'en';
        const todayDoc = await getDoc(flashcardDocRef);
        const docData = todayDoc.exists() ? todayDoc.data() : undefined;

        const currentDeck = getDeckByLang(docData, currentLang);
        if (currentDeck && currentDeck.length > 0) {
          setLastLoadedDateKey(todayDate);
          setLoading(false);
          setHasData(true);
          enrichDeckWithResolvedBranches(currentDeck, repositories)
            .then((branchEnriched) => {
              if (branchEnriched.changed) {
                return setDoc(flashcardDocRef, { [`data_${currentLang}`]: branchEnriched.deck }, { merge: true });
              }
            })
            .catch((err) => {
              console.warn('Flashcard branch enrichment (best-effort) failed:', err);
            });
          return;
        }

        const otherLang = currentLang === 'ko' ? 'en' : 'ko';
        const otherDeck = getDeckByLang(docData, otherLang);
        if (otherDeck && otherDeck.length > 0) {
          const translated = await translateFlashcardsApi(otherDeck, currentLang);
          if (translated.length > 0) {
            await setDoc(flashcardDocRef, { [`data_${currentLang}`]: translated }, { merge: true });
            setLastLoadedDateKey(todayDate);
            setHasData(true);
          } else {
            setLastLoadedDateKey(null);
            setHasData(false);
          }
          setLoading(false);
          return;
        }

        const list = await generateFlashcards(datesAgo, repositories, currentLang);
        if (list.length > 0) {
          await setDoc(flashcardDocRef, { [`data_${currentLang}`]: list }, { merge: true });
          setLastLoadedDateKey(todayDate);
          setHasData(true);
        } else {
          setLastLoadedDateKey(null);
          setHasData(false);
        }
        setLoading(false);
      } catch (error) {
        console.error('Error loading flashcards:', error);
        setLastLoadedDateKey(null);
        setLoading(false);
        setHasData(false);
      }
    };

    loadFlashcards();
  }, [user, flashcardReloadTrigger, tier, i18n.language]);

  return { loading, hasData };
}

async function generateFlashcards(
  datesAgo: number[],
  repositories: Array<{ fullName: string; url: string; branch?: string }>,
  lang?: 'ko' | 'en'
): Promise<FlashCardData[]> {
  const list: FlashCardData[] = [];
  const resolvedBranchByRepo = await resolveBranchByRepo(repositories);

  for (const repo of repositories) {
    const repoFullName = repo.fullName;
    const resolvedBranch = resolvedBranchByRepo[repoFullName];

    for (const d of datesAgo) {
      try {
        const githubData = await getGithubData(d, repoFullName, resolvedBranch);

        if (!githubData) {
          continue;
        }

        const { content, metadata } = githubData;
        const result = await chatCompletions(content, { lang });
        const parsed = JSON.parse(result.result.message.content) as FlashcardStructuredOutput;
        const pairs =
          parsed?.items?.filter(
            (x): x is { question: string; answer: string; highlights?: string[] } =>
              x != null && typeof x.question === 'string' && typeof x.answer === 'string'
          ) ?? [];

        for (const { question, answer, highlights } of pairs) {
          list.push({
            question,
            answer,
            highlights: highlights?.filter((h): h is string => typeof h === 'string' && h.length > 0),
            metadata: {
              ...metadata,
              rawDiff: content,
              repositoryFullName: repoFullName,
              ...(resolvedBranch ? { branch: resolvedBranch } : {}),
            }
          });
        }
      } catch (error) {
        console.error(`Error fetching data for repo ${repoFullName} ${d} days ago:`, error);
      }
    }
  }

  return list;
}

async function resolveBranchByRepo(
  repositories: Array<{ fullName: string; url: string; branch?: string }>
): Promise<Record<string, string | undefined>> {
  const explicit = new Map<string, string | undefined>();
  for (const repo of repositories) {
    explicit.set(repo.fullName, repo.branch);
  }

  const unresolved = repositories.filter((repo) => !repo.branch).map((repo) => repo.fullName);
  if (unresolved.length === 0) {
    return Object.fromEntries(explicit);
  }

  try {
    const accessibleRepos = await getRepositories();
    const defaultMap = new Map(
      accessibleRepos
        .filter((r) => typeof r.default_branch === 'string' && r.default_branch.length > 0)
        .map((r) => [r.full_name, r.default_branch as string])
    );
    for (const fullName of unresolved) {
      if (!explicit.get(fullName)) {
        explicit.set(fullName, defaultMap.get(fullName));
      }
    }
  } catch (error) {
    console.warn('Failed to resolve default branches:', error);
  }

  return Object.fromEntries(explicit);
}

async function enrichDeckWithResolvedBranches(
  deck: FlashCardData[],
  repositories: Array<{ fullName: string; url: string; branch?: string }>
): Promise<{ deck: FlashCardData[]; changed: boolean }> {
  const needsEnrichment = deck.some((card) => card.metadata?.repositoryFullName && !card.metadata?.branch);
  if (!needsEnrichment) return { deck, changed: false };

  const resolvedBranchByRepo = await resolveBranchByRepo(repositories);
  let changed = false;

  const enriched = deck.map((card) => {
    const repoName = card.metadata?.repositoryFullName;
    if (!repoName || card.metadata?.branch) return card;
    const resolvedBranch = resolvedBranchByRepo[repoName];
    if (!resolvedBranch) return card;
    changed = true;
    return {
      ...card,
      metadata: {
        ...card.metadata,
        branch: resolvedBranch,
      },
    };
  });

  return { deck: enriched, changed };
}

interface GithubData {
  content: string;
  metadata?: {
    commitMessage?: string;
    files?: FileChange[];
  };
}

async function getGithubData(daysAgo: number, repositoryFullName: string, branch?: string): Promise<GithubData | null> {
  const interval = 24 * daysAgo * 60 * 60 * 1000;
  const now = new Date();
  const pastDate = new Date(now.getTime() - interval);

  const since = new Date(pastDate);
  since.setHours(0, 0, 0, 0);
  const until = new Date(pastDate);
  until.setHours(23, 59, 59, 999);

  const commits = await getCommits(since, until, repositoryFullName, branch);

  if (commits.length === 0) {
    return null;
  }

  for (const commit of commits) {
    const commitDetail = await getFilename(commit.sha, repositoryFullName);
    const codeDiff = formatCodeDiff(commitDetail);
    if (codeDiff) {
      return {
        content: codeDiff,
        metadata: {
          commitMessage: commitDetail.commit.message,
          files: commitDetail.files
        }
      };
    }
  }

  return null;
}

function formatCodeDiff(commitDetail: CommitDetail): string | null {
  if (commitDetail.files.length === 0) {
    return null;
  }

  const diffParts: string[] = [];
  diffParts.push(`## ${commitDetail.commit.message}\n`);
  diffParts.push(`Commit: ${commitDetail.sha.substring(0, 7)}\n`);

  for (const file of commitDetail.files) {
    diffParts.push(`\n### ${file.filename}`);
    diffParts.push(`**Status**: ${file.status} | **Changes**: +${file.additions} -${file.deletions}\n`);

    if (file.patch) {
      diffParts.push('```diff');
      diffParts.push(file.patch);
      diffParts.push('```\n');
    }
  }

  return diffParts.join('\n');
}
