/**
 * 상담 티켓 관리 탭 컴포넌트.
 *
 * 기능:
 * - 티켓 목록 테이블 (티켓ID, 사용자, 카테고리, 제목, 상태, 우선순위, 작성일, 액션)
 * - 상태 필터 (OPEN/IN_PROGRESS/RESOLVED/CLOSED)
 * - 상세 패널: 원본 문의 내용 + 답변 이력 + 새 답변 작성 textarea
 * - 티켓 상태 변경 (IN_PROGRESS, RESOLVED, CLOSED)
 * - 페이지네이션
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { MdRefresh, MdSend, MdClose, MdOpenInNew } from 'react-icons/md';
import {
  fetchTickets,
  fetchTicketDetail,
  updateTicketStatus,
  replyToTicket,
} from '../api/supportApi';
import StatusBadge from '@/shared/components/StatusBadge';

/** 티켓 상태 옵션 */
const STATUS_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'OPEN', label: '접수' },
  { value: 'IN_PROGRESS', label: '처리중' },
  { value: 'RESOLVED', label: '해결됨' },
  { value: 'CLOSED', label: '완료' },
];

/** 상태 → StatusBadge 색상 매핑 */
const STATUS_BADGE = {
  OPEN: { status: 'error', label: '접수' },
  IN_PROGRESS: { status: 'warning', label: '처리중' },
  RESOLVED: { status: 'success', label: '해결됨' },
  CLOSED: { status: 'default', label: '완료' },
};

/** 우선순위 → StatusBadge 색상 매핑 */
const PRIORITY_BADGE = {
  HIGH: { status: 'error', label: '높음' },
  MEDIUM: { status: 'warning', label: '중간' },
  LOW: { status: 'default', label: '낮음' },
};

/** 다음 상태 전환 옵션 (현재 상태 기준) */
const NEXT_STATUS_OPTIONS = {
  OPEN: [
    { value: 'IN_PROGRESS', label: '처리 시작' },
    { value: 'CLOSED', label: '닫기' },
  ],
  IN_PROGRESS: [
    { value: 'RESOLVED', label: '해결 완료' },
    { value: 'CLOSED', label: '닫기' },
  ],
  RESOLVED: [
    { value: 'CLOSED', label: '닫기' },
    { value: 'IN_PROGRESS', label: '재처리' },
  ],
  CLOSED: [
    { value: 'IN_PROGRESS', label: '재처리' },
  ],
};

/**
 * 티켓 카테고리 한국어 라벨.
 *
 * <p>Backend {@code SupportCategory} enum (6종) 과 1:1 매핑.
 * 유저 SupportPage 의 문의하기 드롭다운 ({@code TICKET_CATEGORIES}) 도
 * 동일한 6종 값으로 저장한다. 과거 SERVICE/TECHNICAL/ETC 로 적혀 있던 값은
 * Backend 가 실제로 저장하지 않으므로 라벨 매핑 실패 → 빈 셀로 표시되던 버그 수정.</p>
 */
const CATEGORY_LABELS = {
  GENERAL: '일반',
  ACCOUNT: '계정',
  CHAT: '채팅',
  RECOMMENDATION: '추천',
  COMMUNITY: '커뮤니티',
  PAYMENT: '결제',
};

/**
 * 상담 티켓 관리 탭 컴포넌트.
 *
 * @param {Object}      props
 * @param {number|null} props.aiTicketId - AI 어시스턴트가 직접 오픈을 요청한 티켓 ID.
 *   목록 로드 완료 후 해당 티켓 행을 찾아 상세 패널을 자동으로 열고,
 *   aiAutoOpenedRef 로 중복 발동을 차단한다.
 */
export default function TicketTab({ aiTicketId = null }) {
  /* ── 목록 상태 ── */
  const [tickets, setTickets] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* ── 필터/페이지 상태 ── */
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;

  /* ── 상세 패널 상태 ── */
  const [selectedTicket, setSelectedTicket] = useState(null); // 선택된 티켓 ID
  const [detail, setDetail] = useState(null);                  // 상세 데이터
  const [detailLoading, setDetailLoading] = useState(false);

  /* ── 답변 작성 상태 ── */
  const [replyContent, setReplyContent] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);

  /* ── 상태 변경 로딩 ── */
  const [statusLoading, setStatusLoading] = useState(false);

  /** 답변 입력창 ref — 상세 오픈 시 포커스 */
  const replyRef = useRef(null);

  /**
   * AI 자동 상세 오픈 중복 차단 플래그.
   * aiTicketId 로 인한 자동 오픈은 최초 1회만 실행된다.
   */
  const aiAutoOpenedRef = useRef(false);

  /** 티켓 목록 조회 */
  const loadTickets = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page, size: PAGE_SIZE };
      if (filterStatus) params.status = filterStatus;
      const result = await fetchTickets(params);
      setTickets(result?.content ?? result ?? []);
      setTotal(result?.totalElements ?? (result?.length ?? 0));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  /**
   * AI 자동 상세 오픈 — aiTicketId 가 있고 목록 로드가 완료된 시점에 실행.
   * tickets 배열에서 해당 ID 를 찾아 상세 패널을 자동으로 연다.
   * 목록 첫 페이지에 해당 티켓이 없을 수 있으나, 있으면 즉시 오픈한다.
   * aiAutoOpenedRef 로 중복 발동을 차단한다.
   */
  useEffect(() => {
    if (!aiTicketId || loading || aiAutoOpenedRef.current) return;
    const target = tickets.find((t) => t.id === aiTicketId);
    if (target) {
      aiAutoOpenedRef.current = true;
      handleOpenDetail(target);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiTicketId, tickets, loading]);

  /** 티켓 상세 조회 */
  const loadDetail = useCallback(async (id) => {
    try {
      setDetailLoading(true);
      const result = await fetchTicketDetail(id);
      setDetail(result);
    } catch (err) {
      setDetail(null);
      alert(err.message || '상세 정보를 불러올 수 없습니다.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  /** 상태 필터 변경 — 첫 페이지로 리셋 */
  function handleStatusFilterChange(value) {
    setFilterStatus(value);
    setPage(0);
  }

  /** 상세 패널 열기 */
  function handleOpenDetail(ticket) {
    setSelectedTicket(ticket.id);
    setReplyContent('');
    loadDetail(ticket.id);
  }

  /** 상세 패널 닫기 */
  function handleCloseDetail() {
    setSelectedTicket(null);
    setDetail(null);
    setReplyContent('');
  }

  /** 티켓 상태 변경 */
  async function handleStatusChange(ticketId, newStatus) {
    try {
      setStatusLoading(true);
      await updateTicketStatus(ticketId, { status: newStatus });
      // 목록과 상세 동시 갱신
      await Promise.all([loadTickets(), loadDetail(ticketId)]);
    } catch (err) {
      alert(err.message || '상태 변경 중 오류가 발생했습니다.');
    } finally {
      setStatusLoading(false);
    }
  }

  /** 답변 제출 */
  async function handleReplySubmit(e) {
    e.preventDefault();
    if (!replyContent.trim()) { alert('답변 내용을 입력해주세요.'); return; }
    if (!selectedTicket) return;

    try {
      setReplyLoading(true);
      await replyToTicket(selectedTicket, { content: replyContent });
      setReplyContent('');
      // 답변 후 상태를 IN_PROGRESS → RESOLVED 로 자동 전환 (OPEN/IN_PROGRESS 상태일 때)
      if (detail?.status === 'OPEN' || detail?.status === 'IN_PROGRESS') {
        await updateTicketStatus(selectedTicket, { status: 'RESOLVED' });
      }
      await Promise.all([loadTickets(), loadDetail(selectedTicket)]);
    } catch (err) {
      alert(err.message || '답변 저장 중 오류가 발생했습니다.');
    } finally {
      setReplyLoading(false);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <Container>
      {/* ── 툴바 ── */}
      <Toolbar>
        <ToolbarLeft>
          {STATUS_OPTIONS.map((opt) => (
            <FilterButton
              key={opt.value}
              $active={filterStatus === opt.value}
              onClick={() => handleStatusFilterChange(opt.value)}
            >
              {opt.label}
            </FilterButton>
          ))}
        </ToolbarLeft>
        <ToolbarRight>
          <IconButton onClick={loadTickets} disabled={loading} title="새로고침">
            <MdRefresh size={16} />
          </IconButton>
        </ToolbarRight>
      </Toolbar>

      {/* ── 에러 메시지 ── */}
      {error && <ErrorMsg>{error}</ErrorMsg>}

      {/* ── 2단 레이아웃: 목록 + 상세 패널 ── */}
      <TwoPane $hasDetail={!!selectedTicket}>
        {/* ── 목록 ── */}
        <ListPane>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th $w="70px">티켓ID</Th>
                  <Th $w="90px">사용자</Th>
                  <Th $w="90px">카테고리</Th>
                  <Th>제목</Th>
                  <Th $w="80px">상태</Th>
                  <Th $w="70px">우선순위</Th>
                  <Th $w="100px">작성일</Th>
                  <Th $w="60px">보기</Th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8}><CenterCell>불러오는 중...</CenterCell></td></tr>
                ) : tickets.length === 0 ? (
                  <tr><td colSpan={8}><CenterCell>티켓이 없습니다.</CenterCell></td></tr>
                ) : (
                  tickets.map((ticket) => {
                    const statusInfo = STATUS_BADGE[ticket.status] ?? { status: 'default', label: ticket.status };
                    const priorityInfo = PRIORITY_BADGE[ticket.priority] ?? { status: 'default', label: ticket.priority };
                    const isSelected = selectedTicket === ticket.id;

                    return (
                      <Tr key={ticket.id} $selected={isSelected}>
                        <Td>
                          <TicketId>#{ticket.id}</TicketId>
                        </Td>
                        <Td>
                          <UserText>{ticket.userNickname ?? ticket.userId ?? '-'}</UserText>
                        </Td>
                        <Td>
                          <StatusBadge
                            status="info"
                            label={CATEGORY_LABELS[ticket.category] ?? ticket.category ?? '-'}
                          />
                        </Td>
                        <Td>
                          <SubjectText>{ticket.title ?? ticket.subject ?? '-'}</SubjectText>
                        </Td>
                        <Td>
                          <StatusBadge status={statusInfo.status} label={statusInfo.label} />
                        </Td>
                        <Td>
                          <StatusBadge status={priorityInfo.status} label={priorityInfo.label} />
                        </Td>
                        <Td>{ticket.createdAt ? ticket.createdAt.slice(0, 10) : '-'}</Td>
                        <Td>
                          <DetailButton
                            onClick={() => isSelected ? handleCloseDetail() : handleOpenDetail(ticket)}
                            $active={isSelected}
                            title={isSelected ? '닫기' : '상세 보기'}
                          >
                            <MdOpenInNew size={14} />
                          </DetailButton>
                        </Td>
                      </Tr>
                    );
                  })
                )}
              </tbody>
            </Table>
          </TableWrap>

          {/* ── 페이지네이션 ── */}
          {totalPages > 1 && (
            <Pagination>
              <PageButton onClick={() => setPage((p) => p - 1)} disabled={page === 0}>이전</PageButton>
              <PageInfo>{page + 1} / {totalPages}</PageInfo>
              <PageButton onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= totalPages}>다음</PageButton>
            </Pagination>
          )}
        </ListPane>

        {/* ── 상세 패널 ── */}
        {selectedTicket && (
          <DetailPane>
            <DetailHeader>
              <DetailTitle>
                {detailLoading ? '불러오는 중...' : `#${detail?.id} ${detail?.title ?? detail?.subject ?? ''}`}
              </DetailTitle>
              <CloseDetailButton onClick={handleCloseDetail} title="닫기">
                <MdClose size={18} />
              </CloseDetailButton>
            </DetailHeader>

            {!detailLoading && detail && (
              <>
                {/* 티켓 메타 정보 */}
                <MetaGrid>
                  <MetaItem>
                    <MetaLabel>상태</MetaLabel>
                    <StatusBadge
                      status={STATUS_BADGE[detail.status]?.status ?? 'default'}
                      label={STATUS_BADGE[detail.status]?.label ?? detail.status}
                    />
                  </MetaItem>
                  <MetaItem>
                    <MetaLabel>우선순위</MetaLabel>
                    <StatusBadge
                      status={PRIORITY_BADGE[detail.priority]?.status ?? 'default'}
                      label={PRIORITY_BADGE[detail.priority]?.label ?? detail.priority}
                    />
                  </MetaItem>
                  <MetaItem>
                    <MetaLabel>작성자</MetaLabel>
                    <MetaValue>{detail.userNickname ?? detail.userId ?? '-'}</MetaValue>
                  </MetaItem>
                  <MetaItem>
                    <MetaLabel>작성일</MetaLabel>
                    <MetaValue>{detail.createdAt ? detail.createdAt.slice(0, 16).replace('T', ' ') : '-'}</MetaValue>
                  </MetaItem>
                </MetaGrid>

                {/* 상태 변경 버튼 */}
                {NEXT_STATUS_OPTIONS[detail.status]?.length > 0 && (
                  <StatusChangeRow>
                    <StatusChangeLabel>상태 변경:</StatusChangeLabel>
                    {NEXT_STATUS_OPTIONS[detail.status].map((opt) => (
                      <StatusChangeButton
                        key={opt.value}
                        onClick={() => handleStatusChange(detail.id, opt.value)}
                        disabled={statusLoading}
                        $variant={opt.value === 'CLOSED' ? 'danger' : 'default'}
                      >
                        {statusLoading ? '...' : opt.label}
                      </StatusChangeButton>
                    ))}
                  </StatusChangeRow>
                )}

                {/* 원본 문의 내용 */}
                <Section>
                  <SectionTitle>문의 내용</SectionTitle>
                  <OriginalContent>{detail.content ?? '-'}</OriginalContent>
                </Section>

                {/* 답변 이력 */}
                <Section>
                  <SectionTitle>
                    답변 이력
                    <ReplyCount>{(detail.replies ?? []).length}건</ReplyCount>
                  </SectionTitle>
                  {(detail.replies ?? []).length === 0 ? (
                    <EmptyReplies>아직 답변이 없습니다.</EmptyReplies>
                  ) : (
                    <ReplyList>
                      {(detail.replies ?? []).map((reply) => (
                        <ReplyItem key={reply.id} $isAdmin={reply.isAdmin}>
                          <ReplyMeta>
                            <ReplyAuthor $isAdmin={reply.isAdmin}>
                              {reply.isAdmin ? '관리자' : (reply.userNickname ?? '사용자')}
                            </ReplyAuthor>
                            <ReplyDate>
                              {reply.createdAt ? reply.createdAt.slice(0, 16).replace('T', ' ') : '-'}
                            </ReplyDate>
                          </ReplyMeta>
                          <ReplyContent>{reply.content}</ReplyContent>
                        </ReplyItem>
                      ))}
                    </ReplyList>
                  )}
                </Section>

                {/* 답변 작성 */}
                {detail.status !== 'CLOSED' && (
                  <Section>
                    <SectionTitle>답변 작성</SectionTitle>
                    <ReplyForm onSubmit={handleReplySubmit}>
                      <ReplyTextarea
                        ref={replyRef}
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        placeholder="답변 내용을 입력하세요. 답변 제출 후 티켓이 '해결됨' 상태로 자동 전환됩니다."
                        rows={5}
                      />
                      <ReplySubmitRow>
                        <CharCount>{replyContent.length}자</CharCount>
                        <ReplySubmitButton type="submit" disabled={replyLoading || !replyContent.trim()}>
                          <MdSend size={14} />
                          {replyLoading ? '전송 중...' : '답변 전송'}
                        </ReplySubmitButton>
                      </ReplySubmitRow>
                    </ReplyForm>
                  </Section>
                )}
              </>
            )}
          </DetailPane>
        )}
      </TwoPane>
    </Container>
  );
}

/* ── styled-components ── */

const Container = styled.div``;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const ToolbarLeft = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const ToolbarRight = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const FilterButton = styled.button`
  padding: 5px 12px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border-radius: 4px;
  border: 1px solid ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.border};
  background: ${({ $active, theme }) => $active ? theme.colors.primaryLight : 'transparent'};
  color: ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.textSecondary};
  font-weight: ${({ $active, theme }) => $active ? theme.fontWeights.semibold : theme.fontWeights.normal};
  transition: all ${({ theme }) => theme.transitions.fast};
  &:hover { border-color: ${({ theme }) => theme.colors.primary}; color: ${({ theme }) => theme.colors.primary}; }
`;

const IconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
  &:disabled { opacity: 0.4; }
`;

const ErrorMsg = styled.p`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  margin-bottom: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.errorBg};
  border-radius: 4px;
`;

/* ── 2단 레이아웃 ── */

const TwoPane = styled.div`
  display: grid;
  grid-template-columns: ${({ $hasDetail }) => $hasDetail ? '1fr 420px' : '1fr'};
  gap: ${({ theme }) => theme.spacing.lg};
  align-items: start;
  transition: grid-template-columns ${({ theme }) => theme.transitions.normal};
`;

const ListPane = styled.div``;

/* ── 목록 테이블 ── */

const TableWrap = styled.div`
  overflow-x: auto;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

const Th = styled.th`
  text-align: left;
  padding: 10px 12px;
  background: ${({ theme }) => theme.colors.bgHover};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  white-space: nowrap;
  width: ${({ $w }) => $w ?? 'auto'};
`;

const Tr = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight};
  background: ${({ $selected, theme }) => $selected ? theme.colors.primaryLight : 'transparent'};
  &:last-child { border-bottom: none; }
  &:hover { background: ${({ $selected, theme }) => $selected ? theme.colors.primaryLight : theme.colors.bgHover}; }
`;

const Td = styled.td`
  padding: 10px 12px;
  color: ${({ theme }) => theme.colors.textPrimary};
  vertical-align: middle;
`;

const TicketId = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
`;

const UserText = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
`;

const SubjectText = styled.span`
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
  max-width: 200px;
`;

const DetailButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  border: 1px solid ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.border};
  color: ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.textMuted};
  background: ${({ $active, theme }) => $active ? theme.colors.primaryLight : 'transparent'};
  transition: all ${({ theme }) => theme.transitions.fast};
  &:hover { border-color: ${({ theme }) => theme.colors.primary}; color: ${({ theme }) => theme.colors.primary}; }
`;

const CenterCell = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xxxl};
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
  padding: 5px 14px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.bgHover}; }
  &:disabled { opacity: 0.4; }
`;

const PageInfo = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
`;

/* ── 상세 패널 ── */

const DetailPane = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  overflow-y: auto;
  max-height: calc(100vh - 200px);
  position: sticky;
  top: ${({ theme }) => theme.layout.headerHeight};
`;

const DetailHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bgHover};
  position: sticky;
  top: 0;
  z-index: 10;
`;

const DetailTitle = styled.h4`
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
`;

const CloseDetailButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textMuted};
  flex-shrink: 0;
  &:hover { background: ${({ theme }) => theme.colors.border}; color: ${({ theme }) => theme.colors.textPrimary}; }
`;

const MetaGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight};
`;

const MetaItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const MetaLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
`;

const MetaValue = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const StatusChangeRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight};
  flex-wrap: wrap;
`;

const StatusChangeLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  flex-shrink: 0;
`;

const StatusChangeButton = styled.button`
  padding: 4px 12px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  border-radius: 4px;
  border: 1px solid ${({ $variant, theme }) =>
    $variant === 'danger' ? theme.colors.error : theme.colors.primary};
  color: ${({ $variant, theme }) =>
    $variant === 'danger' ? theme.colors.error : theme.colors.primary};
  transition: all ${({ theme }) => theme.transitions.fast};
  &:hover:not(:disabled) {
    background: ${({ $variant, theme }) =>
      $variant === 'danger' ? theme.colors.errorBg : theme.colors.primaryLight};
  }
  &:disabled { opacity: 0.4; }
`;

const Section = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight};
  &:last-child { border-bottom: none; }
`;

const SectionTitle = styled.h5`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const ReplyCount = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  font-weight: ${({ theme }) => theme.fontWeights.normal};
`;

const OriginalContent = styled.pre`
  font-family: ${({ theme }) => theme.fonts.base};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  background: ${({ theme }) => theme.colors.bgHover};
  border-radius: 4px;
  padding: ${({ theme }) => theme.spacing.md};
`;

const EmptyReplies = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
  text-align: center;
  padding: ${({ theme }) => theme.spacing.lg} 0;
`;

const ReplyList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const ReplyItem = styled.div`
  background: ${({ $isAdmin, theme }) => $isAdmin ? theme.colors.primaryLight : theme.colors.bgHover};
  border-left: 3px solid ${({ $isAdmin, theme }) => $isAdmin ? theme.colors.primary : theme.colors.border};
  border-radius: 0 4px 4px 0;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
`;

const ReplyMeta = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
`;

const ReplyAuthor = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ $isAdmin, theme }) => $isAdmin ? theme.colors.primary : theme.colors.textSecondary};
`;

const ReplyDate = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  font-family: ${({ theme }) => theme.fonts.mono};
`;

const ReplyContent = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
`;

const ReplyForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const ReplyTextarea = styled.textarea`
  padding: 8px 12px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-family: ${({ theme }) => theme.fonts.base};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  resize: vertical;
  outline: none;
  line-height: 1.6;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
`;

const ReplySubmitRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const CharCount = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
`;

const ReplySubmitButton = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  border-radius: 4px;
  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.primaryHover}; }
  &:disabled { opacity: 0.45; }
`;
