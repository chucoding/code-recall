---
type: Decision
title: 위키를 코드 저장소에 두는 결정
description: LLM Wiki를 별도 저장소가 아닌 이 저장소 wiki/에 OKF v0.2 번들로 둔 이유와 감수한 점
tags: [wiki, decision, agents]
status: draft
sources:
  - id: issue-94
    title: LLM Wiki 구축
    resource: https://github.com/chucoding/code-recall/issues/94
  - id: karpathy-llm-wiki
    title: Karpathy, LLM Wiki
    resource: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
  - id: okf-spec
    title: Open Knowledge Format v0.2
    resource: https://github.com/GoogleCloudPlatform/open-knowledge-format
  - id: openwiki
    title: LangChain OpenWiki
    resource: https://github.com/langchain-ai/openwiki
  - id: docs-as-code-topologies
    title: Docs-as-code topologies
    resource: https://passo.uno/docs-as-code-topologies/
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-02T00:00:00Z }
stale_after: 2027-04-02T00:00:00Z
---

# 결정

LLM Wiki를 이 저장소의 `wiki/` 디렉터리에 OKF v0.2 번들로 둡니다. 에이전트 규칙(카파시 패턴의 schema 계층)은 루트 `AGENTS.md`가 정본이고, `CLAUDE.md`는 그 파일을 불러오기만 합니다. `AGENTS.md`에는 항상 지킬 원칙과 이 저장소 전용 값만 두고, 위키를 쓸 때만 필요한 OKF 작성 절차는 다른 프로젝트에서도 쓸 수 있게 개인 스킬 `chucoding:okf-wiki`로 분리합니다. `AGENTS.md`는 위키와 관계없는 작업에서도 매번 읽히기 때문입니다.

# 검토한 선택지

| 선택지 | 장점 | 단점 |
|------|------|------|
| 이 저장소 `wiki/` (채택) | 코드와 문서를 한 PR에서 고쳐 어긋남을 근원에서 막음. 에이전트가 파일을 직접 읽어 MCP가 필요 없음 | public 저장소라 위키 내용이 공개됨 |
| 별도 private 저장소 | 비공개 기획과 운영 지식을 넣을 수 있음 | 코드 변경과 문서 갱신이 다른 PR로 갈라짐. 에이전트 연결에 경로 지정이나 MCP가 필요 |
| 혼합 | 공개와 비공개를 나눌 수 있음 | 처음부터 관리할 정본이 둘 |

# 근거

- 카파시 원문은 위키를 "마크다운 파일로 된 git 저장소"로 설명하고 개인 지식 베이스를 전제합니다. 위치를 강제하지 않습니다.
- OKF v0.2는 번들의 위치를 정하지 않고, 상대 경로와 번들 루트 기준 경로를 모두 링크로 인정합니다. 코드 파일을 `sources`로 가리킬 수 있습니다.
- OpenWiki는 코드 저장소 안 `openwiki/`에 문서와 근거 메타데이터를 두는 것이 기본입니다. 나중에 3단계로 붙여도 같은 저장소에서 동작합니다.
- 같은 저장소에 문서를 두는 sidecar 방식은 문서가 코드와 함께 버전 관리되어, 변경이 잦은 초기 제품에 맞습니다.
- 이 프로젝트는 혼자 운영해 기획자가 따로 관리하는 정책 문서가 없습니다. 별도 저장소로 나눌 이유였던 "기획자 소유 지식"이 아직 없습니다.

# 감수한 점과 지킬 규칙

- 저장소가 public이므로 비밀 값, 비용과 매출 수치, 사용자 개인정보, 운영 계정 정보는 위키에 쓰지 않습니다. 이런 지식이 필요해지면 그때 별도 private 저장소를 만들고 이 결정을 갱신합니다.
- 학습 기록(TIL)은 이 위키가 아니라 `today-i-learned` 저장소에 둡니다. 이 위키는 CodeRecall 제품 지식만 다룹니다.

# 다시 검토할 시점

- 비공개로 다뤄야 할 정책이나 운영 지식이 생길 때
- 저장소가 여러 개로 나뉠 때. 그때는 위키 MCP 서버와 코드 그래프 도입을 함께 검토합니다
- 문서가 수백 개를 넘어 `index.md`만으로 찾기 어려울 때. 그때는 qmd 검색을 붙입니다
