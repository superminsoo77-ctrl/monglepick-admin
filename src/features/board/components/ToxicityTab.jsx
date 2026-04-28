/**
 * 혐오표현(독성) 로그 관리 탭 컴포넌트.
 *
 * 기능:
 * - 독성 로그 목록 테이블 (inputText 미리보기, toxicityScore, toxicityType, actionTaken, targetType, userId, 시간)
 * - 상단 필터: minScore select (0.3 / 0.5 / 0.8 이상)
 * - 조치 모달: 복원 / 삭제 / 경고 3개 버튼
 * - 페이지네이션
 * - toxicityScore 색상: >= 0.8 → error, >= 0.5 → warning, < 0.5 → info
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { MdRefresh, MdRestoreFromTrash, MdDelete, MdWarning } from 'react-icons/md';
import { fetchToxicityLogs, processToxicity } from '../api/contentApi';
import StatusBadge from '@/shared/components/StatusBadge';

/** 최소 독성 점수 필터 옵션 */
const MIN_SCORE_OPTIONS = [
  { value: '', label: '전체' },
  { value: '0.3', label: '0.3 이상' },
  { value: '0.5', label: '0.5 이상' },
  { value: '0.8', label: '0.8 이상' },
];

/** 조치 결과 상태 → StatusBadge variant 매핑 */
const ACTION_TAKEN_BADGE = {
  BLIND: { status: 'warning', label: '블라인드' },
  DELETE: { status: 'error', label: '삭제됨' },
  WARN: { status: 'info', label: '경고' },
  NONE: { status: 'success', label: '정상 처리' },
  PENDING: { status: 'default', label: '대기' },
};

/** 대상 타입 한국어 라벨 */
const TARGET_TYPE_LABELS = {
  POST: '게시글',
  REVIEW: '리뷰',
  COMMENT: '댓글',
  CHAT: '채팅',
};

const SEVERITY_LABELS = {
  LOW: '경미',
  MEDIUM: '주의',
  HIGH: '고위험',
  CRITICAL: '긴급',
};

/** 페이지당 항목 수 */
const PAGE_SIZE = 10;

/**
 * toxicityScore 값에 따른 색상 variant 반환.
 * @param {number} score - 0.0 ~ 1.0
 * @returns {'error'|'warning'|'info'}
 */
function scoreToBadgeStatus(score) {
  if (score >= 0.8) return 'error';
  if (score >= 0.5) return 'warning';
  return 'info';
}

/**
 * 날짜 문자열을 YYYY.MM.DD HH:MM 형식으로 포맷.
 * @param {string} dateStr - ISO 날짜 문자열
 * @returns {string}
 */
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseDetectedWords(detectedWords) {
  if (!detectedWords) return [];

  try {
    const parsed = JSON.parse(detectedWords);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((word) => typeof word === 'string')
        .map((word) => word.trim())
        .filter(Boolean);
    }
  } catch {
    // JSON이 아니면 아래 문자열 fallback 사용
  }

  return String(detectedWords)
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replaceAll('"', '')
    .split(',')
    .map((word) => word.trim())
    .filter(Boolean);
}

function getPreviewText(log) {
  if (log.inputText?.trim()) {
    return log.inputText.trim();
  }

  const detectedWords = parseDetectedWords(log.detectedWords);
  if (detectedWords.length > 0) {
    return `감지 단어: ${detectedWords.join(', ')}`;
  }

  const targetType = log.targetType ?? log.contentType;
  const targetLabel = TARGET_TYPE_LABELS[targetType] ?? targetType ?? '콘텐츠';
  if (log.contentId != null) {
    return `${targetLabel} #${log.contentId}`;
  }
  return '-';
}

function getToxicityTypeLabel(log) {
  if (log.toxicityType?.trim()) {
    return log.toxicityType.trim();
  }

  const severity = String(log.severity ?? '').trim().toUpperCase();
  return SEVERITY_LABELS[severity] ?? (severity || '-');
}

function getTargetTypeLabel(log) {
  const targetType = log.targetType ?? log.contentType;
  return TARGET_TYPE_LABELS[targetType] ?? targetType ?? '-';
}

function getActionTakenBadge(actionTaken) {
  const normalized = String(actionTaken ?? 'PENDING').trim().toUpperCase() || 'PENDING';
  return ACTION_TAKEN_BADGE[normalized] ?? { status: 'default', label: actionTaken ?? '-' };
}

export default function ToxicityTab() {
  /* ── 목록 상태 ── */
  const [logs, setLogs] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* ── 필터/페이지 상태 ── */
  const [minScore, setMinScore] = useState('');
  const [page, setPage] = useState(0);

  /* ── 조치 모달 상태 ── */
  const [actionTarget, setActionTarget] = useState(null); // 선택된 로그 항목
  const [actionLoading, setActionLoading] = useState(false);

  /** 독성 로그 목록 조회 */
  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = { page, size: PAGE_SIZE };
      if (minScore) params.minScore = minScore;
      const result = await fetchToxicityLogs(params);
      setLogs(result?.content ?? []);
      setTotalPages(result?.totalPages ?? 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, minScore]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  /** minScore 필터 변경 시 첫 페이지로 초기화 */
  function handleMinScoreChange(e) {
    setMinScore(e.target.value);
    setPage(0);
  }

  /** 조치 모달 열기 */
  function openActionModal(log) {
    setActionTarget(log);
  }

  /** 조치 모달 닫기 */
  function closeActionModal() {
    setActionTarget(null);
  }

  /**
   * 독성 로그 조치 처리 실행.
   * @param {'restore'|'delete'|'warn'} action - 조치 유형
   */
  async function handleAction(action) {
    if (!actionTarget) return;
    try {
      setActionLoading(true);
      await processToxicity(actionTarget.id, { action });
      closeActionModal();
      loadLogs();
    } catch (err) {
      alert(err.message || '처리 중 오류가 발생했습니다.');
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <Container>
      {/* ── 툴바: 점수 필터 + 새로고침 ── */}
      <Toolbar>
        <ToolbarLeft>
          <FilterLabel>독성 점수 기준:</FilterLabel>
          <FilterSelect value={minScore} onChange={handleMinScoreChange}>
            {MIN_SCORE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </FilterSelect>
        </ToolbarLeft>
        <ToolbarRight>
          <IconButton onClick={loadLogs} disabled={loading} title="새로고침">
            <MdRefresh size={16} />
          </IconButton>
        </ToolbarRight>
      </Toolbar>

      {/* ── 에러 메시지 ── */}
      {error && <ErrorMsg>{error}</ErrorMsg>}

      {/* ── 독성 로그 테이블 ── */}
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>입력 텍스트 미리보기</Th>
              <Th $w="90px">독성 점수</Th>
              <Th $w="90px">독성 유형</Th>
              <Th $w="90px">조치 결과</Th>
              <Th $w="80px">대상 타입</Th>
              <Th $w="110px">사용자 ID</Th>
              <Th $w="140px">감지 시간</Th>
              <Th $w="80px">액션</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8}>
                  <CenterCell>불러오는 중...</CenterCell>
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <CenterCell>혐오표현 로그가 없습니다.</CenterCell>
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const actionBadge = getActionTakenBadge(log.actionTaken);
                const scoreVal = log.toxicityScore ?? 0;
                const previewText = getPreviewText(log);
                const toxicityTypeLabel = getToxicityTypeLabel(log);
                return (
                  <Tr key={log.id}>
                    {/* 입력 텍스트 미리보기 (100자 truncate) */}
                    <Td>
                      <PreviewText>
                        {previewText.slice(0, 100)}
                      </PreviewText>
                    </Td>
                    {/* 독성 점수 */}
                    <Td>
                      {log.toxicityScore != null ? (
                        <StatusBadge
                          status={scoreToBadgeStatus(scoreVal)}
                          label={scoreVal.toFixed(2)}
                        />
                      ) : (
                        <span style={{ color: '#94a3b8' }}>-</span>
                      )}
                    </Td>
                    {/* 독성 유형 */}
                    <Td>
                      <MutedText>{toxicityTypeLabel}</MutedText>
                    </Td>
                    {/* 조치 결과 */}
                    <Td>
                      <StatusBadge status={actionBadge.status} label={actionBadge.label} />
                    </Td>
                    {/* 대상 타입 */}
                    <Td>
                      <StatusBadge
                        status="info"
                        label={getTargetTypeLabel(log)}
                      />
                    </Td>
                    {/* 사용자 ID */}
                    <Td>
                      <MutedText>{log.userId ?? '-'}</MutedText>
                    </Td>
                    {/* 감지 시간 */}
                    <Td>
                      <MutedText>{formatDate(log.createdAt)}</MutedText>
                    </Td>
                    {/* 액션 버튼 */}
                    <Td>
                      <ActionButton onClick={() => openActionModal(log)}>
                        조치
                      </ActionButton>
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
          <PageButton onClick={() => setPage((p) => p - 1)} disabled={page === 0}>
            이전
          </PageButton>
          <PageInfo>{page + 1} / {totalPages}</PageInfo>
          <PageButton onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= totalPages}>
            다음
          </PageButton>
        </Pagination>
      )}

      {/* ── 조치 모달 ── */}
      {actionTarget && (
        <Overlay onClick={closeActionModal}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>혐오표현 조치</ModalTitle>
              <CloseButton onClick={closeActionModal}>✕</CloseButton>
            </ModalHeader>

            {/* 로그 요약 정보 */}
            <ModalBody>
              <InfoRow>
                <InfoLabel>독성 점수</InfoLabel>
                <InfoValue>
                  {actionTarget.toxicityScore != null ? (
                    <StatusBadge
                      status={scoreToBadgeStatus(actionTarget.toxicityScore)}
                      label={actionTarget.toxicityScore.toFixed(2)}
                    />
                  ) : '-'}
                </InfoValue>
              </InfoRow>
              <InfoRow>
                <InfoLabel>독성 유형</InfoLabel>
                <InfoValue>{getToxicityTypeLabel(actionTarget)}</InfoValue>
              </InfoRow>
              <InfoRow>
                <InfoLabel>입력 텍스트</InfoLabel>
                <InfoValue>{getPreviewText(actionTarget).slice(0, 200)}</InfoValue>
              </InfoRow>

              {/* 조치 설명 */}
              <ActionDesc>아래 조치 중 하나를 선택하세요.</ActionDesc>

              {/* 조치 버튼 3개 */}
              <ActionGrid>
                <ActionCard
                  $variant="success"
                  onClick={() => handleAction('restore')}
                  disabled={actionLoading}
                >
                  <MdRestoreFromTrash size={20} />
                  <ActionCardLabel>복원</ActionCardLabel>
                  <ActionCardDesc>콘텐츠를 원상 복구합니다.</ActionCardDesc>
                </ActionCard>
                <ActionCard
                  $variant="danger"
                  onClick={() => handleAction('delete')}
                  disabled={actionLoading}
                >
                  <MdDelete size={20} />
                  <ActionCardLabel>삭제</ActionCardLabel>
                  <ActionCardDesc>콘텐츠를 영구 삭제합니다.</ActionCardDesc>
                </ActionCard>
                <ActionCard
                  $variant="warning"
                  onClick={() => handleAction('warn')}
                  disabled={actionLoading}
                >
                  <MdWarning size={20} />
                  <ActionCardLabel>경고</ActionCardLabel>
                  <ActionCardDesc>작성자에게 경고를 발송합니다.</ActionCardDesc>
                </ActionCard>
              </ActionGrid>
            </ModalBody>

            <ModalFooter>
              <CancelButton onClick={closeActionModal} disabled={actionLoading}>
                취소
              </CancelButton>
            </ModalFooter>
          </Modal>
        </Overlay>
      )}
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
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const ToolbarRight = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const FilterLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  white-space: nowrap;
`;

const FilterSelect = styled.select`
  padding: 5px 10px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  outline: none;
  background: white;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
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
  transition: background ${({ theme }) => theme.transitions.fast};
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
  &:last-child { border-bottom: none; }
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
`;

const Td = styled.td`
  padding: 10px 12px;
  color: ${({ theme }) => theme.colors.textPrimary};
  vertical-align: middle;
`;

/** 말줄임 텍스트 (최대 너비 고정) */
const PreviewText = styled.span`
  display: block;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const MutedText = styled.span`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.xs};
`;

const ActionButton = styled.button`
  padding: 3px 10px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 3px;
  color: ${({ theme }) => theme.colors.textSecondary};
  transition: all ${({ theme }) => theme.transitions.fast};
  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.primary};
  }
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

/* ── 모달 ── */

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
`;

const Modal = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: ${({ theme }) => theme.shadows.lg};
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.xl};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const ModalTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`;

const CloseButton = styled.button`
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.textMuted};
  &:hover { color: ${({ theme }) => theme.colors.textPrimary}; }
`;

const ModalBody = styled.div`
  padding: ${({ theme }) => theme.spacing.xl};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const InfoRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  align-items: flex-start;
`;

const InfoLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
  min-width: 80px;
  flex-shrink: 0;
`;

const InfoValue = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  word-break: break-all;
  line-height: 1.5;
`;

const ActionDesc = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
  margin-top: ${({ theme }) => theme.spacing.sm};
  padding-top: ${({ theme }) => theme.spacing.md};
  border-top: 1px solid ${({ theme }) => theme.colors.borderLight};
`;

const ActionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: ${({ theme }) => theme.spacing.md};
`;

/** 조치 유형별 색상 매핑 */
const ACTION_CARD_COLORS = {
  success: { border: '#a7f3d0', bg: '#ecfdf5', color: '#059669' },
  danger: { border: '#fecaca', bg: '#fef2f2', color: '#dc2626' },
  warning: { border: '#fde68a', bg: '#fffbeb', color: '#d97706' },
};

const ActionCard = styled.button`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ $variant }) => ACTION_CARD_COLORS[$variant]?.border ?? '#e2e8f0'};
  border-radius: 6px;
  background: ${({ $variant }) => ACTION_CARD_COLORS[$variant]?.bg ?? '#f8fafc'};
  color: ${({ $variant }) => ACTION_CARD_COLORS[$variant]?.color ?? '#475569'};
  transition: all ${({ theme }) => theme.transitions.fast};
  &:hover:not(:disabled) {
    opacity: 0.85;
    transform: translateY(-1px);
  }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const ActionCardLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`;

const ActionCardDesc = styled.span`
  font-size: 11px;
  text-align: center;
  line-height: 1.4;
`;

const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  padding: ${({ theme }) => theme.spacing.lg} ${({ theme }) => theme.spacing.xl};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`;

const CancelButton = styled.button`
  padding: 7px 16px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.bgHover}; }
  &:disabled { opacity: 0.5; }
`;
