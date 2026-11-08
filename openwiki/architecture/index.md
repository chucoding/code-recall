# 파일

- [공개 AI 함수 호출 경계](ai-call-guard.md) - 공개 AI HTTP 함수에서 인증 상태별 일일 사용량을 서버 트랜잭션으로 선차감하는 방식과 입력 제한, 오류 의미를 설명한다. 질문 재생성의 별도 사후 카운터 정책과 공용 guard를 구분한다.
- [Firestore 데이터 경계](firestore-data-boundary.md) - Firestore에서 사용자 소유 문서, 공개 읽기 캐시, 서버 전용 카운터와 완료 상태를 분리하는 권한·삭제·스키마 진화 불변식을 설명한다.
- [시스템 구성](system-overview.md) - 랜딩과 인증 앱의 다중 진입점, Firebase Hosting·Cloud Functions·Firestore의 배포 및 권한 경계, 그리고 외부 API와 정기 작업이 연결되는 런타임 구조를 설명한다.
