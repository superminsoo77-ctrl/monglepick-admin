/**
 * 이탈 위험 분석 탭 컴포넌트.
 *
 * 구성:
 * 1. 위험 등급별 사용자 분포 PieChart (안전/낮음/중간/높음)
 * 2. KPI 카드 4개 (등급별 사용자 수)
 * 3. 이탈 위험 신호 5개 카드 (미로그인/포인트0/구독만료/AI미사용/출석끊김)
 * 4. 위험 신호 시각화 BarChart
 *
 * 데이터 패칭:
 * - Promise.allSettled로 2개 API 병렬 호출
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
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  MdShield,
  MdWarning,
  MdError,
  MdCheckCircle,
  MdLogin,
  MdAccountBalanceWallet,
  MdUnsubscribe,
  MdSmartToy,
  MdEventBusy,
} from 'react-icons/md';
import StatsCard from '@/shared/components/StatsCard';
import {
  fetchChurnRiskOverview,
  fetchChurnRiskSignals,
} from '../api/statsApi';

/** 위험 등급별 색상 */
const RISK_COLORS = {
  safe: '#10b981',
  low: '#f59e0b',
  medium: '#f97316',
  high: '#ef4444',
};

/** 숫자 포맷 */
function fmt(val) {
  if (val === null || val === undefined) return '-';
  return Number(val).toLocaleString();
}

export default function ChurnRiskTab() {
  /* 위험 분포 */
  const [riskOverview, setRiskOverview] = useState(null);
  const [ovLoading, setOvLoading] = useState(true);
  const [ovError, setOvError] = useState(null);

  /* 위험 신호 */
  const [signals, setSignals] = useState(null);
  const [sigLoading, setSigLoading] = useState(true);

  /** 2개 API 병렬 호출 */
  const loadAll = useCallback(async () => {
    setOvLoading(true);
    setSigLoading(true);
    setOvError(null);

    const [ovRes, sigRes] = await Promise.allSettled([
      fetchChurnRiskOverview(),
      fetchChurnRiskSignals(),
    ]);

    if (ovRes.status === 'fulfilled') setRiskOverview(ovRes.value);
    else setOvError(ovRes.reason?.message ?? '이탈 위험 데이터를 불러올 수 없습니다.');
    setOvLoading(false);

    if (sigRes.status === 'fulfilled') setSignals(sigRes.value);
    setSigLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  /* 안전 접근 */
  const ov = riskOverview ?? {};
  const sig = signals ?? {};

  /* 위험 등급별 파이차트 데이터 */
  const riskDistData = [
    { name: '안전 (0~25)', value: ov.safeCount ?? 0, color: RISK_COLORS.safe },
    { name: '낮음 (25~50)', value: ov.lowCount ?? 0, color: RISK_COLORS.low },
    { name: '중간 (50~75)', value: ov.mediumCount ?? 0, color: RISK_COLORS.medium },
    { name: '높음 (75~100)', value: ov.highCount ?? 0, color: RISK_COLORS.high },
  ];
  const totalAnalyzed = riskDistData.reduce((sum, d) => sum + d.value, 0);

  /* 위험 등급 KPI 카드 */
  const riskCards = [
    { key: 'safe', icon: <MdCheckCircle size={18} />, title: '안전', value: ovLoading ? '...' : `${fmt(ov.safeCount)}명`, subtitle: '이탈 위험 0~25점', status: 'success' },
    { key: 'low', icon: <MdShield size={18} />, title: '낮음', value: ovLoading ? '...' : `${fmt(ov.lowCount)}명`, subtitle: '이탈 위험 25~50점', status: 'info' },
    { key: 'medium', icon: <MdWarning size={18} />, title: '중간', value: ovLoading ? '...' : `${fmt(ov.mediumCount)}명`, subtitle: '이탈 위험 50~75점', status: 'warning' },
    { key: 'high', icon: <MdError size={18} />, title: '높음', value: ovLoading ? '...' : `${fmt(ov.highCount)}명`, subtitle: '이탈 위험 75~100점', status: 'error' },
  ];

  /* 위험 신호 카드 */
  const signalCards = [
    { key: 'login7', icon: <MdLogin size={18} />, title: '7일+ 미로그인', value: sigLoading ? '...' : `${fmt(sig.noLogin7Days)}명`, subtitle: '7일 이상 로그인하지 않은 사용자', status: 'info' },
    { key: 'login14', icon: <MdLogin size={18} />, title: '14일+ 미로그인', value: sigLoading ? '...' : `${fmt(sig.noLogin14Days)}명`, subtitle: '14일 이상 미로그인', status: 'warning' },
    { key: 'login30', icon: <MdLogin size={18} />, title: '30일+ 미로그인', value: sigLoading ? '...' : `${fmt(sig.noLogin30Days)}명`, subtitle: '30일 이상 미로그인 (이탈 추정)', status: 'error' },
    { key: 'zeroPoint', icon: <MdAccountBalanceWallet size={18} />, title: '포인트 0', value: sigLoading ? '...' : `${fmt(sig.zeroPointUsers)}명`, subtitle: '포인트 잔액이 0인 사용자', status: 'warning' },
    { key: 'noSub', icon: <MdUnsubscribe size={18} />, title: '구독 미보유', value: sigLoading ? '...' : `${fmt(sig.noSubscriptionUsers)}명`, subtitle: '활성 구독이 없는 사용자', status: 'info' },
  ];

  /* 위험 신호 바차트 데이터 */
  const signalChartData = [
    { label: '7일+ 미로그인', count: sig.noLogin7Days ?? 0, color: '#64748b' },
    { label: '14일+ 미로그인', count: sig.noLogin14Days ?? 0, color: '#f59e0b' },
    { label: '30일+ 미로그인', count: sig.noLogin30Days ?? 0, color: '#ef4444' },
    { label: '포인트 0', count: sig.zeroPointUsers ?? 0, color: '#f97316' },
    { label: '구독 미보유', count: sig.noSubscriptionUsers ?? 0, color: '#94a3b8' },
  ];

  return (
    <Wrapper>
      {ovError && <ErrorMsg>{ovError}</ErrorMsg>}

      {/* ── 위험 등급 분포 + KPI (2열) ── */}
      <SectionLabel>이탈 위험 등급별 분포</SectionLabel>
      <TopGrid>
        {/* 파이차트 */}
        <ChartCard>
          <ChartTitle>위험 등급 분포 ({fmt(totalAnalyzed)}명 분석)</ChartTitle>
          <ChartBody style={{ minHeight: '280px' }}>
            {ovLoading ? (
              <LoadingMsg>데이터를 불러오는 중...</LoadingMsg>
            ) : totalAnalyzed === 0 ? (
              <LoadingMsg>분석할 사용자가 없습니다.</LoadingMsg>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={riskDistData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    label={({ value }) => `${value}명`}
                    labelLine={true}
                  >
                    {riskDistData.map((item, idx) => (
                      <Cell key={`risk-${idx}`} fill={item.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [`${fmt(value)}명`, name]}
                    contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartBody>
        </ChartCard>

        {/* KPI 카드 4개 */}
        <RiskKpiGrid>
          {riskCards.map((card) => (
            <StatsCard key={card.key} icon={card.icon} title={card.title} value={card.value} subtitle={card.subtitle} status={card.status} />
          ))}
        </RiskKpiGrid>
      </TopGrid>

      {/* ── 이탈 위험 신호 ── */}
      <SectionLabel style={{ marginTop: '32px' }}>이탈 위험 신호</SectionLabel>
      <SignalGrid>
        {signalCards.map((card) => (
          <StatsCard key={card.key} icon={card.icon} title={card.title} value={card.value} subtitle={card.subtitle} status={card.status} />
        ))}
      </SignalGrid>

      {/* ── 위험 신호 시각화 ── */}
      <ChartCard style={{ marginTop: '24px' }}>
        <ChartTitle>이탈 위험 신호 비교</ChartTitle>
        <ChartBody>
          {sigLoading ? (
            <LoadingMsg>데이터를 불러오는 중...</LoadingMsg>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={signalChartData} margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value) => [`${fmt(value)}명`]}
                  contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }}
                />
                <Bar dataKey="count" name="사용자 수" radius={[4, 4, 0, 0]} barSize={48}>
                  {signalChartData.map((item, idx) => (
                    <Cell key={`sig-${idx}`} fill={item.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartBody>
      </ChartCard>

      {/* ── 위험 점수 산정 기준 안내 ── */}
      <InfoBox>
        <InfoTitle>이탈 위험 점수 산정 기준 (0~100점)</InfoTitle>
        <InfoList>
          <li><strong>로그인 공백</strong> — 7일+: 10점 / 14일+: 25점 / 30일+: 40점</li>
          <li><strong>포인트 잔액 0</strong> + 가입 7일 이상 — 15점</li>
          <li><strong>구독 미보유</strong> — 10점</li>
          <li><strong>AI 채팅 미사용</strong> + 가입 14일 이상 — 20점</li>
        </InfoList>
      </InfoBox>
    </Wrapper>
  );
}

/* ── styled-components ── */
const Wrapper = styled.div``;
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

const TopGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.lg};
  @media (max-width: 900px) { grid-template-columns: 1fr; }
`;
const RiskKpiGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.lg};
  align-content: start;
`;
const SignalGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: ${({ theme }) => theme.spacing.lg};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
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

/* ── 안내 박스 ── */
const InfoBox = styled.div`
  margin-top: 32px;
  background: ${({ theme }) => theme.colors.primaryBg};
  border: 1px solid ${({ theme }) => theme.colors.primary}33;
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  padding: ${({ theme }) => theme.spacing.xl};
`;
const InfoTitle = styled.h4`
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;
const InfoList = styled.ul`
  list-style: disc;
  padding-left: 20px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  line-height: 1.8;
  & strong { color: ${({ theme }) => theme.colors.textPrimary}; }
`;
