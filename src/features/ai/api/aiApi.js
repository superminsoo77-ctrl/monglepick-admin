/**
 * AI 운영 탭 API 호출 함수.
 * AI_ADMIN_ENDPOINTS 상수 사용.
 *
 * - 퀴즈/리뷰 생성 트리거: agentApi (FastAPI Agent :8000)
 * - 퀴즈/리뷰 이력, 챗봇 세션: backendApi (Spring Boot :8080)
 *
 * @service Agent   - 퀴즈 생성 트리거, 리뷰 생성 트리거
 * @service Backend - 이력 조회, 챗봇 세션/메시지/통계
 */

import { backendApi, agentApi } from '@/shared/api/axiosInstance';
import { AI_ADMIN_ENDPOINTS } from '@/shared/constants/api';

/* ── 퀴즈 ── */

/**
 * AI 퀴즈 생성 트리거 (Agent).
 * @param {Object} data - { genre, difficulty, count }
 * @returns {Promise<Object>} 생성 결과
 */
export function generateQuiz(data) {
  return agentApi.post(AI_ADMIN_ENDPOINTS.QUIZ_GENERATE, data);
}

/**
 * AI 퀴즈 생성 이력 조회 (Backend, 페이징).
 * @param {Object} params - { page, size }
 * @returns {Promise<Object>} 이력 목록
 */
export function fetchQuizHistory(params) {
  return backendApi.get(AI_ADMIN_ENDPOINTS.QUIZ_HISTORY, { params });
}

/* 2026-04-08: generateReview / fetchReviewHistory 제거 — AI 리뷰 생성 기능 삭제 */

/* ── 챗봇 로그 ── */

/**
 * 챗봇 대화 세션 목록 조회 (Backend, 페이징).
 * @param {Object} params - { page, size, keyword }
 * @returns {Promise<Object>} 세션 목록
 */
export function fetchChatSessions(params) {
  return backendApi.get(AI_ADMIN_ENDPOINTS.CHAT_SESSIONS, { params });
}

/**
 * 특정 세션의 메시지 목록 조회 (Backend).
 * @param {string} sessionId - 세션 ID
 * @returns {Promise<Array>} 메시지 배열
 */
export function fetchChatMessages(sessionId) {
  return backendApi.get(AI_ADMIN_ENDPOINTS.CHAT_MESSAGES(sessionId));
}

/**
 * 챗봇 사용 통계 조회 (Backend).
 * @param {Object} params - { from, to } (ISO 날짜 문자열)
 * @returns {Promise<Object>} 통계 데이터
 */
export function fetchChatStats(params) {
  return backendApi.get(AI_ADMIN_ENDPOINTS.CHAT_STATS, { params });
}

/* ── 리뷰 인증 (2026-04-14 추가) ── */

/**
 * 도장깨기 리뷰 인증 큐(목록) 조회.
 *
 * @param {Object} params - 필터 + 페이지 파라미터
 * @param {string} [params.reviewStatus]   상태 필터 (PENDING / AUTO_VERIFIED / NEEDS_REVIEW / AUTO_REJECTED / ADMIN_APPROVED / ADMIN_REJECTED)
 * @param {number} [params.minConfidence]  최소 AI 신뢰도 (0.0~1.0)
 * @param {string} [params.userId]         사용자 ID 부분 일치
 * @param {string} [params.courseId]       코스 ID 부분 일치
 * @param {string} [params.fromDate]       createdAt 시작 ISO DATE
 * @param {string} [params.toDate]         createdAt 종료 ISO DATE
 * @param {number} [params.page]           0-based 페이지 번호
 * @param {number} [params.size]           페이지 크기
 * @returns {Promise<Object>} 페이징된 인증 요약 목록
 */
export function fetchReviewVerifications(params) {
  return backendApi.get(AI_ADMIN_ENDPOINTS.REVIEW_VERIFY_QUEUE, { params });
}

/**
 * 리뷰 인증 상단 KPI(상태별 건수 + 현재 임계값) 조회.
 *
 * @returns {Promise<Object>} { pending, autoVerified, needsReview, autoRejected, adminApproved, adminRejected, threshold }
 */
export function fetchReviewVerificationOverview() {
  return backendApi.get(AI_ADMIN_ENDPOINTS.REVIEW_VERIFY_OVERVIEW);
}

/**
 * 리뷰 인증 단건 상세 조회 (영화 줄거리 + 리뷰 본문 + 매칭 키워드 포함).
 *
 * @param {number|string} id - course_verification PK
 * @returns {Promise<Object>} 상세 응답
 */
export function fetchReviewVerificationDetail(id) {
  return backendApi.get(AI_ADMIN_ENDPOINTS.REVIEW_VERIFY_DETAIL(id));
}

/**
 * 리뷰 인증 수동 승인.
 *
 * @param {number|string} id     대상 인증 PK
 * @param {Object}        body   { reason: string } (선택)
 * @returns {Promise<Object>}    반영된 상세 응답
 */
export function approveReviewVerification(id, body = {}) {
  return backendApi.post(AI_ADMIN_ENDPOINTS.REVIEW_VERIFY_APPROVE(id), body);
}

/**
 * 리뷰 인증 수동 반려.
 *
 * @param {number|string} id     대상 인증 PK
 * @param {Object}        body   { reason: string } (선택)
 * @returns {Promise<Object>}    반영된 상세 응답
 */
export function rejectReviewVerification(id, body = {}) {
  return backendApi.post(AI_ADMIN_ENDPOINTS.REVIEW_VERIFY_REJECT(id), body);
}

/**
 * AI 재검증 요청 — 상태만 PENDING 으로 복귀 (에이전트 미구현 기간).
 *
 * @param {number|string} id 대상 인증 PK
 * @returns {Promise<Object>} { verificationId, reviewStatus, agentAvailable, message }
 */
export function reverifyReviewVerification(id) {
  return backendApi.post(AI_ADMIN_ENDPOINTS.REVIEW_VERIFY_REVERIFY(id));
}
