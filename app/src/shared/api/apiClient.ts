import axios from 'axios';
import { auth } from '@/shared/config/firebase';

// Firebase Functions URL 설정
const FUNCTIONS_URL = import.meta.env.PROD
  ? import.meta.env.VITE_FUNCTIONS_URL_PROD
  : '/api'; // Vite 프록시 사용

// 기본 axios 인스턴스 생성 (GitHub API proxy 전용)
export const apiClient = axios.create({
  baseURL: FUNCTIONS_URL,
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 요청 인터셉터 - Firebase ID Token을 헤더에 추가
apiClient.interceptors.request.use(
  async (config) => {
    // Firebase Auth ID Token 가져오기
    const user = auth.currentUser;

    if (user) {
      try {
        const idToken = await user.getIdToken();
        config.headers['Authorization'] = `Bearer ${idToken}`;
      } catch (error) {
        console.error('Firebase ID Token 가져오기 실패:', error);
      }
    }

    return config;
  },
  (error) => {
    console.error('API 요청 오류:', error);
    return Promise.reject(error);
  }
);

// 응답 인터셉터
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API 응답 오류:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export default apiClient;
