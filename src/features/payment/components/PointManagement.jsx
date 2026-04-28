/**
 * 포인트 수동 관리 컴포넌트.
 *
 * 두 영역으로 구성된다:
 * 1. 수동 지급/차감 폼 — 관리자가 특정 사용자에게 포인트를 직접 지급하거나 차감
 * 2. 사용자 포인트 이력 조회 — UserSearchPicker 로 사용자 선택 후 이력 테이블 표시
 *
 * 2026-04-14 변경:
 *  - 백엔드 DTO(PointHistoryItem) 필드 정합화.
 *    기존: item.id / item.type / item.amount / item.balance / item.reason / item.adminId
 *    실제: historyId / pointType / pointChange / pointAfter / description / actionType
 *  - UUID 직접 입력 대신 이메일/닉네임 검색(UserSearchPicker) 사용
 *  - 수동 지급/차감 폼도 UserSearchPicker 로 사용자 지정
 *
 * @module PointManagement
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { manualPointTransfer, fetchPointHistory } from '../api/paymentApi';
import StatusBadge from '@/shared/components/StatusBadge';
import UserSearchPicker from '@/shared/components/UserSearchPicker';

/**
 * 1회 수동 포인트 지급/차감 최대 금액 (1억 P).
 *
 * 백엔드 `AdminManualPointRequest#amount` 의 `@Max(100,000,000)` 와 동기화되어야 한다.
 * 1P = 10원 기준으로 10억원 상당이며, 서버의 `Integer` 타입 범위 오버플로우와
 * 오타로 인한 비현실적 금액 입력을 사전에 차단하기 위한 상한.
 */
const MAX_MANUAL_POINT = 100_000_000;

/**
 * 포인트 변동 유형 → StatusBadge 매핑.
 * 백엔드 `pointType` 값은 소문자 (earn/spend/refund/revoke/attendance 등) 이므로
 * 대소문자 무관 매핑을 위해 .toLowerCase() 적용.
 */
const POINT_TYPE_MAP = {
  earn:       { status: 'success', label: '적립' },
  spend:      { status: 'error',   label: '차감' },
  refund:     { status: 'default', label: '환불' },
  revoke:     { status: 'default', label: '회수' },
  attendance: { status: 'info',    label: '출석' },
  purchase:   { status: 'warning', label: '구매' },
  expiration: { status: 'default', label: '만료' },
  manual:     { status: 'info',    label: '수동' },
};

function resolveTypeBadge(pointType) {
  if (!pointType) return { status: 'default', label: '-' };
  const key = String(pointType).toLowerCase();
  return POINT_TYPE_MAP[key] ?? { status: 'default', label: pointType };
}

/** 날짜 포맷 (YYYY.MM.DD HH:MM) */
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '-';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 포인트 부호 표시 — 백엔드 pointChange 는 음수/양수 모두 가능 */
function formatPointChange(change) {
  if (change == null) return '-';
  const n = Number(change);
  if (Number.isNaN(n)) return '-';
  const sign = n > 0 ? '+' : (n < 0 ? '-' : '');
  return `${sign}${Math.abs(n).toLocaleString()}`;
}

export default function PointManagement() {
  /* ── 수동 지급/차감 폼 상태 ── */
  const [transferUser, setTransferUser] = useState(null);
  const [transferForm, setTransferForm] = useState({
    amount: '',
    reason: '',
    type: 'EARN',
  });
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferError, setTransferError] = useState(null);
  const [transferSuccess, setTransferSuccess] = useState(null);

  /* ── 이력 조회 상태 ── */
  const [historyUser, setHistoryUser] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPages, setHistoryPages] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const HISTORY_PAGE_SIZE = 20;

  /* 이력 날짜 범위 필터 — Input(타이핑 중) / Filter(확정) 분리.
   * "기간 적용" 버튼 클릭 시에만 Filter 로 커밋되어 재조회가 유발된다.
   * (2026-04-23 추가, AuditLogTab 패턴 재사용) */
  const [fromDateInput, setFromDateInput] = useState('');
  const [toDateInput, setToDateInput] = useState('');
  const [fromDateFilter, setFromDateFilter] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');

  /* ── 수동 지급/차감 폼 핸들러 ── */

  function handleTransferChange(field, value) {
    setTransferForm((prev) => ({ ...prev, [field]: value }));
    setTransferError(null);
    setTransferSuccess(null);
  }

  /** 수동 지급/차감 제출 */
  async function handleTransferSubmit(e) {
    e.preventDefault();

    if (!transferUser?.userId) {
      setTransferError('사용자를 선택해주세요. (이메일 또는 닉네임으로 검색)');
      return;
    }
    const { amount, reason, type } = transferForm;
    const amountNum = Number(amount);
    if (!amount || Number.isNaN(amountNum) || amountNum <= 0) {
      setTransferError('포인트 금액을 올바르게 입력해주세요.');
      return;
    }
    /*
     * 상한 검증 — 백엔드 AdminManualPointRequest#amount 의 @Max(100,000,000) 와 동기화.
     * 정수가 아닌 값/범위 초과 값을 서버까지 보내지 않고 즉시 차단하여
     * 실수로 10조 같은 비현실적 수치를 입력하는 것을 방지한다.
     */
    if (!Number.isInteger(amountNum)) {
      setTransferError('포인트 금액은 정수로 입력해주세요.');
      return;
    }
    if (amountNum > MAX_MANUAL_POINT) {
      setTransferError(
        `1회 ${type === 'EARN' ? '지급' : '차감'} 가능한 최대 금액은 ${MAX_MANUAL_POINT.toLocaleString()}P 입니다.`
      );
      return;
    }
    if (!reason.trim()) {
      setTransferError('처리 사유를 입력해주세요.');
      return;
    }

    try {
      setTransferLoading(true);
      setTransferError(null);
      const result = await manualPointTransfer({
        userId: transferUser.userId,
        amount: amountNum,
        reason: reason.trim(),
        type,
      });

      const actionLabel = type === 'EARN' ? '지급' : '차감';
      /* 백엔드 AdminManualPointResponse 필드명은 newBalance */
      const balance = result?.newBalance ?? result?.balance;
      const balanceMsg = balance != null
        ? ` (현재 잔액: ${Number(balance).toLocaleString()}P)`
        : '';
      setTransferSuccess(
        `${amountNum.toLocaleString()}P ${actionLabel} 완료${balanceMsg}`
      );

      setTransferForm({ amount: '', reason: '', type });

      /* 동일 사용자 이력 탭을 보고 있으면 자동 갱신 */
      if (historyUser?.userId === transferUser.userId) {
        loadHistory(transferUser.userId, 0);
      }
    } catch (err) {
      setTransferError(err.message || '처리 중 오류가 발생했습니다.');
    } finally {
      setTransferLoading(false);
    }
  }

  /* ── 이력 조회 ── */

  /**
   * datetime-local("2026-04-01T14:30") → ISO-8601 초 단위("2026-04-01T14:30:00") 변환.
   * 빈 문자열이면 undefined → 요청 파라미터에서 자동 제외.
   */
  function toIsoOrUndefined(dtLocal) {
    if (!dtLocal) return undefined;
    return dtLocal.length === 16 ? `${dtLocal}:00` : dtLocal;
  }

  /**
   * 이력 API 호출.
   * 확정된 날짜 필터(fromDateFilter/toDateFilter)를 클로저로 캡쳐해 함께 전송한다.
   * useCallback deps 에 두 필터를 포함시켜, 필터 변경 시 새 인스턴스가 생성되고
   * 아래 useEffect 가 동일 사용자에 대해 재조회를 트리거한다.
   */
  const loadHistory = useCallback(async (uid, pg = 0) => {
    if (!uid) return;
    try {
      setHistoryLoading(true);
      setHistoryError(null);
      const params = { page: pg, size: HISTORY_PAGE_SIZE };
      const fromIso = toIsoOrUndefined(fromDateFilter);
      const toIso   = toIsoOrUndefined(toDateFilter);
      if (fromIso) params.fromDate = fromIso;
      if (toIso)   params.toDate   = toIso;
      const result = await fetchPointHistory(uid, params);
      setHistory(result?.content ?? []);
      setHistoryTotal(result?.totalElements ?? 0);
      setHistoryPages(result?.totalPages ?? 0);
      setHistoryPage(pg);
    } catch (err) {
      setHistoryError(err.message);
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [fromDateFilter, toDateFilter]);

  /**
   * 날짜 필터 확정 값이 바뀌면 현재 선택된 사용자의 이력을 첫 페이지부터 재조회.
   * 사용자 선택 변경은 handleHistoryUserChange 에서 직접 호출하므로 여기서는
   * `fromDateFilter` / `toDateFilter` 만 deps 로 두면 충분하다.
   */
  useEffect(() => {
    if (historyUser?.userId) {
      loadHistory(historyUser.userId, 0);
    }
    // historyUser 는 사용자 선택 핸들러에서 직접 loadHistory 를 호출하므로 deps 에서 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDateFilter, toDateFilter]);

  /** 이력 픽커 사용자 선택 변경 */
  function handleHistoryUserChange(user) {
    setHistoryUser(user);
    if (user?.userId) {
      loadHistory(user.userId, 0);
    } else {
      setHistory([]);
      setHistoryTotal(0);
      setHistoryPages(0);
    }
  }

  /** 날짜 필터 적용 — 타이핑 값을 확정 Filter 로 커밋 (useEffect 가 재조회 트리거) */
  function handleDateApply(e) {
    e.preventDefault();
    setFromDateFilter(fromDateInput);
    setToDateFilter(toDateInput);
  }

  /** 날짜 필터 초기화 */
  function handleDateReset() {
    setFromDateInput('');
    setToDateInput('');
    setFromDateFilter('');
    setToDateFilter('');
  }

  const hasDateFilter = !!fromDateFilter || !!toDateFilter;

  return (
    <Wrapper>
      {/* ── 수동 지급/차감 폼 ── */}
      <Section>
        <SectionTitle>포인트 수동 지급 / 차감</SectionTitle>

        <FormCard>
          <form onSubmit={handleTransferSubmit}>
            <FormGrid>
              {/* 유형 선택 */}
              <FormGroup>
                <FormLabel>처리 유형 <RequiredMark>*</RequiredMark></FormLabel>
                <TypeToggle>
                  <TypeButton
                    type="button"
                    $active={transferForm.type === 'EARN'}
                    $color="success"
                    onClick={() => handleTransferChange('type', 'EARN')}
                  >
                    + 지급
                  </TypeButton>
                  <TypeButton
                    type="button"
                    $active={transferForm.type === 'DEDUCT'}
                    $color="danger"
                    onClick={() => handleTransferChange('type', 'DEDUCT')}
                  >
                    - 차감
                  </TypeButton>
                </TypeToggle>
              </FormGroup>

              {/* 사용자 선택 — 이메일/닉네임 검색 */}
              <FormGroup $full>
                <FormLabel>사용자 <RequiredMark>*</RequiredMark></FormLabel>
                <UserSearchPicker
                  selectedUser={transferUser}
                  onChange={setTransferUser}
                  placeholder="이메일 또는 닉네임으로 검색"
                  disabled={transferLoading}
                />
              </FormGroup>

              {/* 포인트 금액 */}
              <FormGroup>
                <FormLabel>포인트 금액 <RequiredMark>*</RequiredMark></FormLabel>
                <InputWithUnit>
                  <Input
                    type="number"
                    min={1}
                    max={MAX_MANUAL_POINT}
                    step={1}
                    value={transferForm.amount}
                    onChange={(e) => handleTransferChange('amount', e.target.value)}
                    placeholder={`1 ~ ${MAX_MANUAL_POINT.toLocaleString()}`}
                    $hasUnit
                  />
                  <Unit>P</Unit>
                </InputWithUnit>
              </FormGroup>

              {/* 처리 사유 */}
              <FormGroup $full>
                <FormLabel>처리 사유 <RequiredMark>*</RequiredMark></FormLabel>
                <Input
                  type="text"
                  value={transferForm.reason}
                  onChange={(e) => handleTransferChange('reason', e.target.value)}
                  placeholder="예: 이벤트 보상, 서비스 장애 보상, 어뷰징 차감..."
                  maxLength={500}
                />
              </FormGroup>
            </FormGrid>

            {transferError && <AlertMsg $type="error">{transferError}</AlertMsg>}
            {transferSuccess && <AlertMsg $type="success">{transferSuccess}</AlertMsg>}

            <SubmitRow>
              <SubmitButton
                type="submit"
                disabled={transferLoading}
                $type={transferForm.type}
              >
                {transferLoading
                  ? '처리 중...'
                  : transferForm.type === 'EARN'
                    ? '포인트 지급'
                    : '포인트 차감'}
              </SubmitButton>
            </SubmitRow>
          </form>
        </FormCard>
      </Section>

      {/* ── 사용자 포인트 이력 조회 ── */}
      <Section>
        <SectionTitle>포인트 변동 이력 조회</SectionTitle>

        <SearchRow>
          <SearchLabel>사용자 검색</SearchLabel>
          <UserSearchPicker
            selectedUser={historyUser}
            onChange={handleHistoryUserChange}
            placeholder="이메일 또는 닉네임으로 검색"
          />
        </SearchRow>

        {/*
          날짜 범위 필터 (2026-04-23 추가) — 포인트 변동일(createdAt) 기준.
          사용자를 선택하지 않은 상태에서도 입력은 가능하되, 재조회는
          사용자가 선택된 경우에만 useEffect 로 트리거된다.
        */}
        <DateFilterForm onSubmit={handleDateApply}>
          <DateFieldWrap>
            <DateLabel>시작일</DateLabel>
            <DateInput
              type="datetime-local"
              value={fromDateInput}
              onChange={(e) => setFromDateInput(e.target.value)}
              max={toDateInput || undefined}
              title="변동일 시작 (inclusive)"
            />
          </DateFieldWrap>
          <DateFieldWrap>
            <DateLabel>종료일</DateLabel>
            <DateInput
              type="datetime-local"
              value={toDateInput}
              onChange={(e) => setToDateInput(e.target.value)}
              min={fromDateInput || undefined}
              title="변동일 종료 (exclusive)"
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

        {historyUser && (
          <>
            <HistoryHeader>
              <HistoryUserId>
                사용자: <strong>{historyUser.nickname ?? historyUser.email ?? historyUser.userId}</strong>
                {(historyUser.nickname || historyUser.email) && (
                  <UserIdSub title={historyUser.userId}> ({historyUser.userId})</UserIdSub>
                )}
              </HistoryUserId>
              {!historyLoading && (
                <HistoryCount>{historyTotal.toLocaleString()}건</HistoryCount>
              )}
            </HistoryHeader>

            {historyError && <AlertMsg $type="error">{historyError}</AlertMsg>}

            <TableWrapper>
              {historyLoading ? (
                <CenterMsg>불러오는 중...</CenterMsg>
              ) : history.length === 0 ? (
                <CenterMsg>이력이 없습니다.</CenterMsg>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>유형</Th>
                      <Th>활동 코드</Th>
                      <Th>변동량</Th>
                      <Th>잔액</Th>
                      <Th>설명</Th>
                      <Th>참조 ID</Th>
                      <Th>일시</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item) => {
                      const badge = resolveTypeBadge(item.pointType);
                      const isPositive = Number(item.pointChange) > 0;

                      return (
                        <tr key={item.historyId}>
                          <Td>
                            <StatusBadge status={badge.status} label={badge.label} />
                          </Td>
                          <Td muted>{item.actionType ?? '-'}</Td>
                          <Td>
                            <DeltaValue $positive={isPositive}>
                              {formatPointChange(item.pointChange)}P
                            </DeltaValue>
                          </Td>
                          <Td mono>
                            {item.pointAfter != null
                              ? `${Number(item.pointAfter).toLocaleString()}P`
                              : '-'}
                          </Td>
                          <Td muted>{item.description ?? '-'}</Td>
                          <Td muted mono>{item.referenceId ?? '-'}</Td>
                          <Td mono>{formatDate(item.createdAt)}</Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            </TableWrapper>

            {historyPages > 1 && (
              <Pagination>
                <PageButton
                  onClick={() => loadHistory(historyUser.userId, historyPage - 1)}
                  disabled={historyPage === 0 || historyLoading}
                >
                  이전
                </PageButton>
                <PageInfo>{historyPage + 1} / {historyPages}</PageInfo>
                <PageButton
                  onClick={() => loadHistory(historyUser.userId, historyPage + 1)}
                  disabled={historyPage >= historyPages - 1 || historyLoading}
                >
                  다음
                </PageButton>
              </Pagination>
            )}
          </>
        )}
      </Section>
    </Wrapper>
  );
}

/* ── styled-components ── */

const Wrapper = styled.div``;

const Section = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.xxl};
`;

const SectionTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.heading};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const FormCard = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  padding: ${({ theme }) => theme.spacing.xxl};
  box-shadow: ${({ theme }) => theme.shadows.card};
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: ${({ theme }) => theme.spacing.xl};
`;

const FormGroup = styled.div`
  ${({ $full }) => $full && 'grid-column: 1 / -1;'}
`;

const FormLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const RequiredMark = styled.span`
  color: ${({ theme }) => theme.colors.error};
`;

const TypeToggle = styled.div`
  display: flex;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  overflow: hidden;
  height: 36px;
`;

const TypeButton = styled.button`
  flex: 1;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  transition: all ${({ theme }) => theme.transitions.fast};

  ${({ $active, $color, theme }) => {
    if (!$active) {
      return `color: ${theme.colors.textSecondary}; background: transparent;`;
    }
    return $color === 'success'
      ? `color: #ffffff; background: ${theme.colors.success};`
      : `color: #ffffff; background: ${theme.colors.error};`;
  }}
`;

const InputWithUnit = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const Input = styled.input`
  width: 100%;
  height: 36px;
  padding: 0 ${({ $hasUnit, theme }) => $hasUnit ? '32px' : theme.spacing.md} 0 ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.bgCard};
  transition: border-color ${({ theme }) => theme.transitions.fast};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }

  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
`;

const Unit = styled.span`
  position: absolute;
  right: ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
  pointer-events: none;
`;

const AlertMsg = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-radius: 4px;
  margin-top: ${({ theme }) => theme.spacing.lg};

  ${({ $type, theme }) =>
    $type === 'error'
      ? `color: ${theme.colors.error}; background: ${theme.colors.errorBg}; border: 1px solid #fecaca;`
      : `color: #065f46; background: ${theme.colors.successBg}; border: 1px solid #a7f3d0;`}
`;

const SubmitRow = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-top: ${({ theme }) => theme.spacing.xl};
`;

const SubmitButton = styled.button`
  height: 36px;
  padding: 0 ${({ theme }) => theme.spacing.xxl};
  border-radius: 6px;
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: #ffffff;
  transition: opacity ${({ theme }) => theme.transitions.fast};

  background: ${({ $type, theme }) =>
    $type === 'EARN' ? theme.colors.success : theme.colors.error};

  &:hover:not(:disabled) { opacity: 0.85; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const SearchRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  flex-wrap: wrap;
`;

const SearchLabel = styled.span`
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

const HistoryHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const HistoryUserId = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textSecondary};

  strong {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const UserIdSub = styled.span`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-family: ${({ theme }) => theme.fonts.mono};
`;

const HistoryCount = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
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
  min-width: 700px;
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

  tr:last-child & { border-bottom: none; }
`;

const DeltaValue = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ $positive, theme }) =>
    $positive ? theme.colors.success : theme.colors.error};
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
