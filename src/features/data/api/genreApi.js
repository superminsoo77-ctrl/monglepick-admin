/**
 * 운영 도구 — 장르 마스터(GenreMaster) 관리 API.
 *
 * 백엔드 AdminGenreController(/api/v1/admin/genres) 호출.
 *
 * - 목록 조회 (페이징)
 * - 전체 목록 (드롭다운/필터용)
 * - 단건 조회
 * - 신규 등록 (genre_code UNIQUE)
 * - 수정 (한국어명만)
 * - 삭제 (hard delete)
 */

import { backendApi } from '@/shared/api/axiosInstance';

const BASE = '/api/v1/admin/genres';

/** 장르 목록 페이징 조회 */
export function fetchGenres(params = {}) {
  return backendApi.get(BASE, { params });
}

/** 전체 장르 (드롭다운/필터용) */
export function fetchAllGenres() {
  return backendApi.get(`${BASE}/all`);
}

/** 장르 단건 조회 */
export function fetchGenre(id) {
  return backendApi.get(`${BASE}/${id}`);
}

/** 장르 신규 등록 */
export function createGenre(payload) {
  return backendApi.post(BASE, payload);
}

/** 장르 수정 (한국어명만) */
export function updateGenre(id, payload) {
  return backendApi.put(`${BASE}/${id}`, payload);
}

/** 장르 hard delete */
export function deleteGenre(id) {
  return backendApi.delete(`${BASE}/${id}`);
}
