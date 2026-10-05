import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {addLogEntries, readTitle} from "./openwiki-log.mjs";

/** 기존 이력이 있는 log.md */
const LOG = "# 위키 변경 이력\n\n설명\n\n## 2026-10-05\n\n- **Update** 기존 항목\n";

describe("addLogEntries", () => {
  it("새 날짜는 첫 날짜 제목 앞에 만듦", () => {
    const result = addLogEntries(LOG, "2026-10-12", [{action: "created", path: "a/b.md", title: "새 문서"}]);
    assert.equal(result, "# 위키 변경 이력\n\n설명\n\n## 2026-10-12\n\n- **Creation** [새 문서](a/b.md)\n\n## 2026-10-05\n\n- **Update** 기존 항목\n");
  });

  it("같은 날짜가 있으면 그 아래 맨 위에 덧붙임", () => {
    const result = addLogEntries(LOG, "2026-10-05", [{action: "updated", path: "c.md", title: "수정 문서"}]);
    assert.equal(result, "# 위키 변경 이력\n\n설명\n\n## 2026-10-05\n\n- **Update** [수정 문서](c.md)\n- **Update** 기존 항목\n");
  });

  it("삭제된 문서는 링크 대신 경로를 적음", () => {
    const result = addLogEntries("# 위키 변경 이력\n", "2026-10-12", [{action: "deleted", path: "old.md", title: "옛 문서"}]);
    assert.equal(result, "# 위키 변경 이력\n\n## 2026-10-12\n\n- **Deletion** 옛 문서 (`old.md`)\n");
  });

  it("CRLF 파일에서도 같은 날짜를 찾고 줄바꿈을 유지함", () => {
    const result = addLogEntries(LOG.replace(/\n/g, "\r\n"), "2026-10-05", [{action: "updated", path: "c.md", title: "수정 문서"}]);
    assert.equal(result, "# 위키 변경 이력\r\n\r\n설명\r\n\r\n## 2026-10-05\r\n\r\n- **Update** [수정 문서](c.md)\r\n- **Update** 기존 항목\r\n");
  });

  it("변경이 없으면 그대로 둠", () => {
    assert.equal(addLogEntries(LOG, "2026-10-12", []), LOG);
  });
});

describe("readTitle", () => {
  it("frontmatter title을 따옴표 없이 읽음", () => {
    assert.equal(readTitle("---\ntype: x\ntitle: \"제목\"\n---\n본문"), "제목");
    assert.equal(readTitle("본문만 있음"), null);
  });
});
