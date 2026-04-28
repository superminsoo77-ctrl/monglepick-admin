/**
 * 커뮤니티 분석 탭 컴포넌트.
 *
 * 구성:
 * 1. 기간 선택 버튼 그룹 (7d / 30d / 90d)
 * 2. KPI 카드 6개 (전체게시글/전체댓글/전체신고/미처리신고/오늘게시글/오늘댓글)
 * 3. 게시글/댓글/신고 일별 추이 ComposedChart
 * 4. 카테고리별 게시글 분포 BarChart + 신고 상태별 분포 PieChart (2열)
 * 5. 독성 점수 구간 분포 BarChart + 신고 분석 KPI 카드
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
  MdArticle,
  MdComment,
  MdFlag,
  MdPendingActions,
  MdToday,
  MdCheckCircle,
  MdWarning,
  MdShield,
} from 'react-icons/md';
import StatsCard from '@/shared/components/StatsCard';
import {
  fetchCommunityOverview,
  fetchCommunityTrends,
  fetchPostCategoryDistribution,
  fetchReportAnalysis,
} from '../api/statsApi';

/** 기간 선택 옵션 */
const PERIOD_OPTIONS = [
  { value: '7d', label: '7일' },
  { value: '30d', label: '30일' },
  { value: '90d', label: '90일' },
];

/** 카테고리 바차트 색상 */
const CATEGORY_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

/** 신고 상태 파이차트 색상 */
const STATUS_COLORS = {
  pending: '#f59e0b',
  reviewed: '#3b82f6',
  resolved: '#10b981',
  dismissed: '#94a3b8',
};

/** 독성 구간 바차트 색상 — 낮은 구간은 초록, 높은 구간은 빨강 */
const TOXICITY_COLORS = ['#10b981', '#84cc16', '#f59e0b', '#f97316', '#ef4444'];

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
          <TooltipValue>{fmt(entry.value)}건</TooltipValue>
        </TooltipRow>
      ))}
    </TooltipBox>
  );
}

export default function CommunityTab() {
  const [period, setPeriod] = useState('30d');

  /* 개요 KPI */
  const [overview, setOverview] = useState(null);
  const [ovLoading, setOvLoading] = useState(true);
  const [ovError, setOvError] = useState(null);

  /* 일별 추이 */
  const [trends, setTrends] = useState(null);
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendError, setTrendError] = useState(null);

  /* 카테고리 분포 */
  const [categories, setCategories] = useState(null);
  const [catLoading, setCatLoading] = useState(true);

  /* 신고/독성 분석 */
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(true);

  /** 최초 마운트: 4개 API 병렬 호출 */
  const loadAll = useCallback(async (p) => {
    setOvLoading(true);
    setTrendLoading(true);
    setCatLoading(true);
    setReportLoading(true);
    setOvError(null);
    setTrendError(null);

    const [ovRes, trendRes, catRes, reportRes] = await Promise.allSettled([
      fetchCommunityOverview(),
      fetchCommunityTrends({ period: p }),
      fetchPostCategoryDistribution(),
      fetchReportAnalysis(),
    ]);

    if (ovRes.status === 'fulfilled') setOverview(ovRes.value);
    else setOvError(ovRes.reason?.message ?? '커뮤니티 개요를 불러올 수 없습니다.');
    setOvLoading(false);

    if (trendRes.status === 'fulfilled') setTrends(trendRes.value);
    else setTrendError(trendRes.reason?.message ?? '추이 데이터를 불러올 수 없습니다.');
    setTrendLoading(false);

    if (catRes.status === 'fulfilled') setCategories(catRes.value);
    setCatLoading(false);

    if (reportRes.status === 'fulfilled') setReportData(reportRes.value);
    setReportLoading(false);
  }, []);

  /** 기간 변경 시 추이만 재호출 */
  const loadTrends = useCallback(async (p) => {
    setTrendLoading(true);
    setTrendError(null);
    try {
      const data = await fetchCommunityTrends({ period: p });
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
  const catItems = categories?.categories ?? [];
  const rd = reportData ?? {};
  const statusDist = rd.statusDistribution ?? [];
  const toxBuckets = rd.toxicityBuckets ?? [];

  /** KPI 카드 정의 */
  const kpiCards = [
    { key: 'posts', icon: <MdArticle size={18} />, title: '전체 게시글', value: ovLoading ? '...' : fmt(ov.totalPosts), subtitle: 'PUBLISHED 게시글 수', status: 'info' },
    { key: 'comments', icon: <MdComment size={18} />, title: '전체 댓글', value: ovLoading ? '...' : fmt(ov.totalComments), subtitle: '유효 댓글 수', status: 'info' },
    { key: 'reports', icon: <MdFlag size={18} />, title: '전체 신고', value: ovLoading ? '...' : fmt(ov.totalReports), subtitle: '누적 신고 접수', status: 'warning' },
    { key: 'pending', icon: <MdPendingActions size={18} />, title: '미처리 신고', value: ovLoading ? '...' : fmt(ov.pendingReports), subtitle: '대기 중인 신고', status: ov.pendingReports > 0 ? 'error' : 'success' },
    { key: 'todayPosts', icon: <MdToday size={18} />, title: '오늘 게시글', value: ovLoading ? '...' : fmt(ov.todayPosts), subtitle: '오늘 작성된 게시글', status: 'success' },
    { key: 'todayComments', icon: <MdToday size={18} />, title: '오늘 댓글', value: ovLoading ? '...' : fmt(ov.todayComments), subtitle: '오늘 작성된 댓글', status: 'success' },
  ];

  /** 신고 분석 카드 */
  const reportCards = [
    { key: 'resolvedRate', icon: <MdCheckCircle size={18} />, title: '처리 완료율', value: reportLoading ? '...' : `${rd.resolvedRate ?? 0}%`, subtitle: '처리 완료 + 기각 비율', status: (rd.resolvedRate ?? 0) >= 80 ? 'success' : 'warning' },
    { key: 'avgTox', icon: <MdShield size={18} />, title: '평균 독성 점수', value: reportLoading ? '...' : `${rd.avgToxicityScore ?? 0}`, subtitle: '신고 콘텐츠 평균 독성 (0~1)', status: (rd.avgToxicityScore ?? 0) > 0.5 ? 'error' : 'success' },
    { key: 'totalReports', icon: <MdWarning size={18} />, title: '분석 대상 신고', value: reportLoading ? '...' : fmt(rd.totalReports), subtitle: '전체 신고 건수', status: 'info' },
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
      <SectionLabel>커뮤니티 지표</SectionLabel>
      {ovError && <ErrorMsg>{ovError}</ErrorMsg>}
      <KpiGrid>
        {kpiCards.map((card) => (
          <StatsCard key={card.key} icon={card.icon} title={card.title} value={card.value} subtitle={card.subtitle} status={card.status} />
        ))}
      </KpiGrid>

      {/* ── 일별 추이 ── */}
      <SectionLabel style={{ marginTop: '32px' }}>일별 게시글 / 댓글 / 신고 추이</SectionLabel>
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
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip content={<TrendTooltip />} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="posts" name="게시글" fill="#6366f1" radius={[3, 3, 0, 0]} barSize={period === '7d' ? 20 : period === '30d' ? 8 : 5} />
                <Bar dataKey="comments" name="댓글" fill="#10b981" radius={[3, 3, 0, 0]} barSize={period === '7d' ? 20 : period === '30d' ? 8 : 5} />
                <Line type="monotone" dataKey="reports" name="신고" stroke="#ef4444" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartBody>
      </ChartCard>

      {/* ── 카테고리 분포 + 신고 상태 분포 (2열) ── */}
      <TwoColGrid>
        {/* 카테고리별 게시글 분포 */}
        <ChartCard>
          <ChartTitle>카테고리별 게시글 분포</ChartTitle>
          <ChartBody>
            {catLoading ? (
              <LoadingMsg>데이터를 불러오는 중...</LoadingMsg>
            ) : catItems.length === 0 ? (
              <LoadingMsg>표시할 데이터가 없습니다.</LoadingMsg>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={catItems} layout="vertical" margin={{ top: 4, right: 24, left: 80, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip
                    formatter={(value) => [`${fmt(value)}건`]}
                    contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }}
                  />
                  <Bar dataKey="count" name="게시글 수" radius={[0, 4, 4, 0]} barSize={24}>
                    {catItems.map((_, idx) => (
                      <Cell key={`cat-${idx}`} fill={CATEGORY_COLORS[idx % CATEGORY_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartBody>
        </ChartCard>

        {/* 신고 상태별 분포 PieChart */}
        <ChartCard>
          <ChartTitle>신고 상태별 분포</ChartTitle>
          <ChartBody>
            {reportLoading ? (
              <LoadingMsg>데이터를 불러오는 중...</LoadingMsg>
            ) : statusDist.length === 0 ? (
              <LoadingMsg>표시할 데이터가 없습니다.</LoadingMsg>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={statusDist}
                    dataKey="count"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, percentage }) => `${name} ${percentage}%`}
                    labelLine={true}
                  >
                    {statusDist.map((item) => (
                      <Cell key={item.status} fill={STATUS_COLORS[item.status] || '#94a3b8'} />
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
      </TwoColGrid>

      {/* ── 독성 분석 ── */}
      <SectionLabel style={{ marginTop: '32px' }}>신고 / 독성 분석</SectionLabel>
      <KpiGrid style={{ marginBottom: '16px' }}>
        {reportCards.map((card) => (
          <StatsCard key={card.key} icon={card.icon} title={card.title} value={card.value} subtitle={card.subtitle} status={card.status} />
        ))}
      </KpiGrid>

      {/* 독성 점수 구간 분포 */}
      <ChartCard>
        <ChartTitle>독성 점수 구간 분포</ChartTitle>
        <ChartBody>
          {reportLoading ? (
            <LoadingMsg>데이터를 불러오는 중...</LoadingMsg>
          ) : toxBuckets.length === 0 ? (
            <LoadingMsg>독성 분석 데이터가 없습니다.</LoadingMsg>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={toxBuckets} margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="range" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value) => [`${fmt(value)}건`]}
                  contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }}
                />
                <Bar dataKey="count" name="신고 건수" radius={[4, 4, 0, 0]} barSize={48}>
                  {toxBuckets.map((_, idx) => (
                    <Cell key={`tox-${idx}`} fill={TOXICITY_COLORS[idx % TOXICITY_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
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
  margin-top: 32px;
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
  min-height: 280px;
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
