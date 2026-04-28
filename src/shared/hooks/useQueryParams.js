/**
 * URL 쿼리파라미터를 객체로 파싱해 반환하는 훅.
 *
 * search 문자열이 바뀔 때만 재계산(useMemo)하므로 불필요한 리렌더를 방지한다.
 *
 * @returns {Record<string, string>} 쿼리파라미터 키-값 맵
 *
 * @example
 * // URL: /support?tab=faq&modal=create
 * const { tab, modal } = useQueryParams();
 * // tab === 'faq', modal === 'create'
 */
import { useLocation } from 'react-router-dom';
import { useMemo } from 'react';

export function useQueryParams() {
  const { search } = useLocation();
  return useMemo(() => Object.fromEntries(new URLSearchParams(search)), [search]);
}
