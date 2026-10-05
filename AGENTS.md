# CodeRecall 에이전트 규칙

이 파일은 이 저장소에서 일하는 코딩 에이전트의 정본 규칙입니다. 에이전트별 설정 파일(`CLAUDE.md` 등)은 이 파일을 불러오기만 하고 내용을 따로 두지 않습니다.

## 저장소

| 경로 | 내용 |
|------|------|
| `app` | React 18과 Vite 기반 프론트엔드. FSD 구조 |
| `functions` | Firebase Cloud Functions |
| `firestore.rules` | Firestore 접근 경계 |
| `openwiki` | OpenWiki로 생성하는 LLM Wiki. 코드만 읽어서는 알기 어려운 설계 의도와 제약 |
| `docs/adr` | 사람이 쓰는 결정 기록(ADR) 원본 |
| `design-system` | 디자인 가이드 |

로컬 셋팅과 코드 규칙, 브랜치와 커밋 규칙은 [CONTRIBUTING.md](.github/CONTRIBUTING.md)를 따릅니다.

## 위키

`openwiki/`는 [OpenWiki](https://github.com/langchain-ai/openwiki) 코드 모드가 생성하고 갱신하는 LLM Wiki입니다. 위키를 읽고 다루는 방식은 아래 OpenWiki 관리 블록을 따릅니다. 배경은 [ADR 0002](docs/adr/0002-adopt-openwiki.md)에 있습니다.

- 위키의 범위와 우선순위는 사람이 쓰는 [openwiki/INSTRUCTIONS.md](openwiki/INSTRUCTIONS.md)가 정합니다. 위키 내용을 바꾸고 싶으면 페이지가 아니라 이 파일을 고치고 다시 생성합니다.
- 위키를 바로 갱신해야 하면 `openwiki code --update --language ko`를 실행합니다. Node 22.22 이상이 필요하고, `~/.openwiki/.env`에 `OPENWIKI_PROVIDER=openai`와 `OPENAI_API_KEY`가 있어야 합니다. `--init`은 `INSTRUCTIONS.md`를 뺀 `openwiki/`를 비우고 새로 만들므로 평소에는 쓰지 않습니다.
- 로컬에서 OpenWiki를 실행했으면 커밋 전에 `pnpm wiki:log`로 바뀐 페이지를 `openwiki/log.md`에 기록합니다. OpenWiki는 `log.md`를 쓰지 않고, 정기 워크플로는 이 단계를 자동으로 실행합니다.
- 저장소가 public이므로 비밀 값, 비용과 매출 수치, 사용자 개인정보, 운영 계정 정보는 위키와 ADR에 쓰지 않습니다.

## 결정 기록

설계 결정의 이유는 위키가 아니라 사람이 쓰는 원본 문서로 [docs/adr](docs/adr/README.md)에 둡니다. 결정을 내리거나 바꾸면 새 ADR을 쓰고, 채택한 ADR 본문은 고치지 않습니다. OpenWiki는 ADR을 근거로 읽기만 합니다.

<!-- OPENWIKI:START -->

## OpenWiki

This repository has a generated `openwiki/` evidence index. It is optional just-in-time context, not required startup reading.

- Do not enumerate, preload, or search wikis at task start. Use retrieval when the user asks for it, when unfamiliar architecture or dependency behavior materially affects the task, or when source inspection leaves an important uncertainty. Stop once the question is grounded.
- When those conditions apply and OpenWiki retrieval tools are available, use `openwiki_search` for just-in-time context and `openwiki_read` for the relevant complete sections. If search returns `workspace_required`, ask which listed workspace to use and retry with its ID.
- Use `openwiki_list_workspaces` or `openwiki_list_wikis` when workspace membership itself needs to be discovered.
- If the retrieval tools are unavailable, read `openwiki/quickstart.md` and follow its links to the relevant pages.
- Treat source code and tests as authoritative. A brief's unknowns and review items are verification gaps, not automatic requirements.
- Prefer the narrowest quiet validation that proves the changed behavior. Preserve complete failure output.

The scheduled OpenWiki GitHub Actions workflow refreshes the repository wiki. Do not hand-edit generated OpenWiki pages unless explicitly asked; prefer updating source code/docs and letting OpenWiki regenerate.

<!-- OPENWIKI:END -->
