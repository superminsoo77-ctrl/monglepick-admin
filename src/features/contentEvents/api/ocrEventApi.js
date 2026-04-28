/**
 * 운영 도구 — OCR 인증 이벤트(OcrEvent) 관리 API.
 *
 * 백엔드 AdminOcrEventController(/api/v1/admin/ocr-events) 6개 EP.
 *
 * - 목록 조회 (페이징 + status 필터)
 * - 단건 조회
 * - 신규 등록 (READY 상태로 시작)
 * - 메타 수정 (movieId/start/end)
 * - 상태 전이 (READY/ACTIVE/CLOSED)
 * - hard delete
 */

import { backendApi } from '@/shared/api/axiosInstance';

const BASE = '/api/v1/admin/ocr-events';

/** 이벤트 목록 (페이징 + 상태 필터) */
export function fetchOcrEvents(params = {}) {
  return backendApi.get(BASE, { params });
}

/** 이벤트 단건 조회 */
export function fetchOcrEvent(eventId) {
  return backendApi.get(`${BASE}/${eventId}`);
}

/** 신규 이벤트 등록 (READY) */
export function createOcrEvent(payload) {
  return backendApi.post(BASE, payload);
}

/** 이벤트 메타 수정 */
export function updateOcrEvent(eventId, payload) {
  return backendApi.put(`${BASE}/${eventId}`, payload);
}

/** 상태 전이 */
export function updateOcrEventStatus(eventId, targetStatus) {
  return backendApi.patch(`${BASE}/${eventId}/status`, { targetStatus });
}

/** 이벤트 삭제 */
export function deleteOcrEvent(eventId) {
  return backendApi.delete(`${BASE}/${eventId}`);
}

/* ── 인증 제출 목록 ── */

/** 이벤트별 인증 목록 (페이징 + 상태 필터) */
export function fetchOcrVerifications(eventId, params = {}) {
  return backendApi.get(`${BASE}/${eventId}/verifications`, { params });
}

/** 인증 승인 또는 반려 */
export function reviewOcrVerification(verificationId, action) {
  return backendApi.patch(`${BASE}/verifications/${verificationId}/review`, { action });
}
