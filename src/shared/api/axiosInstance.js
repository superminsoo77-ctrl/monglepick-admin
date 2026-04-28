/**
 * 관리자용 서비스별 axios 인스턴스.
 * monglepick-client의 axiosInstance.js 패턴과 동일.
 *
 * - backendApi : Spring Boot Backend (관리자 API + 인증)
 * - agentApi   : FastAPI AI Agent (데이터/파이프라인/DB상태)
 *
 * 보안 개선사항 동일 적용:
 * - JWT 3-파트 형식 검증
 * - 토큰 만료 예측 갱신 (5초 skew)
 * - 뮤텍스 패턴 refresh race condition 방지
 */

import axios from 'axios';
import { getToken, setToken, removeToken, clearAll } from '../utils/storage';
import { AUTH_ENDPOINTS } from '../constants/api';
import { SERVICE_URLS } from './serviceUrls';
import useAuthStore from '../stores/useAuthStore';

/* ── 공통 유틸리티 ── */

/** HTTP 상태코드별 한국어 에러 메시지 */
function getFallbackMessage(status) {
  switch (status) {
    case 400: return '입력 정보를 확인해주세요.';
    case 401: return '인증이 필요합니다. 다시 로그인해주세요.';
    case 403: return '관리자 권한이 필요합니다.';
    case 404: return '요청하신 정보를 찾을 수 없습니다.';
    case 409: return '이미 처리된 요청입니다.';
    case 429: return '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
    case 500: return '서버에 문제가 발생했습니다.';
    default: return '일시적인 오류가 발생했습니다.';
  }
}

/** JWT 3-파트 형식 검증 */
function isValidJwtFormat(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

/** JWT 만료 검사 (5초 여유) */
function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now() + 5000;
  } catch {
    return true;
  }
}

/* ── 뮤텍스 패턴: refresh race condition 방지 ── */
let isRefreshing = false;
let failedQueue = [];

function processQueue(error, token = null) {
  failedQueue.forEach((prom) => {
    error ? prom.reject(error) : prom.resolve(token);
  });
  failedQueue = [];
}

function enqueueRefreshWaiter() {
  return new Promise((resolve, reject) => {
    failedQueue.push({ resolve, reject });
  });
}

/** Refresh Token(HttpOnly 쿠키)으로 새 Access Token 발급 */
async function refreshAccessToken() {
  const response = await axios.post(
    `${SERVICE_URLS.BACKEND}${AUTH_ENDPOINTS.REFRESH}`,
    null,
    { headers: { 'Content-Type': 'application/json' }, withCredentials: true },
  );
  const { accessToken } = response.data;
  if (accessToken) setToken(accessToken);
  return accessToken;
}

/* ── 공통 인터셉터 팩토리 ── */

/** Bearer 토큰 주입 (형식 검증만, refresh 없음) — Agent용 */
function attachSimpleTokenInjector(instance) {
  instance.interceptors.request.use((config) => {
    const token = getToken();
    if (token && isValidJwtFormat(token)) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });
}

/** 에러 응답 한국어 변환 */
function attachErrorResponseInterceptor(instance) {
  instance.interceptors.response.use(
    (response) => response.data,
    (error) => {
      const data = error.response?.data;
      const status = error.response?.status;
      const raw = data?.message || data?.detail || getFallbackMessage(status);
      // FastAPI detail 필드는 배열/객체일 수 있으므로 반드시 문자열로 변환
      const message = typeof raw === 'string' ? raw : (JSON.stringify(raw) ?? getFallbackMessage(status));
      const apiError = new Error(message);
      apiError.code = data?.code || null;
      apiError.status = status || null;
      return Promise.reject(apiError);
    },
  );
}

/* ── axios 인스턴스 생성 ── */

/** Backend API (Spring Boot :8080) — JWT 자동 갱신 포함 */
const backendApi = axios.create({
  baseURL: SERVICE_URLS.BACKEND,
  timeout: 30000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

/** Agent API (FastAPI :8000) — Bearer 토큰 주입만 */
const agentApi = axios.create({
  baseURL: SERVICE_URLS.AGENT,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

/* ── Backend: JWT request interceptor (형식검증 + 만료검사 + refresh) ── */
backendApi.interceptors.request.use(async (config) => {
  const token = getToken();
  if (!token) return config;

  if (!isValidJwtFormat(token)) {
    removeToken();
    return config;
  }

  if (isTokenExpired(token)) {
    if (isRefreshing) {
      try {
        const newToken = await enqueueRefreshWaiter();
        config.headers.Authorization = `Bearer ${newToken}`;
      } catch { /* refresh 실패 — 헤더 없이 요청 */ }
      return config;
    }

    isRefreshing = true;
    try {
      const newToken = await refreshAccessToken();
      processQueue(null, newToken);
      config.headers.Authorization = `Bearer ${newToken}`;
    } catch (err) {
      processQueue(err, null);
      clearAll();
      useAuthStore.setState({ token: null, user: null });
    } finally {
      isRefreshing = false;
    }
    return config;
  }

  config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/* ── Backend: 401 응답 시 뮤텍스 refresh + 재시도 ── */
backendApi.interceptors.response.use(
  /*
   * ApiResponse<T> 자동 언래핑.
   * 백엔드 응답이 { success, data, error } 래퍼이면 data 필드만 꺼내고,
   * LoginFilter 등 래퍼 없이 직접 JSON을 반환하는 엔드포인트는 그대로 통과.
   */
  (response) => response.data?.data ?? response.data,
  async (error) => {
    const originalRequest = error.config;
    const isRefreshReq = originalRequest.url?.includes(AUTH_ENDPOINTS.REFRESH);
    const isAuthReq = originalRequest.url?.includes('/auth/');

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isRefreshReq &&
      !isAuthReq
    ) {
      originalRequest._retry = true;

      if (isRefreshing) {
        try {
          const newToken = await enqueueRefreshWaiter();
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return backendApi(originalRequest);
        } catch (queueError) {
          return Promise.reject(queueError);
        }
      }

      isRefreshing = true;
      try {
        const newToken = await refreshAccessToken();
        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return backendApi(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearAll();
        useAuthStore.setState({ token: null, user: null });
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    const data = error.response?.data;
    const status = error.response?.status;
    const message = data?.message || data?.detail || getFallbackMessage(status);
    const apiError = new Error(message);
    apiError.code = data?.code || null;
    apiError.status = status || null;
    return Promise.reject(apiError);
  },
);

/* ── Agent: 토큰 주입 + 에러 처리 ── */
attachSimpleTokenInjector(agentApi);
attachErrorResponseInterceptor(agentApi);

/* ── exports ── */
export { backendApi, agentApi };
export default backendApi;
