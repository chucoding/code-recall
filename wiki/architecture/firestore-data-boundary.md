---
type: Security Boundary
title: Firestore 데이터 경계
description: 클라이언트가 쓸 수 있는 users 필드와 Admin SDK만 쓰는 서버 전용 컬렉션을 나눈 이유
tags: [firestore, security, rules]
status: draft
sources:
  - resource: ../../firestore.rules
  - resource: ../../functions/src/ai-guard.ts
  - resource: ../../functions/src/regenerateQuestion.ts
  - id: pr-81
    title: "fix(77): users 문서 쓰기를 소유 필드로 한정하고 사용량 카운터 분리"
    resource: https://github.com/chucoding/code-recall/pull/81
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-02T00:00:00Z }
---

# 규칙 요약

- `users/{uid}`는 본인만 읽고, 쓰기는 `userWritableFields()` 목록 안의 필드만 허용합니다.
- 구독 등급(`subscriptionTier`, `subscriptionPeriodEnd`, `stripeCustomerId`)은 서버가 한도를 고를 때 쓰는 값이라 Stripe 웹훅만 씁니다.
- 갱신 검사는 이번 쓰기가 바꾸는 키(`affectedKeys`)만 봅니다. 문서 전체를 검사하면 과거 버전이 남긴 값 하나 때문에 그 사용자의 모든 쓰기가 막히기 때문입니다.
- `updatedAt`이 문자열과 timestamp를 모두 받는 이유는 PWA 서비스 워커 캐시로 과거 번들이 배포 뒤에도 남기 때문입니다.

# 서버 전용 컬렉션

규칙에 `match` 블록이 없으면 기본 거부라 Admin SDK만 읽고 씁니다.

| 컬렉션 | 용도 |
|------|------|
| `aiUsage` | AI 호출 일일 카운터. [공개 AI 함수 호출 경계](ai-call-guard.md) |
| `demoRegenerateCounts` | 비로그인 데모의 질문 재생성 카운터 |
| `flashcardPregeneration` | 사용자별 사전 생성 완료 기록 |

`regenerateCounts`는 남은 횟수 표시에 필요해 본인 읽기만 열고 쓰기는 열지 않습니다.

# 사용량을 users 문서에 두지 않는 이유

`users/{uid}`는 본인 삭제가 열려 있습니다. 카운터를 거기 두면 쓸 수 있는 필드를 좁혀도 문서를 지웠다가 다시 만드는 것만으로 한도가 초기화됩니다. 그래서 사용량은 사용자가 손댈 수 없는 컬렉션에 둡니다. 새 서버 전용 컬렉션을 만들 때도 `firestore.rules`에 `match` 블록을 추가하지 않습니다.
