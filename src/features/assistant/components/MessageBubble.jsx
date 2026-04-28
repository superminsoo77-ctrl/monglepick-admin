/**
 * 관리자 어시스턴트 메시지 말풍선.
 *
 * 렌더 규칙:
 *  - user 메시지: 우측 정렬, primary 배경, 단순 텍스트
 *  - assistant 메시지: 좌측 정렬, 카드형 — ToolCallTrace 를 본문 위에 노출
 *    · status=streaming 이면 `typing` 인디케이터
 *    · status=error 면 빨강 테두리 + error 문구
 *
 * Tool 실행이 일어난 assistant 메시지는 본문 위에 ToolCallTrace 를 표시해 LLM 이
 * 어떤 도구를 호출했는지 항상 확인할 수 있게 한다 (투명성 §4).
 */

import styled, { css, keyframes } from 'styled-components';
import ToolCallTrace from './ToolCallTrace';


export default function MessageBubble({ message }) {
  const { role, text, status, toolCalls, toolResults, error } = message;

  if (role === 'user') {
    return (
      <UserRow>
        <UserBubble>{text}</UserBubble>
      </UserRow>
    );
  }

  // assistant
  const isStreaming = status === 'streaming';
  const isError = status === 'error' || status === 'aborted';

  return (
    <AssistantRow>
      <AssistantBubble $error={isError}>
        {/* tool 실행 트레이스 먼저 — "무엇을 하려 했는지" 를 응답 전에 보여준다 */}
        <ToolCallTrace
          toolCalls={toolCalls || []}
          toolResults={toolResults || []}
        />

        {text && <BodyText>{text}</BodyText>}

        {isStreaming && !text && (
          <Typing>
            <Dot $delay={0} />
            <Dot $delay={0.2} />
            <Dot $delay={0.4} />
          </Typing>
        )}

        {isError && error && <ErrorLine>{error}</ErrorLine>}
      </AssistantBubble>
    </AssistantRow>
  );
}


/* ── styled-components ── */

const UserRow = styled.div`
  display: flex;
  justify-content: flex-end;
  margin: ${({ theme }) => theme.spacing.sm} 0;
`;

const AssistantRow = styled.div`
  display: flex;
  justify-content: flex-start;
  margin: ${({ theme }) => theme.spacing.sm} 0;
`;

const UserBubble = styled.div`
  max-width: 72%;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  border-radius: 16px 16px 4px 16px;
  font-size: ${({ theme }) => theme.fontSizes.md};
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
`;

const AssistantBubble = styled.div`
  max-width: 80%;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.bgSubtle};
  border: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textPrimary};
  border-radius: 16px 16px 16px 4px;
  font-size: ${({ theme }) => theme.fontSizes.md};
  line-height: 1.5;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};

  ${({ $error, theme }) =>
    $error &&
    css`
      border-color: ${theme.colors.error};
      background: ${theme.colors.errorLight};
    `}
`;

const BodyText = styled.div`
  white-space: pre-wrap;
  word-break: break-word;
`;

const ErrorLine = styled.div`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

const bounce = keyframes`
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
`;

const Typing = styled.div`
  display: inline-flex;
  gap: 4px;
  align-items: center;
  padding: 4px 0;
`;

const Dot = styled.span`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.textMuted};
  animation: ${bounce} 1.2s infinite;
  animation-delay: ${({ $delay }) => `${$delay}s`};
`;
