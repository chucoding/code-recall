import {existsSync, readdirSync, readFileSync, statSync} from "node:fs";
import {dirname, join, relative, resolve, sep} from "node:path";
import {fileURLToPath} from "node:url";
import {parse} from "yaml";

/**
 * 위키 정적 검사
 *
 * `wiki/`는 OKF v0.2 번들이다. OKF 스펙은 `type`만 필수로 두지만, 이 저장소는 나중에 어떤
 * 도구로 옮겨도 신뢰 신호를 잃지 않도록 출처 필드를 처음부터 강제한다. 모순이나 오래된
 * 주장처럼 의미를 봐야 하는 점검은 LLM Lint가 맡고, 여기서는 기계적으로 판정할 수 있는 것만 본다.
 *
 * 코드에서 나온 문서의 신선도는 같은 PR에서 함께 고치는 규칙(AGENTS.md의 Ingest)에 맡긴다.
 * 저장소 안 출처가 없는 문서는 바뀌어도 이 저장소에 커밋이 생기지 않으므로 `stale_after`로 재확인한다.
 */

/** OKF 예약 파일. 개념 문서가 아니라 목록과 이력이므로 frontmatter 검사에서 뺌 */
const RESERVED_FILES = new Set(["index.md", "log.md"]);

/** 개념 문서에 반드시 있어야 하는 frontmatter 키 */
const REQUIRED_KEYS = ["type", "title", "description", "status", "sources", "generated"];

/** OKF v0.2 수명 상태 */
const STATUS_VALUES = new Set(["draft", "stable", "deprecated"]);

/** OKF 행위자 표기. `<도구>/<버전>`, `human:<id>`, `process:<id>` */
const ACTOR_PATTERN = /^(human:[^\s]+|process:[^\s]+|[^\s:/]+\/[^\s]+)$/;

/** `stale_after` 만료 전에 경고를 띄우는 기간 */
const STALE_WARNING_DAYS = 14;

/** 마크다운 인라인 링크. 이미지와 코드 안 링크는 호출부에서 걸러냄 */
const LINK_PATTERN = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/**
 * 검사 결과 한 건
 *
 * @typedef {{level: "error" | "warning", file: string, message: string}} WikiLintIssue
 */

/**
 * 디렉터리 아래 마크다운 파일 전체를 찾음
 *
 * @param {string} dir - 탐색할 디렉터리
 * @return {string[]} 마크다운 파일 절대 경로 목록
 */
function listMarkdownFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listMarkdownFiles(path);
    return name.endsWith(".md") ? [path] : [];
  });
}

/**
 * 문서를 frontmatter와 본문으로 나눔
 *
 * @param {string} text - 문서 전체
 * @return {{frontmatter: string | null, body: string}} frontmatter가 없으면 null
 */
function splitFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return {frontmatter: null, body: text};
  return {frontmatter: match[1], body: text.slice(match[0].length)};
}

/**
 * 코드 블록과 인라인 코드를 지운 본문. 예시로 적은 링크를 검사하지 않기 위함
 *
 * @param {string} body - 문서 본문
 * @return {string} 코드를 지운 본문
 */
function stripCode(body) {
  return body.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
}

/**
 * 값이 날짜 또는 ISO 8601 문자열이면 Date로 바꿈
 *
 * @param {unknown} value - frontmatter 값
 * @return {Date | null} 해석할 수 없으면 null
 */
function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * 문서 안 링크가 가리키는 로컬 경로
 *
 * `/`로 시작하면 번들 루트 기준, 그 밖은 문서 위치 기준이다(OKF 6.2).
 *
 * @param {string} target - 링크 대상
 * @param {string} file - 링크가 있는 문서
 * @param {string} bundleRoot - 번들 루트
 * @return {string | null} 외부 링크나 문서 내 앵커면 null
 */
function resolveLocalTarget(target, file, bundleRoot) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) return null;
  const path = decodeURI(target.split("#")[0]);
  if (!path) return null;
  return path.startsWith("/") ? join(bundleRoot, path) : resolve(dirname(file), path);
}

/**
 * 개념 문서 frontmatter 검사
 *
 * @param {Record<string, unknown>} data - 해석한 frontmatter
 * @param {string} file - 문서 경로
 * @param {string} bundleRoot - 번들 루트
 * @param {Date} now - 기준 시각
 * @return {{level: "error" | "warning", message: string}[]} 발견한 문제
 */
function checkConcept(data, file, bundleRoot, now) {
  const problems = [];
  let localSourceCount = 0;
  const error = (message) => problems.push({level: "error", message});

  for (const key of REQUIRED_KEYS) {
    if (data[key] === undefined || data[key] === null || data[key] === "") {
      error(`frontmatter에 \`${key}\`가 없음`);
    }
  }

  if (data.status !== undefined && !STATUS_VALUES.has(data.status)) {
    error(`\`status\`는 draft, stable, deprecated 중 하나여야 함: ${data.status}`);
  }

  if (data.sources !== undefined) {
    if (!Array.isArray(data.sources) || data.sources.length === 0) {
      error("`sources`는 항목이 하나 이상인 목록이어야 함");
    } else {
      data.sources.forEach((source, index) => {
        const resource = source?.resource;
        if (typeof resource !== "string" || !resource) {
          error(`\`sources[${index}].resource\`가 없음`);
          return;
        }
        const local = resolveLocalTarget(resource, file, bundleRoot);
        if (!local) return;
        localSourceCount += 1;
        if (!existsSync(local)) error(`\`sources[${index}].resource\` 경로가 없음: ${resource}`);
      });
    }
  }

  // 저장소 안 출처가 없으면 바뀌어도 커밋이 생기지 않아 날짜가 유일한 재확인 계기
  if (Array.isArray(data.sources) && data.sources.length > 0 && localSourceCount === 0 &&
    (data.stale_after === undefined || data.stale_after === null || data.stale_after === "")) {
    error("저장소 안 출처가 없는 문서는 `stale_after`가 필요함");
  }

  if (data.generated !== undefined) {
    const {by, at} = data.generated ?? {};
    if (typeof by !== "string" || !ACTOR_PATTERN.test(by)) {
      error("`generated.by`는 `<도구>/<버전>` 형식이어야 함");
    }
    if (!toDate(at)) error("`generated.at`은 ISO 8601 시각이어야 함");
  }

  const verified = data.verified === undefined ? [] : [data.verified].flat();
  verified.forEach((entry, index) => {
    if (typeof entry?.by !== "string" || !ACTOR_PATTERN.test(entry.by)) {
      error(`\`verified[${index}].by\`는 \`human:<id>\`, \`process:<id>\`, \`<도구>/<버전>\` 중 하나여야 함`);
    }
    if (!toDate(entry?.at)) error(`\`verified[${index}].at\`은 ISO 8601 시각이어야 함`);
  });

  // stable은 사람이 확인한 문서에만 붙임. 기계 확인만으로 올리면 신뢰 단계가 섞임
  if (data.status === "stable" && !verified.some((entry) => String(entry?.by).startsWith("human:"))) {
    error("`status: stable`은 `verified`에 `human:` 항목이 있어야 함");
  }

  if (data.stale_after !== undefined) {
    const staleAfter = toDate(data.stale_after);
    if (!staleAfter) {
      error("`stale_after`는 ISO 8601 날짜여야 함");
    } else if (data.status !== "deprecated") {
      const daysLeft = (staleAfter.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
      if (daysLeft <= 0) {
        error(`\`stale_after\`(${toIsoDate(staleAfter)})가 지남. 내용을 다시 확인하고 날짜를 갱신해야 함`);
      } else if (daysLeft <= STALE_WARNING_DAYS) {
        problems.push({level: "warning", message: `\`stale_after\`(${toIsoDate(staleAfter)})까지 ${Math.ceil(daysLeft)}일 남음`});
      }
    }
  }

  return problems;
}

/**
 * Date를 `YYYY-MM-DD`로 표기
 *
 * @param {Date} date - 날짜
 * @return {string} ISO 날짜
 */
function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * `log.md` 검사. 날짜 제목이 `YYYY-MM-DD`이고 최신순인지 봄
 *
 * @param {string} text - log.md 내용
 * @return {string[]} 발견한 문제
 */
function checkLog(text) {
  const problems = [];
  const headings = [...stripCode(text).matchAll(/^##\s+(.+)$/gm)].map((match) => match[1].trim());

  headings.forEach((heading) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(heading)) problems.push(`날짜 제목은 \`## YYYY-MM-DD\` 형식이어야 함: ${heading}`);
  });

  for (let i = 1; i < headings.length; i += 1) {
    if (headings[i] >= headings[i - 1]) {
      problems.push(`날짜 제목은 최신순이어야 함: ${headings[i - 1]} 다음에 ${headings[i]}`);
    }
  }

  return problems;
}

/**
 * 위키 번들 전체 검사
 *
 * @param {string} bundleRoot - 번들 루트(`wiki/`)
 * @param {{now?: Date}} [options] - 기준 시각. 테스트에서 고정할 때 씀
 * @return {WikiLintIssue[]} 발견한 문제
 */
export function lintWiki(bundleRoot, {now = new Date()} = {}) {
  /** @type {WikiLintIssue[]} */
  const issues = [];
  const toBundlePath = (path) => relative(bundleRoot, path).split(sep).join("/");
  const report = (level, file, message) => issues.push({level, file: toBundlePath(file), message});

  if (!existsSync(bundleRoot)) {
    report("error", bundleRoot, "위키 디렉터리가 없음");
    return issues;
  }

  const files = listMarkdownFiles(bundleRoot);
  /** 각 문서가 링크한 로컬 경로. index 누락 검사에 씀 */
  const linkedFrom = new Map();

  for (const file of files) {
    const name = file.split(sep).pop();
    const text = readFileSync(file, "utf8");
    const {frontmatter, body} = splitFrontmatter(text);

    if (!RESERVED_FILES.has(name)) {
      if (frontmatter === null) {
        report("error", file, "YAML frontmatter가 없음");
      } else {
        let data;
        try {
          data = parse(frontmatter);
        } catch (parseError) {
          report("error", file, `frontmatter YAML 해석 실패: ${parseError.message}`);
        }
        if (data && typeof data === "object") {
          checkConcept(data, file, bundleRoot, now).forEach(({level, message}) => report(level, file, message));
        } else if (data !== undefined) {
          report("error", file, "frontmatter가 키-값 형식이 아님");
        }
      }
    }

    if (name === "log.md") checkLog(text).forEach((message) => report("error", file, message));

    const targets = [];
    for (const match of stripCode(body).matchAll(LINK_PATTERN)) {
      const local = resolveLocalTarget(match[1], file, bundleRoot);
      if (!local) continue;
      if (!existsSync(local)) {
        report("error", file, `깨진 링크: ${match[1]}`);
        continue;
      }
      targets.push(resolve(local));
    }
    linkedFrom.set(resolve(file), targets);
  }

  // 각 문서는 같은 디렉터리 index.md에서, 하위 index.md는 상위 index.md에서 찾을 수 있어야 함
  for (const file of files) {
    const absolute = resolve(file);
    const dir = dirname(absolute);
    const name = absolute.split(sep).pop();
    if (name === "log.md" || (name === "index.md" && dir === resolve(bundleRoot))) continue;

    const parentIndex = name === "index.md" ? join(dirname(dir), "index.md") : join(dir, "index.md");
    if (!existsSync(parentIndex)) {
      report("error", file, `${relative(bundleRoot, parentIndex).split(sep).join("/")}가 없어 이 문서를 찾을 수 없음`);
      continue;
    }
    if (!(linkedFrom.get(resolve(parentIndex)) ?? []).includes(absolute)) {
      report("error", file, `${relative(bundleRoot, parentIndex).split(sep).join("/")}에 이 문서 링크가 없음`);
    }
  }

  return issues;
}

/** CLI 진입점. 오류가 하나라도 있으면 종료 코드 1 */
function main() {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const bundleRoot = resolve(repoRoot, process.argv[2] ?? "wiki");
  const issues = lintWiki(bundleRoot);

  for (const {level, file, message} of issues) {
    const line = `${level === "error" ? "✖" : "⚠"} ${file}: ${message}`;
    if (level === "error") console.error(line);
    else console.warn(line);
  }

  const errorCount = issues.filter((issue) => issue.level === "error").length;
  const warningCount = issues.length - errorCount;
  console.log(`위키 검사: 오류 ${errorCount}건, 경고 ${warningCount}건`);
  if (errorCount > 0) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
