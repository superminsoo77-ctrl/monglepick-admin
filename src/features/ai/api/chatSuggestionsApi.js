/**
 * 채팅 추천 칩 관리 API (Admin 전용).
 *
 * 채팅 환영 화면에 노출되는 추천 질문 칩의 DB 풀을 운영자가 직접 CRUD할 수 있는
 * 5개 엔드포인트 래퍼. 기존 aiApi.js 와 분리된 별도 파일로 유지한다.
 *
 * @service Backend (Spring Boot :8080)
 * @path /api/v1/admin/chat-suggestions
 * @module features/ai/api/chatSuggestionsApi
 */

import { backendApi } from '@/shared/api/axiosInstance';
import { AI_ADMIN_ENDPOINTS } from '@/shared/constants/api';

/**
 * 채팅 추천 칩 목록을 페이징 조회한다.
 *
 * @param {Object} params - 쿼리 파라미터
 * @param {number} [params.page=0] - 페이지 번호 (0-based)
 * @param {number} [params.size=20] - 페이지 크기
 * @param {boolean} [params.isActive] - 활성 상태 필터 (undefined = 전체)
 * @param {string} [params.fromDate] - 시작 일시 (ISO-8601)
 * @param {string} [params.toDate] - 종료 일시 (ISO-8601)
 * @returns {Promise<import('axios').AxiosResponse>} Spring Page 응답 (content, totalElements, ...)
 */
export function fetchChatSuggestions(params) {
  return backendApi.get(AI_ADMIN_ENDPOINTS.CHAT_SUGGESTIONS, { params });
}

/**
 * 채팅 추천 칩을 신규 등록한다.
 *
 * @param {Object} payload - 등록 데이터
 * @param {string} payload.text - 칩 텍스트 (최대 200자)
 * @param {string} [payload.category] - 카테고리 (mood/genre/trending/family/seasonal/similar/personal)
 * @param {boolean} [payload.isActive] - 활성 여부 (기본 true)
 * @param {string} [payload.startAt] - 노출 시작 일시 (ISO-8601)
 * @param {string} [payload.endAt] - 노출 종료 일시 (ISO-8601)
 * @param {number} [payload.displayOrder] - 표시 순서
 * @returns {Promise<Object>} 생성된 AdminChatSuggestionResponse
 */
export function createChatSuggestion(payload) {
  return backendApi.post(AI_ADMIN_ENDPOINTS.CHAT_SUGGESTIONS, payload);
}

/**
 * 채팅 추천 칩을 수정한다.
 *
 * @param {number} id - 수정 대상 칩 ID
 * @param {Object} payload - 수정 데이터 (createChatSuggestion payload와 동일)
 * @returns {Promise<Object>} 수정된 AdminChatSuggestionResponse
 */
export function updateChatSuggestion(id, payload) {
  return backendApi.put(AI_ADMIN_ENDPOINTS.CHAT_SUGGESTION_DETAIL(id), payload);
}

/**
 * 채팅 추천 칩을 삭제한다.
 *
 * @param {number} id - 삭제 대상 칩 ID
 * @returns {Promise<void>} 204 No Content
 */
export function deleteChatSuggestion(id) {
  return backendApi.delete(AI_ADMIN_ENDPOINTS.CHAT_SUGGESTION_DETAIL(id));
}

/**
 * 채팅 추천 칩의 활성 상태를 토글한다.
 *
 * @param {number} id - 대상 칩 ID
 * @param {boolean} isActive - 변경할 활성 상태
 * @returns {Promise<Object>} 수정된 AdminChatSuggestionResponse
 */
export function toggleChatSuggestionActive(id, isActive) {
  return backendApi.patch(AI_ADMIN_ENDPOINTS.CHAT_SUGGESTION_ACTIVE(id), { isActive });
}
