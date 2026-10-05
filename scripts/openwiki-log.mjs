import {execFileSync} from "node:child_process";
import {existsSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

/**
 * OpenWiki 변경 이력 기록
 *
 * OpenWiki는 `log.md`를 OKF 예약 파일로 인식만 하고 내용을 쓰지 않는다. 그래서 OpenWiki 실행 직후
 * 작업 트리와 HEAD를 비교해 생성, 수정, 삭제된 개념 문서를 `log.md` 맨 위 날짜 아래에 덧붙인다.
 * LLM을 거치지 않는 결정적 기록이라 같은 변경에서 항상 같은 항목이 나온다.
 */

/** 위키 번들 경로. 저장소 루트 기준 */
const BUNDLE_DIR = "openwiki";

/** 개념 문서가 아니어서 이력에 남기지 않는 파일 */
const EXCLUDED_FILES = new Set(["index.md", "log.md", "INSTRUCTIONS.md"]);

/** 이력 항목 종류. git 상태 코드에서 정함 */
const ACTIONS = {created: "Creation", updated: "Update", deleted: "Deletion"};

/** 날짜 제목 기준 시간대. 팀이 쓰는 날짜와 맞춤 */
const LOG_TIME_ZONE = "Asia/Seoul";

/**
 * 이력 한 건
 *
 * @typedef {{action: keyof typeof ACTIONS, path: string, title: string}} WikiLogEntry
 */

/**
 * 문서 frontmatter의 `title`
 *
 * @param {string} text - 문서 전체
 * @return {string | null} 제목이 없으면 null
 */
export function readTitle(text) {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
  const title = /^title:\s*(.+)$/m.exec(frontmatter)?.[1].trim();
  return title ? title.replace(/^(["'])(.*)\1$/, "$2") : null;
}

/**
 * `log.md`에 항목을 추가한 결과
 *
 * 같은 날짜 제목이 있으면 그 바로 아래에, 없으면 첫 날짜 제목 앞에 새 날짜 제목을 만들어 넣는다.
 *
 * @param {string} log - 기존 log.md 내용
 * @param {string} date - `YYYY-MM-DD`
 * @param {WikiLogEntry[]} entries - 추가할 항목
 * @return {string} 갱신한 log.md 내용. 항목이 없으면 그대로
 */
export function addLogEntries(log, date, entries) {
  if (entries.length === 0) return log;
  // Windows 체크아웃은 CRLF일 수 있으므로 LF로 처리한 뒤 원래 줄바꿈으로 되돌림
  if (log.includes("\r\n")) return addLogEntries(log.replace(/\r\n/g, "\n"), date, entries).replace(/\n/g, "\r\n");

  const lines = entries.map(({action, path, title}) => (action === "deleted"
    ? `- **${ACTIONS[action]}** ${title} (\`${path}\`)`
    : `- **${ACTIONS[action]}** [${title}](${path})`));
  const heading = `## ${date}`;
  const block = `${lines.join("\n")}\n`;

  const sameDate = log.indexOf(`${heading}\n`);
  if (sameDate !== -1) {
    const insertAt = sameDate + heading.length + 1;
    const rest = log.slice(insertAt).replace(/^\n/, "");
    return `${log.slice(0, insertAt)}\n${block}${rest}`;
  }

  const firstDate = log.search(/^## /m);
  if (firstDate === -1) return `${log.trimEnd()}\n\n${heading}\n\n${block}`;
  return `${log.slice(0, firstDate)}${heading}\n\n${block}\n${log.slice(firstDate)}`;
}

/**
 * HEAD 대비 바뀐 개념 문서 목록
 *
 * @param {string} repoRoot - 저장소 루트
 * @return {WikiLogEntry[]} 경로 순 정렬
 */
function collectChanges(repoRoot) {
  const git = (...args) => execFileSync("git", ["-c", "core.quotepath=false", ...args], {cwd: repoRoot, encoding: "utf8"});
  const records = git("status", "--porcelain=v1", "-z", "--untracked-files=all", "--", BUNDLE_DIR).split("\0");

  /** @type {WikiLogEntry[]} */
  const entries = [];
  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    if (!record) continue;
    const code = record.slice(0, 2);
    const file = record.slice(3);
    // 이름 변경은 다음 레코드가 원래 경로이므로 건너뜀
    if (code.includes("R") || code.includes("C")) i += 1;

    const name = file.split("/").pop();
    if (!file.endsWith(".md") || EXCLUDED_FILES.has(name)) continue;

    const path = file.slice(BUNDLE_DIR.length + 1);
    if (code.includes("D")) {
      const title = readTitle(git("show", `HEAD:${file}`)) ?? path;
      entries.push({action: "deleted", path, title});
      continue;
    }
    const action = code === "??" || code.includes("A") ? "created" : "updated";
    entries.push({action, path, title: readTitle(readFileSync(resolve(repoRoot, file), "utf8")) ?? path});
  }

  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

/** CLI 진입점. OpenWiki 실행 직후 저장소 루트에서 실행 */
function main() {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const logPath = resolve(repoRoot, BUNDLE_DIR, "log.md");
  const date = new Intl.DateTimeFormat("en-CA", {timeZone: LOG_TIME_ZONE}).format(new Date());
  const entries = collectChanges(repoRoot);

  const log = existsSync(logPath) ? readFileSync(logPath, "utf8") : "# 위키 변경 이력\n";
  writeFileSync(logPath, addLogEntries(log, date, entries));
  console.log(`위키 변경 이력: ${entries.length}건 기록`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
