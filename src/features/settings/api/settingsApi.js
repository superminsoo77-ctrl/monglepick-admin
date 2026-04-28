/**
 * 설정 탭 API 호출 함수.
 * 약관/정책, 배너, 감사 로그, 관리자 계정 관리.
 */

import { backendApi } from '@/shared/api/axiosInstance';

const ADMIN = '/api/v1/admin';

/* ── 약관/정책 ── */

/** 약관 목록 조회 */
export function fetchTerms(params) {
  return backendApi.get(`${ADMIN}/terms`, { params });
}

/** 약관 등록 */
export function createTerm(data) {
  return backendApi.post(`${ADMIN}/terms`, data);
}

/** 약관 수정 */
export function updateTerm(id, data) {
  return backendApi.put(`${ADMIN}/terms/${id}`, data);
}

/** 약관 삭제 */
export function deleteTerm(id) {
  return backendApi.delete(`${ADMIN}/terms/${id}`);
}

/* ── 배너 ── */

/** 배너 목록 조회 */
export function fetchBanners(params) {
  return backendApi.get(`${ADMIN}/banners`, { params });
}

/** 배너 등록 */
export function createBanner(data) {
  return backendApi.post(`${ADMIN}/banners`, data);
}

/** 배너 수정 */
export function updateBanner(id, data) {
  return backendApi.put(`${ADMIN}/banners/${id}`, data);
}

/** 배너 삭제 */
export function deleteBanner(id) {
  return backendApi.delete(`${ADMIN}/banners/${id}`);
}

/* ── 감사 로그 ── */

/** 감사 로그 목록 조회 */
export function fetchAuditLogs(params) {
  return backendApi.get(`${ADMIN}/audit-logs`, { params });
}

/* ── 관리자 계정 ── */

/** 관리자 목록 조회 */
export function fetchAdmins(params) {
  return backendApi.get(`${ADMIN}/admins`, { params });
}

/** 관리자 역할 수정 */
export function updateAdminRole(id, data) {
  return backendApi.put(`${ADMIN}/admins/${id}`, data);
}

/**
 * 관리자 계정 신규 등록 (2026-04-14 추가).
 *
 * 기존 일반 사용자를 관리자로 승격시킨다.
 * @param {{ userId?: string, email?: string, adminRole: string }} data
 *   userId 또는 email 중 하나는 필수. adminRole 은 AdminRole enum 허용값.
 */
export function createAdmin(data) {
  return backendApi.post(`${ADMIN}/admins`, data);
}
