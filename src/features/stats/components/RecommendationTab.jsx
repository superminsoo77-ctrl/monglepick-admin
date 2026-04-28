/**
 * 추천 분석 탭 컴포넌트.
 *
 * 구성:
 * 1. 기간 선택 버튼 그룹 (7d / 30d / 90d)
 * 2. 성과 지표 카드 3개 (CTR, 만족도, 총 추천 수)
 * 3. 장르 분포 차트 (Recharts BarChart: 장르별 추천 비율)
 * 4. 추천 로그 테이블 (userId, movieId, score, feedback, 시간 + 페이징)
 *
 * 데이터 패칭:
 * - Promise.allSettled로 3개 API 병렬 호출 (성과 / 분포 / 로그)
 * - 페이징: 로그 테이블 전용 페이지 상태 관리
 *
 * @param {Object} props - 없음 (내부 상태 관리)
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
} from 'recharts';
import { MdTouchApp, MdThumbUp, MdRecommend } from 'react-icons/md';
import StatsCard from '@/shared/components/StatsCard';
import StatusBadge from '@/shared/components/StatusBadge';
import CsvExportButton from '@/shared/components/CsvExportButton';
import {
  fetchRecommendation,
  fetchRecommendationDistribution,
  fetchRecommendationLogs,
} from '../api/statsApi';

/** 기간 선택 옵션 */
const PERIOD_OPTIONS = [
  { value: '7d',  label: '7일' },
  { value: '30d', label: '30일' },
  { value: '90d', label: '90일' },
];

/** 장르 분포 차트 색상 팔레트 */
const GENRE_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6',
];

/** 페이지당 로그 수 */
const PAGE_SIZE = 15;

/**
 * 피드백 값을 StatusBadge status로 변환.
 * positive → success, negative → error, 없음 → default
 *
 * @param {string|null} feedback
 * @returns {{ status: string, label: string }}
 */
function mapFeedback(feedback) {
  if (feedback === 'positive') return { status: 'success', label: '긍정' };
  if (feedback === 'negative') return { status: 'error', label: '부정' };
  return { status: 'default', label: '없음' };
}

/**
 * 날짜 문자열을 읽기 쉬운 형식으로 포맷.
 * "2026-04-01T14:32:00" → "04-01 14:32"
 *
 * @param {string} iso
 * @returns {string}
 */
function fmtDatetime(iso) {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${mm}-${dd} ${hh}:${min}`;
  } catch {
    return iso;
  }
}

/**
 * 퍼센트 포맷. 0.8524 → "85.2%"
 *
 * @param {number|null|undefined} val
 * @returns {string}
 */
function fmtPct(val) {
  if (val === null || val === undefined) return '-';
  return `${(Number(val) * 100).toFixed(1)}%`;
}

/**
 * 숫자 천 단위 포맷.
 *
 * @param {number|null|undefined} val
 * @returns {string}
 */
function fmt(val) {
  if (val === null || val === undefined) return '-';
  return Number(val).toLocaleString();
}

export default function RecommendationTab() {
  /** 현재 선택된 기간 */
  const [period, setPeriod] = useState('7d');

  /** 성과 지표 상태 */
  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState(null);

  /** 장르 분포 상태 */
  const [distribution, setDistribution] = useState([]);
  const [distLoading, setDistLoading] = useState(true);
  const [distError, setDistError] = useState(null);

  /** 추천 로그 상태 */
  const [logs, setLogs] = useState([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsTotalPages, setLogsTotalPages] = useState(0);
  const [logsPage, setLogsPage] = useState(0);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState(null);

  /**
   * 성과 지표 + 장르 분포 + 로그 병렬 호출.
   *
   * @param {string} p    - 기간
   * @param {number} page - 로그 페이지 번호
   */
  const loadData = useCallback(async (p, page) => {
    setMetricsLoading(true);
    setDistLoading(true);
    setLogsLoading(true);
    setMetricsError(null);
    setDistError(null);
    setLogsError(null);

    const [metricsResult, distResult, logsResult] = await Promise.allSettled([
      fetchRecommendation({ period: p }),
      fetchRecommendationDistribution(),
      fetchRecommendationLogs({ period: p, page, size: PAGE_SIZE }),
    ]);

    /* 성과 지표 처리 */
    if (metricsResult.status === 'fulfilled') {
      setMetrics(metricsResult.value);
    } else {
      setMetricsError(metricsResult.reason?.message ?? '성과 지표를 불러올 수 없습니다.');
    }
    setMetricsLoading(false);

    /* 장르 분포 처리 */
    if (distResult.status === 'fulfilled') {
      setDistribution(Array.isArray(distResult.value) ? distResult.value : []);
    } else {
      setDistError(distResult.reason?.message ?? '장르 분포를 불러올 수 없습니다.');
    }
    setDistLoading(false);

    /* 추천 로그 처리 */
    if (logsResult.status === 'fulfilled') {
      const data = logsResult.value;
      setLogs(Array.isArray(data?.content) ? data.content : Array.isArray(data) ? data : []);
      setLogsTotal(data?.totalElements ?? 0);
      setLogsTotalPages(data?.totalPages ?? 1);
    } else {
      setLogsError(logsResult.reason?.message ?? '추천 로그를 불러올 수 없습니다.');
    }
    setLogsLoading(false);
  }, []);

  /* 기간 변경 시 전체 재로드, 페이지는 0으로 초기화 */
  useEffect(() => {
    setLogsPage(0);
    loadData(period, 0);
  }, [period, loadData]);

  /**
   * 로그 테이블 페이지 변경 핸들러.
   * 성과 지표/분포는 유지하고 로그만 재호출.
   *
   * @param {number} newPage
   */
  async function handleLogsPageChange(newPage) {
    setLogsPage(newPage);
    setLogsLoading(true);
    setLogsError(null);
    try {
      const data = await fetchRecommendationLogs({ period, page: newPage, size: PAGE_SIZE });
      setLogs(Array.isArray(data?.content) ? data.content : Array.isArray(data) ? data : []);
      setLogsTotal(data?.totalElements ?? 0);
      setLogsTotalPages(data?.totalPages ?? 1);
    } catch (err) {
      setLogsError(err?.message ?? '추천 로그를 불러올 수 없습니다.');
    } finally {
      setLogsLoading(false);
    }
  }

  /* 성과 지표 안전 접근 */
  const m = metrics ?? {};

  /** 성과 지표 카드 정의 배열 */
  const metricCards = [
    {
      key: 'ctr',
      icon: <MdTouchApp size={18} />,
      title: 'CTR',
      value: metricsLoading ? '...' : fmtPct(m.ctr),
      subtitle: '추천 클릭률',
      status: 'info',
    },
    {
      key: 'satisfaction',
      icon: <MdThumbUp size={18} />,
      title: '만족도',
      value: metricsLoading ? '...' : fmtPct(m.satisfaction),
      subtitle: '긍정 피드백 비율',
      status: 'success',
    },
    {
      key: 'total',
      icon: <MdRecommend size={18} />,
      title: '총 추천 수',
      value: metricsLoading ? '...' : fmt(m.totalRecommendations),
      subtitle: '기간 내 AI 추천 횟수',
      status: 'info',
    },
  ];

  return (
    <Wrapper>
      {/* ── 기간 선택 ── */}
      <FilterRow>
        <FilterLabel>집계 기간</FilterLabel>
        <PeriodGroup>
          {PERIOD_OPTIONS.map((opt) => (
            <PeriodButton
              key={opt.value}
              $active={period === opt.value}
              onClick={() => setPeriod(opt.value)}
            >
              {opt.label}
            </PeriodButton>
          ))}
        </PeriodGroup>
      </FilterRow>

      {/* ── 성과 지표 카드 ── */}
      <SectionLabel>성과 지표</SectionLabel>
      {metricsError && <ErrorMsg>{metricsError}</ErrorMsg>}
      <MetricsGrid>
        {metricCards.map((card) => (
          <StatsCard
            key={card.key}
            icon={card.icon}
            title={card.title}
            value={card.value}
            subtitle={card.subtitle}
            status={card.status}
          />
        ))}
      </MetricsGrid>

      {/* ── 장르 분포 차트 ── */}
      <SectionLabel style={{ marginTop: '32px' }}>장르별 추천 분포</SectionLabel>
      {distError && <ErrorMsg>{distError}</ErrorMsg>}
      <ChartCard>
        <ChartTitle>장르별 추천 비율</ChartTitle>
        <ChartBody>
          {distLoading ? (
            <LoadingMsg>차트 데이터를 불러오는 중...</LoadingMsg>
          ) : distribution.length === 0 ? (
            <LoadingMsg>표시할 데이터가 없습니다.</LoadingMsg>
          ) : (
            /*
             * BarChart: 장르별 추천 건수를 가로 막대로 표시.
             * Cell로 장르마다 색상 순환 적용.
             */
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={distribution}
                margin={{ top: 8, right: 24, left: 0, bottom: 0 }}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => Number(v).toLocaleString()}
                />
                <YAxis
                  type="category"
                  dataKey="genre"
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  width={80}
                />
                <Tooltip
                  formatter={(value) => [Number(value).toLocaleString(), '추천 수']}
                  contentStyle={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    fontSize: '13px',
                  }}
                />
                <Bar dataKey="count" name="추천 수" radius={[0, 4, 4, 0]}>
                  {distribution.map((_, idx) => (
                    <Cell
                      key={`cell-${idx}`}
                      fill={GENRE_COLORS[idx % GENRE_COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartBody>
      </ChartCard>

      {/* ── 추천 로그 테이블 ── */}
      <SectionLabel style={{ marginTop: '32px' }}>추천 로그</SectionLabel>
      {logsError && <ErrorMsg>{logsError}</ErrorMsg>}
      <TableCard>
        <TableHeader>
          <ChartTitle>추천 로그</ChartTitle>
          <TableHeaderRight>
            {!logsLoading && (
              <TableMeta>총 {fmt(logsTotal)}건</TableMeta>
            )}
            {/*
              CSV 다운로드 — 비동기 모드.
              현재 화면은 15건 페이징만 보여주지만 운영자는 전체 기간 로그가 필요한
              경우가 많으므로, 클릭 시 size=1000 으로 한 번 더 호출하여 최대 1000건까지
              내보낸다. 1000건 이상 필요하면 기간을 좁혀야 한다는 운영 규칙을 암묵적으로 유도.
            */}
            <CsvExportButton
              filename={`recommendation_logs_${period}`}
              columns={[
                { header: '사용자 ID', accessor: 'userId' },
                { header: '영화 ID',   accessor: 'movieId' },
                /* score 는 소수 3자리로 통일 — 테이블 표시와 일치 */
                { header: '추천 점수', accessor: (row) => row.score != null ? Number(row.score).toFixed(3) : '' },
                { header: '피드백',    accessor: 'feedback' },
                { header: '발생 시간', accessor: 'createdAt' },
              ]}
              fetchAll={async () => {
                /* 전체 내보내기 — 최대 1000건 한도 */
                const data = await fetchRecommendationLogs({ period, page: 0, size: 1000 });
                return Array.isArray(data?.content)
                  ? data.content
                  : Array.isArray(data)
                    ? data
                    : [];
              }}
              disabled={logsLoading}
              /*
                감사 로그 기록 — 추천 로그에는 user_id 가 포함되어 개인정보에 해당하므로
                CSV 내보내기 시 반드시 admin_audit_logs 에 기록한다. (2026-04-09 P1-2 확장)
              */
              auditSource="recommendation_logs"
              auditFilterInfo={`period=${period}`}
            />
          </TableHeaderRight>
        </TableHeader>
        <TableWrapper>
          <Table>
            <thead>
              <tr>
                <Th>사용자 ID</Th>
                <Th>영화 ID</Th>
                <Th>추천 점수</Th>
                <Th>피드백</Th>
                <Th>발생 시간</Th>
              </tr>
            </thead>
            <tbody>
              {logsLoading ? (
                <tr>
                  <Td colSpan={5} style={{ textAlign: 'center' }}>
                    로그를 불러오는 중...
                  </Td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <Td colSpan={5} style={{ textAlign: 'center' }}>
                    로그가 없습니다.
                  </Td>
                </tr>
              ) : (
                logs.map((log, idx) => {
                  const fb = mapFeedback(log.feedback);
                  return (
                    /* 고유 ID가 없을 경우 userId + movieId + idx 조합 사용 */
                    <tr key={`${log.userId}-${log.movieId}-${idx}`}>
                      <Td>{log.userId ?? '-'}</Td>
                      <Td>{log.movieId ?? '-'}</Td>
                      <Td>{log.score != null ? Number(log.score).toFixed(3) : '-'}</Td>
                      <Td>
                        <StatusBadge status={fb.status} label={fb.label} />
                      </Td>
                      <Td>{fmtDatetime(log.createdAt)}</Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </TableWrapper>

        {/* ── 페이징 컨트롤 ── */}
        {logsTotalPages > 1 && (
          <Pagination>
            <PageButton
              onClick={() => handleLogsPageChange(logsPage - 1)}
              disabled={logsPage === 0 || logsLoading}
            >
              이전
            </PageButton>
            <PageInfo>
              {logsPage + 1} / {logsTotalPages}
            </PageInfo>
            <PageButton
              onClick={() => handleLogsPageChange(logsPage + 1)}
              disabled={logsPage >= logsTotalPages - 1 || logsLoading}
            >
              다음
            </PageButton>
          </Pagination>
        )}
      </TableCard>
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
  color: ${({ $active, theme }) =>
    $active ? '#ffffff' : theme.colors.textSecondary};
  background: ${({ $active, theme }) =>
    $active ? theme.colors.primary : 'transparent'};
  transition: all ${({ theme }) => theme.transitions.fast};
  white-space: nowrap;

  & + & {
    border-left: 1px solid ${({ theme }) => theme.colors.border};
  }

  &:hover {
    background: ${({ $active, theme }) =>
      $active ? theme.colors.primaryHover : theme.colors.bgHover};
  }
`;

const SectionLabel = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

/**
 * 성과 지표 카드 그리드 — 3열 고정.
 */
const MetricsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: ${({ theme }) => theme.spacing.lg};
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

/** 테이블 카드 (차트 카드와 동일 스타일) */
const TableCard = styled(ChartCard)``;

const TableHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

/**
 * 테이블 헤더 우측 영역 — 총 건수 + CSV 다운로드 버튼을 가로 배치.
 * 2026-04-09 P1-2 추가.
 */
const TableHeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
`;

const TableMeta = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
`;

/** 테이블 가로 스크롤 래퍼 */
const TableWrapper = styled.div`
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

const Th = styled.th`
  text-align: left;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  white-space: nowrap;
`;

const Td = styled.td`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight};
  vertical-align: middle;
  white-space: nowrap;

  /* 홀짝 행 배경 */
  tr:nth-child(even) & {
    background: ${({ theme }) => theme.colors.bgHover};
  }
`;

/** 페이징 컨트롤 영역 */
const Pagination = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.md};
  margin-top: ${({ theme }) => theme.spacing.xl};
`;

const PageButton = styled.button`
  padding: 5px ${({ theme }) => theme.spacing.lg};
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
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const PageInfo = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  min-width: 64px;
  text-align: center;
`;
