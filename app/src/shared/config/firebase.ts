import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAnalytics, type Analytics } from 'firebase/analytics';
import { getAuth, GithubAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID,
  measurementId: import.meta.env.VITE_MEASUREMENT_ID,
};

// Firebase 앱 초기화 (이미 초기화된 경우 기존 앱 사용)
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Analytics 인스턴스 (measurementId가 있을 때만 초기화, SSR/미설정 환경 대비)
// 개발 서버에서는 모든 이벤트에 debug_mode를 붙여 DebugView로만 확인하고,
// GA4 개발자 트래픽 데이터 필터로 운영 보고서에서 제외되게 함.
// gtag는 debug_mode: false도 디버그로 취급하므로 운영에서는 키 자체를 넣지 않음
export const analytics: Analytics | null =
  typeof window !== 'undefined' && firebaseConfig.measurementId
    ? initializeAnalytics(app, import.meta.env.DEV ? { config: { debug_mode: true } } : {})
    : null;

// Auth 인스턴스 생성
export const auth = getAuth(app);

// Firestore 인스턴스 생성
export const store = getFirestore(app);

// GitHub 프로바이더 생성
export const githubProvider = new GithubAuthProvider();

// 스코프 설정 (필요한 GitHub 권한)
githubProvider.addScope('user:email'); // User key
githubProvider.addScope('repo'); // 리포지토리 접근 (public/private)
