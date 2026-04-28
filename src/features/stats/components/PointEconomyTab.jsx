/**
 * 포인트 경제 분석 탭 컴포넌트.
 *
 * 구성:
 * 1. 기간 선택 버튼 그룹 (7d / 30d / 90d)
 * 2. KPI 카드 6개 (총발행/총소비/전체잔액/활성사용자/오늘발행/오늘소비)
 * 3. 포인트 유형별 분포 PieChart (earn/spend/bonus/expire/refund/revoke)
 * 4. 등급별 사용자 분포 BarChart (6등급 팝콘 테마)
 * 5. 일별 포인트 발행/소비 추이 ComposedChart (발행 Bar + 소비 Bar + 순유입 Line)
 *
 * 데이터 패칭:
 * - Promise.allSettled로 4개 API 병렬 호출
 * - 기간 변경 시 추이 API만 재호출 (KPI/분포는 전체 기간)
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import {
  BarChart,
  Bar,
  LineChart,
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
  MdAccountBalanceWallet,
  MdTrendingUp,
  MdTrendingDown,
  MdPeople,
  MdToday,
  MdStars,
} from 'react-icons/md';
import StatsCard from '@/shared/components/StatsCard';
import {
  fetchPointEconomyOverview,
  fetchPointTypeDistribution,
  fetchGradeDistribution,
  fetchPointTrends,
} from '../api/statsApi';

/** 기간 선택 옵션 */
const PERIOD_OPTIONS = [
  { value: '7d', label: '7일' },
  { value: '30d', label: '30일' },
  { value: '90d', label: '90일' },
];

/** 포인트 유형별 파이차트 색상 */
const TYPE_COLORS = ['#10b981', '#ef4444', '#6366f1', '#94a3b8', '#f59e0b', '#8b5cf6'];

/** 등급별 바차트 색상 (팝콘 테마) */
const GRADE_COLORS = {
  NORMAL: '#94a3b8',
  BRONZE: '#cd7f32',
  SILVER: '#a8a9ad',
  GOLD: '#ffd700',
  PLATINUM: '#6366f1',
  DIAMOND: '#ec4899',
};

/** 숫자 포맷 (천 단위 콤마) */
function fmt(val) {
  if (val === null || val === undefined) return '-';
  return Number(val).toLocaleString();
}

/** 포인트 축약 포맷 (1000 → 1K, 1000000 → 1M) */
function fmtAxis(v) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

/** 커스텀 Tooltip (일별 추이 차트용) */
function TrendTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <TooltipBox>
      <TooltipDate>{label}</TooltipDate>
      {payload.map((entry) => (
        <TooltipRow key={entry.dataKey}>
          <TooltipDot style={{ background: entry.color }} />
          <TooltipLabel>{entry.name}</TooltipLabel>
          <TooltipValue>{fmt(entry.value)}P</TooltipValue>
        </TooltipRow>
      ))}
    </TooltipBox>
  );
}

export default function PointEconomyTab() {
  const [period, setPeriod] = useState('30d');

  /* 개요 KPI */
  const [overview, setOverview] = useState(null);
  const [ovLoading, setOvLoading] = useState(true);
  const [ovError, setOvError] = useState(null);

  /* 유형별 분포 */
  const [typeDist, setTypeDist] = useState(null);
  const [typeLoading, setTypeLoading] = useState(true);

  /* 등급 분포 */
  const [gradeDist, setGradeDist] = useState(null);
  const [gradeLoading, setGradeLoading] = useState(true);

  /* 일별 추이 */
  const [trends, setTrends] = useState(null);
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendError, setTrendError] = useState(null);

  /** 최초 마운트: 4개 API 병렬 호출 */
  const loadAll = useCallback(async (p) => {
    setOvLoading(true);
    setTypeLoading(true);
    setGradeLoading(true);
    setTrendLoading(true);
    setOvError(null);
    setTrendError(null);

    const [ovRes, typeRes, gradeRes, trendRes] = await Promise.allSettled([
      fetchPointEconomyOverview(),
      fetchPointTypeDistribution(),
      fetchGradeDistribution(),
      fetchPointTrends({ period: p }),
    ]);

    if (ovRes.status === 'fulfilled') setOverview(ovRes.value);
    else setOvError(ovRes.reason?.message ?? '포인트 개요를 불러올 수 없습니다.');
    setOvLoading(false);

    if (typeRes.status === 'fulfilled') setTypeDist(typeRes.value);
    setTypeLoading(false);

    if (gradeRes.status === 'fulfilled') setGradeDist(gradeRes.value);
    setGradeLoading(false);

    if (trendRes.status === 'fulfilled') setTrends(trendRes.value);
    else setTrendError(trendRes.reason?.message ?? '추이 데이터를 불러올 수 없습니다.');
    setTrendLoading(false);
  }, []);

  /** 기간 변경 시 추이만 재호출 */
  const loadTrends = useCallback(async (p) => {
    setTrendLoading(true);
    setTrendError(null);
    try {
      const data = await fetchPointTrends({ period: p });
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
  const typeItems = typeDist?.distribution ?? [];
  const gradeItems = gradeDist?.grades ?? [];
  const trendItems = trends?.trends ?? [];

  /** KPI 카드 정의 */
  const kpiCards = [
    { key: 'issued', icon: <MdTrendingUp size={18} />, title: '총 발행', value: ovLoading ? '...' : `${fmt(ov.totalIssued)}P`, subtitle: '전체 기간 발행 포인트', status: 'success' },
    { key: 'spent', icon: <MdTrendingDown size={18} />, title: '총 소비', value: ovLoading ? '...' : `${fmt(ov.totalSpent)}P`, subtitle: '전체 기간 소비 포인트', status: 'error' },
    { key: 'balance', icon: <MdAccountBalanceWallet size={18} />, title: '전체 잔액', value: ovLoading ? '...' : `${fmt(ov.totalBalance)}P`, subtitle: '전체 사용자 포인트 합계', status: 'info' },
    { key: 'active', icon: <MdPeople size={18} />, title: '활성 사용자', value: ovLoading ? '...' : `${fmt(ov.activeUsers)}명`, subtitle: '포인트 잔액 > 0', status: 'info' },
    { key: 'todayIssued', icon: <MdToday size={18} />, title: '오늘 발행', value: ovLoading ? '...' : `${fmt(ov.todayIssued)}P`, subtitle: '오늘 발행된 포인트', status: 'success' },
    { key: 'todaySpent', icon: <MdToday size={18} />, title: '오늘 소비', value: ovLoading ? '...' : `${fmt(ov.todaySpent)}P`, subtitle: '오늘 소비된 포인트', status: 'warning' },
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
      <SectionLabel>포인트 경제 지표</SectionLabel>
      {ovError && <ErrorMsg>{ovError}</ErrorMsg>}
      <KpiGrid>
        {kpiCards.map((card) => (
          <StatsCard key={card.key} icon={card.icon} title={card.title} value={card.value} subtitle={card.subtitle} status={card.status} />
        ))}
      </KpiGrid>

      {/* ── 유형별 분포 + 등급 분포 2열 ── */}
      <TwoColGrid>
        {/* 포인트 유형별 분포 PieChart */}
        <ChartCard>
          <ChartTitle>포인트 유형별 분포</ChartTitle>
          <ChartBody>
            {typeLoading ? (
              <LoadingMsg>데이터를 불러오는 중...</LoadingMsg>
            ) : typeItems.length === 0 ? (
              <LoadingMsg>표시할 데이터가 없습니다.</LoadingMsg>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={typeItems}
                    dataKey="count"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, percentage }) => `${name} ${percentage}%`}
                    labelLine={true}
                  >
                    {typeItems.map((_, idx) => (
                      <Cell key={`type-${idx}`} fill={TYPE_COLORS[idx % TYPE_COLORS.length]} />
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

        {/* 등급별 사용자 분포 BarChart */}
        <ChartCard>
          <ChartTitle>등급별 사용자 분포</ChartTitle>
          <ChartBody>
            {gradeLoading ? (
              <LoadingMsg>데이터를 불러오는 중...</LoadingMsg>
            ) : gradeItems.length === 0 ? (
              <LoadingMsg>표시할 데이터가 없습니다.</LoadingMsg>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={gradeItems} margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="gradeName" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(value, name) => [`${fmt(value)}명`, name]}
                    contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }}
                  />
                  <Bar dataKey="count" name="사용자 수" radius={[4, 4, 0, 0]} barSize={40}>
                    {gradeItems.map((item) => (
                      <Cell key={item.gradeCode} fill={GRADE_COLORS[item.gradeCode] || '#94a3b8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartBody>
        </ChartCard>
      </TwoColGrid>

      {/* ── 일별 포인트 추이 ── */}
      <SectionLabel style={{ marginTop: '32px' }}>일별 포인트 발행 / 소비 추이</SectionLabel>
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
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmtAxis} />
                <Tooltip content={<TrendTooltip />} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="issued" name="발행" fill="#10b981" radius={[3, 3, 0, 0]} barSize={period === '7d' ? 24 : period === '30d' ? 10 : 6} />
                <Bar dataKey="spent" name="소비" fill="#ef4444" radius={[3, 3, 0, 0]} barSize={period === '7d' ? 24 : period === '30d' ? 10 : 6} />
                <Line type="monotone" dataKey="netFlow" name="순유입" stroke="#6366f1" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartBody>
      </ChartCard>
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

const TwoColGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: ${({ theme }) => theme.spacing.lg};
`;

const ChartCard = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  padding: ${({ theme }) => theme.spacing.xl};
  box-shadow: ${({ theme }) => theme.shadows.card};
`;

const ChartTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.heading};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
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
