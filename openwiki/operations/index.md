# 파일

- [로컬 실행과 Firebase 배포](local-development-and-deployment.md) - app과 Cloud Functions의 환경 변수 생성, 프록시, 빌드, 에뮬레이터 및 Firebase 배포 순서를 설명한다. 번들 시점 Functions URL과 Hosting 산출물의 배포 불변식을 중심으로 안전한 검증 절차를 정리한다.
- [시간대 기반 푸시 알림](push-notifications.md) - 브라우저 권한과 FCM 등록 토큰을 사용자 설정에 저장하고, 매시 실행되는 Cloud Scheduler가 사용자별 현지 시각에 따라 리마인더를 배치 전송하는 경로를 설명한다. 시간대·시각 폴백, 실패 관측의 한계 및 안전한 변경 지점을 다룬다.
