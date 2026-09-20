# CodeRecall 기여 가이드

기여해 주셔서 감사합니다. 버그 제보와 기능 제안, PR 모두 환영합니다.

## 시작하기 전에

- 먼저 [이슈](https://github.com/chucoding/code-recall/issues)를 검색해 같은 내용이 있는지 확인합니다.
- 없으면 이슈를 새로 열어 문제와 목표를 적습니다. 큰 변경은 구현 전에 이슈에서 방향을 맞춥니다.
- 오탈자 수정처럼 작고 자명한 변경은 이슈 없이 바로 PR을 보내도 됩니다.

## 로컬 셋팅

Node.js 22 이상과 pnpm, Firebase CLI가 필요합니다. 환경 변수와 Firebase 프로젝트 연결을 포함한 전체 절차는 [README의 온보딩](../README.md#1-온보딩)에 있습니다.

```bash
pnpm install
pnpm proxy   # app/.env를 읽어 Functions 호출 주소 생성
pnpm serve   # BE (Firebase 에뮬레이터)
pnpm dev     # FE (Vite)
```

`app/.env`와 `functions/.env`, `.firebaserc`는 저장소에 포함되지 않습니다. 각자 Firebase 프로젝트와 AI 제공자 키를 준비해 채웁니다. 키가 담긴 파일을 커밋에 포함하지 않도록 `git status`로 확인합니다.

## 저장소 구조

| 경로 | 내용 |
|------|------|
| `app` | React 18과 Vite 기반 프론트엔드. FSD 구조(`app`, `pages`, `widgets`, `features`, `entities`, `shared`) |
| `functions` | Firebase Cloud Functions. GitHub 연동, AI 카드 생성, 알림 스케줄, 결제 |
| `design-system` | 디자인 가이드 문서 |
| `scripts` | 환경 변수 생성 등 보조 스크립트 |

## 코드 규칙

- 파일과 폴더 이름은 `kebab-case`, React 컴포넌트 파일은 `PascalCase.tsx`를 씁니다.
- 변수와 함수는 `camelCase`, 상수는 `UPPER_SNAKE_CASE`, 클래스는 `PascalCase`를 씁니다.
- 범용 유틸을 새로 만들기 전에 `app/src/shared/lib`에 같은 동작이 있는지 먼저 확인합니다.
- 한 슬라이스가 다른 슬라이스를 참조할 때는 공개 API(`index.ts`)를 거칩니다.
- 주석은 한글로 작성하고, 함수와 타입에는 TSDoc 형식을 씁니다.

## 브랜치와 커밋

브랜치 이름은 `유형/issue-번호` 형태를 씁니다.

```
feat/issue-66
fix/issue-70
docs/issue-72
```

유형은 `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `build`, `ci`, `style`, `revert` 중 하나를 씁니다.

커밋 제목은 `유형(이슈 번호): 제목` 형태로 적고, 본문에는 무엇을 바꿨는지보다 왜 바꿨는지를 남깁니다. 변경 전 문제와 이 접근을 고른 이유를 적으면 리뷰가 빨라집니다.

```
feat(66): 커밋 조회 기간 기본값을 최근 7일로 변경

기간을 고르지 않으면 전체 커밋을 가져와 카드 생성이 수십 초씩 걸린다.
그래서 기본값을 최근 7일로 좁혔다.
```

## PR 보내기 전에

```bash
pnpm build                      # 전체 빌드 (tsc 타입 체크 포함)
pnpm --filter functions lint    # Functions ESLint
```

빌드가 통과하는지 확인하고, 화면이 바뀌는 변경이면 `pnpm dev`로 직접 확인한 뒤 스크린샷을 PR에 첨부합니다. 이 저장소에는 아직 자동화된 테스트 스위트가 없으므로 수동 확인 결과를 PR 본문에 적어 주세요.

PR 제목은 커밋 제목과 같은 `유형(이슈 번호): 제목` 형태로 적고, 본문은 [PR 템플릿](PULL_REQUEST_TEMPLATE.md)의 섹션을 채웁니다. 관련 이슈는 본문에 `(#번호)`로 참조합니다.

한 PR에는 한 가지 목적만 담습니다. 리팩터링과 기능 추가가 섞이면 나눠서 보내 주세요.

## 라이센스

이 프로젝트는 [Apache License 2.0](../LICENSE)을 따릅니다. PR을 보내면 그 기여를 같은 조건으로 제공하는 것으로 봅니다. 별도의 기여자 라이센스 동의(CLA) 절차는 없습니다.

라이센스 제6조에 따라 `CodeRecall` 이름과 로고 사용권은 부여되지 않습니다. 포크해서 별도 서비스를 운영할 때는 다른 이름과 로고를 씁니다. 자세한 내용은 [NOTICE](../NOTICE)를 참고하세요.
