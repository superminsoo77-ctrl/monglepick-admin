/**
 * 신고 관리 탭 컴포넌트.
 *
 * 기능:
 * - 신고 목록 테이블 (targetType, targetPreview, declarationContent, toxicityScore, status, userId, 신고일, 액션)
 * - 상단 필터: status 버튼 (전체/pending/reviewed/dismissed)
 * - 조치 모달: 블라인드 / 삭제 / 무시 3개 버튼
 * - 페이지네이션
 * - toxicityScore 색상: >= 0.8 → error, >= 0.5 → warning, < 0.5 → info
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { MdRefresh, MdWarning, MdBlock, MdVisibilityOff } from 'react-icons/md';
import { fetchReports, processReport } from '../api/contentApi';
import StatusBadge from '@/shared/components/StatusBadge';

/** 신고 상태 필터 옵션 */
const STATUS_FILTERS = [
  { value: '', label: '전체' },
  { value: 'pending', label: '대기' },
  { value: 'reviewed', label: '처리됨' },
  { value: 'dismissed', label: '무시됨' },
];

/** 신고 상태 → StatusBadge variant 매핑 */
const STATUS_BADGE = {
  pending: { status: 'warning', label: '대기' },
  reviewed: { status: 'success', label: '처리됨' },
  dismissed: { status: 'default', label: '무시됨' },
};

/** 대상 타입 한국어 라벨 (대·소문자 모두 대응) */
const TARGET_TYPE_LABELS = {
  POST: '게시글',
  REVIEW: '리뷰',
  COMMENT: '댓글',
  USER: '사용자',
};

/** 신고 유형 코드 → 한국어 라벨 */
const REASON_LABELS = {
  SPAM: '스팸 / 도배',
  ABUSE: '욕설 / 비방',
  OBSCENE: '음란물',
  DEFAMATION: '명예훼손',
  ETC: '기타',
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

/**
 * declarationContent(예: "SPAM", "ABUSE: 추가설명")를 한국어 라벨로 변환.
 * @param {string} content - 신고 내용 원문
 * @returns {string}
 */
function formatReason(content) {
  if (!content) return '-';
  const colonIdx = content.indexOf(': ');
  const code = colonIdx >= 0 ? content.slice(0, colonIdx) : content;
  const detail = colonIdx >= 0 ? content.slice(colonIdx + 2) : '';
  const label = REASON_LABELS[code.trim().toUpperCase()] ?? code;
  return detail ? `${label}: ${detail}` : label;
}

/**
 * 신고 관리 탭 컴포넌트.
 *
 * @param {Object}  props
 * @param {number|null} props.aiReportId - AI 어시스턴트가 직접 오픈을 요청한 신고 ID.
 *   데이터 로드 완료 후 해당 신고 행을 찾아 조치 모달을 자동으로 열고,
 *   useRef 로 중복 발동을 차단한다.
 */
export default function ReportTab({ aiReportId = null }) {
  /* ── 목록 상태 ── */
  const [reports, setReports] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* ── 필터/페이지 상태 ── */
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(0);

  /* ── 조치 모달 상태 ── */
  const [actionTarget, setActionTarget] = useState(null); // 선택된 신고 항목
  const [actionLoading, setActionLoading] = useState(false);

  /**
   * AI 자동 오픈 중복 차단 플래그.
   * 한 번 처리되면 다시 발동하지 않도록 useRef 로 유지한다.
   */
  const aiAutoOpenedRef = useRef(false);

  /** 신고 목록 조회 */
  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = { page, size: PAGE_SIZE };
      if (filterStatus) params.status = filterStatus;
      const result = await fetchReports(params);
      setReports(result?.content ?? []);
      setTotalPages(result?.totalPages ?? 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  /**
   * AI 자동 모달 오픈 — aiReportId 가 있고 데이터 로드가 완료된 시점에 실행.
   * reports 배열에서 해당 ID 를 찾아 조치 모달을 자동으로 연다.
   * aiAutoOpenedRef 로 중복 발동을 차단한다.
   */
  useEffect(() => {
    if (!aiReportId || loading || aiAutoOpenedRef.current) return;
    const target = reports.find((r) => r.id === aiReportId);
    if (target) {
      aiAutoOpenedRef.current = true;
      setActionTarget(target);
    }
  }, [aiReportId, reports, loading]);

  /** 필터 변경 시 첫 페이지로 초기화 */
  function handleStatusChange(value) {
    setFilterStatus(value);
    setPage(0);
  }

  /** 조치 모달 열기 */
  function openActionModal(report) {
    setActionTarget(report);
  }

  /** 조치 모달 닫기 */
  function closeActionModal() {
    setActionTarget(null);
  }

  /**
   * 신고 조치 처리 실행.
   * @param {'blind'|'delete'|'dismiss'} action - 조치 유형
   */
  async function handleAction(action) {
    if (!actionTarget) return;
    try {
      setActionLoading(true);
      await processReport(actionTarget.id, { action });
      closeActionModal();
      loadReports();
    } catch (err) {
      alert(err.message || '처리 중 오류가 발생했습니다.');
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <Container>
      {/* ── 툴바: 상태 필터 + 새로고침 ── */}
      <Toolbar>
        <ToolbarLeft>
          {STATUS_FILTERS.map((f) => (
            <FilterButton
              key={f.value}
              $active={filterStatus === f.value}
              onClick={() => handleStatusChange(f.value)}
            >
              {f.label}
            </FilterButton>
          ))}
        </ToolbarLeft>
        <ToolbarRight>
          <IconButton onClick={loadReports} disabled={loading} title="새로고침">
            <MdRefresh size={16} />
          </IconButton>
        </ToolbarRight>
      </Toolbar>

      {/* ── 에러 메시지 ── */}
      {error && <ErrorMsg>{error}</ErrorMsg>}

      {/* ── 신고 목록 테이블 ── */}
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th $w="80px">대상 타입</Th>
              <Th>신고 대상 미리보기</Th>
              <Th>신고 내용</Th>
              <Th $w="90px">독성 점수</Th>
              <Th $w="80px">상태</Th>
              <Th $w="110px">신고자 ID</Th>
              <Th $w="140px">신고일</Th>
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
            ) : reports.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <CenterCell>신고 내역이 없습니다.</CenterCell>
                </td>
              </tr>
            ) : (
              reports.map((report) => {
                const badge = STATUS_BADGE[report.status] ?? { status: 'default', label: report.status };
                const scoreVal = report.toxicityScore ?? 0;
                return (
                  <Tr key={report.id}>
                    {/* 대상 타입 */}
                    <Td>
                      <StatusBadge
                        status="info"
                        label={TARGET_TYPE_LABELS[report.targetType?.toUpperCase()] ?? report.targetType ?? '-'}
                      />
                    </Td>
                    {/* 신고 대상 미리보기 (50자 truncate) */}
                    <Td>
                      <PreviewText $maxWidth="200px">
                        {report.targetPreview
                          ? report.targetPreview.slice(0, 50)
                          : '-'}
                      </PreviewText>
                    </Td>
                    {/* 신고 내용 */}
                    <Td>
                      <PreviewText $maxWidth="220px">
                        {formatReason(report.declarationContent)}
                      </PreviewText>
                    </Td>
                    {/* 독성 점수 (색상 배지) */}
                    <Td>
                      {report.toxicityScore != null ? (
                        <StatusBadge
                          status={scoreToBadgeStatus(scoreVal)}
                          label={scoreVal.toFixed(2)}
                        />
                      ) : (
                        <span style={{ color: '#94a3b8' }}>-</span>
                      )}
                    </Td>
                    {/* 신고 상태 */}
                    <Td>
                      <StatusBadge status={badge.status} label={badge.label} />
                    </Td>
                    {/* 신고자 ID */}
                    <Td>
                      <MutedText>{report.userId ?? '-'}</MutedText>
                    </Td>
                    {/* 신고일 */}
                    <Td>
                      <MutedText>{formatDate(report.createdAt)}</MutedText>
                    </Td>
                    {/* 액션 버튼 */}
                    <Td>
                      <ActionButton onClick={() => openActionModal(report)}>
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
              <ModalTitle>신고 조치</ModalTitle>
              <CloseButton onClick={closeActionModal}>✕</CloseButton>
            </ModalHeader>

            {/* 신고 요약 정보 */}
            <ModalBody>
              <InfoRow>
                <InfoLabel>대상 타입</InfoLabel>
                <InfoValue>
                  {TARGET_TYPE_LABELS[actionTarget.targetType] ?? actionTarget.targetType ?? '-'}
                </InfoValue>
              </InfoRow>
              <InfoRow>
                <InfoLabel>신고 내용</InfoLabel>
                <InfoValue>{formatReason(actionTarget.declarationContent)}</InfoValue>
              </InfoRow>
              {actionTarget.toxicityScore != null && (
                <InfoRow>
                  <InfoLabel>독성 점수</InfoLabel>
                  <InfoValue>
                    <StatusBadge
                      status={scoreToBadgeStatus(actionTarget.toxicityScore)}
                      label={actionTarget.toxicityScore.toFixed(2)}
                    />
                  </InfoValue>
                </InfoRow>
              )}

              {/* 조치 설명 */}
              <ActionDesc>아래 조치 중 하나를 선택하세요.</ActionDesc>

              {/* 조치 버튼 3개 */}
              <ActionGrid>
                <ActionCard
                  $variant="warning"
                  onClick={() => handleAction('blind')}
                  disabled={actionLoading}
                >
                  <MdVisibilityOff size={20} />
                  <ActionCardLabel>블라인드</ActionCardLabel>
                  <ActionCardDesc>해당 콘텐츠를 숨김 처리합니다.</ActionCardDesc>
                </ActionCard>
                <ActionCard
                  $variant="danger"
                  onClick={() => handleAction('delete')}
                  disabled={actionLoading}
                >
                  <MdBlock size={20} />
                  <ActionCardLabel>삭제</ActionCardLabel>
                  <ActionCardDesc>해당 콘텐츠를 영구 삭제합니다.</ActionCardDesc>
                </ActionCard>
                <ActionCard
                  $variant="default"
                  onClick={() => handleAction('dismiss')}
                  disabled={actionLoading}
                >
                  <MdWarning size={20} />
                  <ActionCardLabel>무시</ActionCardLabel>
                  <ActionCardDesc>이 신고를 무효 처리합니다.</ActionCardDesc>
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
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.border)};
  background: ${({ $active, theme }) => ($active ? theme.colors.primaryLight : 'transparent')};
  color: ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.textSecondary)};
  font-weight: ${({ $active, theme }) =>
    $active ? theme.fontWeights.semibold : theme.fontWeights.normal};
  transition: all ${({ theme }) => theme.transitions.fast};
  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.primary};
  }
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

/** 말줄임 텍스트 */
const PreviewText = styled.span`
  display: block;
  max-width: ${({ $maxWidth }) => $maxWidth ?? '200px'};
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
`;

const ActionDesc = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
  margin-top: ${({ theme }) => theme.spacing.sm};
  padding-top: ${({ theme }) => theme.spacing.md};
  border-top: 1px solid ${({ theme }) => theme.colors.borderLight};
`;

/** 조치 버튼 카드 3개를 가로 배치 */
const ActionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: ${({ theme }) => theme.spacing.md};
`;

/** 조치 유형별 색상 매핑 */
const ACTION_CARD_COLORS = {
  warning: { border: '#fde68a', bg: '#fffbeb', color: '#d97706' },
  danger: { border: '#fecaca', bg: '#fef2f2', color: '#dc2626' },
  default: { border: '#e2e8f0', bg: '#f8fafc', color: '#475569' },
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
