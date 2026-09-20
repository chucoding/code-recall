/**
 * 쿼리 키 팩토리
 *
 * 사용처마다 키 배열을 직접 적으면 문자열 하나만 어긋나도 캐시가 조용히 갈라지고,
 * 무효화 대상을 찾기도 어려워 스코프 단위로 한곳에서 만든다.
 */

/** 쿼리 키 한 칸에 들어갈 수 있는 값. 직렬화가 안정적인 원시값만 허용 */
type QueryKeyPart = string | number | boolean | null | undefined;

/** 인자를 받아 키 뒷부분을 만드는 정의 */
type QueryKeyBuilder = (...args: never[]) => readonly QueryKeyPart[];

/** `createQueryKeys`에 넘기는 정의 묶음 */
type QueryKeyDefinitions = Record<string, QueryKeyBuilder | readonly QueryKeyPart[]>;

/** 정의 묶음을 `[스코프, 이름, ...]` 형태의 키로 바꾼 결과 */
type ScopedQueryKeys<TDefinitions extends QueryKeyDefinitions> = {
  readonly [TName in keyof TDefinitions]: TDefinitions[TName] extends (
    ...args: infer TArgs
  ) => readonly QueryKeyPart[]
    ? (...args: TArgs) => readonly QueryKeyPart[]
    : readonly QueryKeyPart[];
} & {
  /** 스코프 전체를 가리키는 키. 스코프 단위 무효화에 사용 */
  readonly all: readonly QueryKeyPart[];
};

/**
 * 한 스코프의 쿼리 키를 한 번에 정의
 *
 * @param scope - 키 맨 앞에 붙는 스코프 이름
 * @param definitions - 키 이름별 정의. 배열이면 고정 키, 함수면 인자를 받는 키
 * @returns 각 정의가 `[스코프, 이름, ...]` 키로 확장된 객체와 스코프 전체 키(`all`)
 *
 * @example
 * const demoFlashcardKeys = createQueryKeys('demo-flashcards', {
 *   cards: (repositoryUrl: string, lang: string) => [repositoryUrl, lang],
 * });
 * demoFlashcardKeys.cards('owner/repo', 'ko'); // ['demo-flashcards', 'cards', 'owner/repo', 'ko']
 */
export function createQueryKeys<TDefinitions extends QueryKeyDefinitions>(
  scope: string,
  definitions: TDefinitions
): ScopedQueryKeys<TDefinitions> {
  const keys: Record<string, unknown> = { all: [scope] };

  for (const [name, definition] of Object.entries(definitions)) {
    keys[name] =
      typeof definition === 'function'
        ? (...args: never[]) => [scope, name, ...definition(...args)]
        : [scope, name, ...definition];
  }

  return keys as ScopedQueryKeys<TDefinitions>;
}
