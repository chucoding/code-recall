import type { FlashCardData } from '@/entities/flashcard';

/**
 * 날짜별 플래시카드 문서 크기 제한
 *
 * `users/{uid}/flashcards/{날짜}` 문서 하나에 언어별 덱(`data_ko`, `data_en`)이 함께 들어가고,
 * Firestore 문서는 1MB(1,048,576 bytes)를 넘으면 쓰기가 거부된다.
 * 카드는 커밋 하나에서 여러 장이 나오는데 카드마다 같은 diff를 들고 있어, 큰 커밋 하나만으로도
 * 덱이 수 MB로 불어난다. 저장 직전에 덱을 예산 안으로 줄여 쓰기 실패를 막는다.
 */

/** 문서 한 건의 안전 상한. Firestore 문서 상한 1MB 대비 필드 이름과 인덱스 여유 */
export const MAX_FLASHCARD_DOC_BYTES = 900_000;

/** 언어별 덱 하나의 예산. 두 언어 덱이 한 문서에 같이 들어가므로 안전 상한의 절반 */
export const FLASHCARD_DECK_BUDGET_BYTES = MAX_FLASHCARD_DOC_BYTES / 2;

/** 카드 하나에 저장할 원문 diff 길이 상한. 서버가 생성 프롬프트에 붙이는 길이 상한과 같음 */
const MAX_RAW_DIFF_CHARS = 30_000;

/** 예산을 맞추려고 줄여 가는 diff 길이의 하한. 이보다 짧으면 diff를 저장하지 않음 */
const MIN_RAW_DIFF_CHARS = 1_000;

/** 카드 하나에 저장할 변경 파일 목록 수 상한. 파일 보기 탭 목록에만 쓰임 */
const MAX_FILES_PER_CARD = 20;

/** diff를 잘랐을 때 끝에 붙이는 표시 */
const TRUNCATED_MARKER = '…(truncated)';

/**
 * 덱을 JSON으로 직렬화했을 때의 UTF-8 바이트 수
 *
 * Firestore의 실제 저장 크기와 계산 방식은 다르지만, 따옴표와 이스케이프가 더해져
 * 대체로 실제보다 크게 나오므로 상한 판정에 보수적으로 쓸 수 있음
 *
 * @param deck - 크기를 잴 카드 목록
 * @returns 직렬화한 바이트 수
 */
export function measureFlashcardDeckBytes(deck: FlashCardData[]): number {
  return new TextEncoder().encode(JSON.stringify(deck)).length;
}

/**
 * diff를 길이 상한에서 자름. 코드 블록 중간에서 잘리면 블록을 닫아 마크다운이 깨지지 않게 함
 *
 * @param rawDiff - 원문 diff 마크다운
 * @param maxChars - 남길 최대 글자 수
 * @returns 상한 안의 diff
 */
function truncateRawDiff(rawDiff: string, maxChars: number): string {
  if (rawDiff.length <= maxChars) return rawDiff;

  const head = rawDiff.slice(0, maxChars);
  const isFenceOpen = (head.match(/^```/gm) ?? []).length % 2 === 1;
  return `${head}\n${isFenceOpen ? '```\n' : ''}\n${TRUNCATED_MARKER}`;
}

/**
 * 카드 메타데이터를 저장용으로 줄임
 *
 * `files[].patch`는 화면에서 읽지 않고 같은 내용이 `rawDiff`에도 있어 뺀다.
 * 파일 보기 탭은 `filename`과 `raw_url`만으로 원본 파일을 다시 불러온다.
 *
 * @param card - 원본 카드
 * @param maxRawDiffChars - 남길 diff 길이. 0이면 diff를 저장하지 않음
 * @returns 메타데이터를 줄인 카드
 */
function compactFlashcard(card: FlashCardData, maxRawDiffChars: number): FlashCardData {
  if (!card.metadata) return card;

  const { rawDiff, files, ...rest } = card.metadata;
  const compactFiles = files?.slice(0, MAX_FILES_PER_CARD).map(({ patch: _patch, ...file }) => file);

  return {
    ...card,
    metadata: {
      ...rest,
      ...(compactFiles && compactFiles.length > 0 ? { files: compactFiles } : {}),
      ...(rawDiff && maxRawDiffChars > 0 ? { rawDiff: truncateRawDiff(rawDiff, maxRawDiffChars) } : {}),
    },
  };
}

/**
 * 덱을 바이트 예산 안으로 줄임
 *
 * diff 길이를 상한에서 시작해 절반씩 줄이며 예산에 들어오는 첫 길이를 쓰고,
 * 하한까지 줄여도 넘치면 diff 없이 저장한다. diff가 없는 카드는 질문 재생성 버튼만 숨겨진다.
 *
 * @param deck - 저장할 카드 목록
 * @param budgetBytes - 덱 하나에 허용할 바이트 수
 * @returns 예산 안으로 줄인 카드 목록
 */
export function fitFlashcardDeckToBudget(
  deck: FlashCardData[],
  budgetBytes: number = FLASHCARD_DECK_BUDGET_BYTES
): FlashCardData[] {
  for (let maxChars = MAX_RAW_DIFF_CHARS; maxChars >= MIN_RAW_DIFF_CHARS; maxChars = Math.floor(maxChars / 2)) {
    const fitted = deck.map((card) => compactFlashcard(card, maxChars));
    if (measureFlashcardDeckBytes(fitted) <= budgetBytes) return fitted;
  }
  return deck.map((card) => compactFlashcard(card, 0));
}
