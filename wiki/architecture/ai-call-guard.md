---
type: Security Boundary
title: 공개 AI 함수 호출 경계
description: 랜딩 데모 때문에 공개로 열린 AI 함수의 호출자별 한도와 비로그인 전체 상한
tags: [ai, security, cost]
status: draft
sources:
  - resource: ../../functions/src/ai-guard.ts
  - resource: ../../functions/src/openai.ts
  - resource: ../../functions/src/translateFlashcards.ts
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-02T00:00:00Z }
stale_after: 2027-01-02
---

# 왜 필요한가

랜딩 데모는 비로그인 방문자가 써야 해서 `openaiChatCompletions`와 `translateFlashcards`는 `invoker: "public"`을 유지합니다. 함수 URL은 빌드 산출물에 문자열로 들어가고 형식만 알면 조합도 되므로, 주소를 감추는 방식으로는 보호되지 않습니다. 그래서 모델을 호출하기 전에 `consumeAiQuota`가 서버 소유 카운터로 막습니다.

# 두 겹의 경계

| 경계 | 키 | 상한 |
|------|------|------|
| 호출자별 일일 한도 | 로그인은 uid, 비로그인은 IP 해시 | 비로그인 30, Free 100, Pro 300 |
| 비로그인 전체 일일 상한 | 단일 카운터 | 500 |

- 비로그인 키로 쓰는 IP는 `X-Forwarded-For`에서 읽어 위조할 수 있습니다. 위조하면 호출자별 한도는 우회되지만 전체 상한은 키와 무관해 우회되지 않습니다. 하루 모델 비용의 천장이 전체 상한입니다.
- 로그인 호출에는 전체 상한을 걸지 않습니다. 걸면 비로그인 호출을 쏟아부어 로그인 사용자의 카드 생성까지 멈출 수 있습니다.
- 원본 IP는 저장하지 않고 해시만 문서 ID로 씁니다.
- 날짜 경계는 KST 기준입니다.

# 입력 길이 상한

| 상수 | 값 | 적용 |
|------|------|------|
| `MAX_FLASHCARD_PROMPT_CHARS` | 30,000자 | 카드 생성 프롬프트 본문. 넘으면 거부하지 않고 자름 |
| `MAX_TRANSLATE_CARDS` | 200장 | 번역 요청 한 건 |
| `MAX_TRANSLATE_PROMPT_CHARS` | 120,000자 | 번역 프롬프트 본문 |

# 남은 것

위조 요청을 말단에서 거부하려면 App Check가 필요합니다. Firebase 콘솔의 reCAPTCHA 등록과 enforcement 설정이 함께 있어야 해서 이 경계와 별도 작업입니다.
