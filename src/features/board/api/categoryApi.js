/**
 * 운영 도구 — 게시글 카테고리(Category/CategoryChild) 관리 API.
 *
 * 백엔드 AdminCategoryController(/api/v1/admin/categories) 9개 EP.
 *
 * 상위 카테고리 5 EP:
 * - GET    /                  목록 페이징
 * - GET    /{id}              단건 + 하위 목록
 * - POST   /                  신규
 * - PUT    /{id}              수정
 * - DELETE /{id}              삭제 (하위 자동 정리)
 *
 * 하위 카테고리 4 EP:
 * - GET    /{id}/children     하위 목록
 * - POST   /children          신규
 * - PUT    /children/{id}     수정
 * - DELETE /children/{id}     삭제
 */

import { backendApi } from '@/shared/api/axiosInstance';

const BASE = '/api/v1/admin/categories';

/* ── 상위 카테고리 ── */

export function fetchCategories(params = {}) {
  return backendApi.get(BASE, { params });
}

export function fetchCategoryDetail(id) {
  return backendApi.get(`${BASE}/${id}`);
}

export function createCategory(payload) {
  return backendApi.post(BASE, payload);
}

export function updateCategory(id, payload) {
  return backendApi.put(`${BASE}/${id}`, payload);
}

export function deleteCategory(id) {
  return backendApi.delete(`${BASE}/${id}`);
}

/* ── 하위 카테고리 ── */

export function fetchCategoryChildren(id) {
  return backendApi.get(`${BASE}/${id}/children`);
}

export function createCategoryChild(payload) {
  return backendApi.post(`${BASE}/children`, payload);
}

export function updateCategoryChild(childId, payload) {
  return backendApi.put(`${BASE}/children/${childId}`, payload);
}

export function deleteCategoryChild(childId) {
  return backendApi.delete(`${BASE}/children/${childId}`);
}
