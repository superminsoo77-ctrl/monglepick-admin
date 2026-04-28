/**
 * Tier 2/3 쓰기 작업 승인 모달 (Step 5b).
 *
 * Agent 가 risk_gate 에서 `confirmation_required` SSE 이벤트를 발행하면 useAdminAssistant
 * 훅이 `confirmation` state 를 채우고 status='awaiting_confirmation' 으로 전이한다.
 * 이 모달은 사용자가 관리 작업을 실행하기 전 "무엇을 어떤 인자로 실행할지" 를 명확히
 * 보여주고, 사용자가 직접 승인/거절을 선택해야만 다음으로 진행되게 강제한다.
 *
 * 설계:
 *  - **ESC / backdrop 클릭으로 닫지 않는다** — 사용자가 반드시 결정해야 한다.
 *  - Tier 배지로 위험도 시각화 (Tier 2 = 주황 / Tier 3 = 빨강).
 *  - 메모 입력창(선택) — 감사 로그(Step 6) 에 기록될 예정.
 *  - 승인은 primary, 거절은 danger. 버튼 크기 동일.
 *
 * props:
 *  - payload : { tool_name, arguments, tier, plan_summary, rationale }
 *  - onApprove(comment) : 승인 — useAdminAssistant.approveTool 연결
 *  - onReject(comment)  : 거절 — useAdminAssistant.rejectTool 연결
 *  - disabled: boolean   : 처리 중(중복 클릭 방지) 여부
 */

import { useEffect, useState } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { MdCheck, MdClose, MdWarning } from 'react-icons/md';


const TIER_INFO = {
  2: { label: '경량 쓰기', color: 'warning' },
  3: { label: '위험 쓰기', color: 'error' },
  4: { label: 'SQL 쿼리', color: 'error' },
};


export default function ConfirmationDialog({
  payload,
  onApprove,
  onReject,
  disabled = false,
}) {
  const [comment, setComment] = useState('');
  /**
   * Step 6b: Tier 3 확인 키워드 타이핑.
   * payload.required_keyword 가 비어있지 않으면 이 필드가 정확히 일치해야 [승인] 활성화.
   */
  const [keywordInput, setKeywordInput] = useState('');

  // payload 가 바뀌면 입력 초기화 (다른 승인 요청으로 넘어갈 때)
  useEffect(() => {
    setComment('');
    setKeywordInput('');
  }, [payload?.tool_name]);

  if (!payload) return null;

  const tierMeta = TIER_INFO[payload.tier] || { label: '기타', color: 'warning' };
  const argsPreview = JSON.stringify(payload.arguments || {}, null, 2);
  // 키워드 검증 — payload.required_keyword 가 비어있지 않은 경우에만 강제.
  // trim 비교로 공백 실수 허용하되 대소문자는 정확히.
  const requiredKeyword = (payload.required_keyword || '').trim();
  const keywordRequired = requiredKeyword.length > 0;
  const keywordMatches = keywordInput.trim() === requiredKeyword;
  const approveDisabled = disabled || (keywordRequired && !keywordMatches);

  return (
    <Backdrop>
      <Dialog role="dialog" aria-modal="true" $variant={tierMeta.color}>
        <DialogHeader $variant={tierMeta.color}>
          <HeaderIcon>
            <MdWarning size={22} />
          </HeaderIcon>
          <HeaderText>
            <HeaderTitle>쓰기 작업 승인이 필요해요</HeaderTitle>
            <HeaderSubtitle>
              <TierBadge $variant={tierMeta.color}>
                Tier {payload.tier} · {tierMeta.label}
              </TierBadge>
              <ToolName>{payload.tool_name}</ToolName>
            </HeaderSubtitle>
          </HeaderText>
        </DialogHeader>

        <DialogBody>
          {payload.plan_summary && (
            <Section>
              <SectionLabel>실행 요약</SectionLabel>
              <SummaryText>{payload.plan_summary}</SummaryText>
            </Section>
          )}

          <Section>
            <SectionLabel>전달될 인자</SectionLabel>
            <CodeBlock>{argsPreview}</CodeBlock>
          </Section>

          {payload.rationale && (
            <Section>
              <SectionLabel>도구 선택 근거</SectionLabel>
              <RationaleText>{payload.rationale}</RationaleText>
            </Section>
          )}

          {keywordRequired && (
            <Section>
              <SectionLabel>확인 키워드 — 위험 작업</SectionLabel>
              <KeywordHint>
                이 작업을 실행하려면 아래 칸에 <KeywordBadge>{requiredKeyword}</KeywordBadge>
                를 정확히 입력해주세요. 대소문자와 공백을 모두 맞춰야 합니다.
              </KeywordHint>
              <KeywordInput
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                placeholder={`여기에 "${requiredKeyword}" 를 그대로 입력`}
                $ok={keywordMatches}
                autoFocus
                disabled={disabled}
              />
              {!keywordMatches && keywordInput.length > 0 && (
                <KeywordWarn>키워드가 일치하지 않아요.</KeywordWarn>
              )}
            </Section>
          )}

          <Section>
            <SectionLabel>메모 (선택)</SectionLabel>
            <MemoInput
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="승인/거절 사유를 남기면 감사 로그에 기록돼요."
              rows={2}
              maxLength={500}
              disabled={disabled}
            />
          </Section>
        </DialogBody>

        <DialogFooter>
          <FooterButton
            type="button"
            $variant="reject"
            onClick={() => onReject?.(comment)}
            disabled={disabled}
          >
            <MdClose size={18} />
            <span>거절</span>
          </FooterButton>
          <FooterButton
            type="button"
            $variant="approve"
            onClick={() => onApprove?.(comment)}
            disabled={approveDisabled}
            title={
              approveDisabled && keywordRequired && !keywordMatches
                ? `"${requiredKeyword}" 를 정확히 입력해주세요.`
                : undefined
            }
          >
            <MdCheck size={18} />
            <span>승인하고 실행</span>
          </FooterButton>
        </DialogFooter>
      </Dialog>
    </Backdrop>
  );
}


/* ── styled-components ── */

const fadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;

const slideUp = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(2px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.lg};
  animation: ${fadeIn} 0.15s ease-out;
`;

const Dialog = styled.div`
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.colors.bgMain};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  animation: ${slideUp} 0.2s ease-out;
`;

const DialogHeader = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  ${({ $variant, theme }) =>
    $variant === 'error'
      ? css`background: ${theme.colors.errorLight};`
      : css`background: ${theme.colors.warningLight};`}
`;

const HeaderIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.6);
  color: ${({ theme }) => theme.colors.warning};
  flex-shrink: 0;
`;

const HeaderText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`;

const HeaderTitle = styled.h3`
  margin: 0;
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const HeaderSubtitle = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-wrap: wrap;
`;

const TierBadge = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  background: ${({ $variant, theme }) =>
    $variant === 'error' ? theme.colors.error : theme.colors.warning};
  color: #fff;
`;

const ToolName = styled.code`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const DialogBody = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
  overflow-y: auto;
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const SectionLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const SummaryText = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.textPrimary};
  line-height: 1.5;
`;

const CodeBlock = styled.pre`
  margin: 0;
  padding: ${({ theme }) => theme.spacing.sm};
  background: ${({ theme }) => theme.colors.bgSubtle};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textPrimary};
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 220px;
  overflow: auto;
`;

const RationaleText = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
  line-height: 1.5;
`;

const MemoInput = styled.textarea`
  resize: none;
  padding: ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  font-family: inherit;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  line-height: 1.5;
  background: ${({ theme }) => theme.colors.bgSubtle};
  color: ${({ theme }) => theme.colors.textPrimary};
  outline: none;

  &:focus {
    border-color: ${({ theme }) => theme.colors.primary};
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const DialogFooter = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bgSubtle};
  justify-content: flex-end;
`;

const FooterButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 18px;
  min-width: 120px;
  border: none;
  border-radius: 8px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.1s ease;

  &:hover:not(:disabled) { opacity: 0.9; }
  &:active:not(:disabled) { transform: translateY(1px); }
  &:disabled { opacity: 0.45; cursor: not-allowed; }

  ${({ $variant, theme }) =>
    $variant === 'approve'
      ? css`
          background: ${theme.colors.primary};
          color: #fff;
        `
      : css`
          background: ${theme.colors.bgMain};
          color: ${theme.colors.error};
          border: 1px solid ${theme.colors.error};
        `}
`;


/* ── Step 6b: 키워드 타이핑 확인 UI ── */

const KeywordHint = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  line-height: 1.5;
`;

const KeywordBadge = styled.code`
  display: inline-block;
  padding: 1px 8px;
  margin: 0 2px;
  background: ${({ theme }) => theme.colors.errorLight};
  color: ${({ theme }) => theme.colors.error};
  border-radius: 4px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`;

const KeywordInput = styled.input`
  padding: ${({ theme }) => theme.spacing.sm};
  border-radius: 6px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  background: ${({ theme }) => theme.colors.bgSubtle};
  color: ${({ theme }) => theme.colors.textPrimary};
  outline: none;
  transition: border-color 0.15s ease, background 0.15s ease;

  border: 2px solid
    ${({ $ok, theme }) => ($ok ? theme.colors.success : theme.colors.error)};

  &:focus {
    background: ${({ theme }) => theme.colors.bgMain};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const KeywordWarn = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.error};
`;
