# 파일

- [AI 호출 비용·보안 경계](ai-call-guard.md) - 공개 HTTP AI 엔드포인트에서 인증 상태별 일일 사용량, 익명 전체 상한, 서버 전용 카운터와 입력 크기 경계로 모델 호출을 제한하는 방식을 설명한다. 질문 재생성 경로의 별도 카운터 정책과 공용 guard와의 차이도 다룬다.
- [Firestore 데이터 소유권과 접근 경계](firestore-data-boundary.md) - Firestore의 사용자 소유 문서, 공개 읽기 캐시, 서버 전용 상태를 나누는 보안 규칙과 쓰기 경계를 설명한다. 필드·삭제·동시 쓰기를 함께 고려해 안전하게 변경하는 방법을 다룬다.
- [시스템 개요와 런타임 경계](system-overview.md) - React/PWA 클라이언트, Firebase Auth·Firestore, Cloud Functions와 GitHub·OpenAI·FCM의 책임 및 HTTP·스케줄·태스크 흐름을 설명한다. 배포 경계, 사용자 데이터 접근, 백그라운드 작업의 실패·중복 방지 계약을 요약한다.
