/**
 * 운영 도구 — 퀴즈(Quiz) 관리 API 호출.
 *
 * 백엔드 EP 분리:
 * - 목록/생성: AdminAiOpsController (/api/v1/admin/ai/quiz/history, generate) — 기존
 * - 단건/수정/상태전이/삭제: AdminQuizController (/api/v1/admin/quizzes/{id} ...)
 *
 * 본 모듈은 신규 AdminQuizController 4개 EP + 기존 history(목록) 호출을 담당한다.
 */

import { backendApi } from '@/shared/api/axiosInstance';

/** 신규 관리자 퀴즈 EP 베이스 */
const QUIZ_BASE = '/api/v1/admin/quizzes';

/** 기존 AI 운영 EP — history 조회용 (재활용) */
const AI_OPS_BASE = '/api/v1/admin/ai';

/**
 * 퀴즈 목록 조회 (페이징 + 상태 필터).
 *
 * @param {Object} params
 * @param {string} [params.status]   PENDING/APPROVED/REJECTED/PUBLISHED (생략 시 전체)
 * @param {number} [params.page=0]   페이지 번호
 * @param {number} [params.size=20]  페이지 크기
 */
export function fetchQuizzes(params = {}) {
  return backendApi.get(`${AI_OPS_BASE}/quiz/history`, { params });
}

/**
 * 퀴즈 단건 조회 (관리자 검수용).
 * @param {number|string} id
 */
export function fetchQuiz(id) {
  return backendApi.get(`${QUIZ_BASE}/${id}`);
}

/**
 * 퀴즈 본문/메타 수정 (상태 제외).
 *
 * @param {number|string} id
 * @param {Object} payload - movieId/question/explanation/correctAnswer/options/rewardPoint/quizDate
 */
export function updateQuiz(id, payload) {
  return backendApi.put(`${QUIZ_BASE}/${id}`, payload);
}

/**
 * 퀴즈 상태 전이.
 *
 * @param {number|string} id
 * @param {string} targetStatus - PENDING/APPROVED/REJECTED/PUBLISHED
 */
export function updateQuizStatus(id, targetStatus) {
  return backendApi.patch(`${QUIZ_BASE}/${id}/status`, { targetStatus });
}

/**
 * 퀴즈 hard delete (PENDING/REJECTED 상태만 허용).
 * @param {number|string} id
 */
export function deleteQuiz(id) {
  return backendApi.delete(`${QUIZ_BASE}/${id}`);
}

/**
 * 신규 퀴즈 생성 (PENDING 상태로 INSERT).
 * 기존 AdminAiOpsController.generateQuiz EP 호출.
 *
 * @param {Object} payload - movieId/question/correctAnswer/options/explanation/rewardPoint
 */
export function createQuiz(payload) {
  return backendApi.post(`${AI_OPS_BASE}/quiz/generate`, payload);
}
