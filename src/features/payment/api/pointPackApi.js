/**
 * 운영 도구 — 포인트팩(PointPackPrice) 관리 API.
 *
 * 백엔드 AdminPointPackController(/api/v1/admin/point-packs) 6개 EP.
 *
 * - 목록 조회 (페이징, sortOrder ASC + price ASC)
 * - 단건 조회
 * - 신규 등록 ((price, pointsAmount) UNIQUE)
 * - 메타 수정
 * - 활성 토글
 * - hard delete
 */

import { backendApi } from '@/shared/api/axiosInstance';

const BASE = '/api/v1/admin/point-packs';

export function fetchPointPacks(params = {}) {
  return backendApi.get(BASE, { params });
}

export function fetchPointPack(id) {
  return backendApi.get(`${BASE}/${id}`);
}

export function createPointPack(payload) {
  return backendApi.post(BASE, payload);
}

export function updatePointPack(id, payload) {
  return backendApi.put(`${BASE}/${id}`, payload);
}

export function updatePointPackActive(id, isActive) {
  return backendApi.patch(`${BASE}/${id}/active`, { isActive });
}

export function deletePointPack(id) {
  return backendApi.delete(`${BASE}/${id}`);
}
