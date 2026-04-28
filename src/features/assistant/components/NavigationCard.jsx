/**
 * AI 화면 이동 안내 카드 (v3 Phase F).
 *
 * Agent 가 `navigation` SSE 이벤트를 발행했을 때 assistant 메시지 하단에 렌더된다.
 * AI 는 데이터를 조회해 이동 경로를 찾아주는 역할만 하며, 실제 처리(환불·제재 등)는
 * 관리자가 해당 화면에서 직접 수행해야 함을 명확히 안내한다.
 *
 * 단건 모드 (target_path 있음):
 *  - context_summary 요약 + `label` 버튼 → navigate(target_path)
 *
 * 다건 모드 (candidates 배열 있음):
 *  - context_summary 요약 + 각 후보마다 행 렌더 + 각각의 "이동" 버튼
 *
 * 공통:
 *  - 상단 경고 배너: "실제 처리는 화면에서 관리자가 직접 수행합니다."
 *
 * @param {Object}    props
 * @param {Object}    props.data                navigation 이벤트 페이로드 전체
 * @param {string|null} props.data.target_path  단건 이동 경로 (다건이면 null)
 * @param {string}    props.data.label          단건 버튼 레이블
 * @param {string}    props.data.context_summary 검색 결과 요약 (예: "2명 검색됨")
 * @param {Array}     [props.data.candidates]   다건 후보 배열 [{ target_path, label }]
 * @param {string}    [props.data.tool_name]    어떤 navigate tool 이 생성했는지 (디버그용)
 */

import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { MdNavigateNext, MdWarningAmber, MdTravelExplore } from 'react-icons/md';

export default function NavigationCard({ data }) {
  const navigate = useNavigate();

  if (!data) return null;

  const {
    target_path,
    label,
    context_summary,
    candidates,
    tool_name,
  } = data;

  /** 단건 이동 핸들러 */
  function handleNavigate(path) {
    if (!path) return;
    navigate(path);
  }

  const isMulti = Array.isArray(candidates) && candidates.length > 0;

  return (
    <Card>
      {/* 카드 헤더 */}
      <CardHeader>
        <HeaderIcon>
          <MdTravelExplore size={16} />
        </HeaderIcon>
        <HeaderText>화면 이동 안내</HeaderText>
        {tool_name && <ToolBadge>{tool_name}</ToolBadge>}
      </CardHeader>

      {/* 위험 안내 배너 — 실제 처리는 관리자 직접 */}
      <WarningBanner>
        <MdWarningAmber size={14} />
        <span>실제 처리는 화면에서 관리자가 직접 수행합니다.</span>
      </WarningBanner>

      {/* context_summary — 검색 결과 경위 */}
      {context_summary && <Summary>{context_summary}</Summary>}

      {/* 단건 모드 */}
      {!isMulti && target_path && (
        <SingleAction>
          <NavButton
            type="button"
            onClick={() => handleNavigate(target_path)}
            title={target_path}
          >
            <MdNavigateNext size={16} />
            <span>{label || '화면으로 이동'}</span>
          </NavButton>
        </SingleAction>
      )}

      {/* 다건 모드 — 후보 목록 */}
      {isMulti && (
        <CandidateList>
          {candidates.map((c, idx) => (
            <CandidateRow key={c.target_path || idx}>
              <CandidateLabel>{c.label}</CandidateLabel>
              <NavButton
                type="button"
                onClick={() => handleNavigate(c.target_path)}
                disabled={!c.target_path}
                title={c.target_path || '경로 없음'}
                $compact
              >
                <MdNavigateNext size={15} />
                <span>이동</span>
              </NavButton>
            </CandidateRow>
          ))}
        </CandidateList>
      )}
    </Card>
  );
}


/* ── styled-components ── */

const Card = styled.div`
  margin-top: ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.warning};
  border-radius: 8px;
  overflow: hidden;
  background: ${({ theme }) => theme.colors.bgMain};
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.warningLight};
  border-bottom: 1px solid ${({ theme }) => theme.colors.warning};
`;

const HeaderIcon = styled.span`
  display: inline-flex;
  color: ${({ theme }) => theme.colors.warning};
`;

const HeaderText = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.warning};
`;

const ToolBadge = styled.code`
  margin-left: auto;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const WarningBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.warningLight};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.warning};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
`;

const Summary = styled.p`
  margin: 0;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  line-height: 1.5;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const SingleAction = styled.div`
  display: flex;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.bgSubtle};
`;

const CandidateList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
`;

const CandidateRow = styled.li`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bgSubtle};

  &:last-child {
    border-bottom: none;
  }
`;

const CandidateLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  min-width: 0;
  word-break: break-word;
`;

const NavButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: ${({ $compact }) => ($compact ? '4px 10px' : '6px 14px')};
  border: none;
  border-radius: 6px;
  background: ${({ theme }) => theme.colors.warning};
  color: #fff;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.15s ease;

  &:hover:not(:disabled) {
    opacity: 0.88;
  }
  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;
