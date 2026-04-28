/**
 * 고객센터 관리 탭 메인 페이지.
 *
 * 4개 서브탭으로 구성:
 * - 공지사항: 공지 CRUD + 카테고리 필터 + 고정/예약 발행
 * - FAQ: FAQ CRUD + 카테고리 필터
 * - 도움말: 도움말 CRUD + 카테고리 필터
 * - 상담 티켓: 티켓 목록/상세/답변 + 상태 관리
 *
 * 2026-04-08: 비속어 사전 탭 제거 (관리자 요청).
 * 2026-04-23: URL 쿼리파라미터 `?tab=notice|faq|help|ticket` 을 읽어 활성 탭 자동 세팅.
 *   - AI 어시스턴트의 navigation 이벤트로 특정 탭 직접 오픈 가능.
 *   - 유효하지 않은 tab 값은 기본값 'notice' 로 폴백.
 *   - `?ticketId=N` 이 있으면 TicketTab 에 aiTicketId prop 으로 전달 →
 *     목록 로드 완료 후 해당 티켓 상세 패널 자동 오픈.
 *
 * activeTab 상태를 useState로 관리하여 탭 전환 시 컴포넌트를 조건부 렌더링.
 * 탭 전환 시 기존 컴포넌트를 언마운트하지 않고 display:none 방식으로
 * 각 탭의 로컬 상태(필터, 페이지, 선택 항목)를 유지하기 위해
 * $visible prop 기반의 TabContent 스타일 컴포넌트로 처리.
 */

import { useState } from 'react';
import styled from 'styled-components';
import NoticeTab from '../components/NoticeTab';
import FaqTab from '../components/FaqTab';
import HelpTab from '../components/HelpTab';
import TicketTab from '../components/TicketTab';
import { useQueryParams } from '@/shared/hooks/useQueryParams';

/** 서브탭 정의 */
const TABS = [
  { id: 'notice',    label: '공지사항' },
  { id: 'faq',       label: 'FAQ' },
  { id: 'help',      label: '도움말' },
  { id: 'ticket',    label: '상담 티켓' },
];

/** 유효한 탭 ID 집합 */
const VALID_TAB_IDS = new Set(TABS.map((t) => t.id));

export default function SupportPage() {
  const queryParams = useQueryParams();
  const { tab: queryTab } = queryParams;

  /**
   * 현재 활성 탭 ID.
   * URL ?tab= 쿼리가 유효한 값이면 초기값으로 사용. 아니면 'notice' 로 폴백.
   * 탭 버튼 클릭 시 로컬 상태로 관리 (URL 은 변경하지 않음).
   */
  const [activeTab, setActiveTab] = useState(() =>
    VALID_TAB_IDS.has(queryTab) ? queryTab : 'notice'
  );

  /**
   * AI 어시스턴트가 ?ticketId=N 으로 특정 티켓 직접 오픈을 요청한 경우.
   * TicketTab 에 prop 으로 전달하여 데이터 로드 후 상세 패널을 자동으로 연다.
   * 숫자로 정규화 — 문자열 ID 는 tickets.find() 의 strict 비교에서 실패하므로 Number() 변환.
   */
  const aiTicketId = queryParams.ticketId ? Number(queryParams.ticketId) : null;

  return (
    <Wrapper>
      {/* ── 페이지 헤더 ── */}
      <PageHeader>
        <PageTitle>고객센터 관리</PageTitle>
        <PageDesc>
          공지사항, FAQ, 도움말 콘텐츠 CMS와 상담 티켓을 관리합니다.
        </PageDesc>
      </PageHeader>

      {/* ── 서브탭 네비게이션 ── */}
      <TabNav>
        {TABS.map((tab) => (
          <TabButton
            key={tab.id}
            $active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </TabButton>
        ))}
      </TabNav>

      {/* ── 탭 콘텐츠 영역 ── */}
      <TabPanel>
        {/*
         * 탭 전환 시 각 컴포넌트의 로컬 상태(필터, 페이지 등)를 보존하기 위해
         * unmount 대신 $visible prop으로 표시/숨김 처리.
         * 단, 초기 렌더링 비용 방지를 위해 한 번이라도 방문한 탭만 마운트.
         */}
        <TabContent $visible={activeTab === 'notice'}>
          {(activeTab === 'notice' || undefined) && <NoticeTab />}
        </TabContent>
        <TabContent $visible={activeTab === 'faq'}>
          {activeTab === 'faq' && <FaqTab />}
        </TabContent>
        <TabContent $visible={activeTab === 'help'}>
          {activeTab === 'help' && <HelpTab />}
        </TabContent>
        <TabContent $visible={activeTab === 'ticket'}>
          {activeTab === 'ticket' && <TicketTab aiTicketId={aiTicketId} />}
        </TabContent>
      </TabPanel>
    </Wrapper>
  );
}

/* ── styled-components ── */

const Wrapper = styled.div``;

const PageHeader = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.xxl};
`;

const PageTitle = styled.h2`
  font-size: ${({ theme }) => theme.fontSizes.xxl};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const PageDesc = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.textMuted};
`;

const TabNav = styled.nav`
  display: flex;
  border-bottom: 2px solid ${({ theme }) => theme.colors.border};
  margin-bottom: ${({ theme }) => theme.spacing.xxl};
  gap: 0;
`;

const TabButton = styled.button`
  padding: 10px 20px;
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ $active, theme }) =>
    $active ? theme.fontWeights.semibold : theme.fontWeights.normal};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.primary : theme.colors.textSecondary};
  border-bottom: 2px solid ${({ $active, theme }) =>
    $active ? theme.colors.primary : 'transparent'};
  margin-bottom: -2px; /* border-bottom 겹침 보정 */
  transition: all ${({ theme }) => theme.transitions.fast};
  white-space: nowrap;

  &:hover {
    color: ${({ theme }) => theme.colors.primary};
  }
`;

const TabPanel = styled.div``;

/**
 * 탭 콘텐츠 래퍼.
 * $visible=false 일 때 display:none 처리 — 컴포넌트 마운트 상태 유지.
 * 단, 각 탭은 처음 방문 시에만 마운트됨 (조건부 렌더링과 병행).
 */
const TabContent = styled.div`
  display: ${({ $visible }) => ($visible ? 'block' : 'none')};
`;
