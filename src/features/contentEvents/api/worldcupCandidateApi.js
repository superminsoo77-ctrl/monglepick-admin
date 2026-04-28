/**
 * 운영 도구 — 월드컵 후보 영화(WorldcupCandidate) 관리 API.
 *
 * 백엔드 AdminWorldcupCandidateController(/api/v1/admin/worldcup-candidates) 8개 EP.
 *
 * - 영화 검색 (신규 후보 등록용, 제목/인기도 범위 검색)
 * - 목록 조회 (페이징 + category 필터)
 * - 단건 조회
 * - 신규 등록 ((movieId, category_id) UNIQUE, 요청은 category_code 사용)
 * - 메타 수정 (isActive, popularity는 DB 자동 반영)
 * - 활성화 토글
 * - 인기도 임계값 미만 일괄 비활성화
 * - hard delete
 */

import { backendApi } from '@/shared/api/axiosInstance';

const BASE = '/api/v1/admin/worldcup-candidates';

/** 영화 제목/인기도 범위 검색 (월드컵 후보 신규 등록용, 페이지네이션) */
export function searchMovies(params = {}) {
  return backendApi.get(`${BASE}/movies/search`, { params });
}

/** 후보 목록 조회 (페이징) */
export function fetchCandidates(params = {}) {
  return backendApi.get(BASE, { params });
}

/** 후보 단건 조회 */
export function fetchCandidate(id) {
  return backendApi.get(`${BASE}/${id}`);
}

/** 신규 후보 등록 */
export function createCandidate(payload) {
  return backendApi.post(BASE, payload);
}

/** 여러 후보를 같은 기존 카테고리(category_code)로 일괄 등록 */
export async function createCandidatesBulk({ movieIds, category }) {
  const tasks = (movieIds || []).map((movieId) => createCandidate({
    movieId,
    category,
  }));
  const results = await Promise.allSettled(tasks);
  return {
    created: results.filter((result) => result.status === 'fulfilled').length,
    failed: results
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason?.message || '저장 실패'),
  };
}

/** 후보 메타 수정 */
export function updateCandidate(id, payload) {
  return backendApi.put(`${BASE}/${id}`, payload);
}

/** 활성/비활성 토글 */
export function updateCandidateActive(id, isActive) {
  return backendApi.patch(`${BASE}/${id}/active`, { isActive });
}

/** 인기도 임계값 미만 일괄 비활성화 */
export function deactivateBelowPopularity(threshold) {
  return backendApi.post(`${BASE}/deactivate-below`, { threshold });
}

/** 후보 삭제 */
export function deleteCandidate(id) {
  return backendApi.delete(`${BASE}/${id}`);
}
