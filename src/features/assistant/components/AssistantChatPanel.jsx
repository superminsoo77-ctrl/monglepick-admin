/**
 * 관리자 어시스턴트 채팅 패널.
 *
 * 책임:
 *  - useAdminAssistant 훅 인스턴스를 소비해 메시지 스트림 렌더
 *  - 하단 진행 상태(phase) 표시줄 + 입력창
 *  - 빈 상태(첫 진입) 에서는 빠른 질문 칩을 대신 렌더
 *  - 스크롤 자동 하단 고정 (신규 메시지 추가 시)
 */

import { useEffect, useRef } from 'react';
import styled from 'styled-components';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
// ConfirmationDialog: v3 에서 미사용 (HITL/risk_gate 제거). 컴포넌트 파일은 v3 안정화까지 예비 보관.
// import ConfirmationDialog from './ConfirmationDialog';
import FormPrefillCard from './FormPrefillCard';
import NavigationCard from './NavigationCard';
import useAssistantQuickPrompts from '../hooks/useAssistantQuickPrompts';
import { MdAutoAwesome, MdRefresh } from 'react-icons/md';


// 2026-04-23: 빈 상태 빠른 질문 칩을 Backend `chat_suggestions` 테이블의
// `surface='admin_assistant'` 풀에서 동적으로 받아오도록 전환. 관리자 페이지에서
// CRUD 가능. Backend 응답이 비어있을 때는 훅 내부의 FALLBACK_PROMPTS 4개가 노출된다.


export default function AssistantChatPanel({
  messages,
  status,
  currentPhase,
  lastError,
  onSubmit,
  onCancel,
  onReset,
}) {
  const scrollRef = useRef(null);

  // 신규 메시지/상태 변화 시 하단으로 자동 스크롤
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, currentPhase]);

  const isStreaming = status === 'streaming';
  const isAwaitingConfirmation = status === 'awaiting_confirmation';
  const isEmpty = messages.length === 0;

  // 2026-04-23: 빈 상태 칩 동적 조회. `chat_suggestions.surface='admin_assistant'` 풀에서
  // 랜덤 4개. 응답 없으면 훅 내부 FALLBACK_PROMPTS 가 표시된다.
  const quickPrompts = useAssistantQuickPrompts(4);

  return (
    <PanelWrapper>
      {/* 헤더 — 세션 리셋 + 상태 배지 */}
      <PanelHeader>
        <HeaderLeft>
          <MdAutoAwesome size={18} />
          <HeaderTitle>AI 어시스턴트</HeaderTitle>
          {status === 'error' && <StatusPill $variant="error">오류</StatusPill>}
          {status === 'streaming' && <StatusPill $variant="info">응답 중</StatusPill>}
          {status === 'awaiting_confirmation' && (
            <StatusPill $variant="warning">승인 대기</StatusPill>
          )}
          {status === 'done' && <StatusPill $variant="success">완료</StatusPill>}
        </HeaderLeft>
        <ResetButton type="button" onClick={onReset} title="새 대화 시작">
          <MdRefresh size={16} />
          <span>새 대화</span>
        </ResetButton>
      </PanelHeader>

      {/* 스크롤 영역 */}
      <ScrollArea ref={scrollRef}>
        {isEmpty ? (
          <EmptyState>
            <EmptyTitle>무엇을 도와드릴까요?</EmptyTitle>
            <EmptyDesc>
              통계·조회·공지 등록 같은 관리 작업을 자연어로 말씀해주세요.
              <br />
              결과는 아래에 표·텍스트로 정리해 드려요.
            </EmptyDesc>
            <ChipRow>
              {quickPrompts.map((q) => (
                <Chip key={q} type="button" onClick={() => onSubmit?.(q)}>
                  {q}
                </Chip>
              ))}
            </ChipRow>
            {/* 2026-04-24: 빈 상태에서는 입력창을 하단 고정 대신 칩 아래 중앙에 임베드.
                ChatGPT/Claude 스타일로 "첫 질문을 시작하기 쉽게" 시각적 초점을 중앙으로 모은다.
                embedded prop 으로 ChatInput 의 border/배경을 카드 형태로 전환. */}
            <EmbeddedInputWrap>
              <ChatInput
                onSubmit={onSubmit}
                onCancel={onCancel}
                isStreaming={isStreaming}
                disabled={isAwaitingConfirmation}
                placeholder={
                  isAwaitingConfirmation
                    ? '관리자 승인을 기다리고 있어요. 위 모달에서 결정해주세요.'
                    : undefined
                }
                embedded
              />
            </EmbeddedInputWrap>
          </EmptyState>
        ) : (
          <MessageList>
            {messages.map((m) => (
              <MessageItem key={m.id}>
                <MessageBubble message={m} />
                {/* v3 Phase F: form_prefill 이벤트 도착 시 FormPrefillCard 렌더.
                    assistant 메시지에 formPrefill 필드가 채워졌을 때만 표시.
                    버튼 클릭 → navigate(target_path, { state: { draft, source } }) */}
                {m.role === 'assistant' && m.formPrefill && (
                  <FormPrefillCard data={m.formPrefill} />
                )}
                {/* v3 Phase F: navigation 이벤트 도착 시 NavigationCard 렌더.
                    단건(target_path) 또는 다건(candidates) 모두 이 컴포넌트가 처리. */}
                {m.role === 'assistant' && m.navigation && (
                  <NavigationCard data={m.navigation} />
                )}
              </MessageItem>
            ))}
            {(isStreaming || isAwaitingConfirmation) && currentPhase && (
              <PhaseBadge $variant={isAwaitingConfirmation ? 'warning' : 'info'}>
                {currentPhase}
              </PhaseBadge>
            )}
          </MessageList>
        )}
      </ScrollArea>

      {lastError && (
        <ErrorBanner>⚠️ {lastError}</ErrorBanner>
      )}

      {/* 입력창 — 승인 대기 중에는 disabled.
          2026-04-24: 빈 상태에서는 EmptyState 내부(EmbeddedInputWrap)에 렌더되므로 여기서는 생략.
          메시지가 한 건이라도 있으면 하단 고정 모드로 복귀한다. */}
      {!isEmpty && (
        <ChatInput
          onSubmit={onSubmit}
          onCancel={onCancel}
          isStreaming={isStreaming}
          disabled={isAwaitingConfirmation}
          placeholder={
            isAwaitingConfirmation
              ? '관리자 승인을 기다리고 있어요. 위 모달에서 결정해주세요.'
              : undefined
          }
        />
      )}

      {/* v3 에서 ConfirmationDialog 미사용 (HITL/risk_gate 제거).
          v3 안정화 후 최종 삭제 예정. 예비 보관.
      {isAwaitingConfirmation && confirmation && (
        <ConfirmationDialog
          payload={confirmation}
          onApprove={onApprove}
          onReject={onReject}
        />
      )}
      */}
    </PanelWrapper>
  );
}


/* ── styled-components ── */

const PanelWrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: ${({ theme }) => theme.colors.bgMain};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 8px;
  overflow: hidden;
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bgSubtle};
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const HeaderTitle = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`;

const StatusPill = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  padding: 2px 8px;
  border-radius: 10px;
  background: ${({ $variant, theme }) =>
    $variant === 'error'
      ? theme.colors.errorLight
      : $variant === 'info'
      ? theme.colors.infoLight
      : theme.colors.successLight};
  color: ${({ $variant, theme }) =>
    $variant === 'error'
      ? theme.colors.error
      : $variant === 'info'
      ? theme.colors.info
      : theme.colors.success};
`;

const ResetButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  background: ${({ theme }) => theme.colors.bgMain};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  cursor: pointer;

  &:hover { background: ${({ theme }) => theme.colors.bgSubtle}; }
`;

const ScrollArea = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: ${({ theme }) => theme.spacing.lg};
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: ${({ theme }) => theme.spacing.xxl};
  text-align: center;
  gap: ${({ theme }) => theme.spacing.md};
`;

const EmptyTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.xl};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const EmptyDesc = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
  line-height: 1.6;
  margin: 0;
`;

const ChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
  justify-content: center;
  max-width: 720px;
`;

/**
 * 2026-04-24: 빈 상태에서 칩 바로 아래에 입력창을 임베드하는 래퍼.
 * 칩과 동일한 최대 폭(720px)을 유지해 시각적으로 한 덩어리처럼 보이게 한다.
 */
const EmbeddedInputWrap = styled.div`
  width: 100%;
  max-width: 720px;
  margin-top: ${({ theme }) => theme.spacing.md};
`;

const Chip = styled.button`
  padding: 8px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 18px;
  background: ${({ theme }) => theme.colors.bgSubtle};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.primaryLight};
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const MessageList = styled.div`
  display: flex;
  flex-direction: column;
`;

/**
 * 메시지 단위 래퍼 — MessageBubble + FormPrefillCard/NavigationCard 를 묶어
 * 카드가 버블 바로 아래 좌측 정렬로 붙도록 한다.
 */
const MessageItem = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
`;

const PhaseBadge = styled.div`
  align-self: flex-start;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  padding: 4px 10px;
  border: 1px dashed ${({ theme }) => theme.colors.border};
  border-radius: 12px;
  margin: ${({ theme }) => theme.spacing.sm} 0;

  /* Step 5b: 승인 대기(warning) 상태를 시각적으로 강조 */
  ${({ $variant, theme }) =>
    $variant === 'warning'
      ? `
        color: ${theme.colors.warning};
        border-color: ${theme.colors.warning};
        background: ${theme.colors.warningLight};
      `
      : `
        color: ${theme.colors.textMuted};
        background: ${theme.colors.bgSubtle};
      `}
`;

const ErrorBanner = styled.div`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.errorLight};
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`;
