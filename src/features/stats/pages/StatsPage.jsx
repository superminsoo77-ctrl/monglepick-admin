/**
 * 통계/분석 관리자 탭 메인 페이지.
 *
 * 12개 서브탭으로 구성:
 * - 서비스 통계   : DAU/MAU, 신규 가입, 리뷰, 게시글 KPI + 추이 차트
 * - 추천 분석     : CTR, 만족도, 장르 분포, 추천 로그 테이블
 * - 검색 분석     : 검색 품질 지표, 인기 검색어 테이블
 * - 사용자 행동   : 장르 선호 차트, 시간대별 활동, 코호트 리텐션
 * - 매출          : 월매출/MRR/ARPU, 일별 매출 차트, 구독 분포
 * - 포인트 경제   : 포인트 유통량, 유형별 분포, 등급별 분포, 발행/소비 추이
 * - AI 서비스     : 세션/턴 추이, 의도 분포, 쿼터 소진율
 * - 커뮤니티      : 게시글/댓글 추이, 카테고리 분포, 신고/독성 분석
 * - 사용자 참여도 : 출석 패턴, 활동별 참여율, 위시리스트 분석
 * - 콘텐츠 성과   : 코스 완주율, 업적 달성률, 리뷰 품질
 * - 전환 퍼널     : 가입→활동→AI→리뷰→구독→결제 6단계 전환율
 * - 이탈 위험     : 로그인/활동/포인트/구독 기반 이탈 위험 스코어링
 *
 * 탭 전환 전략:
 * - SupportPage와 동일하게 activeTab 상태 + 조건부 렌더링 방식 사용.
 * - 각 탭은 처음 방문(클릭) 시에만 마운트 — visited Set으로 추적.
 * - 마운트 후에는 $visible prop(display:none/block)으로 표시/숨김 처리.
 *   → 탭 로컬 상태(필터, 페이지 등)가 탭 전환 시에도 유지됨.
 */

import { useState, useRef } from 'react';
import styled from 'styled-components';
import ServiceTab from '../components/ServiceTab';
import RecommendationTab from '../components/RecommendationTab';
import SearchTab from '../components/SearchTab';
import BehaviorTab from '../components/BehaviorTab';
import RevenueTab from '../components/RevenueTab';
import PointEconomyTab from '../components/PointEconomyTab';
import AiServiceTab from '../components/AiServiceTab';
import CommunityTab from '../components/CommunityTab';
import EngagementTab from '../components/EngagementTab';
import ContentPerformanceTab from '../components/ContentPerformanceTab';
import ConversionFunnelTab from '../components/ConversionFunnelTab';
import ChurnRiskTab from '../components/ChurnRiskTab';

/** 서브탭 정의 (12개) */
const TABS = [
  { key: 'service',            label: '서비스 통계' },
  { key: 'recommendation',     label: '추천 분석' },
  { key: 'search',             label: '검색 분석' },
  { key: 'behavior',           label: '사용자 행동' },
  { key: 'revenue',            label: '매출' },
  { key: 'pointEconomy',       label: '포인트 경제' },
  { key: 'aiService',          label: 'AI 서비스' },
  { key: 'community',          label: '커뮤니티' },
  { key: 'engagement',         label: '사용자 참여도' },
  { key: 'contentPerformance', label: '콘텐츠 성과' },
  { key: 'conversionFunnel',   label: '전환 퍼널' },
  { key: 'churnRisk',          label: '이탈 위험' },
];

export default function StatsPage() {
  /** 현재 활성 탭 키 */
  const [activeTab, setActiveTab] = useState('service');

  /**
   * 방문한 탭 키 Set.
   * useRef로 관리하여 리렌더링 없이 추적.
   * 최초 탭('service')은 초기값에 포함.
   */
  const visitedRef = useRef(new Set(['service']));

  /**
   * 탭 클릭 핸들러.
   * activeTab을 갱신하고, 처음 방문하는 탭이면 visited에 추가(마운트 허용).
   *
   * @param {string} key - 탭 키
   */
  function handleTabClick(key) {
    visitedRef.current.add(key);
    setActiveTab(key);
  }

  return (
    <Wrapper>
      {/* ── 페이지 헤더 ── */}
      <PageHeader>
        <PageTitle>통계 / 분석</PageTitle>
        <PageDesc>
          서비스 KPI, 추천/검색/사용자 행동, 매출, 포인트 경제, AI 서비스, 커뮤니티, 참여도, 콘텐츠 성과, 전환 퍼널, 이탈 위험 분석을 확인합니다.
        </PageDesc>
      </PageHeader>

      {/* ── 서브탭 네비게이션 ── */}
      <TabNav>
        {TABS.map((tab) => (
          <TabButton
            key={tab.key}
            $active={activeTab === tab.key}
            onClick={() => handleTabClick(tab.key)}
          >
            {tab.label}
          </TabButton>
        ))}
      </TabNav>

      {/* ── 탭 콘텐츠 영역 ── */}
      <TabPanel>
        {/*
         * visited Set에 포함된 탭만 마운트 (처음 클릭 시 마운트, 이후 유지).
         * $visible prop으로 display:none/block 전환 — 로컬 상태 유지.
         */}

        {/* 서비스 통계 */}
        <TabContent $visible={activeTab === 'service'}>
          {visitedRef.current.has('service') && <ServiceTab />}
        </TabContent>

        {/* 추천 분석 */}
        <TabContent $visible={activeTab === 'recommendation'}>
          {visitedRef.current.has('recommendation') && <RecommendationTab />}
        </TabContent>

        {/* 검색 분석 */}
        <TabContent $visible={activeTab === 'search'}>
          {visitedRef.current.has('search') && <SearchTab />}
        </TabContent>

        {/* 사용자 행동 */}
        <TabContent $visible={activeTab === 'behavior'}>
          {visitedRef.current.has('behavior') && <BehaviorTab />}
        </TabContent>

        {/* 매출 */}
        <TabContent $visible={activeTab === 'revenue'}>
          {visitedRef.current.has('revenue') && <RevenueTab />}
        </TabContent>

        {/* 포인트 경제 */}
        <TabContent $visible={activeTab === 'pointEconomy'}>
          {visitedRef.current.has('pointEconomy') && <PointEconomyTab />}
        </TabContent>

        {/* AI 서비스 */}
        <TabContent $visible={activeTab === 'aiService'}>
          {visitedRef.current.has('aiService') && <AiServiceTab />}
        </TabContent>

        {/* 커뮤니티 */}
        <TabContent $visible={activeTab === 'community'}>
          {visitedRef.current.has('community') && <CommunityTab />}
        </TabContent>

        {/* 사용자 참여도 */}
        <TabContent $visible={activeTab === 'engagement'}>
          {visitedRef.current.has('engagement') && <EngagementTab />}
        </TabContent>

        {/* 콘텐츠 성과 */}
        <TabContent $visible={activeTab === 'contentPerformance'}>
          {visitedRef.current.has('contentPerformance') && <ContentPerformanceTab />}
        </TabContent>

        {/* 전환 퍼널 */}
        <TabContent $visible={activeTab === 'conversionFunnel'}>
          {visitedRef.current.has('conversionFunnel') && <ConversionFunnelTab />}
        </TabContent>

        {/* 이탈 위험 */}
        <TabContent $visible={activeTab === 'churnRisk'}>
          {visitedRef.current.has('churnRisk') && <ChurnRiskTab />}
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
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const PageDesc = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.textMuted};
`;

/** 서브탭 네비게이션 바 — SupportPage와 동일한 구조 */
const TabNav = styled.nav`
  display: flex;
  border-bottom: 2px solid ${({ theme }) => theme.colors.border};
  margin-bottom: ${({ theme }) => theme.spacing.xxl};
  gap: 0;
  /* 화면이 좁을 때 가로 스크롤 허용 */
  overflow-x: auto;
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
  /* border-bottom 겹침 보정 — SupportPage와 동일 */
  margin-bottom: -2px;
  transition: all ${({ theme }) => theme.transitions.fast};
  white-space: nowrap;

  &:hover {
    color: ${({ theme }) => theme.colors.primary};
  }
`;

const TabPanel = styled.div``;

/**
 * 탭 콘텐츠 래퍼.
 * $visible=false 일 때 display:none — 컴포넌트 마운트 상태 유지.
 */
const TabContent = styled.div`
  display: ${({ $visible }) => ($visible ? 'block' : 'none')};
`;
