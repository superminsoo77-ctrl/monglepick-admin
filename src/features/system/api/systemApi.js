/**
 * 시스템 탭 API 호출 함수.
 * - Backend(Boot): 서비스 헬스 집계, 설정 조회
 * - Agent: DB 상태, Ollama 상태
 */

import { backendApi, agentApi } from '@/shared/api/axiosInstance';
import { SYSTEM_ENDPOINTS } from '@/shared/constants/api';

/** 4개 서비스 헬스체크 집계 (Backend) */
export function fetchServiceStatus() {
  return backendApi.get(SYSTEM_ENDPOINTS.SERVICES);
}

/** 5개 DB 상태 조회 (Agent) */
export function fetchDbStatus() {
  return agentApi.get(SYSTEM_ENDPOINTS.DB);
}

/** Ollama 모델 상태 조회 (Agent) */
export function fetchOllamaStatus() {
  return agentApi.get(SYSTEM_ENDPOINTS.OLLAMA);
}

/** vLLM 모델 상태(Chat/Vision) 조회 (Agent) */
export function fetchVllmStatus() {
  return agentApi.get(SYSTEM_ENDPOINTS.VLLM);
}

/** 현재 설정값 조회 (Backend) */
export function fetchSystemConfig() {
  return backendApi.get(SYSTEM_ENDPOINTS.CONFIG);
}
