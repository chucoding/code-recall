# 위키 변경 이력

`OpenWiki Update` 워크플로가 OpenWiki 실행 직후 `scripts/openwiki-log.mjs`로 바뀐 개념 문서를 맨 위 날짜 아래에 기록합니다. 날짜 제목은 `## YYYY-MM-DD`(KST)이고, 항목은 `**Creation**`, `**Update**`, `**Deletion**` 중 하나로 시작합니다.

## 2026-10-05

- **Creation** OpenWiki 첫 생성으로 개념 문서 4건 추가 (#97)
  - [CodeRecall 변경 길잡이](quickstart.md), [GitHub 인증과 커밋 조회 경계](integrations/github-access.md), [로컬 실행과 Firebase 배포](operations/local-development-and-deployment.md), [시간대 기반 푸시 알림](operations/push-notifications.md)
- **Update** OpenWiki가 기존 개념 문서 6건을 코드 근거(`.claims/`)와 함께 다시 작성 (#97)
  - [공개 AI 함수 호출 경계](architecture/ai-call-guard.md), [Firestore 데이터 경계](architecture/firestore-data-boundary.md), [시스템 구성](architecture/system-overview.md)
  - [덱 문서 크기 예산](flashcard/deck-size-budget.md), [카드 생성 경로](flashcard/generation-paths.md), [오늘의 플래시카드 사전 생성](flashcard/pregeneration.md)
- **Update** 위키 번들을 `wiki/`에서 OpenWiki 기본 경로 `openwiki/`로 이전하고, 결정 기록을 원본 문서 [docs/adr](../docs/adr/README.md)로 분리 (#97)
- **Update** [위키를 코드 저장소에 두는 결정](../docs/adr/0001-wiki-location.md)에 위키 작성 절차를 개인 스킬로 분리한 내용 추가 (#94)
- **Update** 개념 문서 7건의 `stale_after`를 UTC 오프셋을 붙인 시각으로 변경. OKF v0.2 스펙의 시각 표기 규칙을 따름 (#94)

## 2026-10-02

- **Creation** 위키 번들 골격과 초기 개념 문서 7건 작성 (#94)
  - [시스템 구성](architecture/system-overview.md), [Firestore 데이터 경계](architecture/firestore-data-boundary.md), [공개 AI 함수 호출 경계](architecture/ai-call-guard.md)
  - [카드 생성 경로](flashcard/generation-paths.md), [오늘의 플래시카드 사전 생성](flashcard/pregeneration.md), [덱 문서 크기 예산](flashcard/deck-size-budget.md)
  - [위키를 코드 저장소에 두는 결정](../docs/adr/0001-wiki-location.md)
