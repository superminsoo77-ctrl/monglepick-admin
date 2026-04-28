/**
 * 챗봇 로그 뷰어 컴포넌트.
 * 좌측: 세션 목록 (사용자 필터 + 페이징).
 * 우측: 선택된 세션의 메시지 상세 뷰 (사용자/AI 말풍선 형태).
 * 상단: 챗봇 사용 통계 3종 (총 세션, 총 메시지, 평균 대화 턴).
 *
 * 변경 이력:
 * - 2026-04-14: 좌측 검색창을 텍스트 keyword(`사용자 ID / 세션 ID`) 입력에서
 *   UserSearchPicker(이메일/닉네임 Autocomplete)로 교체.
 *   배경: 백엔드 컨트롤러는 그동안 keyword 파라미터를 받지도 않아서 입력해도 무시되고
 *   있었음(dead UX). 이번 작업으로 백엔드에 `userId` 필터를 추가하고 프론트는
 *   사용자 선택 → userId 추출 → API 전달의 정상 동작 경로로 정리.
 *
 * @param {Object} props - 없음 (자체 데이터 fetch)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { MdRefresh, MdChevronLeft, MdChevronRight, MdPerson, MdSmartToy } from 'react-icons/md';
import StatsCard from '@/shared/components/StatsCard';
import UserSearchPicker from '@/shared/components/UserSearchPicker';
import { fetchChatSessions, fetchChatMessages, fetchChatStats } from '../api/aiApi';

export default function ChatLogViewer() {
  /* ── 통계 상태 ── */
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  /* ── 세션 목록 상태 ──
   *
   * selectedUser: UserSearchPicker 에서 선택된 사용자 객체 ({ userId, email, nickname }).
   *               null 이면 사용자 필터 해제 → 전체 세션 조회.
   *               백엔드(GET /admin/ai/chat/sessions?userId=) 가 userId 필터를 지원하므로
   *               loadSessions 에서 selectedUser?.userId 를 추출해 전달한다.
   */
  const [sessions, setSessions] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [selectedUser, setSelectedUser] = useState(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState(null);

  /* ── 메시지 상세 상태 ── */
  const [selectedSession, setSelectedSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState(null);

  /* 메시지 스크롤 ref */
  const msgEndRef = useRef(null);

  /** 통계 조회 */
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const result = await fetchChatStats({});
      setStats(result);
    } catch {
      // 통계 조회 실패는 무시 (UI 저하 없이 진행)
    } finally {
      setStatsLoading(false);
    }
  }, []);

  /**
   * 세션 목록 조회.
   *
   * @param {number}  pageNum         - 0-based 페이지 번호
   * @param {?Object} userOverride    - 호출 시점에 명시할 사용자 (undefined 면 현재 selectedUser 사용)
   *                                    null 이면 명시적으로 사용자 필터 해제 의도.
   */
  const loadSessions = useCallback(async (pageNum = 0, userOverride = undefined) => {
    setSessionsLoading(true);
    setSessionsError(null);
    /* userOverride 가 undefined 면 selectedUser 사용, null 이면 명시적 해제 */
    const targetUser = userOverride === undefined ? selectedUser : userOverride;
    try {
      const result = await fetchChatSessions({
        page: pageNum,
        size: 20,
        userId: targetUser?.userId || undefined,
      });
      setSessions(result?.content ?? []);
      setTotalPages(result?.totalPages ?? 0);
      setPage(pageNum);
    } catch (err) {
      setSessionsError(err.message);
    } finally {
      setSessionsLoading(false);
    }
  }, [selectedUser]);

  /* 초기 로드 */
  useEffect(() => {
    loadStats();
    loadSessions(0);
  }, [loadStats, loadSessions]);

  /* 메시지 자동 스크롤 */
  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /**
   * UserSearchPicker 의 onChange 핸들러.
   * 사용자 선택/해제 시 첫 페이지로 돌아가고 새 필터로 즉시 재조회한다.
   * @param {?Object} user - 선택된 사용자 ({ userId, email, nickname }) 또는 null
   */
  function handleUserChange(user) {
    setSelectedUser(user);
    /* setSelectedUser 는 비동기이므로 즉시 반영을 위해 user 를 명시 전달 */
    loadSessions(0, user ?? null);
  }

  /** 세션 선택 → 메시지 로드 */
  async function handleSelectSession(session) {
    setSelectedSession(session);
    setMessages([]);
    setMessagesError(null);
    setMessagesLoading(true);
    try {
      const result = await fetchChatMessages(session.sessionId ?? session.id);
      // ChatSessionDetail.messages 는 JSON 문자열(DB TEXT 컬럼)이므로 파싱 필요.
      // 배열 직접 반환, 객체 내 messages 필드(문자열 또는 배열), 기타 케이스를 모두 처리.
      let parsed = [];
      if (Array.isArray(result)) {
        parsed = result;
      } else if (typeof result?.messages === 'string') {
        try { parsed = JSON.parse(result.messages); } catch { parsed = []; }
      } else if (Array.isArray(result?.messages)) {
        parsed = result.messages;
      }
      setMessages(Array.isArray(parsed) ? parsed : []);
    } catch (err) {
      setMessagesError(err.message);
    } finally {
      setMessagesLoading(false);
    }
  }

  return (
    <Section>
      <SectionHeader>
        <SectionTitle>챗봇 로그</SectionTitle>
        <RefreshButton onClick={() => { loadStats(); loadSessions(page); }} title="새로고침">
          <MdRefresh size={16} />
        </RefreshButton>
      </SectionHeader>

      {/* 통계 카드 3개 */}
      {!statsLoading && stats && (
        <StatsRow>
          <StatsCard
            icon={<MdSmartToy />}
            title="총 세션 수"
            value={stats.totalSessions != null ? stats.totalSessions.toLocaleString() : '-'}
            subtitle="전체 대화 세션"
            status="info"
          />
          <StatsCard
            icon={<MdPerson />}
            title="총 메시지 수"
            value={stats.totalMessages != null ? stats.totalMessages.toLocaleString() : '-'}
            subtitle="사용자 + AI 메시지 합산"
            status="info"
          />
          <StatsCard
            icon={<MdSmartToy />}
            title="평균 대화 턴"
            value={stats.avgTurns != null ? `${stats.avgTurns.toFixed(1)}턴` : '-'}
            subtitle="세션당 평균 턴 수"
            status="info"
          />
        </StatsRow>
      )}

      {/* 본문: 좌측 세션 목록 + 우측 메시지 뷰어 */}
      <ContentGrid>
        {/* ── 좌측: 세션 목록 ── */}
        <SessionPanel>
          {/* 사용자 선택 픽커 — 이메일/닉네임으로 검색해 사용자를 선택하면
              해당 사용자의 채팅 세션만 좌측 리스트에 표시된다.
              백엔드 GET /admin/ai/chat/sessions?userId= 가 필터를 처리. */}
          <PickerWrapper>
            <UserSearchPicker
              selectedUser={selectedUser}
              onChange={handleUserChange}
              placeholder="이메일 또는 닉네임으로 사용자 검색"
            />
          </PickerWrapper>

          {sessionsError && <ErrorMsg>{sessionsError}</ErrorMsg>}

          <SessionList>
            {sessionsLoading ? (
              <EmptyMsg>불러오는 중...</EmptyMsg>
            ) : sessions.length === 0 ? (
              <EmptyMsg>세션이 없습니다.</EmptyMsg>
            ) : (
              sessions.map((session) => {
                const isActive = selectedSession?.sessionId === session.sessionId ||
                                 selectedSession?.id === session.id;
                return (
                  <SessionItem
                    key={session.sessionId ?? session.id}
                    $active={isActive}
                    onClick={() => handleSelectSession(session)}
                  >
                    <SessionUser>
                      <MdPerson size={13} />
                      {session.userId ?? '비회원'}
                    </SessionUser>
                    <SessionMeta>
                      <SessionId>{session.sessionId ?? session.id}</SessionId>
                      <SessionTurn>{session.turnCount ?? 0}턴</SessionTurn>
                    </SessionMeta>
                    <SessionDate>
                      {session.lastMessageAt
                        ? new Date(session.lastMessageAt).toLocaleDateString('ko-KR')
                        : '-'}
                    </SessionDate>
                  </SessionItem>
                );
              })
            )}
          </SessionList>

          {totalPages > 1 && (
            <SessionPagination>
              <PageButton
                onClick={() => loadSessions(page - 1)}
                disabled={page === 0 || sessionsLoading}
              >
                <MdChevronLeft size={16} />
              </PageButton>
              <PageInfo>{page + 1} / {totalPages}</PageInfo>
              <PageButton
                onClick={() => loadSessions(page + 1)}
                disabled={page >= totalPages - 1 || sessionsLoading}
              >
                <MdChevronRight size={16} />
              </PageButton>
            </SessionPagination>
          )}
        </SessionPanel>

        {/* ── 우측: 메시지 뷰어 ── */}
        <MessagePanel>
          {!selectedSession ? (
            <PlaceholderMsg>
              좌측에서 세션을 선택하면<br />대화 내용을 확인할 수 있습니다.
            </PlaceholderMsg>
          ) : (
            <>
              <MessageHeader>
                <MessageHeaderTitle>
                  세션: {selectedSession.sessionId ?? selectedSession.id}
                </MessageHeaderTitle>
                <MessageHeaderSub>
                  사용자: {selectedSession.userId ?? '비회원'} &nbsp;|&nbsp;
                  {selectedSession.turnCount ?? messages.length}턴
                </MessageHeaderSub>
              </MessageHeader>

              <MessageList>
                {messagesLoading ? (
                  <EmptyMsg>메시지를 불러오는 중...</EmptyMsg>
                ) : messagesError ? (
                  <ErrorMsg>{messagesError}</ErrorMsg>
                ) : messages.length === 0 ? (
                  <EmptyMsg>메시지가 없습니다.</EmptyMsg>
                ) : (
                  messages.map((msg, idx) => {
                    const isUser = msg.role === 'user' || msg.sender === 'user';
                    return (
                      <MessageRow key={msg.id ?? `msg-${idx}`} $isUser={isUser}>
                        <MessageBubble $isUser={isUser}>
                          <BubbleRole>
                            {isUser ? <MdPerson size={12} /> : <MdSmartToy size={12} />}
                            {isUser ? '사용자' : 'AI'}
                          </BubbleRole>
                          <BubbleText>{msg.content ?? msg.text ?? '-'}</BubbleText>
                          {msg.createdAt && (
                            <BubbleTime>
                              {new Date(msg.createdAt).toLocaleTimeString('ko-KR', {
                                hour: '2-digit', minute: '2-digit',
                              })}
                            </BubbleTime>
                          )}
                        </MessageBubble>
                      </MessageRow>
                    );
                  })
                )}
                <div ref={msgEndRef} />
              </MessageList>
            </>
          )}
        </MessagePanel>
      </ContentGrid>
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

const StatsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: ${({ theme }) => theme.spacing.lg};
  margin-bottom: ${({ theme }) => theme.spacing.xl};

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const ContentGrid = styled.div`
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: ${({ theme }) => theme.spacing.xl};
  align-items: start;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

/* ── 세션 패널 ── */

const SessionPanel = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  box-shadow: ${({ theme }) => theme.shadows.card};
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

/**
 * UserSearchPicker 를 좌측 세션 패널 상단에 끼워 넣기 위한 래퍼.
 *
 * UserSearchPicker 자체는 max-width 420px 의 독립 컨테이너이므로
 * 패널 폭(320px)에 맞도록 래퍼에서 100% 로 늘리고 패딩으로 분리선만 부여한다.
 */
const PickerWrapper = styled.div`
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};

  & > div {
    max-width: 100%;
  }
`;

const SessionList = styled.div`
  flex: 1;
  max-height: 520px;
  overflow-y: auto;
`;

const SessionItem = styled.div`
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  cursor: pointer;
  border-left: 3px solid ${({ $active, theme }) =>
    $active ? theme.colors.primary : 'transparent'};
  background: ${({ $active, theme }) =>
    $active ? theme.colors.primaryBg ?? `${theme.colors.primary}15` : 'transparent'};
  transition: all ${({ theme }) => theme.transitions.fast};

  &:not(:last-child) { border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight}; }
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
`;

const SessionUser = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: 2px;
`;

const SessionMeta = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2px;
`;

const SessionId = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 10px;
  color: ${({ theme }) => theme.colors.textMuted};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
`;

const SessionTurn = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.primary};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  flex-shrink: 0;
`;

const SessionDate = styled.div`
  font-size: 10px;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const SessionPagination = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`;

const PageButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 4px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textSecondary};
  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.bgHover}; }
  &:disabled { opacity: 0.4; }
`;

const PageInfo = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
`;

/* ── 메시지 패널 ── */

const MessagePanel = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  box-shadow: ${({ theme }) => theme.shadows.card};
  display: flex;
  flex-direction: column;
  min-height: 520px;
`;

const PlaceholderMsg = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xxl};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
  line-height: 1.8;
`;

const MessageHeader = styled.div`
  padding: ${({ theme }) => theme.spacing.lg} ${({ theme }) => theme.spacing.xl};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const MessageHeaderTitle = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  font-family: ${({ theme }) => theme.fonts.mono};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: 2px;
`;

const MessageHeaderSub = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
`;

const MessageList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: ${({ theme }) => theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
  max-height: 460px;
`;

const MessageRow = styled.div`
  display: flex;
  justify-content: ${({ $isUser }) => $isUser ? 'flex-end' : 'flex-start'};
`;

const MessageBubble = styled.div`
  max-width: 75%;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-radius: ${({ $isUser }) => $isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px'};
  background: ${({ $isUser, theme }) =>
    $isUser
      ? theme.colors.primary
      : theme.colors.bgHover};
  color: ${({ $isUser, theme }) =>
    $isUser ? '#fff' : theme.colors.textPrimary};
  border: ${({ $isUser, theme }) =>
    $isUser ? 'none' : `1px solid ${theme.colors.border}`};
`;

const BubbleRole = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  opacity: 0.7;
  margin-bottom: 4px;
  font-weight: 600;
`;

const BubbleText = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
`;

const BubbleTime = styled.div`
  font-size: 10px;
  opacity: 0.6;
  text-align: right;
  margin-top: 4px;
`;

const EmptyMsg = styled.div`
  padding: ${({ theme }) => theme.spacing.xl};
  text-align: center;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
`;

const ErrorMsg = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.error};
`;
