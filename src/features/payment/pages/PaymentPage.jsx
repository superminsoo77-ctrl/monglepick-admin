/**
 * 결제 / 포인트 관리 탭 메인 페이지.
 *
 * 2026-04-08 개편:
 *  - "포인트팩" / "리워드 정책" 서브탭 흡수 (구 운영 도구 → 포인트 경제 도메인 통합)
 *
 * 2026-04-14 확장:
 *  - "개별 결제" / "포인트 단독 결제" 탭 추가 — 운영 편의상 결제 유형별 분리 뷰 제공.
 *    PaymentOrderTable 는 `orderTypeFilter` prop 으로 주문 유형을 고정 필터한다.
 *
 * 8개 서브탭:
 * - 결제 내역: 전체 결제 주문 조회/환불, 보상 실패 건 수동 처리
 * - 개별 결제: 구독(SUBSCRIPTION) 단독 뷰
 * - 포인트 단독 결제: 포인트 팩(POINT_PACK) 단독 뷰
 * - 구독 관리: 구독 목록 조회, 수동 취소/연장 (모달 기반)
 * - 포인트 관리: 수동 지급/차감, 사용자 이력 조회 (이메일/닉네임 검색)
 * - 포인트 아이템: 교환 아이템 목록 조회 및 인라인 수정
 * - 포인트팩: 결제 포인트 팩 CRUD (가격/지급량)
 * - 리워드 정책: 55종 활동 리워드 정책 CRUD
 *
 * 탭 상태는 단순 useState 로 관리 (페이지 새로고침 시 첫 탭으로 초기화).
 *
 * @module PaymentPage
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useQueryParams } from '@/shared/hooks/useQueryParams';
import PaymentOrderTable from '../components/PaymentOrderTable';
import SubscriptionTable from '../components/SubscriptionTable';
import PointManagement from '../components/PointManagement';
import PointItemTable from '../components/PointItemTable';
import PointPackTab from '../components/PointPackTab';
import RewardPolicyTab from '../components/RewardPolicyTab';

/** 서브탭 정의 */
const TABS = [
  { id: 'orders',        label: '결제 내역' },
  { id: 'orders_sub',    label: '개별 결제' },
  { id: 'orders_point',  label: '포인트 단독 결제' },
  { id: 'subscription',  label: '구독 관리' },
  { id: 'point',         label: '포인트 관리' },
  { id: 'items',         label: '포인트 아이템' },
  { id: 'point_pack',    label: '포인트팩' },
  { id: 'reward_policy', label: '리워드 정책' },
];

export default function PaymentPage() {
  /* 현재 활성 탭 ID */
  const [activeTab, setActiveTab] = useState('orders');

  /* v3 Phase G: AI Assistant 가 navigate(path?tab=xxx&orderId=yyy&action=refund) 로
   * 진입시킨 경우 해당 탭을 자동 활성화. orderId/action 은 PaymentOrderTable 로 전달. */
  const queryParams = useQueryParams();
  useEffect(() => {
    const requestedTab = queryParams.tab;
    if (requestedTab && TABS.some((t) => t.id === requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, [queryParams.tab]);

  /* PaymentOrderTable 에 넘길 AI 요청 컨텍스트 */
  const aiOrderRequest =
    (queryParams.orderId || queryParams.action === 'refund')
      ? {
          orderId: queryParams.orderId || null,
          action: queryParams.action || null,
        }
      : null;

  return (
    <Wrapper>
      {/* 페이지 헤더 */}
      <PageHeader>
        <PageTitle>결제 / 포인트 관리</PageTitle>
        <PageDesc>
          결제 내역 조회 및 환불 처리, 구독 관리, 포인트 수동 지급/차감,
          포인트 아이템·포인트팩·리워드 정책 CRUD를 담당합니다.
        </PageDesc>
      </PageHeader>

      {/* 서브탭 네비게이션 */}
      <TabNav>
        {TABS.map(({ id, label }) => (
          <TabButton
            key={id}
            $active={activeTab === id}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </TabButton>
        ))}
      </TabNav>

      {/* 탭 콘텐츠 영역 */}
      <TabContent>
        {activeTab === 'orders'        && <PaymentOrderTable aiOrderRequest={aiOrderRequest} />}
        {/*
          개별 결제 탭 — SUBSCRIPTION 주문만 필터링하여 표시.
          보상 실패 섹션은 전체 탭에서만 노출하여 중복 혼란 방지.
        */}
        {activeTab === 'orders_sub'    && (
          <PaymentOrderTable
            orderTypeFilter="SUBSCRIPTION"
            title="개별 결제 (구독)"
            showFailedSection={false}
          />
        )}
        {/* 포인트 단독 결제 탭 — POINT_PACK 주문만 */}
        {activeTab === 'orders_point'  && (
          <PaymentOrderTable
            orderTypeFilter="POINT_PACK"
            title="포인트 단독 결제 (포인트팩)"
            showFailedSection={false}
          />
        )}
        {activeTab === 'subscription'  && <SubscriptionTable />}
        {activeTab === 'point'         && <PointManagement />}
        {activeTab === 'items'         && <PointItemTable />}
        {activeTab === 'point_pack'    && <PointPackTab />}
        {activeTab === 'reward_policy' && <RewardPolicyTab />}
      </TabContent>
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
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const PageDesc = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.textMuted};
`;

const TabNav = styled.div`
  display: flex;
  gap: 0;
  border-bottom: 2px solid ${({ theme }) => theme.colors.border};
  margin-bottom: ${({ theme }) => theme.spacing.xxl};
  flex-wrap: wrap;
`;

const TabButton = styled.button`
  position: relative;
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.xl};
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ $active, theme }) =>
    $active ? theme.fontWeights.semibold : theme.fontWeights.normal};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.primary : theme.colors.textSecondary};
  background: transparent;
  transition: color ${({ theme }) => theme.transitions.fast};

  /* 활성 탭 하단 인디케이터 */
  &::after {
    content: '';
    position: absolute;
    bottom: -2px;
    left: 0;
    right: 0;
    height: 2px;
    background: ${({ $active, theme }) =>
      $active ? theme.colors.primary : 'transparent'};
    transition: background ${({ theme }) => theme.transitions.fast};
  }

  &:hover {
    color: ${({ theme }) => theme.colors.primary};
  }
`;

const TabContent = styled.div``;
