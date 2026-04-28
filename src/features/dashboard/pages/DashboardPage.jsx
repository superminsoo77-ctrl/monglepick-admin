/**
 * 대시보드 메인 페이지.
 *
 * 4섹션 구조:
 * 1. KPI 카드     : 핵심 지표 6개 (회원/구독/결제/신고/AI 채팅)
 * 2. 추이 차트    : 신규 가입 + 활성 사용자 + 결제 금액 (7/14/30일)
 * 3. 서비스 현황  : 미니 차트 4개 (구독 분포/등급 분포/AI 의도/이탈 위험)
 * 4. 최근 활동    : 최신 활동 피드 최대 20건
 *
 * 데이터 패칭 전략:
 * - Promise.allSettled로 3개 API를 병렬 호출
 * - 한 API가 실패해도 나머지 섹션은 정상 표시
 * - 섹션별 독립 에러 메시지 표시
 *
 * 추이 차트 기간 변경 시에만 trends API를 재호출 (KPI/활동 유지).
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { MdRefresh } from 'react-icons/md';
import { fetchKpi, fetchTrends, fetchRecentActivities } from '../api/dashboardApi';
import {
  fetchSubscription,
  fetchGradeDistribution,
  fetchAiIntentDistribution,
  fetchChurnRiskOverview,
} from '../../stats/api/statsApi';
import KpiCards from '../components/KpiCards';
import TrendChart from '../components/TrendChart';
import RecentActivity from '../components/RecentActivity';
import DashboardCharts from '../components/DashboardCharts';

/** 기본 추이 기간: 7일 */
const DEFAULT_DAYS = 7;

/** 최근 활동 최대 조회 건수 */
const ACTIVITY_SIZE = 20;

export default function DashboardPage() {
  /* ── KPI 상태 ── */
  const [kpiData, setKpiData] = useState(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [kpiError, setKpiError] = useState(null);

  /* ── 추이 차트 상태 ── */
  const [trendsData, setTrendsData] = useState([]);
  const [trendsLoading, setTrendsLoading] = useState(true);
  const [trendsError, setTrendsError] = useState(null);
  const [selectedDays, setSelectedDays] = useState(DEFAULT_DAYS);

  /* ── 최근 활동 상태 ── */
  const [activityData, setActivityData] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState(null);

  /* ── 미니 차트 데이터 상태 ── */
  const [chartData, setChartData] = useState({
    subscription: null,
    grades: null,
    intents: null,
    churnRisk: null,
  });
  const [chartsLoading, setChartsLoading] = useState(true);

  /* ── 전체 마지막 갱신 시간 ── */
  const [lastUpdated, setLastUpdated] = useState(null);

  /**
   * KPI + 추이 + 활동 3개 API를 병렬 호출.
   * Promise.allSettled 사용 — 일부 실패해도 성공한 섹션은 표시.
   *
   * @param {number} days - 추이 기간
   */
  const loadAll = useCallback(async (days) => {
    /* 각 섹션 로딩 시작 */
    setKpiLoading(true);
    setTrendsLoading(true);
    setActivityLoading(true);
    setChartsLoading(true);
    setKpiError(null);
    setTrendsError(null);
    setActivityError(null);

    const [kpiResult, trendsResult, activityResult, subResult, gradeResult, intentResult, churnResult] =
      await Promise.allSettled([
        fetchKpi(),
        fetchTrends({ days }),
        fetchRecentActivities({ size: ACTIVITY_SIZE }),
        fetchSubscription(),
        fetchGradeDistribution(),
        fetchAiIntentDistribution(),
        fetchChurnRiskOverview(),
      ]);

    /* KPI 처리 */
    if (kpiResult.status === 'fulfilled') {
      setKpiData(kpiResult.value);
    } else {
      setKpiError(kpiResult.reason?.message ?? 'KPI 데이터를 불러올 수 없습니다.');
    }
    setKpiLoading(false);

    /* 추이 처리 */
    if (trendsResult.status === 'fulfilled') {
      setTrendsData(Array.isArray(trendsResult.value) ? trendsResult.value : []);
    } else {
      setTrendsError(trendsResult.reason?.message ?? '추이 데이터를 불러올 수 없습니다.');
    }
    setTrendsLoading(false);

    /* 최근 활동 처리 */
    if (activityResult.status === 'fulfilled') {
      setActivityData(Array.isArray(activityResult.value) ? activityResult.value : []);
    } else {
      setActivityError(activityResult.reason?.message ?? '최근 활동을 불러올 수 없습니다.');
    }
    setActivityLoading(false);

    /* 미니 차트 데이터 처리 — 개별 실패해도 나머지 표시 */
    setChartData({
      subscription: subResult.status === 'fulfilled' ? subResult.value : null,
      grades: gradeResult.status === 'fulfilled' ? gradeResult.value : null,
      intents: intentResult.status === 'fulfilled' ? intentResult.value : null,
      churnRisk: churnResult.status === 'fulfilled' ? churnResult.value : null,
    });
    setChartsLoading(false);

    /* 마지막 갱신 시간 기록 */
    setLastUpdated(new Date());
  }, []);

  /**
   * 추이 차트 기간 변경 시 trends API만 재호출.
   * KPI와 활동 피드는 유지.
   *
   * @param {number} days - 새로운 기간 (7 | 14 | 30)
   */
  const loadTrends = useCallback(async (days) => {
    setTrendsLoading(true);
    setTrendsError(null);
    try {
      const result = await fetchTrends({ days });
      setTrendsData(Array.isArray(result) ? result : []);
    } catch (err) {
      setTrendsError(err?.message ?? '추이 데이터를 불러올 수 없습니다.');
    } finally {
      setTrendsLoading(false);
    }
  }, []);

  /**
   * 최근 활동 새로고침 (활동 섹션만).
   */
  const refreshActivity = useCallback(async () => {
    setActivityLoading(true);
    setActivityError(null);
    try {
      const result = await fetchRecentActivities({ size: ACTIVITY_SIZE });
      setActivityData(Array.isArray(result) ? result : []);
    } catch (err) {
      setActivityError(err?.message ?? '최근 활동을 불러올 수 없습니다.');
    } finally {
      setActivityLoading(false);
    }
  }, []);

  /* 최초 마운트 시 전체 데이터 로드 */
  useEffect(() => {
    loadAll(DEFAULT_DAYS);
  }, [loadAll]);

  /**
   * 기간 변경 핸들러.
   * selectedDays를 갱신하고 trends만 재호출.
   *
   * @param {number} days
   */
  function handleDaysChange(days) {
    setSelectedDays(days);
    loadTrends(days);
  }

  /**
   * 전체 새로고침 핸들러.
   * 헤더 새로고침 버튼에 연결.
   */
  function handleRefreshAll() {
    loadAll(selectedDays);
  }

  /** 마지막 갱신 시간 포맷 (HH:MM:SS) */
  function formatTime(date) {
    if (!date) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  return (
    <Wrapper>
      {/* ── 페이지 헤더 ── */}
      <PageHeader>
        <HeaderLeft>
          <PageTitle>대시보드</PageTitle>
          <PageDesc>
            서비스 핵심 지표와 최근 활동을 한눈에 확인합니다.
          </PageDesc>
        </HeaderLeft>
        <HeaderRight>
          {lastUpdated && (
            <LastUpdated>마지막 갱신: {formatTime(lastUpdated)}</LastUpdated>
          )}
          <RefreshAllButton
            onClick={handleRefreshAll}
            disabled={kpiLoading || trendsLoading || activityLoading}
            title="전체 새로고침"
          >
            <MdRefresh size={16} />
            전체 새로고침
          </RefreshAllButton>
        </HeaderRight>
      </PageHeader>

      {/* ── 섹션 1: KPI 카드 ── */}
      <Section>
        <SectionLabel>핵심 지표</SectionLabel>
        {kpiError && <SectionError>{kpiError}</SectionError>}
        <KpiCards data={kpiData} loading={kpiLoading} />
      </Section>

      {/* ── 섹션 2: 추이 차트 ── */}
      <Section>
        <SectionLabel>추이 분석</SectionLabel>
        {trendsError && <SectionError>{trendsError}</SectionError>}
        <TrendChart
          data={trendsData}
          loading={trendsLoading}
          days={selectedDays}
          onDaysChange={handleDaysChange}
        />
      </Section>

      {/* ── 섹션 3: 서비스 현황 미니 차트 (4개) ── */}
      <Section>
        <SectionLabel>서비스 현황</SectionLabel>
        <DashboardCharts
          subscription={chartData.subscription}
          grades={chartData.grades}
          intents={chartData.intents}
          churnRisk={chartData.churnRisk}
          loading={chartsLoading}
        />
      </Section>

      {/* ── 섹션 4: 최근 활동 ── */}
      <Section>
        <SectionLabel>최근 활동</SectionLabel>
        {activityError && <SectionError>{activityError}</SectionError>}
        <RecentActivity
          data={activityData}
          loading={activityLoading}
          onRefresh={refreshActivity}
        />
      </Section>
    </Wrapper>
  );
}

/* ── styled-components ── */

const Wrapper = styled.div``;

const PageHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.lg};
  margin-bottom: ${({ theme }) => theme.spacing.xxl};
`;

const HeaderLeft = styled.div``;

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

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
`;

const LastUpdated = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
`;

const RefreshAllButton = styled.button`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: 7px ${({ theme }) => theme.spacing.lg};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  background: ${({ theme }) => theme.colors.bgCard};
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.bgHover};
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

/**
 * 섹션 래퍼.
 * 각 섹션 사이에 간격을 부여하고 섹션 레이블을 표시.
 */
const Section = styled.section`
  margin-bottom: ${({ theme }) => theme.spacing.xxxl};
`;

/**
 * 섹션 레이블.
 * 본문 상단에 작은 회색 텍스트로 섹션 구분.
 */
const SectionLabel = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

/** 섹션별 에러 메시지 */
const SectionError = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.error};
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid #fecaca;
  border-radius: 6px;
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;
