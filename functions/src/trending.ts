import {onSchedule} from "firebase-functions/v2/scheduler";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {pregenerateDemoFlashcards, removeStaleDemoFlashcards} from "./demo-flashcards.js";

/**
 * GitHub Trending Top N 수집
 *
 * GitHub은 Trending 공식 API를 제공하지 않아 https://github.com/trending HTML을 파싱한다.
 * 브라우저에서는 CORS로 직접 읽을 수 없으므로 서버에서 하루 한 번 수집해 Firestore에 캐시하고,
 * 랜딩 데모는 그 캐시 문서만 읽는다.
 */

/** Trending 목록의 저장소 한 건 */
export interface TrendingRepo {
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

const TRENDING_URL = "https://github.com/trending?since=daily";
const TRENDING_DOC_PATH = "meta/trendingRepos";
const TRENDING_LIMIT = 10;

/** 파싱 결과가 이 수에 못 미치면 HTML 구조 변경으로 보고 기존 캐시를 유지 */
const MIN_ACCEPTABLE_COUNT = 5;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
  nbsp: " ",
};

/** HTML 엔티티를 평문으로 되돌림 */
function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (match, name) => NAMED_ENTITIES[name] ?? match);
}

/** 태그를 걷어내고 공백을 한 칸으로 정리한 평문 반환 */
function toPlainText(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

/** 정규식 첫 번째 캡처 그룹 반환. 일치하지 않으면 null */
function firstGroup(source: string, pattern: RegExp): string | null {
  const matched = source.match(pattern);
  return matched ? matched[1] : null;
}

/** Trending 페이지 HTML에서 저장소 목록 추출 */
function parseTrendingHtml(html: string): TrendingRepo[] {
  const rows = html.split(/<article\b[^>]*class="[^"]*Box-row[^"]*"[^>]*>/i).slice(1);
  const repos: TrendingRepo[] = [];

  for (const row of rows) {
    const body = row.split(/<\/article>/i)[0];
    const link = body.match(/<h2\b[\s\S]*?<a\b[^>]*href="\/([^"/]+)\/([^"/?#]+)"/i);
    if (!link) continue;

    const [, owner, name] = link;
    const description = firstGroup(body, /<p\b[^>]*class="[^"]*col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    const language = firstGroup(body, /itemprop="programmingLanguage"[^>]*>([\s\S]*?)<\/span>/i);
    const languageColor = firstGroup(
      body,
      /class="[^"]*repo-language-color[^"]*"[^>]*style="[^"]*background-color:\s*([^;"]+)/i
    );
    const starsToday = firstGroup(body, /([\d,]+)\s+stars?\s+(?:today|this week|this month)/i);

    repos.push({
      owner,
      name,
      fullName: `${owner}/${name}`,
      url: `https://github.com/${owner}/${name}`,
      description: description ? toPlainText(description) : "",
      language: language ? toPlainText(language) : null,
      languageColor: languageColor ? languageColor.trim() : null,
      starsToday: starsToday ? parseInt(starsToday.replace(/,/g, ""), 10) : 0,
    });

    if (repos.length >= TRENDING_LIMIT) break;
  }

  return repos;
}

/** Trending 페이지를 받아 파싱한 결과 반환 */
async function fetchTrendingRepos(): Promise<TrendingRepo[]> {
  const response = await fetch(TRENDING_URL, {
    headers: {
      // 기본 UA로는 GitHub이 응답을 다르게 주거나 차단할 수 있어 명시
      "User-Agent": "CodeRecall-TrendingBot/1.0 (+https://coderecall.app)",
      "Accept": "text/html",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub Trending 요청 실패: ${response.status}`);
  }

  return parseTrendingHtml(await response.text());
}

/**
 * 매일 09시(KST) GitHub Trending Top 10을 수집해 Firestore에 캐시
 *
 * 목록만 캐시하면 방문자가 뱃지를 누를 때마다 GitHub 조회와 AI 생성을 다시 거쳐 수 초를 기다리게 되어,
 * 같은 실행에서 각 저장소의 데모 카드까지 미리 만들어 둔다. 저장소 10곳의 AI 호출이 이어지므로
 * 기본 60초로는 모자라 실행 시간을 늘렸다.
 */
export const refreshTrendingRepos = onSchedule(
  {
    schedule: "0 9 * * *",
    timeZone: "Asia/Seoul",
    region: "asia-northeast3",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    const repos = await fetchTrendingRepos();

    if (repos.length < MIN_ACCEPTABLE_COUNT) {
      // 잘못된 목록으로 덮어쓰면 랜딩 뱃지가 빈약해지므로 기존 캐시를 그대로 둔다
      console.error(
        `Trending 파싱 결과가 ${repos.length}건뿐이라 캐시를 갱신하지 않음. HTML 구조 변경 확인 필요.`
      );
      return;
    }

    await getFirestore().doc(TRENDING_DOC_PATH).set({
      since: "daily",
      repos,
      updatedAt: Timestamp.now(),
    });

    console.log(`Trending 캐시 갱신 완료: ${repos.length}건`);

    // 카드 생성이 실패해도 목록 캐시는 이미 저장돼 랜딩 뱃지는 정상 동작한다
    try {
      await pregenerateDemoFlashcards(repos);
      await removeStaleDemoFlashcards(repos);
    } catch (error) {
      console.error("데모 카드 사전 생성 단계 실패", error);
    }
  }
);
