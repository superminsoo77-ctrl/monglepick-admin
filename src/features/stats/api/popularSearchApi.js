/**
 * 운영 도구 — 인기 검색어(PopularSearchKeyword) 관리 API.
 *
 * 백엔드 AdminPopularSearchController(/api/v1/admin/popular-keywords) 6개 EP.
 *
 * - 목록 조회 (페이징, 수동 우선순위 DESC + createdAt DESC)
 * - 단건 조회
 * - 신규 등록 (keyword UNIQUE — 중복 시 409)
 * - 메타 수정 (keyword 제외)
 * - 블랙리스트 토글
 * - hard delete
 */

import { backendApi } from '@/shared/api/axiosInstance';

const BASE = '/api/v1/admin/popular-keywords';

/** 키워드 목록 조회 (페이징) */
export function fetchPopularKeywords(params = {}) {
  return backendApi.get(BASE, { params });
}

/** 키워드 단건 조회 */
export function fetchPopularKeyword(id) {
  return backendApi.get(`${BASE}/${id}`);
}

/** 신규 키워드 등록 */
export function createPopularKeyword(payload) {
  return backendApi.post(BASE, payload);
}

/** 키워드 메타 수정 (keyword 제외) */
export function updatePopularKeyword(id, payload) {
  return backendApi.put(`${BASE}/${id}`, payload);
}

/** 블랙리스트 토글 */
export function updatePopularKeywordExcluded(id, isExcluded) {
  return backendApi.patch(`${BASE}/${id}/excluded`, { isExcluded });
}

/** 키워드 삭제 */
export function deletePopularKeyword(id) {
  return backendApi.delete(`${BASE}/${id}`);
}
