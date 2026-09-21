/**
 * 날짜별 플래시카드 문서 크기 제한 (서버 사전 생성용)
 *
 * 앱 `features/flashcard/lib/deck-size.ts`와 같은 규칙이다. app과 functions는 따로 빌드되는
 * 패키지라 코드를 공유하지 못해 옮겨 두었고, 한쪽 상한을 바꾸면 다른 쪽도 함께 바꿔야 한다.
 * 두 경로가 같은 문서(`users/{uid}/flashcards/{날짜}`)에 언어별 덱을 나눠 쓰기 때문이다.
 */

/** 문서 한 건의 안전 상한. Firestore 문서 상한 1MB 대비 필드 이름과 인덱스 여유 */
const MAX_FLASHCARD_DOC_BYTES = 900_000;

/** 언어별 덱 하나의 예산. 두 언어 덱이 한 문서에 같이 들어가므로 안전 상한의 절반 */
const FLASHCARD_DECK_BUDGET_BYTES = MAX_FLASHCARD_DOC_BYTES / 2;

/** 카드 하나에 저장할 원문 diff 길이 상한. 생성 프롬프트에 붙이는 길이 상한과 같음 */
const MAX_RAW_DIFF_CHARS = 30_000;

/** 예산을 맞추려고 줄여 가는 diff 길이의 하한. 이보다 짧으면 diff를 저장하지 않음 */
const MIN_RAW_DIFF_CHARS = 1_000;

/** 카드 하나에 저장할 변경 파일 목록 수 상한. 파일 보기 탭 목록에만 쓰임 */
const MAX_FILES_PER_CARD = 20;

/** diff를 잘랐을 때 끝에 붙이는 표시 */
const TRUNCATED_MARKER = "…(truncated)";

/** 앱 `FileChange`와 같은 형태 */
export interface FlashcardFileChange {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  raw_url?: string;
}

/** 앱 `FlashCardData`와 같은 형태 */
export interface FlashcardData {
  question: string;
  answer: string;
  highlights?: string[];
  metadata?: {
    commitMessage?: string;
    rawDiff?: string;
    files?: FlashcardFileChange[];
    repositoryFullName?: string;
    branch?: string;
  };
}

/**
 * 덱을 JSON으로 직렬화했을 때의 UTF-8 바이트 수
 *
 * @param {FlashcardData[]} deck - 크기를 잴 카드 목록
 * @return {number} 직렬화한 바이트 수
 */
function measureFlashcardDeckBytes(deck: FlashcardData[]): number {
  return Buffer.byteLength(JSON.stringify(deck), "utf8");
}

/**
 * diff를 길이 상한에서 자름. 코드 블록 중간에서 잘리면 블록을 닫아 마크다운이 깨지지 않게 함
 *
 * @param {string} rawDiff - 원문 diff 마크다운
 * @param {number} maxChars - 남길 최대 글자 수
 * @return {string} 상한 안의 diff
 */
function truncateRawDiff(rawDiff: string, maxChars: number): string {
  if (rawDiff.length <= maxChars) return rawDiff;

  const head = rawDiff.slice(0, maxChars);
  const isFenceOpen = (head.match(/^```/gm) ?? []).length % 2 === 1;
  return `${head}\n${isFenceOpen ? "```\n" : ""}\n${TRUNCATED_MARKER}`;
}

/**
 * 카드 메타데이터를 저장용으로 줄임. `files[].patch`는 `rawDiff`와 겹쳐 뺌
 *
 * @param {FlashcardData} card - 원본 카드
 * @param {number} maxRawDiffChars - 남길 diff 길이. 0이면 diff를 저장하지 않음
 * @return {FlashcardData} 메타데이터를 줄인 카드
 */
function compactFlashcard(card: FlashcardData, maxRawDiffChars: number): FlashcardData {
  if (!card.metadata) return card;

  const {rawDiff, files, ...rest} = card.metadata;
  const compactFiles = files
    ?.slice(0, MAX_FILES_PER_CARD)
    .map(({patch: _patch, ...file}) => file);

  return {
    ...card,
    metadata: {
      ...rest,
      ...(compactFiles && compactFiles.length > 0 ? {files: compactFiles} : {}),
      ...(rawDiff && maxRawDiffChars > 0 ?
        {rawDiff: truncateRawDiff(rawDiff, maxRawDiffChars)} :
        {}),
    },
  };
}

/**
 * 덱을 바이트 예산 안으로 줄임
 *
 * diff 길이를 상한에서 시작해 절반씩 줄이며 예산에 들어오는 첫 길이를 쓰고,
 * 하한까지 줄여도 넘치면 diff 없이 저장한다.
 *
 * @param {FlashcardData[]} deck - 저장할 카드 목록
 * @return {FlashcardData[]} 예산 안으로 줄인 카드 목록
 */
export function fitFlashcardDeckToBudget(deck: FlashcardData[]): FlashcardData[] {
  for (
    let maxChars = MAX_RAW_DIFF_CHARS;
    maxChars >= MIN_RAW_DIFF_CHARS;
    maxChars = Math.floor(maxChars / 2)
  ) {
    const fitted = deck.map((card) => compactFlashcard(card, maxChars));
    if (measureFlashcardDeckBytes(fitted) <= FLASHCARD_DECK_BUDGET_BYTES) return fitted;
  }
  return deck.map((card) => compactFlashcard(card, 0));
}
