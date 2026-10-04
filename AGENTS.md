# CodeRecall 에이전트 규칙

이 파일은 이 저장소에서 일하는 코딩 에이전트의 정본 규칙입니다. 에이전트별 설정 파일(`CLAUDE.md` 등)은 이 파일을 불러오기만 하고 내용을 따로 두지 않습니다.

## 저장소

| 경로 | 내용 |
|------|------|
| `app` | React 18과 Vite 기반 프론트엔드. FSD 구조 |
| `functions` | Firebase Cloud Functions |
| `firestore.rules` | Firestore 접근 경계 |
| `wiki` | LLM Wiki. 코드만 읽어서는 알기 어려운 설계 의도와 제약 |
| `design-system` | 디자인 가이드 |

로컬 셋팅과 코드 규칙, 브랜치와 커밋 규칙은 [CONTRIBUTING.md](.github/CONTRIBUTING.md)를 따릅니다.

## 위키

`wiki/`는 [OKF v0.2](https://github.com/GoogleCloudPlatform/open-knowledge-format) 형식의 LLM Wiki입니다.

### 항상 지키는 원칙

- 작업과 관련된 문서를 [wiki/index.md](wiki/index.md)에서 먼저 찾아 읽습니다. 원본 코드 전체를 다시 훑기 전에 위키부터 봅니다.
- 위키 내용과 코드가 다르면 코드가 현재 동작의 정본입니다. 어긋남을 작업 보고에 적고 위키를 고칩니다.
- `status: draft`이거나 `verified`가 없는 문서는 사람이 확인하지 않은 내용입니다. 근거(`sources`)를 직접 열어 확인한 뒤 의존합니다.
- 코드나 규칙을 바꾸는 PR에서, 바뀐 사실을 다루는 위키 문서가 있으면 같은 PR에서 함께 고칩니다. 코드 변경을 자동으로 감지하지는 않습니다.

### 위키를 쓰거나 고칠 때

frontmatter 형식, 신뢰 규칙, Ingest와 Query와 Lint 절차는 `chucoding:okf-wiki` 스킬을 따릅니다. 이 저장소에서는 아래 값을 씁니다.

| 항목 | 값 |
|------|------|
| 문서 유형(`type`) | `Architecture`, `Workflow`, `Data Rule`, `Security Boundary`, `Decision` |
| `stale_after` 기본 기간 | 코드 파생 문서는 작성일로부터 3개월, 결정 기록은 6개월 |
| 정적 검사 | `pnpm wiki:lint`. CI는 위키와 검사 스크립트를 고친 PR과 main 푸시에서 실행 |
| 쓰지 않는 내용 | 저장소가 public이므로 비밀 값, 비용과 매출 수치, 사용자 개인정보, 운영 계정 정보. 배경은 [위키를 코드 저장소에 두는 결정](wiki/decisions/wiki-location.md) |
