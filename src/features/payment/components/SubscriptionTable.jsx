/**
 * 구독 관리 테이블 컴포넌트.
 *
 * 전체 구독 목록을 조회하고 취소/연장 액션을 처리한다.
 * - 상태 필터 (전체/ACTIVE/CANCELLED/EXPIRED)
 * - 플랜 필터 (전체/monthly_basic/monthly_premium/yearly_basic/yearly_premium)
 * - 유저 검색 (이메일/닉네임) — UserSearchPicker 선택 시 userId 로 서버 필터
 * - 페이징 (page, size)
 * - 취소: ACTIVE 구독만 가능, ConfirmModal 확인 후 처리
 * - 연장: ACTIVE/CANCELLED 구독 가능, 1주기 연장 — ConfirmModal (adminNote 입력)
 *
 * 2026-04-14 변경:
 *  - 백엔드 DTO(SubscriptionSummary) 필드명과 정합화
 *      subscriptionId / planCode / planName / periodType / startedAt / expiresAt
 *    (기존 sub.id / sub.plan / sub.startDate / sub.endDate 는 undefined 로 연장 버튼이
 *    `/subscription/undefined/extend` 를 호출하여 에러 발생 → 수정)
 *  - window.confirm / alert 전면 제거 → ConfirmModal 로 교체
 *  - userId(UUID) 대신 nickname(email) 를 우선 표시, userId 는 보조 표기
 *  - 이메일/닉네임 검색 UI (UserSearchPicker) 추가, 서버에 userId 쿼리 전달
 *
 * @module SubscriptionTable
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { MdRefresh } from 'react-icons/md';
import { fetchSubscriptions, cancelSubscription, extendSubscription } from '../api/paymentApi';
import StatusBadge from '@/shared/components/StatusBadge';
import ConfirmModal from '@/shared/components/ConfirmModal';
import UserSearchPicker from '@/shared/components/UserSearchPicker';

/** 구독 상태 → StatusBadge 매핑 */
const STATUS_MAP = {
  ACTIVE:    { status: 'success', label: '활성' },
  CANCELLED: { status: 'error',   label: '취소' },
  EXPIRED:   { status: 'default', label: '만료' },
  PAUSED:    { status: 'warning', label: '일시정지' },
};

/**
 * 플랜 코드 → 한국어명 매핑.
 * 백엔드는 `planCode`(예: monthly_basic) 와 `planName`(예: "월간 기본") 을 모두 내려주므로
 * 우선 planName, 없으면 코드 매핑, 그래도 없으면 원문을 사용한다.
 */
const PLAN_CODE_LABEL = {
  monthly_basic:   '월간 기본',
  monthly_premium: '월간 프리미엄',
  yearly_basic:    '연간 기본',
  yearly_premium:  '연간 프리미엄',
};

/** 상태 필터 옵션 */
const STATUS_FILTERS = [
  { value: '', label: '전체' },
  { value: 'ACTIVE',    label: '활성' },
  { value: 'CANCELLED', label: '취소' },
  { value: 'EXPIRED',   label: '만료' },
];

/** 플랜 필터 옵션 (planCode 기준) */
const PLAN_FILTERS = [
  { value: '',                label: '전체 플랜' },
  { value: 'monthly_basic',   label: '월간 기본' },
  { value: 'monthly_premium', label: '월간 프리미엄' },
  { value: 'yearly_basic',    label: '연간 기본' },
  { value: 'yearly_premium',  label: '연간 프리미엄' },
];

/** 날짜 포맷 (YYYY.MM.DD) */
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '-';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

/** 만료일까지 남은 일수 계산 */
function getDaysLeft(endDateStr) {
  if (!endDateStr) return null;
  const end = new Date(endDateStr);
  if (Number.isNaN(end.getTime())) return null;
  const diff = end - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/** 플랜 라벨 우선순위: planName → 코드 매핑 → 원문 */
function resolvePlanLabel(sub) {
  if (sub?.planName) return sub.planName;
  if (sub?.planCode && PLAN_CODE_LABEL[sub.planCode]) return PLAN_CODE_LABEL[sub.planCode];
  return sub?.planCode ?? '-';
}

/**
 * 구독 관리 테이블.
 *
 * @param {Object} props
 * @param {Object|null} [props.aiSubscriptionRequest] - AI 어시스턴트가 navigate 로 주입한 컨텍스트.
 *   { subscriptionId: string|null, userId: string|null }
 *   - userId 가 있으면 목록 로드 후 해당 사용자로 자동 필터 세팅.
 *   - subscriptionId 가 있으면 해당 행을 하이라이트 처리.
 *   - 1회만 소비(consumedRef)하여 중복 발동 방지.
 */
export default function SubscriptionTable({ aiSubscriptionRequest = null }) {
  /* 목록 상태 */
  const [subscriptions, setSubscriptions] = useState([]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* 필터/페이징 상태 */
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  /** 선택된 사용자 — userId 로 서버 필터링. 백엔드 미지원 시 클라이언트 필터 fallback. */
  const [selectedUser, setSelectedUser] = useState(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  /* v3 Phase G P1-B: AI 어시스턴트 자동 필터/하이라이트 상태 */
  /** AI 가 지정한 구독 ID — 해당 행에 하이라이트 테두리를 적용 */
  const [aiHighlightId, setAiHighlightId] = useState(null);
  /** aiSubscriptionRequest 는 마운트 1회만 소비 */
  const aiRequestConsumedRef = useRef(false);

  /* 날짜 범위 필터 — 구독 생성일 기준 (2026-04-23 추가, AuditLogTab 패턴)
   * Input 상태(타이핑 중)와 Filter 상태(확정된 값, API 전송용)를 분리한다. */
  const [fromDateInput, setFromDateInput] = useState('');
  const [toDateInput, setToDateInput] = useState('');
  const [fromDateFilter, setFromDateFilter] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');

  /* 개별 액션 처리 중인 ID */
  const [actionId, setActionId] = useState(null);

  /* 모달 상태 — 취소/연장 공통 */
  const [modal, setModal] = useState({
    open: false,
    mode: null,      // 'cancel' | 'extend'
    target: null,    // 선택된 구독
    loading: false,
    error: null,
  });

  /**
   * datetime-local 입력값을 Backend 가 받는 ISO-8601 초 단위 문자열로 변환.
   * 빈 문자열이면 undefined 반환 → 요청 파라미터에서 자동 제외.
   */
  function toIsoOrUndefined(dtLocal) {
    if (!dtLocal) return undefined;
    return dtLocal.length === 16 ? `${dtLocal}:00` : dtLocal;
  }

  /** 구독 목록 조회 */
  const loadSubscriptions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = { page, size: PAGE_SIZE };
      if (statusFilter) params.status = statusFilter;
      if (planFilter) params.planCode = planFilter;
      if (selectedUser?.userId) params.userId = selectedUser.userId;
      const fromIso = toIsoOrUndefined(fromDateFilter);
      const toIso   = toIsoOrUndefined(toDateFilter);
      if (fromIso) params.fromDate = fromIso;
      if (toIso)   params.toDate   = toIso;
      const result = await fetchSubscriptions(params);

      /* 백엔드가 planCode/userId 필터를 아직 미지원하는 환경을 대비한 클라이언트 필터.
       * 지원 시에는 서버 쪽에서 걸러지므로 추가 비용 없음. */
      let rows = result?.content ?? [];
      if (planFilter) {
        rows = rows.filter((r) => r.planCode === planFilter);
      }
      if (selectedUser?.userId) {
        rows = rows.filter((r) => r.userId === selectedUser.userId);
      }

      setSubscriptions(rows);
      setTotalElements(result?.totalElements ?? rows.length);
      setTotalPages(result?.totalPages ?? 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, planFilter, selectedUser, fromDateFilter, toDateFilter]);

  /* 초기 로드 및 의존성 변경 시 재조회 */
  useEffect(() => {
    loadSubscriptions();
  }, [loadSubscriptions]);

  /* v3 Phase G P1-B: AI 어시스턴트가 navigate(?tab=subscription&subscriptionId=...&userId=...)
   * 로 진입시킨 경우, 목록 로드 완료 후 1회만 아래를 수행한다.
   *  1) userId 가 있으면 selectedUser 를 { userId } 로 세팅 → loadSubscriptions 재실행으로 필터 적용
   *  2) subscriptionId 가 있으면 aiHighlightId 세팅 → 해당 행 하이라이트
   * 상세 사이드 패널이 없어 모달 자동 오픈은 불가하므로 최소한 검색 필터+하이라이트로 처리.
   * consumedRef 로 중복 발동(리렌더) 차단. */
  useEffect(() => {
    if (aiRequestConsumedRef.current) return;
    if (!aiSubscriptionRequest) return;
    if (loading) return;

    aiRequestConsumedRef.current = true;
    const { subscriptionId, userId } = aiSubscriptionRequest;

    if (userId) {
      /* UserSearchPicker 가 { userId } 객체를 selectedUser 로 받는 구조에 맞춰 주입.
       * nickname/email 이 없어도 loadSubscriptions 의 클라이언트 필터가 userId 로 걸러낸다. */
      setSelectedUser({ userId });
      setPage(0);
    }
    if (subscriptionId) {
      setAiHighlightId(subscriptionId);
    }
  }, [aiSubscriptionRequest, loading]);

  /* 필터 변경 시 페이지 초기화 */
  function handleStatusFilter(value) {
    setStatusFilter(value);
    setPage(0);
  }

  function handlePlanFilter(e) {
    setPlanFilter(e.target.value);
    setPage(0);
  }

  function handleUserChange(user) {
    setSelectedUser(user);
    setPage(0);
  }

  /** 날짜 필터 적용 — 타이핑 중 값을 확정 Filter 로 커밋 */
  function handleDateApply(e) {
    e.preventDefault();
    setFromDateFilter(fromDateInput);
    setToDateFilter(toDateInput);
    setPage(0);
  }

  function handleDateReset() {
    setFromDateInput('');
    setToDateInput('');
    setFromDateFilter('');
    setToDateFilter('');
    setPage(0);
  }

  const hasDateFilter = !!fromDateFilter || !!toDateFilter;

  /* ── 모달 열기/닫기 ── */

  function openCancelModal(sub) {
    setModal({ open: true, mode: 'cancel', target: sub, loading: false, error: null });
  }

  function openExtendModal(sub) {
    setModal({ open: true, mode: 'extend', target: sub, loading: false, error: null });
  }

  function closeModal() {
    if (modal.loading) return;
    setModal({ open: false, mode: null, target: null, loading: false, error: null });
  }

  /** 모달 확인 버튼 → 실제 API 호출 */
  async function handleModalConfirm(reason) {
    const { mode, target } = modal;
    if (!target) return;

    const subscriptionId = target.subscriptionId;
    if (!subscriptionId) {
      setModal((m) => ({ ...m, error: '구독 ID 가 유효하지 않습니다.' }));
      return;
    }

    setModal((m) => ({ ...m, loading: true, error: null }));
    try {
      setActionId(subscriptionId);
      if (mode === 'cancel') {
        await cancelSubscription(subscriptionId);
      } else if (mode === 'extend') {
        await extendSubscription(subscriptionId, { adminNote: reason });
      }
      await loadSubscriptions();
      setModal({ open: false, mode: null, target: null, loading: false, error: null });
    } catch (err) {
      setModal((m) => ({ ...m, loading: false, error: err?.message ?? '처리 실패' }));
    } finally {
      setActionId(null);
    }
  }

  /* ── 모달 콘텐츠 ── */

  function renderModalDescription() {
    const { mode, target } = modal;
    if (!target) return null;
    const planLabel = resolvePlanLabel(target);
    const userLabel = target.userId ?? '-';
    const expires = formatDate(target.expiresAt);
    if (mode === 'cancel') {
      return (
        <>
          <strong>[{planLabel}]</strong> 구독을 취소하시겠습니까?{'\n'}
          사용자: {userLabel}{'\n'}
          만료일까지 혜택은 유지됩니다. (만료 예정: {expires})
        </>
      );
    }
    if (mode === 'extend') {
      const period = target.periodType === 'YEARLY' ? '1년' : '1개월';
      return (
        <>
          <strong>[{planLabel}]</strong> 구독을 {period} 연장하시겠습니까?{'\n'}
          사용자: {userLabel}{'\n'}
          현재 만료일: {expires}
        </>
      );
    }
    return null;
  }

  return (
    <Section>
      <SectionHeader>
        <SectionTitle>구독 관리 ({totalElements.toLocaleString()}건)</SectionTitle>
        <HeaderRight>
          {/* 상태 필터 버튼 그룹 */}
          <FilterGroup>
            {STATUS_FILTERS.map(({ value, label }) => (
              <FilterButton
                key={value}
                $active={statusFilter === value}
                onClick={() => handleStatusFilter(value)}
              >
                {label}
              </FilterButton>
            ))}
          </FilterGroup>

          {/* 플랜 선택 드롭다운 */}
          <Select value={planFilter} onChange={handlePlanFilter}>
            {PLAN_FILTERS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>

          <RefreshButton onClick={loadSubscriptions} disabled={loading}>
            <MdRefresh size={16} />
          </RefreshButton>
        </HeaderRight>
      </SectionHeader>

      {/* 유저 검색 (이메일/닉네임) */}
      <UserSearchRow>
        <UserSearchLabel>사용자 검색</UserSearchLabel>
        <UserSearchPicker
          selectedUser={selectedUser}
          onChange={handleUserChange}
          placeholder="이메일 또는 닉네임으로 검색"
        />
      </UserSearchRow>

      {/*
        날짜 범위 필터 (2026-04-23 추가) — 구독 생성일(createdAt) 기준.
        fromDate inclusive, toDate exclusive. "기간 적용" 버튼 클릭 시에만 재조회된다.
      */}
      <DateFilterForm onSubmit={handleDateApply}>
        <DateFieldWrap>
          <DateLabel>시작일</DateLabel>
          <DateInput
            type="datetime-local"
            value={fromDateInput}
            onChange={(e) => setFromDateInput(e.target.value)}
            max={toDateInput || undefined}
            title="구독 생성일 시작 (inclusive)"
          />
        </DateFieldWrap>
        <DateFieldWrap>
          <DateLabel>종료일</DateLabel>
          <DateInput
            type="datetime-local"
            value={toDateInput}
            onChange={(e) => setToDateInput(e.target.value)}
            min={fromDateInput || undefined}
            title="구독 생성일 종료 (exclusive)"
          />
        </DateFieldWrap>
        <ApplyButton type="submit">기간 적용</ApplyButton>
        {hasDateFilter && (
          <ResetButton type="button" onClick={handleDateReset}>
            초기화
          </ResetButton>
        )}
        {hasDateFilter && (
          <AppliedBadge>
            적용됨: <strong>
              {fromDateFilter ? fromDateFilter.replace('T', ' ') : '처음'}
              {' ~ '}
              {toDateFilter ? toDateFilter.replace('T', ' ') : '지금'}
            </strong>
          </AppliedBadge>
        )}
      </DateFilterForm>

      {error && <ErrorMsg>{error}</ErrorMsg>}

      <TableWrapper>
        {loading ? (
          <CenterMsg>불러오는 중...</CenterMsg>
        ) : subscriptions.length === 0 ? (
          <CenterMsg>구독 내역이 없습니다.</CenterMsg>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>구독 ID</Th>
                <Th>사용자</Th>
                <Th>플랜</Th>
                <Th>상태</Th>
                <Th>시작일</Th>
                <Th>만료일</Th>
                <Th>자동갱신</Th>
                <Th>액션</Th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((sub) => {
                const badge = STATUS_MAP[sub.status] ?? { status: 'default', label: sub.status };
                const daysLeft = getDaysLeft(sub.expiresAt);
                const isProcessing = actionId === sub.subscriptionId;
                const canCancel = sub.status === 'ACTIVE';
                /* 도메인: EXPIRED 는 신규 구독으로 처리. ACTIVE/CANCELLED 만 연장 가능 */
                const canExtend = sub.status === 'ACTIVE' || sub.status === 'CANCELLED';

                return (
                  /* v3 Phase G P1-B: aiHighlightId 와 일치하는 행에 하이라이트 테두리 적용 */
                  <HighlightTr
                    key={sub.subscriptionId}
                    $highlight={aiHighlightId === sub.subscriptionId}
                  >
                    <Td $mono>{sub.subscriptionId ?? '-'}</Td>
                    <Td>
                      {/* 닉네임/이메일 우선 — UUID 는 보조 표시 */}
                      <UserCell>
                        <UserMain>{sub.nickname ?? sub.email ?? sub.userId ?? '-'}</UserMain>
                        {(sub.nickname || sub.email) && sub.userId && (
                          <UserSub title={sub.userId}>{sub.userId}</UserSub>
                        )}
                      </UserCell>
                    </Td>
                    <Td>
                      <PlanChip $planCode={sub.planCode}>
                        {resolvePlanLabel(sub)}
                      </PlanChip>
                    </Td>
                    <Td>
                      <StatusBadge status={badge.status} label={badge.label} />
                    </Td>
                    <Td $mono>{formatDate(sub.startedAt)}</Td>
                    <Td>
                      <DateCell>
                        <span>{formatDate(sub.expiresAt)}</span>
                        {/* 만료 임박 (7일 이내) 경고 표시 */}
                        {daysLeft !== null && daysLeft >= 0 && daysLeft <= 7 && (
                          <DaysLeftBadge $urgent={daysLeft <= 3}>
                            D-{daysLeft}
                          </DaysLeftBadge>
                        )}
                      </DateCell>
                    </Td>
                    <Td>
                      <AutoRenewDot $on={sub.autoRenew}>
                        {sub.autoRenew ? '활성' : '비활성'}
                      </AutoRenewDot>
                    </Td>
                    <Td>
                      <ActionGroup>
                        {canCancel && (
                          <ActionButton
                            $variant="danger"
                            disabled={isProcessing}
                            onClick={() => openCancelModal(sub)}
                          >
                            {isProcessing && modal.mode === 'cancel' ? '...' : '취소'}
                          </ActionButton>
                        )}
                        {canExtend && (
                          <ActionButton
                            $variant="primary"
                            disabled={isProcessing}
                            onClick={() => openExtendModal(sub)}
                          >
                            {isProcessing && modal.mode === 'extend' ? '...' : '연장'}
                          </ActionButton>
                        )}
                      </ActionGroup>
                    </Td>
                  </HighlightTr>
                );
              })}
            </tbody>
          </Table>
        )}
      </TableWrapper>

      {/* 페이징 */}
      {totalPages > 1 && (
        <Pagination>
          <PageButton
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            이전
          </PageButton>
          <PageInfo>{page + 1} / {totalPages}</PageInfo>
          <PageButton
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            다음
          </PageButton>
        </Pagination>
      )}

      {/* 취소/연장 공통 모달 */}
      <ConfirmModal
        isOpen={modal.open}
        title={modal.mode === 'cancel' ? '구독 취소' : '구독 연장'}
        description={renderModalDescription()}
        confirmText={modal.mode === 'cancel' ? '구독 취소' : '1주기 연장'}
        cancelText="닫기"
        variant={modal.mode === 'cancel' ? 'danger' : 'primary'}
        withReason
        reasonLabel="관리자 메모"
        reasonPlaceholder={
          modal.mode === 'cancel'
            ? '취소 사유를 입력해주세요. (감사 로그 기록용)'
            : '연장 사유를 입력해주세요. (생략 시 "관리자 연장")'
        }
        reasonRequired={modal.mode === 'cancel'}
        loading={modal.loading}
        error={modal.error}
        onConfirm={handleModalConfirm}
        onClose={closeModal}
      />
    </Section>
  );
}

/* ── styled-components ── */

const Section = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.xxl};
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const SectionTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.heading};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;
`;

const FilterGroup = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xs};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  overflow: hidden;
`;

const FilterButton = styled.button`
  padding: 5px ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ $active, theme }) =>
    $active ? '#ffffff' : theme.colors.textSecondary};
  background: ${({ $active, theme }) =>
    $active ? theme.colors.primary : 'transparent'};
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    background: ${({ $active, theme }) =>
      $active ? theme.colors.primaryHover : theme.colors.bgHover};
  }
`;

const Select = styled.select`
  height: 30px;
  padding: 0 ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.bgCard};
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const RefreshButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.border};
  transition: background ${({ theme }) => theme.transitions.fast};

  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
  &:disabled { opacity: 0.5; }
`;

const UserSearchRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  flex-wrap: wrap;
`;

const UserSearchLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
  white-space: nowrap;
`;

/* ── 날짜 범위 필터 (2026-04-23 추가) ── */

const DateFilterForm = styled.form`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-wrap: wrap;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.bgHover};
  border: 1px solid ${({ theme }) => theme.colors.borderLight};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
`;

const DateFieldWrap = styled.label`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const DateLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  white-space: nowrap;
`;

const DateInput = styled.input`
  height: 32px;
  padding: 0 8px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  background: #ffffff;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: ${({ theme }) => theme.fonts.base};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const ApplyButton = styled.button`
  padding: 5px 12px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  border-radius: 4px;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  &:hover { background: ${({ theme }) => theme.colors.primaryHover}; }
`;

const ResetButton = styled.button`
  padding: 5px 10px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
`;

const AppliedBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  background: ${({ theme }) => theme.colors.primaryLight};
  color: ${({ theme }) => theme.colors.primary};
  border-radius: 20px;
  border: 1px solid ${({ theme }) => theme.colors.primary};
`;

const TableWrapper = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  overflow-x: auto;
  box-shadow: ${({ theme }) => theme.shadows.card};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 900px;
`;

const Th = styled.th`
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  text-align: left;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgHover};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  white-space: nowrap;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const Td = styled.td`
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: ${({ $mono, theme }) => $mono ? theme.fonts.mono : 'inherit'};
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight};
  white-space: nowrap;

  tr:last-child & {
    border-bottom: none;
  }
`;

/**
 * AI 어시스턴트 하이라이트용 tr.
 * $highlight=true 인 행에 primary 색 좌측 보더 + 옅은 배경을 적용해
 * navigate(?subscriptionId=...) 로 진입한 대상 행을 시각적으로 구분한다.
 */
const HighlightTr = styled.tr`
  ${({ $highlight, theme }) =>
    $highlight
      ? `
        background: ${theme.colors.primaryBg};
        box-shadow: inset 3px 0 0 ${theme.colors.primary};
      `
      : ''}
  transition: background ${({ theme }) => theme.transitions.fast};
`;

/** 사용자 셀 — 닉네임/이메일 우선, userId 보조 */
const UserCell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const UserMain = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const UserSub = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  font-family: ${({ theme }) => theme.fonts.mono};
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
`;

/**
 * 플랜별 색상 칩.
 * 백엔드 planCode 기준 — 프리미엄 계열은 warning, 기본/베이식은 muted, 연간은 primary.
 */
const PlanChip = styled.span`
  display: inline-block;
  padding: 2px ${({ theme }) => theme.spacing.sm};
  border-radius: 4px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};

  ${({ $planCode, theme }) => {
    if ($planCode?.endsWith('premium')) {
      return `background: ${theme.colors.warningBg}; color: #b45309;`;
    }
    if ($planCode?.startsWith('yearly')) {
      return `background: ${theme.colors.primaryBg}; color: ${theme.colors.primary};`;
    }
    return `background: ${theme.colors.bgHover}; color: ${theme.colors.textSecondary};`;
  }}
`;

const DateCell = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  font-family: ${({ theme }) => theme.fonts.mono};
`;

const DaysLeftBadge = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  padding: 1px 6px;
  border-radius: 3px;
  background: ${({ $urgent, theme }) =>
    $urgent ? theme.colors.errorBg : theme.colors.warningBg};
  color: ${({ $urgent, theme }) =>
    $urgent ? theme.colors.error : '#92400e'};
`;

const AutoRenewDot = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ $on, theme }) =>
    $on ? theme.colors.success : theme.colors.textMuted};
`;

const ActionGroup = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const ActionButton = styled.button`
  padding: 3px ${({ theme }) => theme.spacing.md};
  border-radius: 4px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  transition: opacity ${({ theme }) => theme.transitions.fast};
  white-space: nowrap;
  min-width: 42px;

  ${({ $variant, theme }) => {
    switch ($variant) {
      case 'danger':
        return `color: ${theme.colors.error}; border: 1px solid ${theme.colors.error}; background: ${theme.colors.errorBg};`;
      case 'primary':
        return `color: ${theme.colors.primary}; border: 1px solid ${theme.colors.primary}; background: ${theme.colors.primaryBg};`;
      default:
        return `color: ${theme.colors.textSecondary}; border: 1px solid ${theme.colors.border}; background: transparent;`;
    }
  }}

  &:hover:not(:disabled) { opacity: 0.75; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

const ErrorMsg = styled.p`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const CenterMsg = styled.p`
  padding: ${({ theme }) => theme.spacing.xxl};
  text-align: center;
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.md};
`;

const Pagination = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.lg};
`;

const PageButton = styled.button`
  height: 32px;
  padding: 0 ${({ theme }) => theme.spacing.lg};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.bgHover}; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

const PageInfo = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  min-width: 64px;
  text-align: center;
`;
