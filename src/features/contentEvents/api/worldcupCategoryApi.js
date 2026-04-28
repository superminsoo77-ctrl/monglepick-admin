/**
 * 운영 도구 — 월드컵 후보 카테고리(WorldcupCategory) 관리 API.
 *
 * 백엔드 AdminWorldcupCategoryController(/api/v1/admin/worldcup-categories) 호출.
 *
 * - 전체 목록 (드롭다운/필터용)
 * - 신규 등록
 * - 수정
 */

import { backendApi } from '@/shared/api/axiosInstance';

const BASE = '/api/v1/admin/worldcup-categories';

/** 전체 카테고리 목록 (드롭다운/선택용) */
export function fetchAllWorldcupCategories() {
  return backendApi.get(`${BASE}/all`);
}

/** 월드컵 카테고리 신규 등록 */
export function createWorldcupCategory(payload) {
  return backendApi.post(BASE, payload);
}

/** 월드컵 카테고리 수정 */
export function updateWorldcupCategory(id, payload) {
  return backendApi.put(`${BASE}/${id}`, payload);
}
