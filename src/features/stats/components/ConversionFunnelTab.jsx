/**
 * 전환 퍼널 분석 탭 컴포넌트.
 *
 * 구성:
 * 1. 기간 선택 버튼 그룹 (7d / 30d / 90d)
 * 2. 퍼널 시각화 — 6단계 깔때기형 (가입→활동→AI→리뷰→구독→결제)
 * 3. 단계별 전환율 카드 5개 (각 단계 간 전환율)
 * 4. 전체 전환율 하이라이트 카드 (가입→결제 전체)
 *
 * 데이터 패칭:
 * - fetchConversionFunnel 1개 API 호출 (기간 파라미터)
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';
import {
  MdPersonAdd,
  MdTouchApp,
  MdSmartToy,
  MdRateReview,
  MdCardMembership,
  MdPayment,
  MdArrowForward,
} from 'react-icons/md';
import StatsCard from '@/shared/components/StatsCard';
import { fetchConversionFunnel } from '../api/statsApi';

/** 기간 선택 옵션 */
const PERIOD_OPTIONS = [
  { value: '7d', label: '7일' },
  { value: '30d', label: '30일' },
  { value: '90d', label: '90일' },
];

/** 퍼널 단계별 색상 (진한 → 연한 그라데이션) */
const FUNNEL_COLORS = ['#6366f1', '#818cf8', '#a5b4fc', '#c4b5fd', '#d8b4fe', '#f0abfc'];

/** 퍼널 단계 메타 정보 */
const STEP_META = [
  { key: 'signup', label: '가입', icon: <MdPersonAdd size={18} /> },
  { key: 'activity', label: '첫 활동', icon: <MdTouchApp size={18} /> },
  { key: 'aiUsed', label: 'AI 사용', icon: <MdSmartToy size={18} /> },
  { key: 'review', label: '리뷰 작성', icon: <MdRateReview size={18} /> },
  { key: 'subscription', label: '구독', icon: <MdCardMembership size={18} /> },
  { key: 'payment', label: '결제', icon: <MdPayment size={18} /> },
];

/** 숫자 포맷 */
function fmt(val) {
  if (val === null || val === undefined) return '-';
  return Number(val).toLocaleString();
}

export default function ConversionFunnelTab() {
  const [period, setPeriod] = useState('30d');
  const [funnel, setFunnel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /** API 호출 */
  const loadFunnel = useCallback(async (p) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchConversionFunnel({ period: p });
      setFunnel(data);
    } catch (err) {
      setError(err?.message ?? '퍼널 데이터를 불러올 수 없습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFunnel(period); }, [loadFunnel]); // eslint-disable-line react-hooks/exhaustive-deps

  function handlePeriodChange(p) {
    setPeriod(p);
    loadFunnel(p);
  }

  /* 안전 접근 */
  const f = funnel ?? {};
  const steps = f.steps ?? [];

  /* 바차트 데이터 구성 */
  const chartData = steps.map((step, idx) => ({
    label: STEP_META[idx]?.label ?? step.stepName ?? `단계${idx + 1}`,
    count: step.count ?? 0,
    conversionRate: step.conversionRate ?? 0,
  }));

  /* 단계별 전환율 카드 (1→2, 2→3, ..., 5→6) */
  const conversionCards = [];
  for (let i = 0; i < steps.length - 1; i++) {
    const from = STEP_META[i]?.label ?? `단계${i + 1}`;
    const to = STEP_META[i + 1]?.label ?? `단계${i + 2}`;
    const rate = steps[i + 1]?.conversionRate ?? 0;
    conversionCards.push({
      key: `conv-${i}`,
      icon: <MdArrowForward size={18} />,
      title: `${from} → ${to}`,
      value: loading ? '...' : `${rate}%`,
      subtitle: `${fmt(steps[i]?.count)}명 → ${fmt(steps[i + 1]?.count)}명`,
      status: rate >= 30 ? 'success' : rate >= 10 ? 'info' : 'warning',
    });
  }

  /* 전체 전환율 (가입→결제) */
  const totalConv = f.totalConversionRate ?? 0;

  return (
    <Wrapper>
      {/* ── 기간 선택 ── */}
      <FilterRow>
        <FilterLabel>분석 기간</FilterLabel>
        <PeriodGroup>
          {PERIOD_OPTIONS.map((opt) => (
            <PeriodButton key={opt.value} $active={period === opt.value} onClick={() => handlePeriodChange(opt.value)}>
              {opt.label}
            </PeriodButton>
          ))}
        </PeriodGroup>
      </FilterRow>

      {error && <ErrorMsg>{error}</ErrorMsg>}

      {/* ── 전체 전환율 하이라이트 ── */}
      <SectionLabel>전체 전환율</SectionLabel>
      <HighlightCard>
        <HighlightIcon $status={totalConv >= 5 ? 'success' : 'warning'}>
          <MdPayment size={28} />
        </HighlightIcon>
        <HighlightContent>
          <HighlightValue>{loading ? '...' : `${totalConv}%`}</HighlightValue>
          <HighlightLabel>
            가입 → 결제 전체 전환율 ({loading ? '...' : `${fmt(steps[0]?.count)}명 가입 → ${fmt(steps[steps.length - 1]?.count)}명 결제`})
          </HighlightLabel>
        </HighlightContent>
      </HighlightCard>

      {/* ── 퍼널 바차트 ── */}
      <SectionLabel style={{ marginTop: '32px' }}>전환 퍼널 (6단계)</SectionLabel>
      <ChartCard>
        <ChartBody>
          {loading ? (
            <LoadingMsg>퍼널 데이터를 불러오는 중...</LoadingMsg>
          ) : chartData.length === 0 ? (
            <LoadingMsg>표시할 퍼널 데이터가 없습니다.</LoadingMsg>
          ) : (
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={chartData} margin={{ top: 20, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 13, fill: '#334155', fontWeight: 500 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === '전환율') return [`${value}%`, name];
                    return [`${fmt(value)}명`, '사용자 수'];
                  }}
                  contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }}
                />
                <Bar dataKey="count" name="사용자 수" radius={[6, 6, 0, 0]} barSize={64}>
                  <LabelList dataKey="count" position="top" formatter={(v) => fmt(v)} style={{ fontSize: 12, fill: '#475569', fontWeight: 600 }} />
                  {chartData.map((_, idx) => (
                    <Cell key={`funnel-${idx}`} fill={FUNNEL_COLORS[idx % FUNNEL_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartBody>
      </ChartCard>

      {/* ── 단계별 전환율 카드 ── */}
      <SectionLabel style={{ marginTop: '32px' }}>단계별 전환율</SectionLabel>
      <ConvGrid>
        {conversionCards.map((card) => (
          <StatsCard key={card.key} icon={card.icon} title={card.title} value={card.value} subtitle={card.subtitle} status={card.status} />
        ))}
      </ConvGrid>
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

/* ── 전체 전환율 하이라이트 ── */
const HighlightCard = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xl};
  background: ${({ theme }) => theme.colors.bgCard};
  border: 2px solid ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  padding: ${({ theme }) => theme.spacing.xl} ${({ theme }) => theme.spacing.xxl};
  box-shadow: ${({ theme }) => theme.shadows.card};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;
const HighlightIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 12px;
  flex-shrink: 0;
  background: ${({ $status, theme }) => $status === 'success' ? theme.colors.successBg : theme.colors.warningBg};
  color: ${({ $status, theme }) => $status === 'success' ? theme.colors.success : theme.colors.warning};
`;
const HighlightContent = styled.div``;
const HighlightValue = styled.div`
  font-size: 32px;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
  line-height: 1.2;
`;
const HighlightLabel = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
  margin-top: ${({ theme }) => theme.spacing.xs};
`;

const ChartCard = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  padding: ${({ theme }) => theme.spacing.xl};
  box-shadow: ${({ theme }) => theme.shadows.card};
`;
const ChartBody = styled.div`
  min-height: 320px;
  display: flex;
  align-items: center;
  justify-content: center;
`;
const LoadingMsg = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.textMuted};
  text-align: center;
`;
const ConvGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: ${({ theme }) => theme.spacing.lg};
`;
