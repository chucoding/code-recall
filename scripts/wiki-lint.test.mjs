import assert from "node:assert/strict";
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {afterEach, beforeEach, describe, it} from "node:test";
import {lintWiki} from "./wiki-lint.mjs";

/** 테스트 기준 시각 */
const NOW = new Date("2026-10-02T00:00:00Z");

/** 검사를 통과하는 개념 문서 frontmatter */
const VALID_FRONTMATTER = `---
type: Architecture
title: 예시
description: 예시 문서
status: draft
sources:
  - resource: ../code.ts
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-02T00:00:00Z }
stale_after: 2027-01-01
---
`;

describe("lintWiki", () => {
  let root;
  let bundle;

  /**
   * 번들 안에 파일 작성
   *
   * @param {string} path - 번들 루트 기준 경로
   * @param {string} content - 파일 내용
   */
  const write = (path, content) => {
    const file = join(bundle, path);
    mkdirSync(dirname(file), {recursive: true});
    writeFileSync(file, content);
  };

  /**
   * 오류 메시지만 모음
   *
   * @return {string[]} `파일: 메시지` 목록
   */
  const errors = () => lintWiki(bundle, {now: NOW})
    .filter((issue) => issue.level === "error")
    .map((issue) => `${issue.file}: ${issue.message}`);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "wiki-lint-"));
    bundle = join(root, "wiki");
    writeFileSync(join(root, "code.ts"), "");
    write("index.md", "# 위키\n\n- [예시](concept.md)\n");
    write("log.md", "# 로그\n\n## 2026-10-02\n\n- 생성\n\n## 2026-09-30\n\n- 이전\n");
    write("concept.md", `${VALID_FRONTMATTER}\n# 본문\n`);
  });

  afterEach(() => rmSync(root, {recursive: true, force: true}));

  it("규칙을 지킨 번들은 오류가 없음", () => {
    assert.deepEqual(errors(), []);
  });

  it("frontmatter 필수 키 누락을 잡음", () => {
    write("concept.md", "---\ntype: Architecture\n---\n# 본문\n");
    const found = errors();
    for (const key of ["title", "description", "status", "sources", "generated", "stale_after"]) {
      assert.ok(found.some((message) => message.includes(`\`${key}\``)), key);
    }
  });

  it("frontmatter 없는 개념 문서를 잡음", () => {
    write("concept.md", "# 본문\n");
    assert.deepEqual(errors(), ["concept.md: YAML frontmatter가 없음"]);
  });

  it("만료된 stale_after를 오류로, 임박한 stale_after를 경고로 봄", () => {
    write("concept.md", VALID_FRONTMATTER.replace("2027-01-01", "2026-10-01"));
    assert.ok(errors().some((message) => message.includes("stale_after") && message.includes("지남")));

    write("concept.md", VALID_FRONTMATTER.replace("2027-01-01", "2026-10-10"));
    const warnings = lintWiki(bundle, {now: NOW}).filter((issue) => issue.level === "warning");
    assert.equal(warnings.length, 1);
  });

  it("deprecated 문서는 stale_after 만료를 보지 않음", () => {
    write("concept.md", VALID_FRONTMATTER.replace("2027-01-01", "2026-01-01").replace("draft", "deprecated"));
    assert.deepEqual(errors(), []);
  });

  it("사람 확인 없는 stable을 잡음", () => {
    write("concept.md", VALID_FRONTMATTER.replace("draft", "stable"));
    assert.ok(errors().some((message) => message.includes("human:")));

    write("concept.md", VALID_FRONTMATTER
      .replace("draft", "stable")
      .replace("stale_after", "verified:\n  - { by: human:chucoding, at: 2026-10-02T00:00:00Z }\nstale_after"));
    assert.deepEqual(errors(), []);
  });

  it("없는 source 경로를 잡음", () => {
    write("concept.md", VALID_FRONTMATTER.replace("../code.ts", "../missing.ts"));
    assert.ok(errors().some((message) => message.includes("missing.ts")));
  });

  it("깨진 상대 링크와 번들 절대 링크를 잡고 코드 블록 안 링크는 무시함", () => {
    write("concept.md", `${VALID_FRONTMATTER}\n[없음](nope.md) [절대](/nope.md)\n\n\`\`\`md\n[예시](ignored.md)\n\`\`\`\n`);
    assert.deepEqual(errors(), ["concept.md: 깨진 링크: nope.md", "concept.md: 깨진 링크: /nope.md"]);
  });

  it("index.md에서 찾을 수 없는 문서를 잡음", () => {
    write("orphan.md", `${VALID_FRONTMATTER}\n# 고아\n`);
    write("sub/child.md", `${VALID_FRONTMATTER.replace("../code.ts", "../../code.ts")}\n# 자식\n`);
    const found = errors();
    assert.ok(found.includes("orphan.md: index.md에 이 문서 링크가 없음"));
    assert.ok(found.includes("sub/child.md: sub/index.md가 없어 이 문서를 찾을 수 없음"));
  });

  it("log.md 날짜 형식과 순서를 검사함", () => {
    write("log.md", "# 로그\n\n## 2026-09-30\n\n## 2026-10-02\n\n## 어제\n");
    const found = errors();
    assert.ok(found.some((message) => message.includes("최신순")));
    assert.ok(found.some((message) => message.includes("어제")));
  });
});
