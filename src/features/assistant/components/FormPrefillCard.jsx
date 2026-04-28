/**
 * AI 폼 초안 카드 (v3 Phase F).
 *
 * Agent 가 `form_prefill` SSE 이벤트를 발행했을 때 assistant 메시지 하단에 렌더된다.
 * AI 가 폼 필드를 채워두었으며, 관리자가 실제 저장은 해당 화면에서 직접 수행해야 함을
 * 명확히 안내한다.
 *
 * 동작:
 *  1. `summary` — 초안 생성 경위 요약 텍스트 표시
 *  2. `draft_fields` — key/value 2컬럼 그리드 (긴 값은 80자 truncate)
 *  3. `action_label` 버튼 클릭 → `navigate(target_path, { state: { draft: draft_fields, source: 'ai_assistant' } })`
 *  4. 버튼 옆 안내 문구: "저장은 열린 화면에서 직접 실행해 주세요."
 *
 * @param {Object}   props
 * @param {Object}   props.data               form_prefill 이벤트 페이로드 전체
 * @param {string}   props.data.target_path   이동할 관리 화면 경로 (예: /admin/support?tab=notice&modal=create)
 * @param {Object}   props.data.draft_fields  폼 필드 key→value 맵
 * @param {string}   props.data.action_label  버튼 레이블 (예: "공지사항 작성 화면 열기")
 * @param {string}   props.data.summary       초안 생성 경위 요약
 * @param {string}   [props.data.tool_name]   어떤 draft tool 이 생성했는지 (디버그용)
 */

import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { MdOpenInNew, MdArticle } from 'react-icons/md';

/** draft_fields 값 표시 시 최대 글자 수. 초과분은 "…" 로 잘라낸다. */
const MAX_VALUE_LEN = 80;

/**
 * 값 문자열을 MAX_VALUE_LEN 으로 자른다.
 * boolean / number 는 먼저 문자열로 변환한다.
 *
 * @param {*} val
 * @returns {string}
 */
function truncate(val) {
  if (val === null || val === undefined) return '—';
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  return str.length > MAX_VALUE_LEN ? `${str.slice(0, MAX_VALUE_LEN)}…` : str;
}

export default function FormPrefillCard({ data }) {
  const navigate = useNavigate();

  if (!data) return null;

  const { target_path, draft_fields = {}, action_label, summary, tool_name } = data;

  /** "열기" 버튼 클릭 핸들러 — 대상 화면으로 draft 상태를 실어 이동 */
  function handleOpen() {
    if (!target_path) return;
    navigate(target_path, {
      state: {
        draft: draft_fields,
        source: 'ai_assistant',
      },
    });
  }

  const fieldEntries = Object.entries(draft_fields);

  return (
    <Card>
      {/* 카드 헤더 */}
      <CardHeader>
        <HeaderIcon>
          <MdArticle size={16} />
        </HeaderIcon>
        <HeaderText>AI 초안 완성</HeaderText>
        {tool_name && <ToolBadge>{tool_name}</ToolBadge>}
      </CardHeader>

      {/* 초안 생성 경위 요약 */}
      {summary && <Summary>{summary}</Summary>}

      {/* draft_fields 2컬럼 그리드 */}
      {fieldEntries.length > 0 && (
        <FieldGrid>
          {fieldEntries.map(([key, val]) => (
            <FieldRow key={key}>
              <FieldKey>{key}</FieldKey>
              <FieldVal>{truncate(val)}</FieldVal>
            </FieldRow>
          ))}
        </FieldGrid>
      )}

      {/* 하단 액션 영역 */}
      <Footer>
        <OpenButton
          type="button"
          onClick={handleOpen}
          disabled={!target_path}
          title={target_path || '이동 경로가 지정되지 않았어요.'}
        >
          <MdOpenInNew size={15} />
          <span>{action_label || '화면 열기'}</span>
        </OpenButton>
        <FooterHint>저장은 열린 화면에서 직접 실행해 주세요.</FooterHint>
      </Footer>
    </Card>
  );
}


/* ── styled-components ── */

const Card = styled.div`
  margin-top: ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.primary};
  border-radius: 8px;
  overflow: hidden;
  background: ${({ theme }) => theme.colors.bgMain};
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.primaryLight};
  border-bottom: 1px solid ${({ theme }) => theme.colors.primary};
`;

const HeaderIcon = styled.span`
  display: inline-flex;
  color: ${({ theme }) => theme.colors.primary};
`;

const HeaderText = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.primary};
`;

const ToolBadge = styled.code`
  margin-left: auto;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const Summary = styled.p`
  margin: 0;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  line-height: 1.5;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const FieldGrid = styled.dl`
  margin: 0;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px ${({ theme }) => theme.spacing.md};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const FieldRow = styled.div`
  display: contents; /* grid-template-columns 에 참여하도록 display: contents */
`;

const FieldKey = styled.dt`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textMuted};
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  white-space: nowrap;
  padding: 2px 0;
`;

const FieldVal = styled.dd`
  margin: 0;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textPrimary};
  word-break: break-word;
  padding: 2px 0;
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.bgSubtle};
  flex-wrap: wrap;
`;

const OpenButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  border: none;
  border-radius: 6px;
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  transition: opacity 0.15s ease;
  flex-shrink: 0;

  &:hover:not(:disabled) {
    opacity: 0.88;
  }
  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

const FooterHint = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
`;
