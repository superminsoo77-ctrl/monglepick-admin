/**
 * 사용자 관리 API 모듈.
 *
 * 관리자 전용 회원 조회/수정 API.
 * backendApi (axios 인스턴스)를 사용하며 JWT 자동 갱신이 내장되어 있다.
 *
 * 엔드포인트 기준: /api/v1/admin/users
 */

import { backendApi } from '@/shared/api/axiosInstance';

/** 관리자 사용자 API 기본 경로 */
const ADMIN_USERS = '/api/v1/admin/users';

/**
 * 사용자 목록 조회 (페이징 + 필터).
 *
 * @param {Object} params - 쿼리 파라미터
 * @param {string} [params.keyword] - 이메일/닉네임 키워드 검색
 * @param {string} [params.status]  - 계정 상태 필터 (ACTIVE | SUSPENDED | LOCKED)
 * @param {string} [params.role]    - 역할 필터 (USER | ADMIN)
 * @param {number} [params.page=0]  - 페이지 번호 (0-based)
 * @param {number} [params.size=20] - 페이지 크기
 * @returns {Promise<{content: Array, totalElements: number, totalPages: number}>}
 */
export function fetchUsers(params = {}) {
  return backendApi.get(ADMIN_USERS, { params });
}

/**
 * 특정 사용자 상세 정보 조회.
 *
 * @param {string} userId - 사용자 ID
 * @returns {Promise<Object>} 사용자 상세 객체
 */
export function fetchUserDetail(userId) {
  return backendApi.get(`${ADMIN_USERS}/${userId}`);
}

/**
 * 사용자 역할 변경.
 *
 * @param {string} userId - 사용자 ID
 * @param {Object} data - 역할 변경 데이터
 * @param {string} data.role - 변경할 역할 (USER | ADMIN)
 * @returns {Promise<Object>} 변경된 사용자 정보
 */
export function updateUserRole(userId, data) {
  return backendApi.put(`${ADMIN_USERS}/${userId}/role`, data);
}

/**
 * 계정 정지 처리.
 *
 * @param {string} userId - 사용자 ID
 * @param {Object} data - 정지 요청 데이터
 * @param {string} data.reason - 정지 사유
 * @param {number} [data.durationDays] - 임시 정지 일수 (null=영구 정지)
 * @returns {Promise<Object>} 처리 결과
 */
export function suspendUser(userId, data) {
  return backendApi.put(`${ADMIN_USERS}/${userId}/suspend`, data);
}

/**
 * 사용자 제재 이력 조회 (정지/복구 이력 최신순).
 *
 * @param {string} userId - 사용자 ID
 * @returns {Promise<Array>} SuspensionHistoryResponse 배열
 */
export function fetchSuspensionHistory(userId) {
  return backendApi.get(`${ADMIN_USERS}/${userId}/suspension-history`);
}

/**
 * 계정 복구 (정지 해제).
 *
 * @param {string} userId - 사용자 ID
 * @returns {Promise<Object>} 처리 결과
 */
export function activateUser(userId) {
  return backendApi.put(`${ADMIN_USERS}/${userId}/activate`);
}

/**
 * 사용자 활동 이력 조회 (게시글/댓글/리뷰 등).
 *
 * @param {string} userId - 사용자 ID
 * @param {Object} params - 페이징 파라미터
 * @param {number} [params.page=0]  - 페이지 번호
 * @param {number} [params.size=10] - 페이지 크기
 * @returns {Promise<{content: Array, totalElements: number}>}
 */
export function fetchUserActivity(userId, params = {}) {
  return backendApi.get(`${ADMIN_USERS}/${userId}/activity`, { params });
}

/**
 * 사용자 포인트 내역 조회.
 *
 * @param {string} userId - 사용자 ID
 * @param {Object} params - 페이징 파라미터
 * @param {number} [params.page=0]  - 페이지 번호
 * @param {number} [params.size=10] - 페이지 크기
 * @returns {Promise<{content: Array, totalElements: number}>}
 */
export function fetchUserPoints(userId, params = {}) {
  return backendApi.get(`${ADMIN_USERS}/${userId}/points`, { params });
}

/**
 * 사용자 결제 내역 조회.
 *
 * @param {string} userId - 사용자 ID
 * @param {Object} params - 페이징 파라미터
 * @param {number} [params.page=0]  - 페이지 번호
 * @param {number} [params.size=10] - 페이지 크기
 * @returns {Promise<{content: Array, totalElements: number}>}
 */
export function fetchUserPayments(userId, params = {}) {
  return backendApi.get(`${ADMIN_USERS}/${userId}/payments`, { params });
}

/**
 * 사용자 리워드 진행 현황 조회 (2026-04-14 신설).
 *
 * Backend GET /api/v1/admin/users/{userId}/rewards 와 1:1 매핑.
 * 사용자 본인이 /api/v1/point/progress 로 보는 것과 동일한 구조를 관리자 시점에서 조회한다.
 *
 * @param {string} userId - 사용자 ID
 * @returns {Promise<Object>} UserRewardStatusResponse
 *   - userId, totalEarned, earnedByActivity, currentBalance, gradeCode
 *   - activities: ActivityProgressResponse[] (일반 활동 — 일일 한도/카운터)
 *   - milestones: MilestoneProgressResponse[] (threshold 기반 — 달성률)
 */
export function fetchUserRewards(userId) {
  return backendApi.get(`${ADMIN_USERS}/${userId}/rewards`);
}

/**
 * 관리자 수동 포인트 지급/회수 (Phase 6-2).
 *
 * @param {string} userId - 사용자 ID
 * @param {Object} data - 조정 요청
 * @param {number} data.amount - 변동량 (양수=지급, 음수=회수, 0 금지)
 * @param {string} data.reason - 사유 (필수, 최대 300자)
 * @returns {Promise<Object>} ManualPointResponse { deltaApplied, balanceBefore, balanceAfter, ... }
 */
export function adjustUserPoints(userId, data) {
  return backendApi.post(`${ADMIN_USERS}/${userId}/points/adjust`, data);
}

/**
 * 관리자 수동 AI 이용권 발급 (Phase 6-3).
 *
 * @param {string} userId - 사용자 ID
 * @param {Object} data - 발급 요청
 * @param {number} data.count - 발급 수량 (1 이상 정수)
 * @param {string} data.reason - 사유 (필수, 최대 300자)
 * @returns {Promise<Object>} GrantAiTokenResponse { grantedCount, tokensBefore, tokensAfter, ... }
 */
export function grantAiTokens(userId, data) {
  return backendApi.post(`${ADMIN_USERS}/${userId}/tokens/grant`, data);
}
