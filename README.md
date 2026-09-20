# CodeRecall
**GitHub 커밋 기록을 AI가 분석해 플래시카드로 만들어 주고, 매일 알림으로 복습을 도와주는 웹 앱입니다.**

https://coderecall.app/

<div align="center">
  <div style="overflow:hidden; height:200px; max-width:600px; margin:0 auto; border-radius:8px;">
    <img src="app/public/og-image.png" alt="CodeRecall OG Image" style="width:100%; height:220%; object-fit:cover; object-position:center; display:block;" />
  </div>
</div>

## 서비스 상세 설명

### 기획 배경

- GitHub에 TIL(Today I Learned), 코드 리뷰, 학습 내용을 커밋해도 시간이 지나면 잘 기억나지 않는 문제가 있음
- 커밋·학습 기록을 **자동으로 정리하고 복습할 수 있는 도구**가 있으면 지식 유지에 도움이 됨
- 매일 알림으로 복습 습관을 유도하고, AI로 요약·질문 형태의 플래시카드를 만들어 학습 효율을 높이기 위해 기획됨

### 타겟 사용자

- **TIL·학습 기록을 GitHub에 커밋하는 개발자**
- **코드 리뷰·스터디 내용을 정리해 두고 주기적으로 복습하고 싶은 사람**
- **커밋 기록을 기반으로 한 간편한 복습·리콜 도구**를 찾는 사람

### 주요 기능

- **GitHub 연동**: OAuth 로그인 후 복습할 리포지토리 선택
- **커밋 기반 플래시카드**: 지정 기간의 커밋을 가져와 OpenAI로 질문/답 형식 플래시카드 자동 생성
- **플래시카드 복습**: 카드 넘기기로 복습, 마크다운·코드 diff 렌더링 지원
- **매일 알림**: 매일 오전 8시(KST) FCM 푸시로 "복습할 카드가 도착했어요" 리마인더
- **PWA**: 설치 가능한 웹 앱으로 모바일·데스크톱에서 사용

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| **프론트엔드** | React 18, TypeScript, Vite, Tailwind CSS, Zustand |
| **PWA** | vite-plugin-pwa (오프라인·설치 지원) |
| **백엔드·인프라** | Firebase (Authentication, Firestore, Cloud Functions, FCM) |
| **AI** | OpenAI gpt-5.6-luna (기본), 네이버 클라우드 HyperCLOVA X (HCX-007) (선택) |
| **연동** | GitHub API (커밋·파일 조회) |
| **기타** | Markdown 렌더링 (react-markdown, remark-gfm), 코드 하이라이트 (react-syntax-highlighter) |

<div align=left>
  <img src="https://img.shields.io/badge/react v18-61DAFB?style=for-the-badge&logo=React&logoColor=white">
  <img src="https://img.shields.io/badge/PWA-5A0FC8?style=for-the-badge&logo=PWA&logoColor=white">
  <img src="https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=Firebase&logoColor=black">
  <img src="https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=GitHub&logoColor=white">
  <img src="https://img.shields.io/badge/Markdown-000000?style=for-the-badge&logo=Markdown&logoColor=white">
</div>
<br>

## 🚀 시작하기

### 필수 요구사항
- Node.js 22+
- pnpm (패키지 매니저)
- Firebase CLI
```bash
npm install -g firebase-tools
```

### 1. 온보딩

#### 1.1. 환경 설정

##### app/.env
예시 파일을 복사한 뒤 값을 채운다.
```bash
cp app/.env.example app/.env
```
Firebase Web 설정 (Console > 프로젝트 설정 > 일반 > 웹 앱 구성에서 복사)
```bash
VITE_API_KEY=...
VITE_AUTH_DOMAIN=...
VITE_PROJECT_ID=...
VITE_STORAGE_BUCKET=...
VITE_MESSAGING_SENDER_ID=...
VITE_APP_ID=...
VITE_MEASUREMENT_ID=...
```
- **FCM 웹 푸시** (매일 알림 사용 시 필수): Console > 프로젝트 설정 > Cloud Messaging > Web configuration > Web Push certificates에서 키 쌍 생성 후 공개 키 입력
```bash
VITE_VAPID_KEY=...
```
- **AI Provider** (선택): 미설정 시 OpenAI 사용. Clova 사용 시:
```bash
VITE_AI_PROVIDER=clova
```
- **Microsoft Clarity** (선택): 히트맵과 세션 녹화
```bash
VITE_CLARITY_PROJECT_ID=...
```

`VITE_FIREBASE_*`와 `VITE_FUNCTIONS_URL_*`은 1.3에서 자동으로 채워지므로 직접 입력하지 않는다.

##### functions/.env
- **OpenAI 사용 시** (기본): `functions/.env` 파일에 `OPENAI_API_KEY` 추가
```bash
OPENAI_API_KEY=your_openai_api_key
```
- **Clova 사용 시**: `VITE_AI_PROVIDER=clova` 설정 후
```bash
CLOVA_API_KEY=your_clova_api_key
```

##### Firebase 프로젝트 연결
```bash
firebase login
firebase use --add
```
`firebase init`은 실행하지 않는다. `firebase.json`과 `firestore.rules`, `functions/`가 이미 저장소에 있어 덮어쓸 수 있다.

연결 정보가 담기는 `.firebaserc`는 `.gitignore` 대상이라 커밋되지 않는다. 저장소를 새로 클론하거나 워크트리를 만들 때마다 `firebase use --add`를 다시 실행한다. 현재 연결 상태는 `firebase use`로 확인한다.

#### 1.2. 프로젝트 셋팅
```bash
pnpm install
```
`Ignored build scripts` 경고는 pnpm 10의 기본 동작이며 빌드에 영향이 없다.

#### 1.3. Functions 환경변수 생성
```bash
pnpm proxy
```
`app/.env`의 `VITE_PROJECT_ID`를 읽어 `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_REGION`, `VITE_FUNCTIONS_URL_LOCAL`, `VITE_FUNCTIONS_URL_PROD`를 채운다.

이 값들은 빌드 시점에 번들로 인라인된다. 건너뛰면 Functions 호출 주소가 빈 문자열이 되어 AI 카드 생성과 질문 재생성, 번역이 모두 실패한다.

### 2. 개발 서버 시작
```bash
# BE
pnpm serve

# FE
pnpm dev
```

### 3. 빌드
```bash
pnpm build
```

### 4. 배포

배포 전 확인
- `firebase use`로 활성 프로젝트가 잡혀 있는지
- `app/.env`의 `VITE_FUNCTIONS_URL_PROD`가 채워져 있는지 (1.3)
- hosting은 predeploy가 없어 `app/dist`를 그대로 올리므로 `pnpm build`를 먼저 실행했는지

전체 배포
```bash
pnpm push
```

일부만 배포
```bash
firebase deploy --only functions,firestore:rules
firebase deploy --only hosting
```

AI 모델을 바꾼 뒤
- 랜딩 데모 카드는 `refreshTrendingRepos`가 매일 오전 9시(KST)에 미리 만들어 둔 것을 쓰므로, 배포 직후에는 이전 모델이 만든 카드가 그대로 보인다. 새 모델 결과를 바로 확인하거나 시연해야 하면 Cloud Scheduler에서 `refreshTrendingRepos`를 강제 실행해 캐시를 앞당긴다.

## 🌏 리전

이 프로젝트는 기본적으로 **Seoul (asia-northeast3)** 리전에 배포됩니다.

[전체 리전 목록 보러가기](https://firebase.google.com/docs/functions/locations)

## 기술 블로그
|version|date|link|
|---|---|---|
|v2.0|2025.10.20|[RecallBuddy 2.0 개발 후기](https://chucoding.tistory.com/163)|
|v1.2|2024.03.03|[HyperCLOVA X를 활용한 공부앱 만들기](https://chucoding.tistory.com/137)|
|v1.0|2023.11.19|[네이버클라우드 서비스를 활용한 알림(PUSH) 앱 배포하기](https://chucoding.tistory.com/130)|
|v1.0|2023.10.15|[안드로이드, IOS 지식 없이 SENS로 알림(PUSH) 서비스 개발하기](https://chucoding.tistory.com/129)|

## 기여하기

버그 제보와 기능 제안, PR 모두 환영한다. 로컬 셋팅과 브랜치 명명, PR 전 확인 사항은 [CONTRIBUTING.md](.github/CONTRIBUTING.md)에 있다.

PR을 보내면 그 기여는 Apache License 2.0 조건으로 제공하는 것으로 본다. 별도 기여자 라이센스 동의(CLA) 절차는 없다.

## 라이센스

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

이 저장소는 [Apache License 2.0](LICENSE)을 따른다. 출처와 라이센스 고지, 변경 사항 표시를 지키면 복제, 수정, 배포, 상업적 이용이 모두 가능하다.

다만 라이센스 제6조에 따라 CodeRecall 이름과 로고 사용권은 부여되지 않는다. 포크하거나 파생 서비스를 운영할 때는 다른 이름과 로고를 쓴다. 자세한 내용은 [NOTICE](NOTICE)에 있다.

라이센스 적용 대상은 소스 코드뿐이다. https://coderecall.app 운영 서비스와 그 데이터, 외부 제공자 계정은 포함되지 않는다.

<a href="https://www.linkedin.com/in/chucoding/" target="_blank">Prod By. 외계공룡</a><br/>
Copyright &copy; 2023-2026 chucoding
