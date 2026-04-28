/**
 * 운영 도구 — 업적(AchievementType) 마스터 관리 API 호출.
 *
 * 백엔드 AdminAchievementController(/api/v1/admin/achievements) 5개 EP를 호출한다.
 *
 * - 목록 조회 (페이징, 활성/비활성 모두)
 * - 단건 조회
 * - 신규 등록 (achievement_code UNIQUE — 중복 시 409)
 * - 수정 (achievement_code 제외)
 * - 활성/비활성 토글
 *
 * 모든 함수는 backendApi(JWT 자동 갱신) 인스턴스를 사용한다.
 */

import { backendApi } from '@/shared/api/axiosInstance';

/** 업적 마스터 관리자 EP 베이스 */
const BASE = '/api/v1/admin/achievements';

/**
 * 업적 마스터 목록 조회 (페이징).
 *
 * @param {Object} params
 * @param {number} [params.page=0]  페이지 번호 (0-based)
 * @param {number} [params.size=20] 페이지 크기
 * @returns {Promise<Object>} ApiResponse<Page<AchievementResponse>>
 */
export function fetchAchievements(params = {}) {
  return backendApi.get(BASE, { params });
}

/**
 * 업적 마스터 단건 조회.
 *
 * @param {number|string} id - achievement_type_id
 */
export function fetchAchievement(id) {
  return backendApi.get(`${BASE}/${id}`);
}

/**
 * 신규 업적 마스터 등록.
 *
 * @param {Object} payload
 * @param {string} payload.achievementCode  업적 코드 (UNIQUE, 영문 소문자+언더스코어 권장)
 * @param {string} payload.achievementName  표시명
 * @param {string} [payload.description]    설명
 * @param {number} [payload.requiredCount]  달성 조건 횟수
 * @param {number} [payload.rewardPoints]   보상 포인트 (기본 0)
 * @param {string} [payload.iconUrl]        아이콘 URL
 * @param {string} [payload.category]       카테고리 (VIEWING/SOCIAL/COLLECTION/CHALLENGE)
 */
export function createAchievement(payload) {
  return backendApi.post(BASE, payload);
}

/**
 * 업적 마스터 수정 (achievement_code 제외).
 *
 * @param {number|string} id
 * @param {Object} payload - achievementName/description/requiredCount/rewardPoints/iconUrl/category
 */
export function updateAchievement(id, payload) {
  return backendApi.put(`${BASE}/${id}`, payload);
}

/**
 * 업적 마스터 활성/비활성 토글.
 *
 * @param {number|string} id
 * @param {boolean} isActive
 */
export function updateAchievementActive(id, isActive) {
  return backendApi.patch(`${BASE}/${id}/active`, { isActive });
}
