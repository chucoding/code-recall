/**
 * 사용자 타임존 기준 날짜 계산
 *
 * 앱은 기기 로컬 타임존으로 "오늘"과 "N일 전"을 정한다. 서버가 같은 날짜 문서와
 * 같은 커밋 조회 구간을 만들려면 사용자 타임존으로 같은 계산을 해야 한다.
 */

/**
 * 주어진 시각을 특정 타임존의 시(0–23)로 반환
 *
 * @param {Date} date - 기준 시각
 * @param {string} timeZone - IANA 타임존
 * @return {number} 해당 타임존의 시
 */
export function getHourInTimezone(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hour12: false,
  });
  // 자정을 "24"로 표기하는 런타임이 있어 0으로 맞춤
  return parseInt(formatter.format(date), 10) % 24;
}

/**
 * 주어진 시각을 특정 타임존의 `YYYY-MM-DD`로 반환
 *
 * 앱 `getCurrentDate`(`toLocaleDateString('en-CA')`)와 같은 형식이라 플래시카드 문서 ID로 쓴다.
 *
 * @param {Date} date - 기준 시각
 * @param {string} timeZone - IANA 타임존
 * @return {string} `YYYY-MM-DD` 형식의 날짜
 */
export function getDateInTimezone(date: Date, timeZone: string): string {
  return date.toLocaleDateString("en-CA", {timeZone});
}

/**
 * 타임존이 런타임에서 인식되는지 여부
 *
 * 타임존은 클라이언트가 쓰는 값이라 잘못된 문자열이 들어올 수 있고, `Intl`은 그때 예외를 던진다.
 *
 * @param {string} timeZone - 검사할 타임존
 * @return {boolean} 사용할 수 있으면 true
 */
export function isValidTimezone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", {timeZone});
    return true;
  } catch {
    return false;
  }
}

/**
 * 특정 시각에서 타임존의 UTC 오프셋(밀리초)
 *
 * @param {Date} date - 기준 시각
 * @param {string} timeZone - IANA 타임존
 * @return {number} 로컬 시각 - UTC 시각
 */
function getTimezoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second")
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * 타임존 기준 특정 날짜의 시작과 끝 시각
 *
 * 앱이 `setHours(0, 0, 0, 0)`과 `setHours(23, 59, 59, 999)`로 만드는 커밋 조회 구간과 같다.
 * 오프셋은 그날 자정 부근에서 다시 구해 서머타임 전환일에도 맞춘다.
 *
 * @param {string} dateKey - `YYYY-MM-DD` 형식의 날짜
 * @param {string} timeZone - IANA 타임존
 * @return {{since: Date, until: Date}} 그날의 시작과 끝
 */
export function getDayRangeInTimezone(
  dateKey: string,
  timeZone: string
): { since: Date; until: Date } {
  const [year, month, day] = dateKey.split("-").map(Number);
  const toLocalMidnight = (y: number, m: number, d: number): Date => {
    const guess = Date.UTC(y, m - 1, d);
    const firstPass = guess - getTimezoneOffsetMs(new Date(guess), timeZone);
    return new Date(guess - getTimezoneOffsetMs(new Date(firstPass), timeZone));
  };

  const since = toLocalMidnight(year, month, day);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const nextMidnight = toLocalMidnight(
    nextDay.getUTCFullYear(),
    nextDay.getUTCMonth() + 1,
    nextDay.getUTCDate()
  );
  return {since, until: new Date(nextMidnight.getTime() - 1)};
}

/**
 * `YYYY-MM-DD` 날짜에서 달력 기준 N일을 뺀 날짜
 *
 * @param {string} dateKey - 기준 날짜
 * @param {number} days - 뺄 일수
 * @return {string} `YYYY-MM-DD` 형식의 날짜
 */
export function subtractDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - days)).toISOString().split("T")[0];
}
