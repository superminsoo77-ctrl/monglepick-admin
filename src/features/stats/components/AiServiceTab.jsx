/**
 * AI 서비스 분석 탭 컴포넌트.
 *
 * 구성:
 * 1. 기간 선택 버튼 그룹 (7d / 30d / 90d)
 * 2. KPI 카드 6개 (전체세션/전체턴/평균턴/오늘세션/오늘턴/추천영화수)
 * 3. AI 세션/턴 일별 추이 ComposedChart (세션 Bar + 턴 Line)
 * 4. 의도(Intent) 분포 PieChart
 * 5. AI 쿼터 소진 현황 카드 5개
 *
 * 데이터 패칭:
 * - Promise.allSettled로 4개 API 병렬 호출
 * - 기간 변경 시 추이 API만 재호출
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import {
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  ComposedChart,
} from 'recharts';
import {
  MdSmartToy,
  MdChatBubble,
  MdSwapVert,
  MdToday,
  MdLocalMovies,
  MdSpeed,
  MdPeople,
  MdToken,
  MdWarning,
} from 'react-icons/md';
import StatsCard from '@/shared/components/StatsCard';
import {
  fetchAiServiceOverview,
  fetchAiSessionTrends,
  fetchAiIntentDistribution,
  fetchAiQuotaStats,
} from '../api/statsApi';

/** 기간 선택 옵션 */
const PERIOD_OPTIONS = [
  { value: '7d', label: '7일' },
  { value: '30d', label: '30일' },
  { value: '90d', label: '90일' },
];

/** 의도 분포 파이차트 색상 */
const INTENT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

/** 숫자 포맷 */
function fmt(val) {
  if (val === null || val === undefined) return '-';
  return Number(val).toLocaleString();
}

/** 커스텀 Tooltip */
function TrendTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <TooltipBox>
      <TooltipDate>{label}</TooltipDate>
      {payload.map((entry) => (
        <TooltipRow key={entry.dataKey}>
          <TooltipDot style={{ background: entry.color }} />
          <TooltipLabel>{entry.name}</TooltipLabel>
          <TooltipValue>{fmt(entry.value)}</TooltipValue>
        </TooltipRow>
      ))}
    </TooltipBox>
  );
}

export default function AiServiceTab() {
  const [period, setPeriod] = useState('30d');

  /* 개요 KPI */
  const [overview, setOverview] = useState(null);
  const [ovLoading, setOvLoading] = useState(true);
  const [ovError, setOvError] = useState(null);

  /* 세션 추이 */
  const [trends, setTrends] = useState(null);
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendError, setTrendError] = useState(null);

  /* 의도 분포 */
  const [intents, setIntents] = useState(null);
  const [intentLoading, setIntentLoading] = useState(true);

  /* 쿼터 현황 */
  const [quota, setQuota] = useState(null);
  const [quotaLoading, setQuotaLoading] = useState(true);

  /** 최초 마운트: 4개 API 병렬 호출 */
  const loadAll = useCallback(async (p) => {
    setOvLoading(true);
    setTrendLoading(true);
    setIntentLoading(true);
    setQuotaLoading(true);
    setOvError(null);
    setTrendError(null);

    const [ovRes, trendRes, intentRes, quotaRes] = await Promise.allSettled([
      fetchAiServiceOverview(),
      fetchAiSessionTrends({ period: p }),
      fetchAiIntentDistribution(),
      fetchAiQuotaStats(),
    ]);

    if (ovRes.status === 'fulfilled') setOverview(ovRes.value);
    else setOvError(ovRes.reason?.message ?? 'AI 개요를 불러올 수 없습니다.');
    setOvLoading(false);

    if (trendRes.status === 'fulfilled') setTrends(trendRes.value);
    else setTrendError(trendRes.reason?.message ?? '추이 데이터를 불러올 수 없습니다.');
    setTrendLoading(false);

    if (intentRes.status === 'fulfilled') setIntents(intentRes.value);
    setIntentLoading(false);

    if (quotaRes.status === 'fulfilled') setQuota(quotaRes.value);
    setQuotaLoading(false);
  }, []);

  /** 기간 변경 시 추이만 재호출 */
  const loadTrends = useCallback(async (p) => {
    setTrendLoading(true);
    setTrendError(null);
    try {
      const data = await fetchAiSessionTrends({ period: p });
      setTrends(data);
    } catch (err) {
      setTrendError(err?.message ?? '추이 데이터를 불러올 수 없습니다.');
    } finally {
      setTrendLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll(period);
  }, [loadAll]); // eslint-disable-line react-hooks/exhaustive-deps

  function handlePeriodChange(p) {
    setPeriod(p);
    loadTrends(p);
  }

  /* 안전 접근 */
  const ov = overview ?? {};
  const trendItems = trends?.trends ?? [];
  const intentItems = intents?.intents ?? [];
  const q = quota ?? {};

  /** KPI 카드 정의 */
  const kpiCards = [
    { key: 'sessions', icon: <MdChatBubble size={18} />, title: '전체 세션', value: ovLoading ? '...' : fmt(ov.totalSessions), subtitle: '누적 AI 채팅 세션 수', status: 'info' },
    { key: 'turns', icon: <MdSwapVert size={18} />, title: '전체 턴', value: ovLoading ? '...' : fmt(ov.totalTurns), subtitle: '누적 대화 턴 수', status: 'info' },
    { key: 'avgTurns', icon: <MdSmartToy size={18} />, title: '세션당 평균 턴', value: ovLoading ? '...' : `${ov.avgTurnsPerSession ?? 0}회`, subtitle: '세션 1회당 대화 깊이', status: 'success' },
    { key: 'todaySessions', icon: <MdToday size={18} />, title: '오늘 세션', value: ovLoading ? '...' : fmt(ov.todaySessions), subtitle: '오늘 생성된 세션', status: 'success' },
    { key: 'todayTurns', icon: <MdToday size={18} />, title: '오늘 턴', value: ovLoading ? '...' : fmt(ov.todayTurns), subtitle: '오늘 발생한 턴', status: 'info' },
    { key: 'movies', icon: <MdLocalMovies size={18} />, title: '추천 영화', value: ovLoading ? '...' : `${fmt(ov.totalRecommendedMovies)}편`, subtitle: '누적 추천된 영화 수', status: 'success' },
  ];

  /** 쿼터 카드 정의 */
  const quotaCards = [
    { key: 'quotaUsers', icon: <MdPeople size={18} />, title: '쿼터 사용자', value: quotaLoading ? '...' : `${fmt(q.totalQuotaUsers)}명`, subtitle: 'AI 쿼터 보유 사용자', status: 'info' },
    { key: 'avgDaily', icon: <MdSpeed size={18} />, title: '평균 일일 사용', value: quotaLoading ? '...' : `${q.avgDailyUsage ?? 0}회`, subtitle: '일일 평균 AI 사용 횟수', status: 'info' },
    { key: 'avgMonthly', icon: <MdSpeed size={18} />, title: '평균 월간 쿠폰', value: quotaLoading ? '...' : `${q.avgMonthlyUsage ?? 0}회`, subtitle: '월간 평균 쿠폰 사용', status: 'info' },
    { key: 'tokens', icon: <MdToken size={18} />, title: '구매 이용권', value: quotaLoading ? '...' : `${fmt(q.totalPurchasedTokens)}개`, subtitle: '전체 보유 이용권 수', status: 'success' },
    { key: 'exhausted', icon: <MdWarning size={18} />, title: '한도 소진', value: quotaLoading ? '...' : `${fmt(q.exhaustedUsers)}명`, subtitle: '일일 무료 한도 소진 사용자', status: q.exhaustedUsers > 0 ? 'warning' : 'success' },
  ];

  return (
    <Wrapper>
      {/* ── 기간 선택 ── */}
      <FilterRow>
        <FilterLabel>추이 기간</FilterLabel>
        <PeriodGroup>
          {PERIOD_OPTIONS.map((opt) => (
            <PeriodButton key={opt.value} $active={period === opt.value} onClick={() => handlePeriodChange(opt.value)}>
              {opt.label}
            </PeriodButton>
          ))}
        </PeriodGroup>
      </FilterRow>

      {/* ── KPI 카드 ── */}
      <SectionLabel>AI 서비스 지표</SectionLabel>
      {ovError && <ErrorMsg>{ovError}</ErrorMsg>}
      <KpiGrid>
        {kpiCards.map((card) => (
          <StatsCard key={card.key} icon={card.icon} title={card.title} value={card.value} subtitle={card.subtitle} status={card.status} />
        ))}
      </KpiGrid>

      {/* ── 세션/턴 일별 추이 ── */}
      <SectionLabel style={{ marginTop: '32px' }}>일별 세션 / 턴 추이</SectionLabel>
      {trendError && <ErrorMsg>{trendError}</ErrorMsg>}
      <ChartCard>
        <ChartBody>
          {trendLoading ? (
            <LoadingMsg>차트 데이터를 불러오는 중...</LoadingMsg>
          ) : trendItems.length === 0 ? (
            <LoadingMsg>표시할 추이 데이터가 없습니다.</LoadingMsg>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={trendItems} margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip content={<TrendTooltip />} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar yAxisId="left" dataKey="sessions" name="세션 수" fill="#6366f1" radius={[3, 3, 0, 0]} barSize={period === '7d' ? 28 : period === '30d' ? 12 : 6} />
                <Line yAxisId="right" type="monotone" dataKey="turns" name="턴 수" stroke="#10b981" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartBody>
      </ChartCard>

      {/* ── 의도 분포 PieChart ── */}
      <SectionLabel style={{ marginTop: '32px' }}>사용자 의도(Intent) 분포</SectionLabel>
      <ChartCard>
        <ChartBody>
          {intentLoading ? (
            <LoadingMsg>데이터를 불러오는 중...</LoadingMsg>
          ) : intentItems.length === 0 ? (
            <LoadingMsg>표시할 의도 데이터가 없습니다.</LoadingMsg>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={intentItems}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius={110}
                  label={({ name, percentage }) => `${name} ${percentage}%`}
                  labelLine={true}
                >
                  {intentItems.map((_, idx) => (
                    <Cell key={`intent-${idx}`} fill={INTENT_COLORS[idx % INTENT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [`${fmt(value)}건`, name]}
                  contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartBody>
      </ChartCard>

      {/* ── AI 쿼터 소진 현황 ── */}
      <SectionLabel style={{ marginTop: '32px' }}>AI 쿼터 소진 현황</SectionLabel>
      <KpiGrid>
        {quotaCards.map((card) => (
          <StatsCard key={card.key} icon={card.icon} title={card.title} value={card.value} subtitle={card.subtitle} status={card.status} />
        ))}
      </KpiGrid>
    </Wrapper>
  );
}

/* ── styled-components ── */

const Wrapper = styled.div``;

const FilterRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.lg};
  margin-bottom: ${({ theme }) => theme.spacing.xxl};
`;

const FilterLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const PeriodGroup = styled.div`
  display: flex;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  overflow: hidden;
`;

const PeriodButton = styled.button`
  padding: 5px ${({ theme }) => theme.spacing.lg};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ $active, theme }) => ($active ? '#ffffff' : theme.colors.textSecondary)};
  background: ${({ $active, theme }) => ($active ? theme.colors.primary : 'transparent')};
  transition: all ${({ theme }) => theme.transitions.fast};
  white-space: nowrap;
  & + & { border-left: 1px solid ${({ theme }) => theme.colors.border}; }
  &:hover { background: ${({ $active, theme }) => ($active ? theme.colors.primaryHover : theme.colors.bgHover)}; }
`;

const SectionLabel = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const ErrorMsg = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.error};
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid #fecaca;
  border-radius: 6px;
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const KpiGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: ${({ theme }) => theme.spacing.lg};
  margin-bottom: ${({ theme }) => theme.spacing.xxl};
`;

const ChartCard = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  padding: ${({ theme }) => theme.spacing.xl};
  box-shadow: ${({ theme }) => theme.shadows.card};
`;

const ChartBody = styled.div`
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const LoadingMsg = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.textMuted};
  text-align: center;
`;

/* ── 커스텀 Tooltip 스타일 ── */
const TooltipBox = styled.div`
  background: #ffffff;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  min-width: 160px;
`;

const TooltipDate = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const TooltipRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.xs};
`;

const TooltipDot = styled.span`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
`;

const TooltipLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  flex: 1;
`;

const TooltipValue = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;
