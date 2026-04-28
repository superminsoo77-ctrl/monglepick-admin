/**
 * 관리자 AI 어시스턴트 빈 상태 빠른 질문 풀을 Backend 에서 동적 조회.
 *
 * Backend `GET /api/v1/chat/suggestions?surface=admin_assistant&limit=4` 로 활성 칩을 가져오고,
 * 빈 응답이면 FALLBACK_PROMPTS 를 사용한다 (관리자가 아직 어드민 시드/CRUD 를 안 한 경우 대비).
 *
 * 2026-04-23 신규 — ChatSuggestion.surface 컬럼 도입으로 3채널(user_chat/admin_assistant/faq_chatbot)
 * 을 단일 테이블 + 쿼리 파라미터로 분리 관리하는 전략. AssistantChatPanel 의 QUICK_PROMPTS
 * 하드코딩을 대체한다.
 */

import { useEffect, useState } from 'react';
import { backendApi } from '../../../shared/api/axiosInstance';


/** Backend 에 아직 admin_assistant 시드가 없을 때 대체로 쓰일 최후 방어선. */
const FALLBACK_PROMPTS = [
  '지난 7일 DAU 추이 보여줘',
  '이번 달 환불된 결제 주문 목록',
  '대기 중인 고객센터 티켓 몇 건이야?',
  'AI 추천 서비스 현황 알려줘',
];


/**
 * @param {number} limit 반환할 칩 수 (기본 4, 최대 10)
 * @returns {Array<string>} 칩 텍스트 배열
 */
export default function useAssistantQuickPrompts(limit = 4) {
  const [prompts, setPrompts] = useState(FALLBACK_PROMPTS);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        // Public EP — JWT 없이도 동작하지만 backendApi 가 자동 주입해도 무관.
        // response interceptor 가 `response.data?.data ?? response.data` 로 언래핑하는데,
        // bare List 응답이라 `response.data.data` 는 undefined → `response.data` 배열로 반환됨.
        const data = await backendApi.get('/api/v1/chat/suggestions', {
          params: { surface: 'admin_assistant', limit },
        });
        if (cancelled) return;
        if (Array.isArray(data) && data.length > 0) {
          // 서버는 `{id, text}` 형태. 본 훅은 칩 텍스트 배열만 필요.
          setPrompts(data.map((s) => s?.text).filter(Boolean));
        }
      } catch {
        // 네트워크 오류 시 FALLBACK 유지 — 관리자 초기 체험 UX 유지가 우선.
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [limit]);

  return prompts;
}
