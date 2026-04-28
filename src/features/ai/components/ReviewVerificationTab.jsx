/**
 * 도장깨기 리뷰 인증 관리 탭 (AI 운영 → 리뷰 인증) — 2026-04-14 신규.
 *
 * <h3>목적</h3>
 * 사용자가 도장깨기 코스에서 작성한 리뷰를 "영화 줄거리 ↔ 리뷰 유사도" 기반으로 AI 에이전트
 * 가 판정한 시청 인증 기록을 관리자가 모니터링/오버라이드하는 화면.
 * 에이전트 자체는 추후 개발 예정이며, 본 화면은 에이전트 결과 판독 + 수동 오버라이드(승인/
 * 반려/재검증)를 담당한다.
 *
 * <h3>구성</h3>
 * - 상단 KPI 카드 7개 (PENDING / AUTO_VERIFIED / NEEDS_REVIEW / AUTO_REJECTED / ADMIN_APPROVED /
 *   ADMIN_REJECTED / 현재 AI 임계값)
 * - 필터 툴바 (상태 / 최소 신뢰도 / 사용자 ID / 코스 ID / 기간)
 * - 테이블 (10건/페이지) — 행 클릭 시 상세 모달
 * - 상세 모달 — 리뷰 본문 + 영화 줄거리 + 매칭 키워드 배지 + 승인/반려/재검증 3버튼
 *
 * <h3>참고 패턴</h3>
 * ToxicityTab.jsx 의 점수 색상/조치 모달 패턴 + QuizManagementTab 의 복합 필터 + KPI 카드 블럭.
 * 중복 코드는 의도적 — 이 탭은 독립적으로 유지보수/삭제 가능해야 하므로 얕은 공유에 머문다.
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { MdRefresh, MdCheck, MdClose, MdReplay } from 'react-icons/md';
import StatusBadge from '@/shared/components/StatusBadge';
import {
  fetchReviewVerifications,
  fetchReviewVerificationOverview,
  fetchReviewVerificationDetail,
  approveReviewVerification,
  rejectReviewVerification,
  reverifyReviewVerification,
} from '../api/aiApi';

/** 페이지당 항목 수 */
const PAGE_SIZE = 10;

/** 리뷰 인증 상태 → StatusBadge variant/라벨 매핑 */
const REVIEW_STATUS_BADGE = {
  PENDING:        { status: 'default', label: '대기' },
  AUTO_VERIFIED:  { status: 'success', label: '자동 승인' },
  NEEDS_REVIEW:   { status: 'warning', label: '검토 필요' },
  AUTO_REJECTED:  { status: 'error',   label: '자동 반려' },
  ADMIN_APPROVED: { status: 'success', label: '관리자 승인' },
  ADMIN_REJECTED: { status: 'error',   label: '관리자 반려' },
};

/** 상태 필터 옵션 */
const STATUS_FILTER_OPTIONS = [
  { value: '',               label: '전체' },
  { value: 'PENDING',        label: '대기' },
  { value: 'AUTO_VERIFIED',  label: '자동 승인' },
  { value: 'NEEDS_REVIEW',   label: '검토 필요' },
  { value: 'AUTO_REJECTED',  label: '자동 반려' },
  { value: 'ADMIN_APPROVED', label: '관리자 승인' },
  { value: 'ADMIN_REJECTED', label: '관리자 반려' },
];

/** 최소 신뢰도 필터 옵션 */
const MIN_CONFIDENCE_OPTIONS = [
  { value: '',    label: '전체' },
  { value: '0.3', label: '0.3 이상' },
  { value: '0.5', label: '0.5 이상' },
  { value: '0.7', label: '0.7 이상' },
  { value: '0.9', label: '0.9 이상' },
];

/**
 * 점수(0.0~1.0) → StatusBadge 색상 variant.
 * ToxicityTab 과 반대 방향: 점수가 높을수록 "좋은" 인증이므로 success/warning/error.
 */
function confidenceToBadgeStatus(score) {
  if (score == null) return 'default';
  if (score >= 0.8) return 'success';
  if (score >= 0.5) return 'warning';
  return 'error';
}

/** ISO 날짜 → "YYYY.MM.DD HH:MM" 포맷 */
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * matched_keywords JSON 배열 문자열 → string[] 파싱.
 * 파싱 실패 시 빈 배열 반환 (에이전트가 쓰기 전에는 null 이 일반적).
 */
function parseKeywords(json) {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export default function ReviewVerificationTab() {
  /* ── 목록 상태 ── */
  const [rows, setRows] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* ── KPI 상태 ── */
  const [overview, setOverview] = useState(null);

  /* ── 필터/페이지 ── */
  const [status, setStatus] = useState('');
  const [minConfidence, setMinConfidence] = useState('');
  const [userKeyword, setUserKeyword] = useState('');
  const [courseTitleKeyword, setCourseTitleKeyword] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(0);

  /* ── 상세 모달 ── */
  const [detail, setDetail] = useState(null);              // 현재 열린 상세 (null = 모달 닫힘)
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [decisionReason, setDecisionReason] = useState(''); // 승인/반려 사유 입력값

  /** 필터 파라미터를 API 쿼리 객체로 정규화 (빈 문자열은 제거) */
  const buildParams = useCallback(() => {
    const p = { page, size: PAGE_SIZE };
    if (status) p.reviewStatus = status;
    if (minConfidence) p.minConfidence = Number(minConfidence);
    if (userKeyword.trim()) p.userKeyword = userKeyword.trim();
    if (courseTitleKeyword.trim()) p.courseTitleKeyword = courseTitleKeyword.trim();
    if (fromDate) p.fromDate = fromDate;
    if (toDate) p.toDate = toDate;
    return p;
  }, [page, status, minConfidence, userKeyword, courseTitleKeyword, fromDate, toDate]);

  /** 목록 로드 */
  const loadRows = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchReviewVerifications(buildParams());
      // Spring Data 3.x: result.totalPages / Spring Data 4.x: result.page.totalPages
      setRows(result?.content ?? []);
      setTotalPages(result?.page?.totalPages ?? result?.totalPages ?? 0);
    } catch (err) {
      console.error('[ReviewVerificationTab] 목록 조회 실패', err);
      setError(err?.message || '목록 조회 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  /** KPI 로드 (필터 변경과 무관, 탭 최초 진입 + 새로고침 시에만) */
  const loadOverview = useCallback(async () => {
    try {
      const result = await fetchReviewVerificationOverview();
      setOverview(result);
    } catch (err) {
      // KPI 실패는 목록 표시를 막지 않는다 — 조용히 무시 + 콘솔 경고
      console.warn('[ReviewVerificationTab] KPI 로드 실패', err);
    }
  }, []);

  useEffect(() => { loadRows(); }, [loadRows]);
  useEffect(() => { loadOverview(); }, [loadOverview]);

  /** 필터 초기화 */
  function resetFilters() {
    setStatus('');
    setMinConfidence('');
    setUserKeyword('');
    setCourseTitleKeyword('');
    setFromDate('');
    setToDate('');
    setPage(0);
  }

  /** 필터 변경 시 첫 페이지로 */
  function withPageReset(setter) {
    return (v) => { setter(v); setPage(0); };
  }

  /** 상세 열기 */
  async function openDetail(row) {
    setDetail({ loading: true, verificationId: row.verificationId });
    setDecisionReason('');
    try {
      setDetailLoading(true);
      const result = await fetchReviewVerificationDetail(row.verificationId);
      setDetail(result);
    } catch (err) {
      alert(err?.message || '상세 조회 중 오류가 발생했습니다.');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  /** 상세 닫기 */
  function closeDetail() {
    setDetail(null);
    setDecisionReason('');
  }

  /**
   * 승인/반려/재검증 처리 공통 핸들러.
   * @param {'approve'|'reject'|'reverify'} kind
   */
  async function handleDecision(kind) {
    if (!detail?.verificationId) return;
    try {
      setActionLoading(true);
      const id = detail.verificationId;
      if (kind === 'approve') {
        await approveReviewVerification(id, { reason: decisionReason });
      } else if (kind === 'reject') {
        await rejectReviewVerification(id, { reason: decisionReason });
      } else if (kind === 'reverify') {
        // FastAPI /verify 엔드포인트는 X-Service-Key 서버 간 인증을 요구하므로
        // 브라우저에서 직접 호출 불가. Spring Boot 백엔드가 내부적으로 에이전트를
        // 호출하고 결과를 CourseVerification 에 반영한다.
        const r = await reverifyReviewVerification(id);
        const msg = r?.message
          || (r?.agentAvailable
            ? 'AI 에이전트에 재검증을 요청했습니다. 잠시 후 상태를 확인하세요.'
            : '상태가 PENDING으로 복귀되었습니다. 백엔드가 AI 에이전트 연동을 완료하면 자동 판정됩니다.');
        alert(msg);
      }
      closeDetail();
      // 액션 후 목록/KPI 재조회 — 사용자 체감 응답성 대비 직접 호출
      loadRows();
      loadOverview();
    } catch (err) {
      alert(err?.message || '처리 중 오류가 발생했습니다.');
    } finally {
      setActionLoading(false);
    }
  }

  const keywords = detail ? parseKeywords(detail.matchedKeywords) : [];

  return (
    <Container>
      {/* ── 에이전트 미구현 안내 배너 ── */}
      <AgentBanner>
        <strong>ℹ AI 리뷰 검증 에이전트</strong>
        <span>
          재검증 버튼을 누르면 AI 에이전트가 영화 줄거리 ↔ 리뷰 유사도를 분석하여 AUTO_VERIFIED /
          NEEDS_REVIEW / AUTO_REJECTED 중 하나로 판정합니다. 에이전트 연결 실패 시 PENDING 으로
          복귀합니다.
        </span>
      </AgentBanner>

      {/* ── KPI 카드 ── */}
      {overview && (
        <KpiGrid>
          <KpiCard $variant="default">
            <KpiLabel>대기</KpiLabel>
            <KpiValue>{overview.pending}</KpiValue>
          </KpiCard>
          <KpiCard $variant="success">
            <KpiLabel>자동 승인</KpiLabel>
            <KpiValue>{overview.autoVerified}</KpiValue>
          </KpiCard>
          <KpiCard $variant="warning">
            <KpiLabel>검토 필요</KpiLabel>
            <KpiValue>{overview.needsReview}</KpiValue>
          </KpiCard>
          <KpiCard $variant="error">
            <KpiLabel>자동 반려</KpiLabel>
            <KpiValue>{overview.autoRejected}</KpiValue>
          </KpiCard>
          <KpiCard $variant="success">
            <KpiLabel>관리자 승인</KpiLabel>
            <KpiValue>{overview.adminApproved}</KpiValue>
          </KpiCard>
          <KpiCard $variant="error">
            <KpiLabel>관리자 반려</KpiLabel>
            <KpiValue>{overview.adminRejected}</KpiValue>
          </KpiCard>
          <KpiCard $variant="info">
            <KpiLabel>AI 임계값</KpiLabel>
            <KpiValue>{overview.threshold?.toFixed(2) ?? '-'}</KpiValue>
          </KpiCard>
        </KpiGrid>
      )}

      {/* ── 필터 툴바 ── */}
      <Toolbar>
        <ToolbarLeft>
          <FilterGroup>
            <FilterLabel>상태</FilterLabel>
            <FilterSelect value={status} onChange={(e) => withPageReset(setStatus)(e.target.value)}>
              {STATUS_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </FilterSelect>
          </FilterGroup>
          <FilterGroup>
            <FilterLabel>최소 신뢰도</FilterLabel>
            <FilterSelect value={minConfidence} onChange={(e) => withPageReset(setMinConfidence)(e.target.value)}>
              {MIN_CONFIDENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </FilterSelect>
          </FilterGroup>
          <FilterGroup>
            <FilterLabel>닉네임/이메일</FilterLabel>
            <FilterInput
              type="text"
              value={userKeyword}
              placeholder="닉네임 또는 이메일"
              onChange={(e) => withPageReset(setUserKeyword)(e.target.value)}
            />
          </FilterGroup>
          <FilterGroup>
            <FilterLabel>코스 제목</FilterLabel>
            <FilterInput
              type="text"
              value={courseTitleKeyword}
              placeholder="코스 제목"
              onChange={(e) => withPageReset(setCourseTitleKeyword)(e.target.value)}
            />
          </FilterGroup>
          <FilterGroup>
            <FilterLabel>기간</FilterLabel>
            <FilterInput
              type="date"
              value={fromDate}
              onChange={(e) => withPageReset(setFromDate)(e.target.value)}
            />
            <span style={{ color: '#94a3b8' }}>~</span>
            <FilterInput
              type="date"
              value={toDate}
              onChange={(e) => withPageReset(setToDate)(e.target.value)}
            />
          </FilterGroup>
          <ResetButton onClick={resetFilters}>필터 초기화</ResetButton>
        </ToolbarLeft>
        <ToolbarRight>
          <IconButton onClick={() => { loadRows(); loadOverview(); }} disabled={loading} title="새로고침">
            <MdRefresh size={16} />
          </IconButton>
        </ToolbarRight>
      </Toolbar>

      {error && <ErrorMsg>{error}</ErrorMsg>}

      {/* ── 테이블 ── */}
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th $w="110px">사용자</Th>
              <Th $w="120px">코스</Th>
              <Th $w="90px">영화</Th>
              <Th>리뷰 미리보기</Th>
              <Th $w="80px">유사도</Th>
              <Th $w="80px">신뢰도</Th>
              <Th $w="110px">상태</Th>
              <Th $w="130px">인증 요청 시각</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8}><CenterCell>불러오는 중...</CenterCell></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8}><CenterCell>리뷰 인증 기록이 없습니다. (사용자가 도장깨기 리뷰를 제출하면 이 목록에 나타납니다)</CenterCell></td></tr>
            ) : (
              rows.map((row) => {
                const badge = REVIEW_STATUS_BADGE[row.reviewStatus] ?? { status: 'default', label: row.reviewStatus ?? '-' };
                return (
                  <Tr key={row.verificationId} onClick={() => openDetail(row)}>
                    <Td><MutedText>{row.userNickname ?? row.userId ?? '-'}</MutedText></Td>
                    <Td><MutedText>{row.courseTitle ?? row.courseId ?? '-'}</MutedText></Td>
                    <Td><MutedText>{row.movieId ?? '-'}</MutedText></Td>
                    <Td><PreviewText>{row.reviewPreview ?? '(리뷰 본문 없음)'}</PreviewText></Td>
                    <Td>
                      {row.similarityScore != null ? (
                        <StatusBadge
                          status={confidenceToBadgeStatus(row.similarityScore)}
                          label={row.similarityScore.toFixed(2)}
                        />
                      ) : <MutedText>-</MutedText>}
                    </Td>
                    <Td>
                      {row.aiConfidence != null ? (
                        <StatusBadge
                          status={confidenceToBadgeStatus(row.aiConfidence)}
                          label={row.aiConfidence.toFixed(2)}
                        />
                      ) : <MutedText>-</MutedText>}
                    </Td>
                    <Td><StatusBadge status={badge.status} label={badge.label} /></Td>
                    <Td><MutedText>{formatDate(row.createdAt)}</MutedText></Td>
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

      {/* ── 상세 모달 ── */}
      {detail && (
        <Overlay onClick={closeDetail}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>리뷰 인증 상세 #{detail.verificationId}</ModalTitle>
              <CloseButton onClick={closeDetail}>✕</CloseButton>
            </ModalHeader>

            <ModalBody>
              {detailLoading ? (
                <CenterCell>불러오는 중...</CenterCell>
              ) : (
                <>
                  {/* 기본 정보 */}
                  <InfoGrid>
                    <InfoRow><InfoLabel>사용자</InfoLabel><InfoValue>{detail.userId}</InfoValue></InfoRow>
                    <InfoRow><InfoLabel>코스 / 영화</InfoLabel><InfoValue>{detail.courseId} / {detail.movieId}</InfoValue></InfoRow>
                    <InfoRow>
                      <InfoLabel>영화 제목</InfoLabel>
                      <InfoValue>{detail.movieTitle ?? '(제목 없음)'}</InfoValue>
                    </InfoRow>
                    <InfoRow>
                      <InfoLabel>상태</InfoLabel>
                      <InfoValue>
                        <StatusBadge
                          status={(REVIEW_STATUS_BADGE[detail.reviewStatus] ?? { status: 'default' }).status}
                          label={(REVIEW_STATUS_BADGE[detail.reviewStatus] ?? { label: detail.reviewStatus }).label}
                        />
                        {detail.isVerified ? (
                          <InlineBadge $variant="success">is_verified=true</InlineBadge>
                        ) : (
                          <InlineBadge $variant="error">is_verified=false</InlineBadge>
                        )}
                      </InfoValue>
                    </InfoRow>
                    <InfoRow>
                      <InfoLabel>유사도 / 신뢰도</InfoLabel>
                      <InfoValue>
                        {detail.similarityScore != null ? detail.similarityScore.toFixed(3) : '-'}
                        {' / '}
                        {detail.aiConfidence != null ? detail.aiConfidence.toFixed(3) : '-'}
                      </InfoValue>
                    </InfoRow>
                    {detail.reviewedBy && (
                      <InfoRow>
                        <InfoLabel>관리자 판정자</InfoLabel>
                        <InfoValue>{detail.reviewedBy} ({formatDate(detail.reviewedAt)})</InfoValue>
                      </InfoRow>
                    )}
                  </InfoGrid>

                  {/* 영화 줄거리 */}
                  <Section>
                    <SectionTitle>영화 줄거리</SectionTitle>
                    <SectionBody>{detail.moviePlot ?? '(줄거리 없음)'}</SectionBody>
                  </Section>

                  {/* 리뷰 본문 */}
                  <Section>
                    <SectionTitle>리뷰 본문</SectionTitle>
                    <SectionBody>{detail.reviewText ?? '(리뷰 본문 없음)'}</SectionBody>
                  </Section>

                  {/* 매칭 키워드 */}
                  {keywords.length > 0 && (
                    <Section>
                      <SectionTitle>매칭 키워드 ({keywords.length})</SectionTitle>
                      <KeywordList>
                        {keywords.map((kw) => (
                          <KeywordChip key={kw}>{kw}</KeywordChip>
                        ))}
                      </KeywordList>
                    </Section>
                  )}

                  {/* 판정 사유 */}
                  {detail.decisionReason && (
                    <Section>
                      <SectionTitle>직전 판정 사유</SectionTitle>
                      <SectionBody>{detail.decisionReason}</SectionBody>
                    </Section>
                  )}

                  {/* 수동 조치 입력 */}
                  <Section>
                    <SectionTitle>관리자 사유 (승인/반려 시 감사 로그에 기록)</SectionTitle>
                    <ReasonInput
                      value={decisionReason}
                      placeholder="예: 줄거리 핵심 장면 언급 + 감상평 포함으로 승인"
                      onChange={(e) => setDecisionReason(e.target.value)}
                      maxLength={500}
                    />
                  </Section>

                  {/* 액션 카드 */}
                  <ActionGrid>
                    <ActionCard
                      $variant="success"
                      onClick={() => handleDecision('approve')}
                      disabled={actionLoading}
                    >
                      <MdCheck size={20} />
                      <ActionCardLabel>승인</ActionCardLabel>
                      <ActionCardDesc>시청 인증으로 인정 (is_verified=true)</ActionCardDesc>
                    </ActionCard>
                    <ActionCard
                      $variant="danger"
                      onClick={() => handleDecision('reject')}
                      disabled={actionLoading}
                    >
                      <MdClose size={20} />
                      <ActionCardLabel>반려</ActionCardLabel>
                      <ActionCardDesc>부정 인증/무관 리뷰로 판정</ActionCardDesc>
                    </ActionCard>
                    <ActionCard
                      $variant="info"
                      onClick={() => handleDecision('reverify')}
                      disabled={actionLoading}
                    >
                      <MdReplay size={20} />
                      <ActionCardLabel>AI 재검증</ActionCardLabel>
                      <ActionCardDesc>상태 PENDING 복귀 (에이전트 대기)</ActionCardDesc>
                    </ActionCard>
                  </ActionGrid>
                </>
              )}
            </ModalBody>

            <ModalFooter>
              <CancelButton onClick={closeDetail} disabled={actionLoading}>닫기</CancelButton>
            </ModalFooter>
          </Modal>
        </Overlay>
      )}
    </Container>
  );
}

/* ── styled-components ── */

const Container = styled.div``;

const AgentBanner = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  color: #9a3412;
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

const KpiGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

/** KPI 카드 색상 — 상태 의미별 */
const KPI_COLORS = {
  default: { bg: '#f8fafc', color: '#475569', border: '#e2e8f0' },
  success: { bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' },
  warning: { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
  error:   { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  info:    { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
};

const KpiCard = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ $variant }) => KPI_COLORS[$variant]?.bg ?? '#f8fafc'};
  border: 1px solid ${({ $variant }) => KPI_COLORS[$variant]?.border ?? '#e2e8f0'};
  color: ${({ $variant }) => KPI_COLORS[$variant]?.color ?? '#475569'};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  display: flex;
  flex-direction: column;
  gap: 4px;
`;
const KpiLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
`;
const KpiValue = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xl};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
`;

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
  flex-wrap: wrap;
`;
const ToolbarRight = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
`;
const FilterGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;
const FilterLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
`;
const FilterSelect = styled.select`
  padding: 5px 10px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  background: white;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
`;
const FilterInput = styled.input`
  padding: 5px 10px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  outline: none;
  background: white;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
`;
const ResetButton = styled.button`
  padding: 5px 12px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  background: white;
  color: ${({ theme }) => theme.colors.textSecondary};
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
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
  cursor: pointer;
  &:last-child { border-bottom: none; }
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
`;
const Td = styled.td`
  padding: 10px 12px;
  color: ${({ theme }) => theme.colors.textPrimary};
  vertical-align: middle;
`;
const PreviewText = styled.span`
  display: block;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;
const MutedText = styled.span`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.xs};
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
  max-width: 720px;
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
  gap: ${({ theme }) => theme.spacing.lg};
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
const InfoGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;
const InfoRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
`;
const InfoLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
  min-width: 110px;
  flex-shrink: 0;
`;
const InfoValue = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
`;
const InlineBadge = styled.span`
  padding: 1px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  background: ${({ $variant }) => ($variant === 'success' ? '#ecfdf5' : '#fef2f2')};
  color: ${({ $variant }) => ($variant === 'success' ? '#059669' : '#dc2626')};
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;
const SectionTitle = styled.h4`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
`;
const SectionBody = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.bgHover};
  border-radius: 4px;
  max-height: 180px;
  overflow-y: auto;
`;
const KeywordList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;
const KeywordChip = styled.span`
  padding: 3px 10px;
  border-radius: 12px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  background: #eff6ff;
  color: #2563eb;
  border: 1px solid #bfdbfe;
`;
const ReasonInput = styled.textarea`
  width: 100%;
  min-height: 60px;
  padding: ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  resize: vertical;
  font-family: inherit;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; outline: none; }
`;

const ActionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: ${({ theme }) => theme.spacing.md};
`;
const ACTION_CARD_COLORS = {
  success: { border: '#a7f3d0', bg: '#ecfdf5', color: '#059669' },
  danger:  { border: '#fecaca', bg: '#fef2f2', color: '#dc2626' },
  info:    { border: '#bfdbfe', bg: '#eff6ff', color: '#2563eb' },
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
  &:hover:not(:disabled) { opacity: 0.85; transform: translateY(-1px); }
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
