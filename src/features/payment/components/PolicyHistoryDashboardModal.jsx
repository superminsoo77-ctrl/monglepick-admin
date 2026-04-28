/**
 * 전체 리워드 정책 변경 이력 대시보드 모달 — 2026-04-09 P2-⑰ 신규.
 *
 * 기존 `RewardPolicyTab` 에는 **개별 정책별 변경 이력** 패널만 존재했다 (각 행의 "이력"
 * 버튼 클릭 → 해당 정책의 이력만 조회). 그러나 실제 운영 감사 관점에서는 "어떤 정책이
 * 언제 누구에 의해 변경되었는가" 를 한 화면에서 통합 조회하는 것이 더 중요하다. 본 모달은
 * Backend `GET /api/v1/admin/reward-policies/history` 를 호출하여 모든 정책의 변경
 * 이력을 복합 필터로 페이징 조회한다.
 *
 * ## 필터
 *
 * - **정책 ID (policyId)**: 특정 정책만 (선택, 숫자 입력)
 * - **변경 관리자 (changedBy)**: 특정 관리자 userId 만 (선택, 텍스트 입력)
 * - **시간 범위**: 시작 ~ 종료 datetime-local (선택)
 *
 * 모든 필터는 optional 이며 빈 값은 서버에서 null 로 정규화되어 조건이 비활성화된다.
 *
 * ## 렌더링
 *
 * 각 이력 엔트리는 리스트 카드로 표시:
 * - 상단: `INSERT`/`UPDATE`/`TOGGLE` 타입 배지 (beforeValue 유무로 추론)
 *   + 변경 관리자 + 시각 + policyId
 * - 중단: changeReason (변경 사유)
 * - 하단: JSON Diff 뷰어 — beforeValue/afterValue 를 키별로 비교하여 변경점 시각화
 *   (감사 로그 `AuditLogDetailModal` 과 동일 패턴)
 *
 * ## Props
 *
 * @param {Object}   props
 * @param {boolean}  props.isOpen   - 모달 열림 여부
 * @param {Function} props.onClose  - 닫기 콜백
 * @param {number}   [props.initialPolicyId] - 초기 policyId 필터 (옵션). 특정 정책에서 "이력" 버튼 눌러 열 때 전달
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { MdClose, MdRefresh, MdHistory } from 'react-icons/md';
import { fetchAllRewardPolicyHistory } from '../api/rewardPolicyApi';

/** 페이지 크기 */
const PAGE_SIZE = 15;

/** 날짜 포맷 */
function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * JSON 문자열을 안전하게 파싱 — 실패 시 null 반환.
 * AuditLogDetailModal 의 parseJsonSafe 와 동일 패턴.
 */
function parseJsonSafe(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * 값을 사람이 읽을 수 있는 문자열로 직렬화.
 */
function stringifyValue(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * 두 객체를 키 단위로 비교하여 diff 엔트리 배열을 생성한다.
 * `AuditLogDetailModal.computeDiff()` 와 동일 로직 — 추후 공통 유틸로 추출 가능.
 */
function computeDiff(beforeObj, afterObj) {
  const beforeKeys = beforeObj ? Object.keys(beforeObj) : [];
  const afterKeys = afterObj ? Object.keys(afterObj) : [];
  const allKeys = Array.from(new Set([...beforeKeys, ...afterKeys]));

  const entries = allKeys.map((key) => {
    const hasBefore = beforeObj && key in beforeObj;
    const hasAfter = afterObj && key in afterObj;
    const beforeStr = hasBefore ? stringifyValue(beforeObj[key]) : null;
    const afterStr = hasAfter ? stringifyValue(afterObj[key]) : null;

    let status;
    if (!hasBefore && hasAfter) status = 'added';
    else if (hasBefore && !hasAfter) status = 'removed';
    else if (beforeStr !== afterStr) status = 'changed';
    else status = 'unchanged';

    return { key, status, before: beforeStr, after: afterStr };
  });

  /* 변경된 것만 앞쪽으로 */
  const statusOrder = { changed: 0, added: 1, removed: 2, unchanged: 3 };
  entries.sort((a, b) => {
    const orderDiff = statusOrder[a.status] - statusOrder[b.status];
    if (orderDiff !== 0) return orderDiff;
    return a.key.localeCompare(b.key);
  });

  return entries;
}

/** diff 상태별 색상 */
const STATUS_COLORS = {
  changed: '#f59e0b',
  added: '#10b981',
  removed: '#ef4444',
  unchanged: '#94a3b8',
};

/**
 * before/after 상태에 따라 이벤트 타입 배지를 결정한다.
 * - before 없음 + after 있음 → CREATE (정책 신규 등록)
 * - before 있음 + after 있음 → UPDATE (정책 수정)
 * - before 있음 + after 없음 → DELETE (실제로는 발생 안 함 — INSERT-ONLY 원장이므로)
 */
function getEventTypeBadge(beforeObj, afterObj) {
  if (!beforeObj && afterObj) return { label: 'CREATE', color: '#10b981' };
  if (beforeObj && afterObj) return { label: 'UPDATE', color: '#f59e0b' };
  if (beforeObj && !afterObj) return { label: 'DELETE', color: '#ef4444' };
  return { label: 'EVENT', color: '#94a3b8' };
}

/**
 * datetime-local input 값을 Backend 가 받는 ISO-8601 초 단위 문자열로 변환.
 * 빈 값이면 undefined 반환 → URLSearchParams 에서 자동 제외.
 */
function toIsoOrUndefined(datetimeLocal) {
  if (!datetimeLocal) return undefined;
  return datetimeLocal.length === 16 ? `${datetimeLocal}:00` : datetimeLocal;
}

export default function PolicyHistoryDashboardModal({ isOpen, onClose, initialPolicyId }) {
  /* ── 목록 상태 ── */
  const [items, setItems] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /* ── 필터 입력 상태 (타이핑 중) ── */
  const [policyIdInput, setPolicyIdInput] = useState('');
  const [changedByInput, setChangedByInput] = useState('');
  const [fromDateInput, setFromDateInput] = useState('');
  const [toDateInput, setToDateInput] = useState('');

  /* ── 확정 필터 상태 ── */
  const [policyIdFilter, setPolicyIdFilter] = useState('');
  const [changedByFilter, setChangedByFilter] = useState('');
  const [fromDateFilter, setFromDateFilter] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');

  /**
   * 모달이 열릴 때 초기 필터 설정.
   * `initialPolicyId` 가 전달되면 해당 정책으로 사전 필터링된 상태로 시작한다.
   */
  useEffect(() => {
    if (isOpen) {
      const initialId = initialPolicyId ? String(initialPolicyId) : '';
      setPolicyIdInput(initialId);
      setPolicyIdFilter(initialId);
      setChangedByInput('');
      setChangedByFilter('');
      setFromDateInput('');
      setFromDateFilter('');
      setToDateInput('');
      setToDateFilter('');
      setPage(0);
      setError(null);
    }
  }, [isOpen, initialPolicyId]);

  /** 이력 조회 */
  const loadHistory = useCallback(async () => {
    if (!isOpen) return;
    try {
      setLoading(true);
      setError(null);
      const params = { page, size: PAGE_SIZE };
      if (policyIdFilter.trim()) {
        const n = Number(policyIdFilter.trim());
        if (Number.isFinite(n)) params.policyId = n;
      }
      if (changedByFilter.trim()) params.changedBy = changedByFilter.trim();
      const fromIso = toIsoOrUndefined(fromDateFilter);
      const toIso = toIsoOrUndefined(toDateFilter);
      if (fromIso) params.fromDate = fromIso;
      if (toIso) params.toDate = toIso;

      const result = await fetchAllRewardPolicyHistory(params);
      setItems(result?.content ?? (Array.isArray(result) ? result : []));
      setTotalPages(result?.totalPages ?? 0);
      setTotalElements(result?.totalElements ?? 0);
    } catch (err) {
      setError(err?.message ?? '이력을 불러올 수 없습니다.');
    } finally {
      setLoading(false);
    }
  }, [isOpen, page, policyIdFilter, changedByFilter, fromDateFilter, toDateFilter]);

  /* 모달 열림/필터/페이지 변경 시 재호출 */
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  /* 모달 닫기 */
  if (!isOpen) return null;

  /** 검색 실행 — 입력 중인 필터를 확정 상태로 커밋 */
  function handleSearch(e) {
    e.preventDefault();
    setPage(0);
    setPolicyIdFilter(policyIdInput);
    setChangedByFilter(changedByInput);
    setFromDateFilter(fromDateInput);
    setToDateFilter(toDateInput);
  }

  /** 필터 초기화 */
  function handleReset() {
    setPolicyIdInput('');
    setChangedByInput('');
    setFromDateInput('');
    setToDateInput('');
    setPolicyIdFilter('');
    setChangedByFilter('');
    setFromDateFilter('');
    setToDateFilter('');
    setPage(0);
  }

  const hasActiveFilter =
    !!policyIdFilter || !!changedByFilter || !!fromDateFilter || !!toDateFilter;

  return (
    <Overlay onClick={onClose}>
      <ModalBox onClick={(e) => e.stopPropagation()}>
        {/* ── 헤더 ── */}
        <ModalHeader>
          <HeaderTitle>
            <MdHistory size={20} />
            정책 변경 이력 대시보드
          </HeaderTitle>
          <HeaderRight>
            <RefreshButton type="button" onClick={loadHistory} disabled={loading} title="새로고침">
              <MdRefresh size={16} />
            </RefreshButton>
            <CloseButton type="button" onClick={onClose} title="닫기">
              <MdClose size={20} />
            </CloseButton>
          </HeaderRight>
        </ModalHeader>

        {/* ── 필터 폼 ── */}
        <FilterForm onSubmit={handleSearch}>
          <FilterField>
            <FilterLabel>정책 ID</FilterLabel>
            <FilterInput
              type="number"
              min={1}
              value={policyIdInput}
              onChange={(e) => setPolicyIdInput(e.target.value)}
              placeholder="예: 12"
            />
          </FilterField>
          <FilterField>
            <FilterLabel>변경 관리자</FilterLabel>
            <FilterInput
              type="text"
              value={changedByInput}
              onChange={(e) => setChangedByInput(e.target.value)}
              placeholder="userId 또는 SYSTEM"
              maxLength={50}
            />
          </FilterField>
          <FilterField>
            <FilterLabel>시작 시각</FilterLabel>
            <FilterDate
              type="datetime-local"
              value={fromDateInput}
              onChange={(e) => setFromDateInput(e.target.value)}
              max={toDateInput || undefined}
            />
          </FilterField>
          <FilterField>
            <FilterLabel>종료 시각</FilterLabel>
            <FilterDate
              type="datetime-local"
              value={toDateInput}
              onChange={(e) => setToDateInput(e.target.value)}
              min={fromDateInput || undefined}
            />
          </FilterField>
          <FilterActions>
            <SearchButton type="submit">검색</SearchButton>
            {hasActiveFilter && (
              <ResetButton type="button" onClick={handleReset}>초기화</ResetButton>
            )}
          </FilterActions>
        </FilterForm>

        {/* ── 결과 카운트 ── */}
        <ResultCount>
          {loading ? '불러오는 중...' : `총 ${totalElements.toLocaleString()}건`}
          {hasActiveFilter && <FilterTag>필터 적용 중</FilterTag>}
        </ResultCount>

        {/* ── 에러 ── */}
        {error && <ErrorBox>{error}</ErrorBox>}

        {/* ── 이력 리스트 ── */}
        <HistoryList>
          {loading ? (
            <EmptyState>불러오는 중...</EmptyState>
          ) : items.length === 0 ? (
            <EmptyState>
              {hasActiveFilter
                ? '지정한 필터 조건에 해당하는 이력이 없습니다.'
                : '변경 이력이 없습니다.'}
            </EmptyState>
          ) : (
            items.map((entry) => {
              const before = parseJsonSafe(entry.beforeValue);
              const after = parseJsonSafe(entry.afterValue);
              const eventBadge = getEventTypeBadge(before, after);
              const diff = (before || after) ? computeDiff(before, after) : [];
              const changedCount = diff.filter((d) => d.status !== 'unchanged').length;

              return (
                <HistoryCard key={entry.id ?? entry.rewardPolicyHistoryId}>
                  <CardHeader>
                    <CardHeaderLeft>
                      <EventBadge $color={eventBadge.color}>
                        {eventBadge.label}
                      </EventBadge>
                      <PolicyIdBadge>정책 #{entry.policyId ?? '-'}</PolicyIdBadge>
                      <ChangedBy>{entry.changedBy ?? 'SYSTEM'}</ChangedBy>
                    </CardHeaderLeft>
                    <Timestamp>{formatDateTime(entry.createdAt)}</Timestamp>
                  </CardHeader>

                  {entry.changeReason && (
                    <ChangeReason>
                      <ChangeReasonLabel>사유</ChangeReasonLabel>
                      <ChangeReasonText>{entry.changeReason}</ChangeReasonText>
                    </ChangeReason>
                  )}

                  {/* Diff 요약 */}
                  {diff.length > 0 && changedCount > 0 && (
                    <DiffSection>
                      <DiffSummary>
                        <strong>{changedCount}</strong>개 필드 변경
                      </DiffSummary>
                      <DiffTable>
                        <thead>
                          <tr>
                            <DiffTh $w="70px">상태</DiffTh>
                            <DiffTh $w="140px">필드</DiffTh>
                            <DiffTh>변경 전</DiffTh>
                            <DiffTh>변경 후</DiffTh>
                          </tr>
                        </thead>
                        <tbody>
                          {diff
                            .filter((d) => d.status !== 'unchanged')
                            .slice(0, 10)
                            .map((d) => (
                              <DiffRow key={d.key}>
                                <DiffTd>
                                  <DiffStatusBadge $color={STATUS_COLORS[d.status]}>
                                    {d.status === 'changed' && '변경'}
                                    {d.status === 'added' && '추가'}
                                    {d.status === 'removed' && '삭제'}
                                  </DiffStatusBadge>
                                </DiffTd>
                                <DiffTd>
                                  <DiffKey>{d.key}</DiffKey>
                                </DiffTd>
                                <DiffTd>
                                  <DiffVal $muted={d.status === 'added'}>
                                    {d.before ?? '—'}
                                  </DiffVal>
                                </DiffTd>
                                <DiffTd>
                                  <DiffVal $muted={d.status === 'removed'}>
                                    {d.after ?? '—'}
                                  </DiffVal>
                                </DiffTd>
                              </DiffRow>
                            ))}
                          {changedCount > 10 && (
                            <DiffRow>
                              <DiffTd colSpan={4} style={{ textAlign: 'center', color: '#94a3b8' }}>
                                ...외 {changedCount - 10}개 필드 생략
                              </DiffTd>
                            </DiffRow>
                          )}
                        </tbody>
                      </DiffTable>
                    </DiffSection>
                  )}

                  {/* diff 가 비어있으면 raw JSON 노출 (예: 파싱 실패 또는 신규 등록) */}
                  {diff.length === 0 && (entry.beforeValue || entry.afterValue) && (
                    <RawJsonBox>
                      {entry.afterValue || entry.beforeValue}
                    </RawJsonBox>
                  )}
                </HistoryCard>
              );
            })
          )}
        </HistoryList>

        {/* ── 페이지네이션 ── */}
        {totalPages > 1 && (
          <Pagination>
            <PageButton
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
            >
              이전
            </PageButton>
            <PageInfo>{page + 1} / {totalPages}</PageInfo>
            <PageButton
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page + 1 >= totalPages || loading}
            >
              다음
            </PageButton>
          </Pagination>
        )}
      </ModalBox>
    </Overlay>
  );
}

/* ── styled-components ── */

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: ${({ theme }) => theme.spacing.lg};
`;

const ModalBox = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  width: 100%;
  max-width: 980px;
  max-height: 92vh;
  overflow-y: auto;
  padding: ${({ theme }) => theme.spacing.xxl};
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const HeaderTitle = styled.h3`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.fontSizes.heading};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const RefreshButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgCard};
  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.bgHover}; }
  &:disabled { opacity: 0.4; }
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
`;

/* 필터 폼 — 4개 필드 + 액션을 flex wrap 으로 가로 배치 */
const FilterForm = styled.form`
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.bgHover};
  border: 1px solid ${({ theme }) => theme.colors.borderLight};
  border-radius: 6px;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const FilterField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const FilterLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
`;

const FilterInput = styled.input`
  height: 30px;
  padding: 0 10px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  background: #ffffff;
  color: ${({ theme }) => theme.colors.textPrimary};
  min-width: 140px;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const FilterDate = styled.input`
  height: 30px;
  padding: 0 8px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  background: #ffffff;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: inherit;
  min-width: 180px;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const FilterActions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xs};
  margin-left: auto;
`;

const SearchButton = styled.button`
  height: 30px;
  padding: 0 16px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: #ffffff;
  background: ${({ theme }) => theme.colors.primary};
  border-radius: 4px;
  &:hover { opacity: 0.85; }
`;

const ResetButton = styled.button`
  height: 30px;
  padding: 0 12px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
`;

const ResultCount = styled.p`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const FilterTag = styled.span`
  font-size: 10px;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.primary};
  background: ${({ theme }) => theme.colors.primaryLight};
  border: 1px solid ${({ theme }) => theme.colors.primary};
  border-radius: 12px;
  padding: 1px 8px;
`;

const ErrorBox = styled.p`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.errorBg};
  border-left: 3px solid ${({ theme }) => theme.colors.error};
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border-radius: 4px;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const HistoryList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const EmptyState = styled.div`
  padding: ${({ theme }) => theme.spacing.xxxl};
  text-align: center;
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  background: ${({ theme }) => theme.colors.bgHover};
  border-radius: 6px;
`;

/* 이력 카드 — 각 이력 엔트리 1개 */
const HistoryCard = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
  flex-wrap: wrap;
`;

const CardHeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-wrap: wrap;
`;

const EventBadge = styled.span`
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 700;
  color: #ffffff;
  background: ${({ $color }) => $color};
  border-radius: 3px;
  letter-spacing: 0.3px;
`;

const PolicyIdBadge = styled.span`
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.primary};
  background: ${({ theme }) => theme.colors.primaryLight};
  border: 1px solid ${({ theme }) => theme.colors.primary};
  border-radius: 3px;
  font-family: ${({ theme }) => theme.fonts.mono};
`;

const ChangedBy = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-family: ${({ theme }) => theme.fonts.mono};
`;

const Timestamp = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  font-family: ${({ theme }) => theme.fonts.mono};
`;

const ChangeReason = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  background: ${({ theme }) => theme.colors.bgHover};
  border-radius: 3px;
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const ChangeReasonLabel = styled.span`
  flex-shrink: 0;
  font-size: 10px;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding-top: 2px;
`;

const ChangeReasonText = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textPrimary};
  line-height: 1.5;
  word-break: break-all;
`;

const DiffSection = styled.div``;

const DiffSummary = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 4px;

  strong {
    color: ${({ theme }) => theme.colors.primary};
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
  }
`;

const DiffTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  border: 1px solid ${({ theme }) => theme.colors.borderLight};
  border-radius: 4px;
  overflow: hidden;
`;

const DiffTh = styled.th`
  padding: 5px 8px;
  text-align: left;
  font-size: 10px;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textMuted};
  background: ${({ theme }) => theme.colors.bgHover};
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  width: ${({ $w }) => $w ?? 'auto'};
`;

const DiffRow = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight};
  &:last-child { border-bottom: none; }
`;

const DiffTd = styled.td`
  padding: 5px 8px;
  vertical-align: top;
  word-break: break-all;
`;

const DiffStatusBadge = styled.span`
  display: inline-block;
  padding: 1px 6px;
  font-size: 9px;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: #ffffff;
  background: ${({ $color }) => $color};
  border-radius: 2px;
  letter-spacing: 0.3px;
`;

const DiffKey = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
`;

const DiffVal = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 11px;
  color: ${({ $muted, theme }) => ($muted ? theme.colors.textMuted : theme.colors.textPrimary)};
`;

const RawJsonBox = styled.pre`
  padding: ${({ theme }) => theme.spacing.sm};
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 11px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.5;
`;

/* 페이지네이션 */
const Pagination = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.md};
  margin-top: ${({ theme }) => theme.spacing.lg};
  padding-top: ${({ theme }) => theme.spacing.md};
  border-top: 1px solid ${({ theme }) => theme.colors.borderLight};
`;

const PageButton = styled.button`
  padding: 5px 14px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgCard};
  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.bgHover}; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

const PageInfo = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
  font-family: ${({ theme }) => theme.fonts.mono};
`;
