/**
 * AI 생성 이력 컴포넌트.
 * 퀴즈 이력을 페이징으로 표시.
 *
 * 2026-04-08: AI 리뷰 이력 탭 제거 (AI 리뷰 생성 기능 삭제).
 *
 * @param {Object} props - 없음 (자체 데이터 fetch)
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { MdRefresh, MdChevronLeft, MdChevronRight } from 'react-icons/md';
import StatusBadge from '@/shared/components/StatusBadge';
import { fetchQuizHistory } from '../api/aiApi';

/** 생성 상태 → 뱃지 매핑 */
function getGenBadge(status) {
  switch (status) {
    case 'success':
    case 'done':    return { status: 'success', label: '완료' };
    case 'pending': return { status: 'info',    label: '대기' };
    case 'failed':
    case 'error':   return { status: 'error',   label: '실패' };
    default:        return { status: 'default', label: status ?? '-' };
  }
}

/** 퀴즈 난이도 한국어 */
const DIFFICULTY_KO = { easy: '쉬움', medium: '보통', hard: '어려움' };

export default function GenerationHistory() {
  /* ── 퀴즈 이력 상태 ── */
  const [quizItems, setQuizItems]       = useState([]);
  const [quizPages, setQuizPages]       = useState(0);
  const [quizPage, setQuizPage]         = useState(0);
  const [quizLoading, setQuizLoading]   = useState(false);
  const [quizError, setQuizError]       = useState(null);

  /** 퀴즈 이력 조회 */
  const loadQuiz = useCallback(async (pageNum = 0) => {
    setQuizLoading(true);
    setQuizError(null);
    try {
      const res = await fetchQuizHistory({ page: pageNum, size: 15 });
      setQuizItems(res?.content ?? []);
      setQuizPages(res?.totalPages ?? 0);
      setQuizPage(pageNum);
    } catch (err) {
      setQuizError(err.message);
    } finally {
      setQuizLoading(false);
    }
  }, []);

  /* 초기 로드 */
  useEffect(() => {
    loadQuiz(0);
  }, [loadQuiz]);

  /* ── 공통 테이블 렌더 헬퍼 ── */
  function renderPagination(page, totalPages, loading, onPageChange) {
    if (totalPages <= 1) return null;
    return (
      <Pagination>
        <PageButton onClick={() => onPageChange(page - 1)} disabled={page === 0 || loading}>
          <MdChevronLeft size={18} />
        </PageButton>
        <PageInfo>{page + 1} / {totalPages}</PageInfo>
        <PageButton onClick={() => onPageChange(page + 1)} disabled={page >= totalPages - 1 || loading}>
          <MdChevronRight size={18} />
        </PageButton>
      </Pagination>
    );
  }

  return (
    <Section>
      <SectionHeader>
        <SectionTitle>퀴즈 생성 이력</SectionTitle>
        <RefreshButton
          onClick={() => loadQuiz(quizPage)}
          title="새로고침"
        >
          <MdRefresh size={16} />
        </RefreshButton>
      </SectionHeader>

      {/* ── 퀴즈 이력 테이블 ── */}
      {quizError && <ErrorMsg>{quizError}</ErrorMsg>}
      <TableWrapper>
        <Table>
          <thead>
            <tr>
              <Th style={{ width: '60px' }}>번호</Th>
              <Th style={{ width: '100px' }}>장르</Th>
              <Th style={{ width: '80px' }}>난이도</Th>
              <Th style={{ width: '70px' }}>수량</Th>
              <Th style={{ width: '90px' }}>상태</Th>
              <Th>생성 시각</Th>
              <Th>메모</Th>
            </tr>
          </thead>
          <tbody>
            {quizLoading ? (
              <tr><td colSpan={7}><EmptyRow>불러오는 중...</EmptyRow></td></tr>
            ) : quizItems.length === 0 ? (
              <tr><td colSpan={7}><EmptyRow>퀴즈 생성 이력이 없습니다.</EmptyRow></td></tr>
            ) : (
              quizItems.map((item, idx) => {
                const badge = getGenBadge(item.status);
                return (
                  <Tr key={item.id ?? `quiz-${idx}`}>
                    <Td><RunId>{item.id ?? quizPage * 15 + idx + 1}</RunId></Td>
                    <Td>{item.genre ?? '전체'}</Td>
                    <Td>{DIFFICULTY_KO[item.difficulty] ?? item.difficulty ?? '-'}</Td>
                    <Td><CountVal>{item.count ?? '-'}</CountVal></Td>
                    <Td><StatusBadge status={badge.status} label={badge.label} /></Td>
                    <Td>
                      <DateCell>
                        {item.createdAt
                          ? new Date(item.createdAt).toLocaleString('ko-KR')
                          : '-'}
                      </DateCell>
                    </Td>
                    <Td>
                      <MemoCell title={item.note ?? ''}>{item.note ?? '-'}</MemoCell>
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </Table>
      </TableWrapper>
      {renderPagination(quizPage, quizPages, quizLoading, loadQuiz)}
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

const CountVal = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
`;

const DateCell = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  white-space: nowrap;
`;

const MemoCell = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: help;
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
