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

## 작업 전

- 작업과 관련된 문서를 [wiki/index.md](wiki/index.md)에서 먼저 찾아 읽습니다. 원본 코드 전체를 다시 훑기 전에 위키부터 봅니다.
- 위키 내용과 코드가 다르면 코드가 현재 동작의 정본입니다. 어긋남을 작업 보고에 적고, 아래 `Ingest` 절차로 위키를 고칩니다.
- `status: draft`이거나 `verified`가 없는 문서는 사람이 확인하지 않은 내용입니다. 근거(`sources`)를 직접 열어 확인한 뒤 의존합니다.

## 위키 구조

`wiki/`는 [OKF v0.2](https://github.com/GoogleCloudPlatform/open-knowledge-format) 번들입니다. 카파시 LLM Wiki 패턴의 세 계층은 이 저장소에서 아래와 같이 대응합니다.

| 계층 | 위치 | 누가 쓰는가 |
|------|------|------|
| 원본 | 코드, `firestore.rules`, GitHub 이슈와 PR | 사람과 에이전트가 평소 작업으로 씀. 위키 작업 중에는 읽기만 함 |
| 위키 | `wiki/` | 에이전트가 쓰고 사람이 PR에서 리뷰 |
| 스키마 | 이 파일 | 사람이 정함 |

- `index.md`는 디렉터리 목록이고 `log.md`는 변경 이력입니다. 두 이름은 개념 문서에 쓰지 않습니다.
- 개념 문서는 주제별 하위 디렉터리에 두고, 같은 디렉터리 `index.md`에 한 줄 설명과 함께 링크합니다. 새 하위 디렉터리를 만들면 상위 `index.md`에 링크합니다.
- 파일 이름은 `kebab-case.md`입니다.

## 개념 문서 frontmatter

OKF는 `type`만 필수지만 이 저장소는 신뢰 신호를 처음부터 강제합니다. `pnpm wiki:lint`가 검사합니다.

```yaml
---
type: Workflow                    # 필수. Architecture, Workflow, Data Rule, Security Boundary, Decision 등
title: 오늘의 플래시카드 사전 생성     # 필수
description: 한 문장 요약             # 필수
tags: [flashcard, scheduler]      # 선택
status: draft                     # 필수. draft, stable, deprecated
sources:                          # 필수. 하나 이상
  - resource: ../../functions/src/flashcard-pregeneration.ts   # 문서 기준 상대 경로. 존재해야 함
  - id: pr-88
    title: "feat(86): ..."
    resource: https://github.com/chucoding/code-recall/pull/88
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-02T00:00:00Z }   # 필수. <도구>/<모델>
verified:                         # 선택. stable이면 human: 항목 필수
  - { by: human:chucoding, at: 2026-10-03T00:00:00Z }
stale_after: 2027-04-02           # 저장소 안 출처가 없는 문서만 필수. 이 날짜가 지나면 CI가 실패
---
```

- 문서가 낡았는지는 출처 종류에 따라 다르게 다룹니다.

| 출처 | 신선도 관리 |
|------|------|
| 저장소 안 파일이 하나라도 있음 | 아래 `Ingest` 규칙대로 코드를 고치는 PR에서 함께 고침. 자동 감지는 두지 않음 |
| 외부 URL만 있음 (외부 스펙, 서비스 제한, 결정 기록) | `stale_after` 필수. 커밋 없이도 바뀌므로 날짜로 재확인. 작성일로부터 6개월을 기본으로 잡음 |
- 사람이 PR 리뷰로 내용을 확인하면 `verified`에 `human:<GitHub 아이디>`를 추가하고 `status`를 `stable`로 올립니다. 에이전트는 사람 확인 없이 `stable`로 올리지 않습니다.
- 더 이상 맞지 않지만 링크와 이력 때문에 남길 문서는 `status: deprecated`로 바꾸고 대체 문서를 본문에 링크합니다.

## 무엇을 쓰고 무엇을 쓰지 않는가

- 씁니다: 코드만 봐서는 알기 어려운 이유, 앱과 서버처럼 여러 곳을 함께 바꿔야 하는 값, 보안과 비용 경계, 되돌리기 어려운 결정
- 쓰지 않습니다: 코드를 그대로 옮긴 설명, 함수 시그니처 목록, 커밋 이력으로 충분한 변경 내용
- 저장소가 public이므로 비밀 값, 비용과 매출 수치, 사용자 개인정보, 운영 계정 정보는 쓰지 않습니다. 배경은 [위키를 코드 저장소에 두는 결정](wiki/decisions/wiki-location.md)에 있습니다.

## 운영 동작

### Ingest

코드나 규칙을 바꾸는 PR에서, 바뀐 사실을 다루는 위키 문서가 있으면 같은 PR에서 함께 고칩니다.

1. `wiki/index.md`에서 영향받는 문서를 찾습니다.
2. 본문과 `sources`, `generated`를 갱신합니다. 내용이 바뀌면 기존 `verified`는 지우고 `status`를 `draft`로 내립니다. `stale_after`가 있는 문서는 날짜를 다시 잡습니다.
3. 새 주제면 개념 문서를 만들고 디렉터리 `index.md`에 링크합니다.
4. `wiki/log.md` 맨 위 날짜 아래에 `**Creation**`, `**Update**`, `**Deprecation**` 중 하나로 시작하는 한 줄을 추가합니다.
5. `pnpm wiki:lint`를 통과시킵니다.

### Query

설계 질문에는 위키를 먼저 찾아 답하고, 답에 쓴 문서를 링크합니다. 위키에 없어 코드를 조사해 얻은 답이 다시 쓸 만하면 `Ingest`로 문서를 추가합니다.

### Lint

- 정적 검사: `pnpm wiki:lint`. frontmatter 필수 키, `sources` 경로 존재, 깨진 링크, `index.md` 누락, `log.md` 형식, `stale_after` 만료를 봅니다. CI는 위키와 검사 스크립트를 고친 PR, main 푸시에서 실행하고, `stale_after` 만료를 잡으려고 매주 월요일에도 실행합니다.
- 의미 검사: 요청을 받으면 문서끼리의 모순, 코드와 어긋난 주장, 고아 개념, 빠진 상호 참조를 점검해 수정 PR을 올립니다.
- `stale_after`가 지난 문서는 `sources`를 다시 읽어 내용을 확인한 뒤 날짜를 갱신합니다. 확인 없이 날짜만 미루지 않습니다.
