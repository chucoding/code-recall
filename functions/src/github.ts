import {onRequest} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";

/**
 * GitHub Repository
 */
interface Repository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  private: boolean;
}

/** Firestore users.repositories 항목 */
interface UserRepository {
  fullName: string;
  url: string;
  /** 브랜치 (없으면 default branch 사용) */
  branch?: string;
}

/**
 * Firebase ID Token 검증 및 사용자 정보 조회.
 * repositories 배열만 사용 (기존 repositoryFullName/repositoryUrl 제거).
 */
async function getUserData(req: any): Promise<{
  githubToken: string;
  repositories: UserRepository[];
}> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Firebase ID token not provided. Please authenticate.");
  }

  const idToken = authHeader.split("Bearer ")[1];

  try {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const userDoc = await getFirestore().collection("users").doc(userId).get();

    if (!userDoc.exists) {
      throw new Error("User not found. Please login again.");
    }

    const userData = userDoc.data();
    const githubToken = userData?.githubToken;
    const repositories = userData?.repositories as UserRepository[] | undefined;

    if (!githubToken) {
      throw new Error("GitHub token not found. Please login with GitHub again.");
    }

    if (!Array.isArray(repositories) || repositories.length === 0) {
      throw new Error("Repository settings not found. Please configure in Settings page.");
    }

    return {
      githubToken,
      repositories,
    };
  } catch (error) {
    console.error("Authentication error:", error);
    throw error;
  }
}

/** 쿼리 repositoryFullName이 유저 목록에 있으면 사용, 없으면 첫 번째 레포 */
function resolveRepoFullName(
  repositories: UserRepository[],
  queryRepo?: string | null
): string {
  if (queryRepo && repositories.some((r) => r.fullName === queryRepo)) {
    return queryRepo;
  }
  return repositories[0].fullName;
}

/** repositoryFullName에 해당하는 레포의 branch 반환 (없으면 undefined) */
function resolveBranch(
  repositories: UserRepository[],
  repoFullName: string
): string | undefined {
  const repo = repositories.find((r) => r.fullName === repoFullName);
  return repo?.branch && repo.branch.trim() ? repo.branch.trim() : undefined;
}

/** getFileContent용: repositories 없이 토큰만 조회 (raw_url은 레포 불필요) */
async function getOptionalToken(req: any): Promise<{ githubToken: string } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  try {
    const decodedToken = await getAuth().verifyIdToken(authHeader.split("Bearer ")[1]);
    const userDoc = await getFirestore().collection("users").doc(decodedToken.uid).get();
    const githubToken = userDoc.exists ? (userDoc.data()?.githubToken as string | undefined) : undefined;
    return githubToken ? { githubToken } : null;
  } catch {
    return null;
  }
}

// GitHub API 호출을 위한 HTTP Functions
export const getCommits = onRequest(
  {
    cors: true,
    region: "asia-northeast3",
    invoker: "public", // CORS preflight 통과용
  },
  async (req, res) => {
    try {
      const {since, until, repositoryFullName, branch: queryBranch} = req.query;

      if (!since || !until) {
        res.status(400).json({error: "since and until parameters are required"});
        return;
      }

      const userData = await getUserData(req);
      const repoFullName = resolveRepoFullName(
        userData.repositories,
        typeof repositoryFullName === "string" ? repositoryFullName : undefined
      );
      const branch = typeof queryBranch === "string" && queryBranch.trim()
        ? queryBranch.trim()
        : resolveBranch(userData.repositories, repoFullName);
      const shaParam = branch ? `&sha=${encodeURIComponent(branch)}` : "";

      const response = await fetch(`https://api.github.com/repos/${repoFullName}/commits?since=${since}&until=${until}${shaParam}`, {
        headers: {
          "Authorization": `Bearer ${userData.githubToken}`,
          "Accept": "application/vnd.github.v3+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`GitHub API error: ${response.status}`, errorBody);
        res.status(response.status).json({
          error: "Failed to fetch commits from GitHub",
          details: errorBody,
        });
        return;
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Error fetching commits:", error);
      res.status(500).json({
        error: "Failed to fetch commits",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

export const getFilename = onRequest(
  {
    cors: true,
    region: "asia-northeast3",
    invoker: "public",
  },
  async (req, res) => {
    try {
      const {commit_sha, repositoryFullName} = req.query;

      if (!commit_sha) {
        res.status(400).json({error: "commit_sha parameter is required"});
        return;
      }

      const userData = await getUserData(req);
      const repoFullName = resolveRepoFullName(
        userData.repositories,
        typeof repositoryFullName === "string" ? repositoryFullName : undefined
      );

      const response = await fetch(`https://api.github.com/repos/${repoFullName}/commits/${commit_sha}`, {
        headers: {
          "Authorization": `Bearer ${userData.githubToken}`,
          "Accept": "application/vnd.github.v3+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`GitHub API error: ${response.status}`, errorBody);
        res.status(response.status).json({
          error: "Failed to fetch commit details from GitHub",
          details: errorBody,
        });
        return;
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Error fetching commit details:", error);
      res.status(500).json({
        error: "Failed to fetch commit details",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

export const getMarkdown = onRequest(
  {
    cors: true,
    region: "asia-northeast3",
    invoker: "public",
  },
  async (req, res) => {
    try {
      const {filename, repositoryFullName} = req.query;

      if (!filename) {
        res.status(400).json({error: "filename parameter is required"});
        return;
      }

      const userData = await getUserData(req);
      const repoFullName = resolveRepoFullName(
        userData.repositories,
        typeof repositoryFullName === "string" ? repositoryFullName : undefined
      );

      const response = await fetch(`https://api.github.com/repos/${repoFullName}/contents/${filename}`, {
        headers: {
          "Accept": "application/vnd.github.raw",
          "Authorization": `Bearer ${userData.githubToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`GitHub API error: ${response.status}`, errorBody);
        res.status(response.status).json({
          error: "File not found or access denied",
          details: errorBody,
        });
        return;
      }

      const content = await response.text();
      res.json({content});
    } catch (error) {
      console.error("Error fetching markdown:", error);
      res.status(500).json({
        error: "Failed to fetch markdown content",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

/**
 * raw_url로 해당 커밋 시점 파일 원문 조회
 * - 로그인 시: Authorization으로 private repo 대응
 * - 데모(비로그인) 시: raw_url만 검증 후 토큰 없이 fetch (공개 repo만 가능)
 * raw_url은 GitHub commit files[].raw_url 또는 raw.githubusercontent.com/owner/repo/ref/path
 */
export const getFileContent = onRequest(
  {
    cors: true,
    region: "asia-northeast3",
    invoker: "public",
  },
  async (req, res) => {
    try {
      const rawUrl = typeof req.query.raw_url === "string" ? req.query.raw_url : null;

      if (!rawUrl) {
        res.status(400).json({error: "raw_url parameter is required"});
        return;
      }

      const allowedHosts = ["github.com", "raw.githubusercontent.com", "api.github.com"];
      let parsed: URL;
      try {
        parsed = new URL(rawUrl);
      } catch {
        res.status(400).json({error: "Invalid raw_url"});
        return;
      }
      if (!allowedHosts.includes(parsed.hostname)) {
        res.status(400).json({error: "raw_url must be from GitHub"});
        return;
      }

      const headers: Record<string, string> = {
        "Accept": "application/vnd.github.raw",
        "X-GitHub-Api-Version": "2022-11-28",
      };
      const auth = await getOptionalToken(req);
      if (auth) {
        headers["Authorization"] = `Bearer ${auth.githubToken}`;
      }

      const response = await fetch(rawUrl, { headers });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`GitHub raw fetch error: ${response.status}`, errorBody);
        res.status(response.status).json({
          error: "File not found or access denied",
          details: errorBody,
        });
        return;
      }

      const content = await response.text();
      res.json({content});
    } catch (error) {
      console.error("Error fetching file content:", error);
      res.status(500).json({
        error: "Failed to fetch file content",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

/**
 * 사용자의 GitHub 리포지토리 목록 가져오기
 * Settings 페이지에서 리포지토리 선택을 위해 사용
 */
export const getRepositories = onRequest(
  {
    cors: true,
    region: "asia-northeast3",
    invoker: "public",
  },
  async (req, res) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({error: "Firebase ID token not provided. Please authenticate."});
        return;
      }

      const idToken = authHeader.split("Bearer ")[1];

      // Firebase ID Token 검증
      const decodedToken = await getAuth().verifyIdToken(idToken);
      const userId = decodedToken.uid;

      // Firestore에서 GitHub 토큰 조회
      const userDoc = await getFirestore().collection("users").doc(userId).get();

      if (!userDoc.exists) {
        res.status(404).json({error: "User not found. Please login again."});
        return;
      }

      const userData = userDoc.data();
      const githubToken = userData?.githubToken;

      if (!githubToken) {
        res.status(400).json({error: "GitHub token not found. Please login with GitHub again."});
        return;
      }

      // GitHub API로 리포지토리 목록 가져오기
      const response = await fetch("https://api.github.com/user/repos?sort=updated&per_page=100", {
        headers: {
          "Authorization": `Bearer ${githubToken}`,
          "Accept": "application/vnd.github.v3+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`GitHub API error: ${response.status}`, errorBody);
        res.status(response.status).json({
          error: "Failed to fetch repositories from GitHub",
          details: errorBody,
        });
        return;
      }

      const repositories: Repository[] = await response.json();
      res.json(repositories);
    } catch (error) {
      console.error("Error fetching repositories:", error);
      res.status(500).json({
        error: "Failed to fetch repositories",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

/**
 * 특정 리포지토리의 브랜치 목록 가져오기
 * Settings 페이지에서 브랜치 선택을 위해 사용
 * @deprecated
 * 과한 정보 제공으로 인해 사용하지 않음 2026-02-16
 * @TODO
 * 결제 기능 생기면 복구
 */
export const getBranches = onRequest(
  {
    cors: true,
    region: "asia-northeast3",
    invoker: "public",
  },
  async (req, res) => {
    try {
      const {owner, repo} = req.query;

      if (!owner || !repo) {
        res.status(400).json({error: "owner and repo parameters are required"});
        return;
      }

      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({error: "Firebase ID token not provided. Please authenticate."});
        return;
      }

      const idToken = authHeader.split("Bearer ")[1];

      // Firebase ID Token 검증
      const decodedToken = await getAuth().verifyIdToken(idToken);
      const userId = decodedToken.uid;

      // Firestore에서 GitHub 토큰 조회
      const userDoc = await getFirestore().collection("users").doc(userId).get();

      if (!userDoc.exists) {
        res.status(404).json({error: "User not found. Please login again."});
        return;
      }

      const userData = userDoc.data();
      const githubToken = userData?.githubToken;

      if (!githubToken) {
        res.status(400).json({error: "GitHub token not found. Please login with GitHub again."});
        return;
      }

      // GitHub API로 브랜치 목록 가져오기 (페이지네이션으로 전체 목록 수집)
      const headers = {
        "Authorization": `Bearer ${githubToken}`,
        "Accept": "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28",
      };
      const allBranches: Array<{name: string; protected?: boolean}> = [];
      const perPage = 100;
      let page = 1;

      while (true) {
        const url = `https://api.github.com/repos/${owner}/${repo}/branches?per_page=${perPage}&page=${page}`;
        const response = await fetch(url, { headers });

        if (!response.ok) {
          const errorBody = await response.text();
          console.error(`GitHub API error: ${response.status}`, errorBody);
          res.status(response.status).json({
            error: "Failed to fetch branches from GitHub",
            details: errorBody,
          });
          return;
        }

        const pageBranches = await response.json();
        allBranches.push(...pageBranches);

        if (pageBranches.length < perPage) break;
        page += 1;
      }

      res.json(allBranches);
    } catch (error) {
      console.error("Error fetching branches:", error);
      res.status(500).json({
        error: "Failed to fetch branches",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);
