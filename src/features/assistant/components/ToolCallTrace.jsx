/**
 * tool_call / tool_result SSE 이벤트를 시각화하는 접힘 카드.
 *
 * 투명성 원칙: 관리자가 "AI 가 무엇을 하려 했는지 / 실제로 무엇을 호출했는지" 를
 * 항상 볼 수 있어야 한다. Tier 배지로 위험도도 같이 노출한다.
 *
 * props:
 *  - toolCalls   : streamAdminAssistant onToolCall 로 수집된 payload 배열
 *                  [{ tool_name, arguments, tier }]
 *  - toolResults : onToolResult 로 수집된 payload 배열
 *                  [{ tool_name, ok, status_code, latency_ms, row_count, ref_id, error }]
 *
 * toolCalls 와 toolResults 는 "같은 순서로 생성된다" 가정 (Step 2 는 single-tool).
 * Step 3 에서 multi-tool loop 가 되면 call 에 id 를 붙여 result 와 매칭하도록 확장.
 */

import { useState } from 'react';
import styled, { css } from 'styled-components';
import { MdKeyboardArrowDown, MdCheckCircle, MdError } from 'react-icons/md';


const TIER_LABELS = {
  0: '통계 조회',
  1: '리소스 조회',
  2: '경량 쓰기',
  3: '위험 쓰기',
  4: 'SQL 쿼리',
};


export default function ToolCallTrace({ toolCalls = [], toolResults = [] }) {
  // toolCall 하나당 하나의 카드. 결과는 index 매칭.
  if (toolCalls.length === 0) return null;

  return (
    <TraceWrapper>
      {toolCalls.map((call, idx) => {
        const result = toolResults[idx];
        return (
          <ToolCard
            key={`${call.tool_name}-${idx}`}
            call={call}
            result={result}
          />
        );
      })}
    </TraceWrapper>
  );
}


function ToolCard({ call, result }) {
  const [open, setOpen] = useState(false);
  const ok = result?.ok;
  const pending = result == null;

  return (
    <Card $ok={ok} $pending={pending}>
      <CardHeader onClick={() => setOpen((v) => !v)}>
        <HeaderLeft>
          <StatusIcon $ok={ok} $pending={pending}>
            {pending ? '⋯' : ok ? <MdCheckCircle size={14} /> : <MdError size={14} />}
          </StatusIcon>
          <ToolName>{call.tool_name}</ToolName>
          <TierBadge $tier={call.tier}>
            Tier {call.tier} · {TIER_LABELS[call.tier] || '기타'}
          </TierBadge>
          {result && (
            <MetaSpan>
              {result.latency_ms ? `${result.latency_ms}ms` : ''}
              {result.row_count != null ? ` · ${result.row_count}행` : ''}
              {!ok && result.error ? ` · ${result.error}` : ''}
            </MetaSpan>
          )}
        </HeaderLeft>
        <ArrowIcon $open={open}>
          <MdKeyboardArrowDown size={18} />
        </ArrowIcon>
      </CardHeader>

      {open && (
        <CardBody>
          <Section>
            <SectionTitle>인자 (LLM 결정)</SectionTitle>
            <CodeBlock>{JSON.stringify(call.arguments ?? {}, null, 2)}</CodeBlock>
          </Section>
          {result && (
            <Section>
              <SectionTitle>실행 결과</SectionTitle>
              <CodeBlock>
                {JSON.stringify(
                  {
                    ok: result.ok,
                    status_code: result.status_code,
                    latency_ms: result.latency_ms,
                    row_count: result.row_count,
                    ref_id: result.ref_id,
                    error: result.error || undefined,
                  },
                  null,
                  2,
                )}
              </CodeBlock>
            </Section>
          )}
        </CardBody>
      )}
    </Card>
  );
}


/* ── styled-components ── */

const TraceWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  margin: ${({ theme }) => theme.spacing.sm} 0;
`;

const Card = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  background: ${({ theme }) => theme.colors.bgSubtle};
  overflow: hidden;

  ${({ $ok, $pending, theme }) =>
    $pending
      ? css`border-left: 3px solid ${theme.colors.warning};`
      : $ok
      ? css`border-left: 3px solid ${theme.colors.success};`
      : css`border-left: 3px solid ${theme.colors.error};`}
`;

const CardHeader = styled.button`
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  gap: ${({ theme }) => theme.spacing.sm};
  box-sizing: border-box;

  &:hover {
    background: ${({ theme }) => theme.colors.bgMain};
  }
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-wrap: wrap;
  min-width: 0;
`;

const StatusIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  color: ${({ $ok, $pending, theme }) =>
    $pending
      ? theme.colors.warning
      : $ok
      ? theme.colors.success
      : theme.colors.error};
`;

const ToolName = styled.code`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  background: transparent;
`;

const TierBadge = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  padding: 2px 6px;
  border-radius: 4px;
  background: ${({ $tier, theme }) =>
    $tier >= 3
      ? theme.colors.errorLight
      : $tier === 2
      ? theme.colors.warningLight
      : theme.colors.infoLight};
  color: ${({ $tier, theme }) =>
    $tier >= 3
      ? theme.colors.error
      : $tier === 2
      ? theme.colors.warning
      : theme.colors.info};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
`;

const MetaSpan = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
`;

const ArrowIcon = styled.span`
  display: inline-flex;
  align-items: center;
  color: ${({ theme }) => theme.colors.textMuted};
  transform: ${({ $open }) => ($open ? 'rotate(180deg)' : 'rotate(0deg)')};
  transition: transform 0.15s ease;
`;

const CardBody = styled.div`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bgMain};
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const SectionTitle = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textMuted};
`;

const CodeBlock = styled.pre`
  margin: 0;
  padding: ${({ theme }) => theme.spacing.sm};
  background: ${({ theme }) => theme.colors.bgSubtle};
  border-radius: 4px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 240px;
  overflow: auto;
`;
