/**
 * 추이 차트 컴포넌트.
 *
 * Recharts ComposedChart를 사용해 신규 가입 + 활성 사용자(Line)와
 * 결제 금액(Bar)을 하나의 차트에 표시.
 *
 * 기능:
 * - 기간 선택: 7일 / 14일 / 30일 버튼 그룹
 * - 기간 변경 시 부모(DashboardPage)로 콜백 전달
 * - ResponsiveContainer로 반응형 처리
 * - 결제 금액은 오른쪽 Y축(YAxis yAxisId="right")에 표시
 *
 * @param {Object}   props
 * @param {Array}    props.data    - fetchTrends() 응답 배열
 *                                  [{ date, newUsers, activeUsers, paymentAmount }]
 * @param {boolean}  props.loading - 로딩 여부
 * @param {number}   props.days    - 현재 선택된 기간 (7 | 14 | 30)
 * @param {Function} props.onDaysChange - 기간 변경 콜백 (days: number) => void
 */

import styled, { useTheme } from 'styled-components';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

/** 기간 선택 옵션 */
const PERIOD_OPTIONS = [
  { value: 7,  label: '7일' },
  { value: 14, label: '14일' },
  { value: 30, label: '30일' },
];

/**
 * 결제 금액 Y축 레이블 포맷.
 * 1000000 → "100만", 500000 → "50만"
 *
 * @param {number} value
 * @returns {string}
 */
function formatPaymentAxis(value) {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(0)}억`;
  if (value >= 10_000) return `${Math.floor(value / 10_000)}만`;
  return String(value);
}

/**
 * Tooltip 결제 금액 포맷.
 * 2850000 → "2,850,000원"
 *
 * @param {number} value
 * @returns {string}
 */
function formatPaymentTooltip(value) {
  if (value === null || value === undefined) return '-';
  return `${Number(value).toLocaleString()}원`;
}

/**
 * Tooltip 사용자 수 포맷.
 * 1240 → "1,240명"
 *
 * @param {number} value
 * @returns {string}
 */
function formatUserTooltip(value) {
  if (value === null || value === undefined) return '-';
  return `${Number(value).toLocaleString()}명`;
}

/**
 * 커스텀 Tooltip 렌더러.
 * Recharts Tooltip의 content prop으로 사용.
 */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <TooltipBox>
      <TooltipDate>{label}</TooltipDate>
      {payload.map((entry) => (
        <TooltipRow key={entry.dataKey}>
          <TooltipDot style={{ background: entry.color }} />
          <TooltipLabel>{entry.name}</TooltipLabel>
          <TooltipValue>
            {/* 결제 금액(paymentAmount)은 원 단위, 나머지는 명 단위 */}
            {entry.dataKey === 'paymentAmount'
              ? formatPaymentTooltip(entry.value)
              : formatUserTooltip(entry.value)}
          </TooltipValue>
        </TooltipRow>
      ))}
    </TooltipBox>
  );
}

export default function TrendChart({ data, loading, days, onDaysChange }) {
  /* 데이터가 없을 때 표시할 빈 배열 */
  const chartData = Array.isArray(data) ? data : [];

  /**
   * useTheme으로 현재 테마 객체를 가져온다.
   * Recharts 내부 요소(CartesianGrid, XAxis, YAxis 등)는
   * styled-components 컨텍스트 밖에서 렌더링되므로
   * theme 값을 props로 직접 전달해야 한다.
   */
  const theme = useTheme();

  /* 차트에서 사용할 테마 색상 — 다크/라이트 모드에 따라 자동 변경 */
  const gridColor = theme.colors.border;
  const tickColor = theme.colors.textMuted;
  const primaryColor = theme.colors.primary;
  const successColor = theme.colors.success;
  const warningColor = theme.colors.warning;

  return (
    <Wrapper>
      {/* ── 헤더: 제목 + 기간 선택 버튼 ── */}
      <ChartHeader>
        <ChartTitle>추이 차트</ChartTitle>
        <PeriodGroup>
          {PERIOD_OPTIONS.map((opt) => (
            <PeriodButton
              key={opt.value}
              $active={days === opt.value}
              onClick={() => onDaysChange(opt.value)}
            >
              {opt.label}
            </PeriodButton>
          ))}
        </PeriodGroup>
      </ChartHeader>

      {/* ── 차트 본체 ── */}
      <ChartBody>
        {loading ? (
          /* 로딩 중 플레이스홀더 */
          <LoadingMsg>차트 데이터를 불러오는 중...</LoadingMsg>
        ) : chartData.length === 0 ? (
          /* 데이터 없음 */
          <LoadingMsg>표시할 데이터가 없습니다.</LoadingMsg>
        ) : (
          /*
           * ResponsiveContainer: 부모 너비에 맞춰 자동 리사이즈.
           * ComposedChart: Line + Bar 혼합 차트.
           * - 왼쪽 Y축 (yAxisId="left")  : 신규 가입 + 활성 사용자 (명)
           * - 오른쪽 Y축 (yAxisId="right"): 결제 금액 (원)
           */
          <ResponsiveContainer width="100%" height={350}>
            <ComposedChart
              data={chartData}
              margin={{ top: 8, right: 24, left: 0, bottom: 0 }}
            >
              {/* 격자선 — 테마 border 색상 사용 */}
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />

              {/* X축: 날짜 레이블 — 테마 textMuted 색상 사용 */}
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: tickColor }}
                axisLine={{ stroke: gridColor }}
                tickLine={false}
              />

              {/* 왼쪽 Y축: 사용자 수 */}
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 12, fill: tickColor }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${Number(v).toLocaleString()}`}
              />

              {/* 오른쪽 Y축: 결제 금액 */}
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 12, fill: tickColor }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatPaymentAxis}
              />

              {/* 커스텀 Tooltip */}
              <Tooltip content={<CustomTooltip />} />

              {/* 범례 */}
              <Legend
                wrapperStyle={{ fontSize: '13px', paddingTop: '12px', color: tickColor }}
              />

              {/* 결제 금액 Bar (오른쪽 Y축, 배경에 표시) */}
              <Bar
                yAxisId="right"
                dataKey="paymentAmount"
                name="결제 금액"
                fill={warningColor}
                fillOpacity={0.6}
                radius={[3, 3, 0, 0]}
                barSize={days === 7 ? 32 : days === 14 ? 20 : 12}
              />

              {/* 활성 사용자 Line */}
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="activeUsers"
                name="활성 사용자"
                stroke={successColor}
                strokeWidth={2}
                dot={{ r: 3, fill: successColor }}
                activeDot={{ r: 5 }}
              />

              {/* 신규 가입 Line */}
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="newUsers"
                name="신규 가입"
                stroke={primaryColor}
                strokeWidth={2}
                dot={{ r: 3, fill: primaryColor }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ChartBody>
    </Wrapper>
  );
}

/* ── styled-components ── */

const Wrapper = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  padding: ${({ theme }) => theme.spacing.xl};
  box-shadow: ${({ theme }) => theme.shadows.card};
`;

const ChartHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const ChartTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.heading};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

/**
 * 기간 선택 버튼 그룹.
 * 하나의 border로 묶어 세그먼트 컨트롤 형태로 표시.
 */
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
  color: ${({ $active, theme }) =>
    $active ? '#ffffff' : theme.colors.textSecondary};
  background: ${({ $active, theme }) =>
    $active ? theme.colors.primary : 'transparent'};
  transition: all ${({ theme }) => theme.transitions.fast};
  white-space: nowrap;

  /* 버튼 사이 구분선 */
  & + & {
    border-left: 1px solid ${({ theme }) => theme.colors.border};
  }

  &:hover {
    background: ${({ $active, theme }) =>
      $active ? theme.colors.primaryHover : theme.colors.bgHover};
  }
`;

const ChartBody = styled.div`
  min-height: 350px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const LoadingMsg = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.textMuted};
  text-align: center;
`;

/* ── Tooltip 스타일 ── */

const TooltipBox = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
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
