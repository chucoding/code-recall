---
type: Data Rule
title: 덱 문서 크기 예산
description: 언어별 덱 두 개를 Firestore 문서 상한 1MB 안에 함께 넣기 위한 크기 규칙
tags: [flashcard, firestore, limits]
status: draft
sources:
  - resource: ../../functions/src/flashcard-deck-size.ts
  - resource: ../../app/src/features/flashcard/lib/deck-size.ts
  - id: pr-83
    title: "fix(82): 카드 덱을 문서 크기 예산 안으로 줄여 저장"
    resource: https://github.com/chucoding/code-recall/pull/83
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-02T00:00:00Z }
stale_after: 2027-01-02
---

# 규칙

`users/{uid}/flashcards/{YYYY-MM-DD}` 문서 하나에 `data_ko`와 `data_en` 두 덱이 함께 들어갑니다. 카드마다 원문 diff를 담으면 큰 커밋 하나로 문서가 Firestore 상한 1MB를 넘어 저장이 실패합니다.

| 상수 | 값 | 이유 |
|------|------|------|
| `MAX_FLASHCARD_DOC_BYTES` | 900,000 | 1MB 대비 필드 이름과 인덱스 여유 |
| 덱 하나의 예산 | 450,000 | 두 언어 덱이 한 문서에 들어가므로 절반 |
| `MAX_RAW_DIFF_CHARS` | 30,000 | 생성 프롬프트 본문 상한과 같음 |
| `MIN_RAW_DIFF_CHARS` | 1,000 | 이보다 짧게 줄여야 하면 diff를 저장하지 않음 |
| `MAX_FILES_PER_CARD` | 20 | 파일 보기 탭 목록에만 쓰임 |

# 줄이는 순서

1. `files[].patch`는 `rawDiff`와 겹쳐 항상 뺍니다.
2. diff 길이를 30,000자에서 시작해 절반씩 줄이며 예산에 들어오는 첫 길이를 씁니다.
3. 1,000자까지 줄여도 넘치면 diff 없이 저장합니다.

diff를 자를 때 코드 블록 중간이면 블록을 닫고 `…(truncated)`를 붙여 마크다운이 깨지지 않게 합니다.

# 주의

같은 규칙이 앱(`app/src/features/flashcard/lib/deck-size.ts`)과 서버(`functions/src/flashcard-deck-size.ts`)에 따로 있습니다. 두 경로가 같은 문서에 언어별 덱을 나눠 쓰므로 한쪽 상한을 바꾸면 다른 쪽도 같은 PR에서 바꿉니다.
