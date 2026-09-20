/**
 * 오늘 날짜를 사용자 디바이스(로컬) 타임존 기준 YYYY-MM-DD로 반환.
 * 해외 유저 포함해 각자 기준 "오늘"에 맞게 플래시카드·재생성·날짜 입력이 동작함.
 */
export function getCurrentDate(): string {
  return new Date().toLocaleDateString('en-CA');
}

/** Fisher-Yates 셔플. 덱 순서를 무작위로 바꾼 새 배열 반환 (원본 불변). */
export function shuffleArray<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
