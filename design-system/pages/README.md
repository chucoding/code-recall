# Page-Specific Overrides

페이지별로 Master와 다른 규칙이 필요할 때 이 폴더에 `[page-name].md` 파일을 추가하세요.

- **규칙:** 해당 페이지를 만들 때 먼저 `design-system/pages/[page-name].md` 존재 여부를 확인합니다.
- **있으면:** 해당 파일의 규칙이 `design-system/MASTER.md`를 **덮어씁니다.**
- **없으면:** `design-system/MASTER.md`만 따릅니다.

예: 플래시카드 뷰어만 다른 카드 스타일을 쓰려면 `design-system/pages/flashcard-viewer.md`를 만들고, 그 페이지 빌드 시 그 파일을 참고합니다.
