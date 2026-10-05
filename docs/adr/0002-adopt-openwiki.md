# 0002. OpenWiki로 위키를 생성하고 결정 기록을 원본으로 분리

| 항목 | 값 |
|------|------|
| 상태 | 채택 |
| 결정일 | 2026-10-05 |
| 관련 이슈 | [#97](https://github.com/chucoding/code-recall/issues/97) |
| 대체하는 결정 | [0001](0001-wiki-location.md)의 위키 경로와 작성 방식 |

## 맥락

[0001](0001-wiki-location.md)에서 카파시 LLM Wiki 패턴과 OKF v0.2를 직접 적용해 `wiki/`를 만들었습니다. 그런데 두 규약 모두 자유도가 높아서, 문서 단위와 디렉터리 구성과 갱신 시점을 매번 새로 정해야 했습니다. 위키를 사람과 에이전트가 손으로 유지하는 비용도 컸습니다.

또 결정 기록이 위키 개념 문서(`type: Decision`)로 섞여 있었습니다. 위키는 코드에서 다시 생성할 수 있는 요약이지만, 결정의 이유는 코드에서 다시 만들 수 없는 원본입니다. 둘의 수명이 다릅니다.

## 결정

- [OpenWiki](https://github.com/langchain-ai/openwiki) 코드 모드로 위키를 생성하고 갱신합니다. 번들 경로는 OpenWiki 기본값인 `openwiki/`이고, 기존 `wiki/` 문서는 이력을 보존하려고 `git mv`로 옮긴 뒤 OpenWiki가 이어서 갱신하게 합니다.
- 위키의 범위와 우선순위는 사람이 쓰는 `openwiki/INSTRUCTIONS.md`로 정합니다. OpenWiki는 이 파일을 읽기만 하고 고치지 않습니다.
- 결정 기록은 `docs/adr/`에 번호를 붙인 원본 문서로 둡니다. OpenWiki는 이 디렉터리를 근거로 읽고 위키에서 링크합니다.
- 생성 공급자는 OpenAI API 키(`OPENWIKI_PROVIDER=openai`)를 씁니다.
- 위키 형식과 운영은 OpenWiki 규칙을 따릅니다. 0001에서 손으로 운영하려고 만든 장치는 실제로 쓴 적이 없어 제거합니다. 자체 검사 `pnpm wiki:lint`와 그 CI, frontmatter 필수 키와 `stale_after` 규칙, 사람 확인을 요구하던 `stable` 규칙, `chucoding:okf-wiki` 스킬이 해당합니다. 문서 구성과 OKF 검증은 OpenWiki가 맡습니다.
- `log.md` 변경 이력은 유지합니다. OpenWiki는 `log.md`를 OKF 예약 파일로 인식만 하고 쓰지 않으므로, 갱신 워크플로가 OpenWiki 실행 직후 `scripts/openwiki-log.mjs`로 바뀐 페이지를 결정적으로 기록합니다. 손으로 쓰는 이력은 갱신이 끊기기 쉬워서 자동 기록을 택했습니다.

## 검토한 선택지

| 선택지 | 장점 | 단점 |
|------|------|------|
| OpenWiki 도입 (채택) | 문서 구성과 frontmatter와 근거(`.claims/`)를 도구가 강제함. `--update`가 직전 생성 이후 커밋만 반영 | 생성에 LLM API 비용이 듦. Node 22.22 이상 필요 |
| 수작업 OKF 유지 | 도구 의존과 API 비용이 없음 | 자유도 문제가 그대로 남음 |
| 결정 기록도 위키 안에 유지 | 디렉터리가 하나 | 도구가 결정의 이유를 다시 써서 원본이 흐려질 수 있음 |

공급자는 ChatGPT 구독 로그인(`openai-chatgpt`)과 Anthropic API 키도 검토했습니다. Claude 구독에는 API 크레딧이 포함되지 않아 Anthropic은 별도 크레딧 구매가 필요했습니다. ChatGPT 구독 로그인은 토큰 유효 기간이 짧아 CI에서 쓸 수 없었습니다. 이미 가진 OpenAI API 키를 로컬과 CI에 같은 방식으로 쓸 수 있어 이것을 골랐습니다.

## 결과

- OpenWiki가 `generated`와 `verified`를 `openwiki/<버전>`으로 직접 기록합니다. 따라서 frontmatter의 `verified`는 사람의 확인이 아니라 근거 재확인 결과입니다. 사람의 확인은 위키 갱신 PR 리뷰로 대신합니다.
- `AGENTS.md`와 `CLAUDE.md`의 OpenWiki 관리 블록(`OPENWIKI:START`와 `OPENWIKI:END` HTML 주석 사이)은 OpenWiki가 관리합니다. 그 밖의 내용은 도구가 건드리지 않습니다.
- 위키 자동 갱신 워크플로는 저장소 시크릿 `OPENAI_API_KEY`가 있어야 동작합니다. 갱신 결과는 매주 PR로 올라오고, 사람이 리뷰한 뒤 머지합니다.
- 생성된 위키 페이지는 손으로 고치지 않습니다. 위키 내용을 바꾸려면 `openwiki/INSTRUCTIONS.md`나 코드를 고치고 다시 생성합니다.
- 저장소가 public이므로 비밀 값, 비용과 매출 수치, 사용자 개인정보, 운영 계정 정보는 위키와 ADR 모두에 쓰지 않는다는 [0001](0001-wiki-location.md)의 규칙은 그대로 유지합니다.
- 다시 검토할 시점은 OpenWiki가 OKF 규격이나 CLI를 크게 바꿀 때, 그리고 생성 비용이 위키 유지 이득보다 커질 때입니다.
