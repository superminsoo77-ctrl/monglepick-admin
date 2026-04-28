/**
 * 고객센터 관리 탭 API 호출 모듈.
 *
 * 모든 요청은 Backend(Spring Boot :8080) backendApi 인스턴스를 사용.
 * 엔드포인트는 SUPPORT_ADMIN_ENDPOINTS 상수에서 가져옴 (하드코딩 금지).
 *
 * 구성:
 * - 공지사항 CRUD + 순서 변경 (5개)
 * - FAQ CRUD + 순서 변경 (5개)
 * - 도움말 CRUD (4개)
 * - 티켓 목록/상세/상태변경/답변 (4개)
 *
 * 2026-04-08: 비속어 사전(Profanity) API 제거 — 관리자 요청으로 기능 삭제.
 */

import { backendApi } from '@/shared/api/axiosInstance';
import { SUPPORT_ADMIN_ENDPOINTS } from '@/shared/constants/api';

/* ── 공지사항 (Notices) ── */

/**
 * 공지사항 목록 조회.
 * @param {Object} params - { page, size, category, isPinned }
 * @returns {Promise<Object>} 페이징된 공지사항 목록
 */
export function fetchNotices(params) {
  return backendApi.get(SUPPORT_ADMIN_ENDPOINTS.NOTICES, { params });
}

/**
 * 공지사항 등록.
 * @param {Object} data - { title, category, content, isPinned, isPublished, scheduledAt }
 * @returns {Promise<Object>} 생성된 공지사항
 */
export function createNotice(data) {
  return backendApi.post(SUPPORT_ADMIN_ENDPOINTS.NOTICES, data);
}

/**
 * 공지사항 수정.
 * @param {number|string} id - 공지사항 ID
 * @param {Object} data - 수정할 필드
 * @returns {Promise<Object>} 수정된 공지사항
 */
export function updateNotice(id, data) {
  return backendApi.put(SUPPORT_ADMIN_ENDPOINTS.NOTICE_DETAIL(id), data);
}

/**
 * 공지사항 삭제.
 * @param {number|string} id - 공지사항 ID
 * @returns {Promise<void>}
 */
export function deleteNotice(id) {
  return backendApi.delete(SUPPORT_ADMIN_ENDPOINTS.NOTICE_DETAIL(id));
}

/**
 * 공지사항 순서 일괄 변경.
 * @param {Array<Object>} orders - [{ id, displayOrder }, ...]
 * @returns {Promise<void>}
 */
export function reorderNotices(orders) {
  return backendApi.put(SUPPORT_ADMIN_ENDPOINTS.NOTICE_REORDER, orders);
}

/**
 * 공지사항 활성/비활성 토글 (앱 메인 노출 제어).
 *
 * 2026-04-08: 앱 공지(AppNotice) 통합으로 추가. SupportNotice.isActive=false 이면
 * 표시 기간과 무관하게 앱 메인 BANNER/POPUP/MODAL 노출이 차단된다.
 *
 * @param {number|string} id - 공지 noticeId
 * @param {boolean} isActive - 활성 여부
 * @returns {Promise<Object>} 업데이트된 공지
 */
export function updateNoticeActive(id, isActive) {
  return backendApi.patch(SUPPORT_ADMIN_ENDPOINTS.NOTICE_ACTIVE(id), { isActive });
}

/* ── FAQ ── */

/**
 * FAQ 목록 조회.
 * @param {Object} params - { page, size, category, isPublished }
 * @returns {Promise<Object>} 페이징된 FAQ 목록
 */
export function fetchFaqs(params) {
  return backendApi.get(SUPPORT_ADMIN_ENDPOINTS.FAQ, { params });
}

/**
 * FAQ 등록.
 * @param {Object} data - { category, question, answer, isPublished }
 * @returns {Promise<Object>} 생성된 FAQ
 */
export function createFaq(data) {
  return backendApi.post(SUPPORT_ADMIN_ENDPOINTS.FAQ, data);
}

/**
 * FAQ 수정.
 * @param {number|string} id - FAQ ID
 * @param {Object} data - 수정할 필드
 * @returns {Promise<Object>} 수정된 FAQ
 */
export function updateFaq(id, data) {
  return backendApi.put(SUPPORT_ADMIN_ENDPOINTS.FAQ_DETAIL(id), data);
}

/**
 * FAQ 삭제.
 * @param {number|string} id - FAQ ID
 * @returns {Promise<void>}
 */
export function deleteFaq(id) {
  return backendApi.delete(SUPPORT_ADMIN_ENDPOINTS.FAQ_DETAIL(id));
}

/**
 * FAQ 순서 일괄 변경.
 * @param {Array<Object>} orders - [{ id, displayOrder }, ...]
 * @returns {Promise<void>}
 */
export function reorderFaqs(orders) {
  return backendApi.put(SUPPORT_ADMIN_ENDPOINTS.FAQ_REORDER, orders);
}

/* ── 도움말 (Help Articles) ── */

/**
 * 도움말 목록 조회.
 * @param {Object} params - { page, size, category }
 * @returns {Promise<Object>} 페이징된 도움말 목록
 */
export function fetchHelpArticles(params) {
  return backendApi.get(SUPPORT_ADMIN_ENDPOINTS.HELP, { params });
}

/**
 * 도움말 등록.
 * @param {Object} data - { title, category, content, displayOrder }
 * @returns {Promise<Object>} 생성된 도움말
 */
export function createHelpArticle(data) {
  return backendApi.post(SUPPORT_ADMIN_ENDPOINTS.HELP, data);
}

/**
 * 도움말 수정.
 * @param {number|string} id - 도움말 ID
 * @param {Object} data - 수정할 필드
 * @returns {Promise<Object>} 수정된 도움말
 */
export function updateHelpArticle(id, data) {
  return backendApi.put(SUPPORT_ADMIN_ENDPOINTS.HELP_DETAIL(id), data);
}

/**
 * 도움말 삭제.
 * @param {number|string} id - 도움말 ID
 * @returns {Promise<void>}
 */
export function deleteHelpArticle(id) {
  return backendApi.delete(SUPPORT_ADMIN_ENDPOINTS.HELP_DETAIL(id));
}

/* ── 상담 티켓 (Support Tickets) ── */

/**
 * 티켓 목록 조회.
 * @param {Object} params - { page, size, status, category, priority }
 * @returns {Promise<Object>} 페이징된 티켓 목록
 */
export function fetchTickets(params) {
  return backendApi.get(SUPPORT_ADMIN_ENDPOINTS.TICKETS, { params });
}

/**
 * 티켓 상세 조회 (답변 이력 포함).
 * @param {number|string} id - 티켓 ID
 * @returns {Promise<Object>} 티켓 상세 및 답변 이력
 */
export function fetchTicketDetail(id) {
  return backendApi.get(SUPPORT_ADMIN_ENDPOINTS.TICKET_DETAIL(id));
}

/**
 * 티켓 상태 변경.
 * @param {number|string} id - 티켓 ID
 * @param {Object} data - { status } (OPEN/IN_PROGRESS/RESOLVED/CLOSED)
 * @returns {Promise<Object>} 업데이트된 티켓
 */
export function updateTicketStatus(id, data) {
  return backendApi.put(SUPPORT_ADMIN_ENDPOINTS.TICKET_STATUS(id), data);
}

/**
 * 티켓 답변 작성.
 * @param {number|string} id - 티켓 ID
 * @param {Object} data - { content }
 * @returns {Promise<Object>} 작성된 답변
 */
export function replyToTicket(id, data) {
  return backendApi.post(SUPPORT_ADMIN_ENDPOINTS.TICKET_REPLY(id), data);
}

/* 2026-04-08: 비속어 사전 API 제거 (fetchProfanity/addProfanity/deleteProfanity/importProfanity/exportProfanity) */
