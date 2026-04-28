/**
 * AI 어시스턴트가 채운 draft 데이터와 출처 정보를 location.state 에서 추출하는 훅.
 *
 * FormPrefillCard 가 navigate(target_path, { state: { draft, source: 'ai_assistant' } }) 를
 * 호출하면 대상 페이지에서 이 훅을 통해 prefill 값을 읽어 모달 초기값으로 주입한다.
 *
 * @returns {{ draft: Object|null, isAiGenerated: boolean, bannerText: string|null }}
 *   - draft: AI 가 채운 폼 초기값. source='ai_assistant' 가 아니면 null 반환.
 *   - isAiGenerated: source === 'ai_assistant' 여부
 *   - bannerText: 모달 상단 안내 배너 문구. isAiGenerated=false 이면 null.
 */
import { useLocation } from 'react-router-dom';
import { useMemo } from 'react';

export function useAiPrefill() {
  const location = useLocation();
  const draft  = location.state?.draft  || null;
  const source = location.state?.source || null;
  const isAi   = source === 'ai_assistant';

  return useMemo(() => ({
    /** AI 어시스턴트가 채운 폼 초기값. 미존재 또는 출처가 ai_assistant 가 아니면 null. */
    draft: isAi ? draft : null,
    /** source === 'ai_assistant' 여부 */
    isAiGenerated: isAi,
    /**
     * 모달 상단에 렌더링할 안내 문구.
     * isAiGenerated=false 이면 null 반환 → 배너 미노출.
     */
    bannerText: isAi
      ? 'AI 어시스턴트가 채운 내용이에요. 검토 후 저장해주세요.'
      : null,
  }), [draft, isAi]);
}
