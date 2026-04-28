/**
 * 결제 내역 테이블 컴포넌트.
 *
 * 관리자가 전체 결제 주문을 조회하고 환불 처리할 수 있다.
 * - 상태 필터 (전체/COMPLETED/PENDING/FAILED/REFUNDED)
 * - 유저 검색 (이메일/닉네임) — UserSearchPicker
 * - `orderTypeFilter` prop — 상위 탭(전체/개별 결제/포인트 단독 결제)에서 지정하는 주문 유형 고정 필터
 * - 페이징 (page, size)
 * - 환불 버튼 클릭 시 RefundModal 오픈
 * - 보상 실패 건 별도 섹션으로 표시 및 수동 보상 처리 (ConfirmModal)
 *
 * 2026-04-14 변경:
 *  - 백엔드 DTO(PaymentOrderSummary) 필드 정합화
 *      orderType / pgProvider / failedReason / completedAt (기존 type/paymentMethod/failReason)
 *  - window.confirm / alert / prompt 제거 → ConfirmModal 로 교체
 *  - 닉네임/이메일 검색 및 표시 지원
 *  - `orderTypeFilter` prop 신설 — PaymentPage 에서 "개별 결제"(SUBSCRIPTION), "포인트 단독 결제"(POINT_PACK) 탭 추가 지원
 *
 * @module PaymentOrderTable
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { MdRefresh, MdErrorOutline, MdBuild, MdClose, MdSync } from 'react-icons/md';
import {
  fetchPaymentOrders,
  fetchFailedOrders,
  compensateOrder,
  syncOrderFromPg,
} from '../api/paymentApi';
import StatusBadge from '@/shared/components/StatusBadge';
import ConfirmModal from '@/shared/components/ConfirmModal';
import UserSearchPicker from '@/shared/components/UserSearchPicker';
import RefundModal from './RefundModal';

/** 결제 상태 → StatusBadge status 매핑 */
const STATUS_MAP = {
  COMPLETED: { status: 'success', label: '완료' },
  PENDING:   { status: 'warning', label: '대기' },
  FAILED:    { status: 'error',   label: '실패' },
  REFUNDED:  { status: 'info',    label: '환불' },
  COMPENSATION_FAILED: { status: 'error', label: '보상실패' },
};

/** 주문 유형 한국어 (백엔드 orderType = SUBSCRIPTION | POINT_PACK) */
const TYPE_LABEL = {
  SUBSCRIPTION: '구독',
  POINT_PACK:   '포인트 팩',
  ITEM:         '아이템',
};

/** 필터 옵션 */
const STATUS_FILTERS = [
  { value: '', label: '전체' },
  { value: 'COMPLETED', label: '완료' },
  { value: 'PENDING',   label: '대기' },
  { value: 'FAILED',    label: '실패' },
  { value: 'REFUNDED',  label: '환불' },
];

/** 날짜 포맷 (YYYY.MM.DD HH:MM) */
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '-';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 결제 주문 테이블.
 *
 * @param {Object} props
 * @param {string} [props.orderTypeFilter] - 주문 유형 고정 필터 (SUBSCRIPTION|POINT_PACK). 미지정 시 전체.
 * @param {string} [props.title]           - 상단 섹션 타이틀 (기본 "결제 내역")
 * @param {boolean} [props.showFailedSection=true] - 보상 실패 건 섹션 노출 여부 (전체 탭에서만)
 */
export default function PaymentOrderTable({
  orderTypeFilter,
  title,
  showFailedSection = true,
  aiOrderRequest = null,
}) {
  /* 결제 목록 상태 */
  const [orders, setOrders] = useState([]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* 필터/페이징 상태 */
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  /* 날짜 범위 필터 — 타이핑 중 상태(Input)와 확정 상태(Filter)를 분리.
   * 타이핑 중 매번 재조회하지 않도록 "적용" 버튼 클릭 시에만 Filter 로 커밋된다.
   * (2026-04-23 추가, AuditLogTab 패턴 재사용) */
  const [fromDateInput, setFromDateInput] = useState('');
  const [toDateInput, setToDateInput] = useState('');
  const [fromDateFilter, setFromDateFilter] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');

  /* 보상 실패 목록 상태 */
  const [failedOrders, setFailedOrders] = useState([]);
  const [failedLoading, setFailedLoading] = useState(false);
  /* 개별 보상 모달 대상 */
  const [compensateTarget, setCompensateTarget] = useState(null);
  const [compensateLoading, setCompensateLoading] = useState(false);
  const [compensateError, setCompensateError] = useState(null);

  /* 대량 보상 선택 상태 */
  const [selectedFailedIds, setSelectedFailedIds] = useState(() => new Set());
  const [bulkCompensateOpen, setBulkCompensateOpen] = useState(false);
  const [bulkCompensating, setBulkCompensating] = useState(false);
  const [bulkError, setBulkError] = useState(null);

  /* 결과 안내 모달 (alert 대체) */
  const [resultAlert, setResultAlert] = useState(null); // { title, description }

  /* 환불 모달 상태 */
  const [refundTarget, setRefundTarget] = useState(null);
  const [refundModalOpen, setRefundModalOpen] = useState(false);

  /* PG 재조회 동기화 모달 상태 (2026-04-24 추가).
   * Toss 콘솔에서 직접 취소하거나 웹훅이 유실되어 DB 가 COMPLETED 로 남은 주문을,
   * cancelPayment 재호출 없이 getPayment 기반으로만 DB 에 동기화한다. */
  const [syncTarget, setSyncTarget] = useState(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState(null);

  /**
   * datetime-local 입력값(예: "2026-04-01T14:30")을 Backend 가 받는
   * ISO-8601 초 단위 문자열("2026-04-01T14:30:00") 로 변환한다.
   * 빈 문자열이면 undefined 반환 → 요청 파라미터에서 자동 제외.
   */
  function toIsoOrUndefined(dtLocal) {
    if (!dtLocal) return undefined;
    return dtLocal.length === 16 ? `${dtLocal}:00` : dtLocal;
  }

  /** 결제 목록 조회 */
  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = { page, size: PAGE_SIZE };
      if (statusFilter) params.status = statusFilter;
      if (orderTypeFilter) params.orderType = orderTypeFilter;
      if (selectedUser?.userId) params.userId = selectedUser.userId;
      const fromIso = toIsoOrUndefined(fromDateFilter);
      const toIso   = toIsoOrUndefined(toDateFilter);
      if (fromIso) params.fromDate = fromIso;
      if (toIso)   params.toDate   = toIso;
      const result = await fetchPaymentOrders(params);

      /* 백엔드가 orderType/userId 필터를 미지원하더라도 최소한의 UX 보장을 위한 클라이언트 필터 fallback */
      let rows = result?.content ?? [];
      if (orderTypeFilter) {
        rows = rows.filter((r) => r.orderType === orderTypeFilter);
      }
      if (selectedUser?.userId) {
        rows = rows.filter((r) => r.userId === selectedUser.userId);
      }

      setOrders(rows);
      setTotalElements(result?.totalElements ?? rows.length);
      setTotalPages(result?.totalPages ?? 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, orderTypeFilter, selectedUser, fromDateFilter, toDateFilter]);

  /** 보상 실패 목록 조회 */
  const loadFailedOrders = useCallback(async () => {
    if (!showFailedSection) return;
    try {
      setFailedLoading(true);
      const result = await fetchFailedOrders();
      setFailedOrders(Array.isArray(result) ? result : []);
      setSelectedFailedIds(new Set());
    } catch {
      setFailedOrders([]);
      setSelectedFailedIds(new Set());
    } finally {
      setFailedLoading(false);
    }
  }, [showFailedSection]);

  // ──────────────────────────────────────────────────────────
  // 대량 보상 선택/실행
  // ──────────────────────────────────────────────────────────

  function toggleSelectFailed(orderId) {
    setSelectedFailedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  function toggleSelectAllFailed() {
    setSelectedFailedIds((prev) => {
      const allIds = failedOrders.map((o) => o.orderId);
      if (allIds.length === 0) return prev;
      const allSelected = allIds.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(allIds);
    });
  }

  function clearFailedSelection() {
    setSelectedFailedIds(new Set());
  }

  /** 일괄 보상 모달 열기 */
  function openBulkCompensate() {
    if (selectedFailedIds.size === 0) return;
    setBulkError(null);
    setBulkCompensateOpen(true);
  }

  /** 일괄 보상 모달 확인 */
  async function runBulkCompensate(note) {
    const ids = Array.from(selectedFailedIds);
    if (ids.length === 0) return;

    setBulkCompensating(true);
    setBulkError(null);
    try {
      const results = await Promise.allSettled(
        ids.map((orderId) => compensateOrder(orderId, { adminNote: note })),
      );
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - succeeded;
      const firstError = results.find((r) => r.status === 'rejected');

      let description = `성공: ${succeeded}건, 실패: ${failed}건`;
      if (firstError) {
        description += `\n첫 실패 사유: ${firstError.reason?.message ?? '알 수 없음'}`;
      }
      setBulkCompensateOpen(false);
      setResultAlert({ title: '일괄 보상 결과', description });
    } catch (err) {
      setBulkError(err?.message ?? '일괄 보상 중 오류 발생');
    } finally {
      setBulkCompensating(false);
      loadFailedOrders();
      loadOrders();
    }
  }

  /* 초기 로드 */
  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    loadFailedOrders();
  }, [loadFailedOrders]);

  /* 필터 변경 시 페이지 초기화 */
  function handleStatusFilter(value) {
    setStatusFilter(value);
    setPage(0);
  }

  function handleUserChange(user) {
    setSelectedUser(user);
    setPage(0);
  }

  /** 날짜 필터 적용 — 타이핑 중 값을 확정 Filter 로 커밋하고 첫 페이지로 이동 */
  function handleDateApply(e) {
    e.preventDefault();
    setFromDateFilter(fromDateInput);
    setToDateFilter(toDateInput);
    setPage(0);
  }

  /** 날짜 필터 초기화 — 타이핑/확정 양쪽 모두 리셋 */
  function handleDateReset() {
    setFromDateInput('');
    setToDateInput('');
    setFromDateFilter('');
    setToDateFilter('');
    setPage(0);
  }

  const hasDateFilter = !!fromDateFilter || !!toDateFilter;

  /** 환불 모달 오픈 */
  function openRefund(order) {
    setRefundTarget(order);
    setRefundModalOpen(true);
  }

  /* v3 Phase G: AI Assistant 가 navigate(?orderId=...&action=refund) 로 진입시킨 경우,
   * 목록 로드 후 해당 주문을 찾아 환불 모달을 자동 오픈.
   * 1회만 실행되어야 하므로 consumedRef 로 중복 발동 차단. */
  const aiRequestConsumedRef = useRef(false);
  useEffect(() => {
    if (aiRequestConsumedRef.current) return;
    if (!aiOrderRequest?.orderId || aiOrderRequest.action !== 'refund') return;
    if (loading) return;
    const matched = orders.find((o) => o.orderId === aiOrderRequest.orderId);
    if (matched) {
      aiRequestConsumedRef.current = true;
      openRefund(matched);
    }
  }, [aiOrderRequest, orders, loading]);

  /** 환불 성공 후 목록 갱신 */
  function handleRefundSuccess() {
    loadOrders();
  }

  /**
   * PG(Toss) 재조회 동기화 모달 열기.
   *
   * Toss 콘솔 직접 취소나 웹훅 유실로 DB 상태가 PG 와 어긋났을 때 사용한다.
   * 일반 환불 버튼은 cancelPayment 를 재호출해 ALREADY_CANCELED 500 을 유발하지만,
   * 이 기능은 getPayment(read-only) 만 호출하므로 안전하다.
   */
  function openSyncFromPg(order) {
    setSyncError(null);
    setSyncTarget(order);
  }

  /** PG 재조회 동기화 실행 — 결과는 resultAlert 모달로 안내 */
  async function runSyncFromPg() {
    if (!syncTarget) return;
    setSyncLoading(true);
    setSyncError(null);
    try {
      const res = await syncOrderFromPg(syncTarget.orderId);
      setSyncTarget(null);
      /* 결과 타입(result)별 시각적 구분:
       *  - SYNCED    → 성공 (DB 가 PG 에 맞춰 갱신됨)
       *  - NO_CHANGE → DB/PG 이미 일치 (변경 없음)
       *  - MISMATCH  → 자동 동기화 규칙 외 (수동 검토 필요) */
      const titleByResult = {
        SYNCED:    'PG 재조회 — 동기화 완료',
        NO_CHANGE: 'PG 재조회 — 이미 일치',
        MISMATCH:  'PG 재조회 — 수동 검토 필요',
      };
      setResultAlert({
        title: titleByResult[res?.result] ?? 'PG 재조회 결과',
        description:
          (res?.message ?? '') +
          `\n\nDB 상태: ${res?.dbStatus ?? '-'}\nPG 상태: ${res?.pgStatus ?? '-'}` +
          (res?.pointsRecovered > 0 ? `\n회수 포인트: ${res.pointsRecovered.toLocaleString()}P` : ''),
      });
      /* SYNCED 인 경우에만 목록 갱신 — NO_CHANGE/MISMATCH 는 DB 변경이 없으므로 재조회 불필요 */
      if (res?.result === 'SYNCED') {
        loadOrders();
      }
    } catch (err) {
      setSyncError(err?.message ?? 'PG 재조회 중 오류 발생');
    } finally {
      setSyncLoading(false);
    }
  }

  /** 개별 보상 모달 열기 */
  function openCompensate(order) {
    setCompensateError(null);
    setCompensateTarget(order);
  }

  /** 개별 보상 모달 확인 */
  async function runCompensate(note) {
    if (!compensateTarget) return;
    setCompensateLoading(true);
    setCompensateError(null);
    try {
      await compensateOrder(compensateTarget.orderId, { adminNote: note });
      setCompensateTarget(null);
      loadFailedOrders();
      loadOrders();
    } catch (err) {
      setCompensateError(err?.message ?? '보상 처리 실패');
    } finally {
      setCompensateLoading(false);
    }
  }

  /** 유저 표시 우선순위: nickname > email > userId */
  function userLabel(order) {
    return order.nickname ?? order.email ?? order.userId ?? '-';
  }

  return (
    <>
      {/* ── 보상 실패 섹션 ── */}
      {showFailedSection && (failedOrders.length > 0 || failedLoading) && (
        <Section>
          <SectionHeader>
            <SectionTitle>
              <MdErrorOutline size={18} style={{ color: '#ef4444' }} />
              보상 실패 건 ({failedLoading ? '...' : failedOrders.length})
            </SectionTitle>
            <RefreshButton onClick={loadFailedOrders} disabled={failedLoading}>
              <MdRefresh size={16} />
            </RefreshButton>
          </SectionHeader>
          <AlertBanner>
            결제는 완료됐으나 포인트/구독 지급에 실패한 건입니다. 수동 보상 처리가 필요합니다.
          </AlertBanner>

          {/* 대량 보상 바 */}
          {selectedFailedIds.size > 0 && (
            <BulkBar>
              <BulkInfo>
                선택 <strong>{selectedFailedIds.size}</strong>건
              </BulkInfo>
              <BulkActions>
                <BulkRunButton
                  type="button"
                  onClick={openBulkCompensate}
                  disabled={bulkCompensating}
                  title="선택한 실패 주문 일괄 수동 보상"
                >
                  <MdBuild size={16} />
                  일괄 보상 처리
                </BulkRunButton>
                <BulkCancelButton
                  type="button"
                  onClick={clearFailedSelection}
                  disabled={bulkCompensating}
                >
                  <MdClose size={16} />
                  선택 해제
                </BulkCancelButton>
                {bulkCompensating && <BulkStatus>처리 중...</BulkStatus>}
              </BulkActions>
            </BulkBar>
          )}

          {failedOrders.length > 0 && (
            <TableWrapper>
              <Table>
                <thead>
                  <tr>
                    <Th style={{ width: '36px' }}>
                      <FailedHeaderCheckbox
                        orders={failedOrders}
                        selectedIds={selectedFailedIds}
                        onToggle={toggleSelectAllFailed}
                        disabled={failedLoading || bulkCompensating}
                      />
                    </Th>
                    <Th>주문 ID</Th>
                    <Th>사용자</Th>
                    <Th>유형</Th>
                    <Th>금액</Th>
                    <Th>실패 사유</Th>
                    <Th>일시</Th>
                    <Th>액션</Th>
                  </tr>
                </thead>
                <tbody>
                  {failedOrders.map((order) => {
                    const isChecked = selectedFailedIds.has(order.orderId);
                    return (
                      <tr key={order.orderId}>
                        <Td>
                          <RowCheckbox
                            type="checkbox"
                            checked={isChecked}
                            disabled={bulkCompensating}
                            onChange={() => toggleSelectFailed(order.orderId)}
                            aria-label={`주문 ${order.orderId} 선택`}
                          />
                        </Td>
                        <Td mono>{order.orderId}</Td>
                        <Td>
                          <UserCell>
                            <UserMain>{userLabel(order)}</UserMain>
                            {(order.nickname || order.email) && order.userId && (
                              <UserSub title={order.userId}>{order.userId}</UserSub>
                            )}
                          </UserCell>
                        </Td>
                        <Td>{TYPE_LABEL[order.orderType] ?? order.orderType ?? '-'}</Td>
                        <Td mono>{order.amount?.toLocaleString()}원</Td>
                        <Td muted>{order.failedReason ?? '-'}</Td>
                        <Td mono>{formatDate(order.createdAt)}</Td>
                        <Td>
                          <ActionButton
                            $variant="warning"
                            disabled={bulkCompensating || compensateLoading}
                            onClick={() => openCompensate(order)}
                          >
                            수동 보상
                          </ActionButton>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrapper>
          )}
        </Section>
      )}

      {/* ── 결제 내역 목록 ── */}
      <Section>
        <SectionHeader>
          <SectionTitle>
            {title ?? '결제 내역'} ({totalElements.toLocaleString()}건)
          </SectionTitle>
          <HeaderRight>
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
            <RefreshButton onClick={loadOrders} disabled={loading}>
              <MdRefresh size={16} />
            </RefreshButton>
          </HeaderRight>
        </SectionHeader>

        {/* 유저 검색 */}
        <UserSearchRow>
          <UserSearchLabel>사용자 검색</UserSearchLabel>
          <UserSearchPicker
            selectedUser={selectedUser}
            onChange={handleUserChange}
            placeholder="이메일 또는 닉네임으로 검색"
          />
        </UserSearchRow>

        {/*
          날짜 범위 필터 (2026-04-23 추가).
          결제 주문 생성일(createdAt) 기준 inclusive(from) ~ exclusive(to).
          "적용" 버튼 클릭 시 재조회되어 타이핑 중 불필요한 호출을 방지한다.
        */}
        <DateFilterForm onSubmit={handleDateApply}>
          <DateFieldWrap>
            <DateLabel>시작일</DateLabel>
            <DateInput
              type="datetime-local"
              value={fromDateInput}
              onChange={(e) => setFromDateInput(e.target.value)}
              max={toDateInput || undefined}
              title="생성일 시작 (inclusive)"
            />
          </DateFieldWrap>
          <DateFieldWrap>
            <DateLabel>종료일</DateLabel>
            <DateInput
              type="datetime-local"
              value={toDateInput}
              onChange={(e) => setToDateInput(e.target.value)}
              min={fromDateInput || undefined}
              title="생성일 종료 (exclusive)"
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
            <LoadingMsg>불러오는 중...</LoadingMsg>
          ) : orders.length === 0 ? (
            <EmptyMsg>결제 내역이 없습니다.</EmptyMsg>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>주문 ID</Th>
                  <Th>사용자</Th>
                  <Th>유형</Th>
                  <Th>금액</Th>
                  <Th>지급 포인트</Th>
                  <Th>PG</Th>
                  <Th>상태</Th>
                  <Th>일시</Th>
                  <Th>액션</Th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const badge = STATUS_MAP[order.status] ?? { status: 'default', label: order.status };
                  const canRefund = order.status === 'COMPLETED';

                  return (
                    <tr key={order.orderId}>
                      <Td mono>{order.orderId}</Td>
                      <Td>
                        <UserCell>
                          <UserMain>{userLabel(order)}</UserMain>
                          {(order.nickname || order.email) && order.userId && (
                            <UserSub title={order.userId}>{order.userId}</UserSub>
                          )}
                        </UserCell>
                      </Td>
                      <Td>{TYPE_LABEL[order.orderType] ?? order.orderType ?? '-'}</Td>
                      <Td mono>{order.amount?.toLocaleString()}원</Td>
                      <Td mono>
                        {order.pointsAmount != null
                          ? `${order.pointsAmount.toLocaleString()}P`
                          : '-'}
                      </Td>
                      <Td>{order.pgProvider ?? '-'}</Td>
                      <Td>
                        <StatusBadge status={badge.status} label={badge.label} />
                      </Td>
                      <Td mono>{formatDate(order.createdAt)}</Td>
                      <Td>
                        <RowActions>
                          {canRefund && (
                            <ActionButton
                              $variant="danger"
                              onClick={() => openRefund(order)}
                            >
                              환불
                            </ActionButton>
                          )}
                          {/*
                            PG 재조회 버튼 (2026-04-24 추가).
                            Toss 콘솔 직접 취소 / 웹훅 유실 대응용.
                            COMPLETED 상태에서만 의미가 있으므로 canRefund 와 동일한 조건으로 노출.
                          */}
                          {canRefund && (
                            <ActionButton
                              $variant="info"
                              onClick={() => openSyncFromPg(order)}
                              title="Toss 결제 상태를 재조회하여 DB 를 PG 에 맞춰 동기화합니다 (Toss 재취소 호출 없음)."
                            >
                              <MdSync size={12} />
                              PG 재조회
                            </ActionButton>
                          )}
                        </RowActions>
                      </Td>
                    </tr>
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
            <PageInfo>
              {page + 1} / {totalPages}
            </PageInfo>
            <PageButton
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              다음
            </PageButton>
          </Pagination>
        )}
      </Section>

      {/* 환불 모달 (기존 유지) */}
      <RefundModal
        isOpen={refundModalOpen}
        order={refundTarget}
        onClose={() => {
          setRefundModalOpen(false);
          setRefundTarget(null);
        }}
        onSuccess={handleRefundSuccess}
      />

      {/* 개별 보상 모달 */}
      <ConfirmModal
        isOpen={!!compensateTarget}
        title="수동 보상 처리"
        description={
          compensateTarget
            ? `주문 ${compensateTarget.orderId} 을(를) COMPENSATION_FAILED → COMPLETED 로 복구합니다.\n감사 로그에 남길 관리자 메모를 입력해주세요.`
            : null
        }
        confirmText="보상 처리"
        cancelText="취소"
        variant="warning"
        withReason
        reasonLabel="관리자 메모"
        reasonPlaceholder="예: Toss 콘솔에서 포인트 수동 지급 완료"
        reasonRequired
        loading={compensateLoading}
        error={compensateError}
        onConfirm={runCompensate}
        onClose={() => {
          if (!compensateLoading) setCompensateTarget(null);
        }}
      />

      {/* PG(Toss) 재조회 동기화 모달 (2026-04-24 추가) */}
      <ConfirmModal
        isOpen={!!syncTarget}
        title="PG(Toss) 재조회 동기화"
        description={
          syncTarget
            ? `주문 ${syncTarget.orderId} 의 Toss 결제 상태를 재조회하여 DB 와 동기화합니다.\n\n` +
              `• Toss getPayment(read-only) 만 호출합니다 — 취소 API 재호출 없음\n` +
              `• Toss 가 이미 CANCELED 이면 DB 를 REFUNDED 로 변경 + POINT_PACK 포인트 회수\n` +
              `• Toss/DB 이미 일치 시 변경 없음 (NO_CHANGE)\n` +
              `• 자동 동기화 규칙 외(PG DONE · DB REFUNDED 등)는 MISMATCH 로 보고`
            : null
        }
        confirmText="재조회 실행"
        cancelText="취소"
        variant="primary"
        loading={syncLoading}
        error={syncError}
        onConfirm={runSyncFromPg}
        onClose={() => {
          if (!syncLoading) setSyncTarget(null);
        }}
      />

      {/* 일괄 보상 모달 */}
      <ConfirmModal
        isOpen={bulkCompensateOpen}
        title="일괄 보상 처리"
        description={`선택된 ${selectedFailedIds.size}건에 동일하게 적용될 관리자 메모를 입력해주세요.\n감사 로그(admin_audit_logs)에 개별 건마다 기록됩니다.`}
        confirmText="일괄 보상"
        cancelText="취소"
        variant="warning"
        withReason
        reasonLabel="공통 관리자 메모"
        reasonPlaceholder="예: Toss 콘솔에서 포인트 일괄 지급 완료"
        reasonRequired
        loading={bulkCompensating}
        error={bulkError}
        onConfirm={runBulkCompensate}
        onClose={() => {
          if (!bulkCompensating) setBulkCompensateOpen(false);
        }}
      />

      {/* 결과 안내 모달 */}
      <ConfirmModal
        isOpen={!!resultAlert}
        title={resultAlert?.title ?? ''}
        description={resultAlert?.description ?? ''}
        confirmText="확인"
        hideCancel
        variant="primary"
        onConfirm={() => setResultAlert(null)}
        onClose={() => setResultAlert(null)}
      />
    </>
  );
}

/**
 * 실패 주문 테이블 헤더 체크박스 — indeterminate 상태 제어용.
 */
function FailedHeaderCheckbox({ orders, selectedIds, onToggle, disabled }) {
  const ref = useRef(null);

  const ids = orders.map((o) => o.orderId);
  const checkedCount = ids.filter((id) => selectedIds.has(id)).length;
  const allChecked  = ids.length > 0 && checkedCount === ids.length;
  const someChecked = checkedCount > 0 && !allChecked;

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = someChecked;
    }
  }, [someChecked]);

  return (
    <RowCheckbox
      type="checkbox"
      ref={ref}
      checked={allChecked}
      disabled={disabled}
      onChange={onToggle}
      aria-label="실패 주문 전체 선택/해제"
    />
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
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
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

/** 날짜 필터 폼 — 검색 행과 동일한 여백/색감으로 툴바 느낌 유지 */
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

/** 확정된 기간을 표시하는 배지 — 필터 UX 피드백용 */
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

const AlertBanner = styled.div`
  background: ${({ theme }) => theme.colors.warningBg};
  border: 1px solid #fde68a;
  border-radius: 6px;
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: #92400e;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
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
  color: ${({ muted, theme }) =>
    muted ? theme.colors.textMuted : theme.colors.textPrimary};
  font-family: ${({ mono, theme }) => mono ? theme.fonts.mono : 'inherit'};
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight};
  white-space: nowrap;

  tr:last-child & {
    border-bottom: none;
  }
`;

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
 * 행 단위 액션 버튼 컨테이너 — "환불" + "PG 재조회" 등 복수 버튼이 줄바꿈 없이 나란히 배치되도록 감싼다.
 * 좁은 화면에서도 버튼이 잘리지 않게 nowrap 유지 + gap 으로 간격 분리.
 */
const RowActions = styled.div`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  flex-wrap: nowrap;
`;

const ActionButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px ${({ theme }) => theme.spacing.md};
  border-radius: 4px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  transition: opacity ${({ theme }) => theme.transitions.fast};
  white-space: nowrap;

  ${({ $variant, theme }) => {
    if ($variant === 'danger') {
      /* 환불: 금전 이동 — 강조 위험 스타일 */
      return `color: ${theme.colors.error}; border: 1px solid ${theme.colors.error}; background: ${theme.colors.errorBg};`;
    }
    if ($variant === 'info') {
      /* PG 재조회: 진단/동기화 — 안전한 조회 성격의 중립 스타일 (primary 계열) */
      return `color: ${theme.colors.primary}; border: 1px solid ${theme.colors.primary}; background: ${theme.colors.primaryLight ?? '#eff6ff'};`;
    }
    /* 기본(수동 보상): warning 스타일 */
    return `color: ${theme.colors.warning ?? '#92400e'}; border: 1px solid ${theme.colors.warning ?? '#f59e0b'}; background: ${theme.colors.warningBg};`;
  }}

  &:hover:not(:disabled) { opacity: 0.75; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

const ErrorMsg = styled.p`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const LoadingMsg = styled.p`
  padding: ${({ theme }) => theme.spacing.xxl};
  text-align: center;
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.md};
`;

const EmptyMsg = styled.p`
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

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.bgHover};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const PageInfo = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  min-width: 64px;
  text-align: center;
`;

const BulkBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.lg};
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  margin-bottom: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.primaryLight};
  border: 1px solid ${({ theme }) => theme.colors.primary};
  border-radius: 6px;
`;

const BulkInfo = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.primary};

  strong {
    font-size: ${({ theme }) => theme.fontSizes.md};
    font-weight: ${({ theme }) => theme.fontWeights.bold};
    margin: 0 ${({ theme }) => theme.spacing.xs};
  }
`;

const BulkActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const BulkRunButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: 6px ${({ theme }) => theme.spacing.lg};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: #ffffff;
  background: ${({ theme }) => theme.colors.warning ?? '#f59e0b'};
  border-radius: 4px;
  transition: opacity ${({ theme }) => theme.transitions.fast};
  white-space: nowrap;

  &:hover:not(:disabled) {
    opacity: 0.85;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const BulkCancelButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: 6px ${({ theme }) => theme.spacing.lg};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  transition: all ${({ theme }) => theme.transitions.fast};
  white-space: nowrap;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.bgHover};
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const BulkStatus = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.primary};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  margin-left: ${({ theme }) => theme.spacing.sm};
`;

const RowCheckbox = styled.input`
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: ${({ theme }) => theme.colors.primary};

  &:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }
`;
