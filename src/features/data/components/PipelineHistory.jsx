/**
 * 파이프라인 실행 이력 테이블 컴포넌트.
 * 페이징 지원, 실패 항목에 재시도 버튼 표시.
 * fetchPipelineHistory + retryFailedPipeline 사용.
 *
 * @param {Object} props - 없음 (자체 데이터 fetch)
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { MdRefresh, MdReplay, MdChevronLeft, MdChevronRight } from 'react-icons/md';
import StatusBadge from '@/shared/components/StatusBadge';
import { fetchPipelineHistory, retryFailedPipeline } from '../api/dataApi';

/** 작업 한국어 라벨.
 *
 * 2026-04-15: Agent admin_data.py 의 PIPELINE_TASKS 키와 일치시킴
 * (PipelineExecutor 의 드롭다운과 동일한 단일 진실 원본).
 */
const TASK_LABELS = {
  full_reload:       '전체 재적재',
  tmdb_collect:      'TMDB 수집',
  kaggle_supplement: 'Kaggle 보강',
  kobis_load:        'KOBIS 적재',
  kmdb_load:         'KMDb 적재',
  mood_enrichment:   '무드 태그 보강',
  es_sync:           'Elasticsearch 동기화',
  mysql_sync:        'MySQL 동기화',
  cf_only:           'CF 매트릭스 재구축',
};

/** 실행 상태 → 뱃지 매핑 */
function getRunBadge(status) {
  switch (status) {
    case 'success':
    case 'done':     return { status: 'success', label: '완료' };
    case 'running':  return { status: 'info',    label: '실행 중' };
    case 'failed':
    case 'error':    return { status: 'error',   label: '실패' };
    case 'cancelled':return { status: 'warning', label: '취소됨' };
    default:         return { status: 'default', label: status ?? '-' };
  }
}

/** 소요 시간 포맷 (초 → "5분 30초" 형식) */
function formatDuration(seconds) {
  if (seconds == null) return '-';
  if (seconds < 60) return `${seconds}초`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}분 ${s}초` : `${m}분`;
}

export default function PipelineHistory() {
  const [items, setItems] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryLoading, setRetryLoading] = useState(false);

  /** 이력 목록 조회 */
  const loadHistory = useCallback(async (pageNum = 0) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchPipelineHistory({ page: pageNum, size: 15 });
      setItems(result?.content ?? []);
      setTotalPages(result?.totalPages ?? 0);
      setPage(pageNum);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadHistory(0); }, [loadHistory]);

  /** 실패 항목 재시도 */
  async function handleRetry() {
    setRetryLoading(true);
    try {
      await retryFailedPipeline();
      // 재시도 후 이력 새로고침
      await loadHistory(page);
    } catch (err) {
      alert(`재시도 실패: ${err.message}`);
    } finally {
      setRetryLoading(false);
    }
  }

  /** 실패 항목 존재 여부 */
  const hasFailedItems = items.some(
    (item) => item.status === 'failed' || item.status === 'error'
  );

  return (
    <Section>
      <SectionHeader>
        <SectionTitle>수집 이력</SectionTitle>
        <HeaderRight>
          {hasFailedItems && (
            <RetryButton onClick={handleRetry} disabled={retryLoading}>
              <MdReplay size={14} />
              {retryLoading ? '재시도 중...' : '실패 항목 재시도'}
            </RetryButton>
          )}
          <RefreshButton onClick={() => loadHistory(page)} disabled={loading} title="새로고침">
            <MdRefresh size={16} />
          </RefreshButton>
        </HeaderRight>
      </SectionHeader>

      {error && <ErrorMsg>이력을 불러올 수 없습니다: {error}</ErrorMsg>}

      <TableWrapper>
        <Table>
          <thead>
            <tr>
              <Th style={{ width: '60px' }}>번호</Th>
              <Th style={{ width: '140px' }}>작업</Th>
              <Th style={{ width: '90px' }}>상태</Th>
              <Th style={{ width: '90px' }}>처리 건수</Th>
              <Th style={{ width: '80px' }}>소요 시간</Th>
              <Th>시작 시각</Th>
              <Th>종료 시각</Th>
              <Th>오류 메시지</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8}>
                  <EmptyRow>불러오는 중...</EmptyRow>
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <EmptyRow>실행 이력이 없습니다.</EmptyRow>
                </td>
              </tr>
            ) : (
              items.map((item, idx) => {
                const badge = getRunBadge(item.status);
                return (
                  <Tr key={item.id ?? `run-${idx}`}>
                    <Td>
                      <RunId>{item.id ?? page * 15 + idx + 1}</RunId>
                    </Td>
                    <Td>
                      <TaskName>{TASK_LABELS[item.task] ?? item.task ?? '-'}</TaskName>
                    </Td>
                    <Td>
                      <StatusBadge status={badge.status} label={badge.label} />
                    </Td>
                    <Td>
                      <CountCell>
                        {item.processedCount != null
                          ? item.processedCount.toLocaleString()
                          : '-'}
                        {item.totalCount != null && (
                          <CountTotal>/ {item.totalCount.toLocaleString()}</CountTotal>
                        )}
                      </CountCell>
                    </Td>
                    <Td>{formatDuration(item.durationSeconds)}</Td>
                    <Td>
                      <DateCell>
                        {item.startedAt
                          ? new Date(item.startedAt).toLocaleString('ko-KR')
                          : '-'}
                      </DateCell>
                    </Td>
                    <Td>
                      <DateCell>
                        {item.finishedAt
                          ? new Date(item.finishedAt).toLocaleString('ko-KR')
                          : '-'}
                      </DateCell>
                    </Td>
                    <Td>
                      {item.errorMessage ? (
                        <ErrorCell title={item.errorMessage}>
                          {item.errorMessage.length > 50
                            ? `${item.errorMessage.slice(0, 50)}...`
                            : item.errorMessage}
                        </ErrorCell>
                      ) : (
                        <NoneCell>-</NoneCell>
                      )}
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </Table>
      </TableWrapper>

      {/* 페이징 */}
      {totalPages > 1 && (
        <Pagination>
          <PageButton
            onClick={() => loadHistory(page - 1)}
            disabled={page === 0 || loading}
          >
            <MdChevronLeft size={18} />
          </PageButton>
          <PageInfo>{page + 1} / {totalPages}</PageInfo>
          <PageButton
            onClick={() => loadHistory(page + 1)}
            disabled={page >= totalPages - 1 || loading}
          >
            <MdChevronRight size={18} />
          </PageButton>
        </Pagination>
      )}
    </Section>
  );
}

/* ── styled-components ── */

const Section = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.xxl};
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const SectionTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.heading};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const RetryButton = styled.button`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.warningBg ?? '#fffbeb'};
  color: ${({ theme }) => theme.colors.warning ?? '#d97706'};
  border: 1px solid ${({ theme }) => theme.colors.warning ?? '#d97706'};
  border-radius: 6px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover { opacity: 0.8; }
  &:disabled { opacity: 0.5; }
`;

const RefreshButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.border};
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
  &:disabled { opacity: 0.5; }
`;

const ErrorMsg = styled.p`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const TableWrapper = styled.div`
  overflow-x: auto;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  background: ${({ theme }) => theme.colors.bgCard};
  box-shadow: ${({ theme }) => theme.shadows.card};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  text-align: left;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textMuted};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  white-space: nowrap;
  background: ${({ theme }) => theme.colors.bgHover};
`;

const Tr = styled.tr`
  &:not(:last-child) { border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight}; }
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
`;

const Td = styled.td`
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  vertical-align: middle;
`;

const RunId = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
`;

const TaskName = styled.span`
  font-weight: ${({ theme }) => theme.fontWeights.medium};
`;

const CountCell = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

const CountTotal = styled.span`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  margin-left: 2px;
`;

const DateCell = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  white-space: nowrap;
`;

const ErrorCell = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.error};
  cursor: help;
`;

const NoneCell = styled.span`
  color: ${({ theme }) => theme.colors.textMuted};
`;

const EmptyRow = styled.div`
  padding: ${({ theme }) => theme.spacing.xxl};
  text-align: center;
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

const Pagination = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.md};
  margin-top: ${({ theme }) => theme.spacing.lg};
`;

const PageButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bgCard};
  color: ${({ theme }) => theme.colors.textSecondary};

  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.bgHover}; }
  &:disabled { opacity: 0.4; }
`;

const PageInfo = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
`;
