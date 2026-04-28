/**
 * 운영 도구 — 리워드 정책(RewardPolicy) 관리 API.
 *
 * 백엔드 AdminRewardPolicyController(/api/v1/admin/reward-policies) 6개 EP.
 *
 * - 목록 조회 (페이징)
 * - 단건 조회
 * - 변경 이력 조회 (INSERT-ONLY 원장)
 * - 신규 등록 (action_type UNIQUE)
 * - 메타 수정 (actionType 제외)
 * - 활성 토글
 *
 * 모든 변경 작업은 RewardPolicyHistory에 자동 기록되며, 이력은 변경/삭제 불가.
 */

import { backendApi } from '@/shared/api/axiosInstance';

const BASE = '/api/v1/admin/reward-policies';

export function fetchRewardPolicies(params = {}) {
  return backendApi.get(BASE, { params });
}

export function fetchRewardPolicy(id) {
  return backendApi.get(`${BASE}/${id}`);
}

export function fetchRewardPolicyHistory(id) {
  return backendApi.get(`${BASE}/${id}/history`);
}

/**
 * 전체 리워드 정책 변경 이력 대시보드 조회 — 2026-04-09 P2-⑰ 신규.
 *
 * Backend `GET /api/v1/admin/reward-policies/history` 호출.
 * 모든 정책의 변경 이력을 복합 필터로 페이징 조회한다.
 *
 * @param {Object} [params]           - 필터 파라미터
 * @param {number} [params.policyId]  - 특정 정책만 (생략 시 전체)
 * @param {string} [params.changedBy] - 특정 관리자 userId (생략 시 전체)
 * @param {string} [params.fromDate]  - 시작 시각 ISO-8601 (생략 시 전체)
 * @param {string} [params.toDate]    - 종료 시각 ISO-8601 (생략 시 전체)
 * @param {number} [params.page=0]    - 페이지 번호
 * @param {number} [params.size=20]   - 페이지 크기
 * @returns {Promise<Object>} Page&lt;HistoryResponse&gt;
 */
export function fetchAllRewardPolicyHistory(params = {}) {
  return backendApi.get(`${BASE}/history`, { params });
}

export function createRewardPolicy(payload) {
  return backendApi.post(BASE, payload);
}

export function updateRewardPolicy(id, payload) {
  return backendApi.put(`${BASE}/${id}`, payload);
}

export function updateRewardPolicyActive(id, isActive, changeReason) {
  return backendApi.patch(`${BASE}/${id}/active`, { isActive, changeReason });
}
