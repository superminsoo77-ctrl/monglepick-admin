/**
 * 대시보드 미니 차트 위젯 4개.
 *
 * 기존 통계 API를 재사용하여 대시보드에 한눈에 파악할 수 있는 시각 차트를 제공한다.
 * - 구독 플랜 분포 (도넛 PieChart)
 * - 등급별 사용자 분포 (미니 BarChart)
 * - AI 의도 분포 (도넛 PieChart)
 * - 이탈 위험 요약 (도넛 PieChart)
 *
 * @param {Object} props
 * @param {Object|null} props.subscription  - fetchSubscription() 응답
 * @param {Object|null} props.grades        - fetchGradeDistribution() 응답
 * @param {Object|null} props.intents       - fetchAiIntentDistribution() 응답
 * @param {Object|null} props.churnRisk     - fetchChurnRiskOverview() 응답
 * @param {boolean}     props.loading       - 로딩 여부
 */

import styled, { useTheme } from 'styled-components';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

/** 구독 플랜별 색상 */
const PLAN_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444'];

/** 등급별 색상 (팝콘 테마) */
const GRADE_COLORS = {
  NORMAL: '#94a3b8',
  BRONZE: '#cd7f32',
  SILVER: '#a8a9ad',
  GOLD: '#ffd700',
  PLATINUM: '#6366f1',
  DIAMOND: '#ec4899',
};

/** AI 의도 색상 */
const INTENT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

/** 이탈 위험 등급 색상 */
const RISK_COLORS = ['#10b981', '#f59e0b', '#f97316', '#ef4444'];

/** 숫자 포맷 */
function fmt(val) {
  if (val === null || val === undefined) return '-';
  return Number(val).toLocaleString();
}

export default function DashboardCharts({ subscription, grades, intents, churnRisk, loading }) {
  const theme = useTheme();

  /* 구독 플랜 데이터 */
  const planDist = subscription?.plans ?? [];

  /* 등급 데이터 */
  const gradeItems = grades?.grades ?? [];

  /* 의도 데이터 — 상위 5개만 */
  const intentItems = (intents?.intents ?? []).slice(0, 5);

  /* 이탈 위험 데이터 */
  const rv = churnRisk ?? {};
  const riskData = [
    { name: '안전', value: rv.safeCount ?? 0, color: RISK_COLORS[0] },
    { name: '낮음', value: rv.lowCount ?? 0, color: RISK_COLORS[1] },
    { name: '중간', value: rv.mediumCount ?? 0, color: RISK_COLORS[2] },
    { name: '높음', value: rv.highCount ?? 0, color: RISK_COLORS[3] },
  ];
  const totalRisk = riskData.reduce((s, d) => s + d.value, 0);

  /** 공통 Tooltip 스타일 */
  const tooltipStyle = {
    background: theme.colors.bgCard,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: '6px',
    fontSize: '12px',
  };

  return (
    <Grid>
      {/* ── 1. 구독 플랜 분포 ── */}
      <ChartCard>
        <CardTitle>구독 플랜 분포</CardTitle>
        <CardBody>
          {loading ? (
            <LoadingMsg>로딩 중...</LoadingMsg>
          ) : planDist.length === 0 ? (
            <LoadingMsg>구독 데이터 없음</LoadingMsg>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={planDist}
                  dataKey="count"
                  nameKey="planName"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                >
                  {planDist.map((_, idx) => (
                    <Cell key={`plan-${idx}`} fill={PLAN_COLORS[idx % PLAN_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, n) => [`${fmt(v)}명`, n]} contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardBody>
      </ChartCard>

      {/* ── 2. 등급별 사용자 분포 ── */}
      <ChartCard>
        <CardTitle>등급별 사용자</CardTitle>
        <CardBody>
          {loading ? (
            <LoadingMsg>로딩 중...</LoadingMsg>
          ) : gradeItems.length === 0 ? (
            <LoadingMsg>등급 데이터 없음</LoadingMsg>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={gradeItems} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.border} />
                <XAxis dataKey="gradeName" tick={{ fontSize: 10, fill: theme.colors.textMuted }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: theme.colors.textMuted }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => [`${fmt(v)}명`]} contentStyle={tooltipStyle} />
                <Bar dataKey="count" radius={[3, 3, 0, 0]} barSize={28}>
                  {gradeItems.map((item) => (
                    <Cell key={item.gradeCode} fill={GRADE_COLORS[item.gradeCode] || '#94a3b8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardBody>
      </ChartCard>

      {/* ── 3. AI 의도 분포 ── */}
      <ChartCard>
        <CardTitle>AI 채팅 의도 TOP 5</CardTitle>
        <CardBody>
          {loading ? (
            <LoadingMsg>로딩 중...</LoadingMsg>
          ) : intentItems.length === 0 ? (
            <LoadingMsg>의도 데이터 없음</LoadingMsg>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={intentItems}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                >
                  {intentItems.map((_, idx) => (
                    <Cell key={`int-${idx}`} fill={INTENT_COLORS[idx % INTENT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, n) => [`${fmt(v)}건`, n]} contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardBody>
      </ChartCard>

      {/* ── 4. 이탈 위험 요약 ── */}
      <ChartCard>
        <CardTitle>이탈 위험 분포 ({fmt(totalRisk)}명)</CardTitle>
        <CardBody>
          {loading ? (
            <LoadingMsg>로딩 중...</LoadingMsg>
          ) : totalRisk === 0 ? (
            <LoadingMsg>분석 데이터 없음</LoadingMsg>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={riskData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                >
                  {riskData.map((item, idx) => (
                    <Cell key={`risk-${idx}`} fill={item.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, n) => [`${fmt(v)}명`, n]} contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardBody>
      </ChartCard>
    </Grid>
  );
}

/* ── styled-components ── */

/** 2×2 그리드 레이아웃 */
const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: ${({ theme }) => theme.spacing.lg};
`;

const ChartCard = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  padding: ${({ theme }) => theme.spacing.lg};
  box-shadow: ${({ theme }) => theme.shadows.card};
`;

const CardTitle = styled.h4`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const CardBody = styled.div`
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const LoadingMsg = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
  text-align: center;
`;
