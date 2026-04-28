/**
 * 사용자 목록 테이블 컴포넌트.
 *
 * 기능:
 * - 회원 목록 테이블 (이메일, 닉네임, 역할, 상태, 가입일, 최근 로그인, 액션)
 * - 상단 필터: keyword 검색 input / status 버튼 필터 / role select 필터 / 새로고침
 * - 행 클릭 또는 "상세" 버튼 → onSelectUser(userId) 콜백 호출
 * - 페이지네이션
 *
 * @param {Object}   props
 * @param {string}   props.selectedUserId  - 현재 선택된 사용자 ID (행 하이라이트)
 * @param {Function} props.onSelectUser    - 사용자 선택 콜백 (userId: string) => void
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import {
  MdSearch,
  MdRefresh,
  MdPerson,
  MdOpenInNew,
  MdBlock,
  MdCheckCircle,
  MdClose,
} from 'react-icons/md';
import { fetchUsers, suspendUser, activateUser } from '../api/usersApi';
import StatusBadge from '@/shared/components/StatusBadge';

/** 날짜 포맷 헬퍼: ISO → YYYY.MM.DD HH:MM */
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 계정 상태 → StatusBadge 매핑 */
const STATUS_BADGE = {
  ACTIVE:    { status: 'success', label: '활성' },
  SUSPENDED: { status: 'error',   label: '정지' },
  LOCKED:    { status: 'warning', label: '잠금' },
};

/** 역할 → StatusBadge 매핑 */
const ROLE_BADGE = {
  ADMIN: { status: 'info',    label: 'ADMIN' },
  USER:  { status: 'default', label: 'USER' },
};

/** 계정 상태 필터 옵션 */
const STATUS_OPTIONS = [
  { value: '',          label: '전체' },
  { value: 'ACTIVE',    label: '활성' },
  { value: 'SUSPENDED', label: '정지' },
  { value: 'LOCKED',    label: '잠금' },
];

/** 역할 필터 옵션 */
const ROLE_OPTIONS = [
  { value: '',      label: '전체 역할' },
  { value: 'USER',  label: 'USER' },
  { value: 'ADMIN', label: 'ADMIN' },
];

/** 페이지 크기 */
const PAGE_SIZE = 20;

export default function UserTable({ selectedUserId, onSelectUser }) {
  /* ── 목록 상태 ── */
  const [users, setUsers]     = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  /* ── 필터 상태 ── */
  /** 키워드 input 값 (타이핑 중) */
  const [keywordInput, setKeywordInput] = useState('');
  /** 실제 API 요청에 사용되는 확정 키워드 */
  const [keyword, setKeyword]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter]     = useState('');

  /* ── 페이징 상태 ── */
  const [page, setPage] = useState(0);

  /* ── 대량 선택 상태 (P2-1, 2026-04-09 추가) ── */
  /**
   * 선택된 사용자 ID 집합.
   * Set 을 사용하여 O(1) has/add/delete 로 체크박스 토글 성능 확보.
   * 필터/페이지 변경 시 별도 useEffect 에서 초기화된다.
   */
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  /**
   * 대량 작업 진행 중 플래그.
   * 진행 중에는 체크박스·버튼·목록을 disabled 처리하여 중복 요청을 차단한다.
   */
  const [bulkProcessing, setBulkProcessing] = useState(false);

  /** 키워드 디바운스 타이머 ref */
  const debounceRef = useRef(null);

  /**
   * 사용자 목록 조회.
   * 필터/페이지 변경 시 useCallback 의존성 배열에 의해 자동 재호출.
   */
  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = { page, size: PAGE_SIZE };
      if (keyword)      params.keyword = keyword;
      if (statusFilter) params.status  = statusFilter;
      if (roleFilter)   params.role    = roleFilter;
      const result = await fetchUsers(params);
      setUsers(result?.content ?? result ?? []);
      setTotal(result?.totalElements ?? (result?.length ?? 0));
    } catch (err) {
      setError(err.message || '사용자 목록을 불러올 수 없습니다.');
    } finally {
      setLoading(false);
    }
  }, [page, keyword, statusFilter, roleFilter]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  /**
   * 필터/페이지 변경 시 대량 선택 초기화.
   * 서로 다른 조회 결과의 사용자가 혼합 선택되면 혼란을 초래하고,
   * 페이지 전환 후 "보이지 않는 선택"이 남아있으면 사고 위험이 크다.
   */
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, keyword, statusFilter, roleFilter]);

  /** 컴포넌트 언마운트 시 디바운스 타이머 클린업 */
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ──────────────────────────────────────────────
  // 대량 선택/실행 (P2-1, 2026-04-09 추가)
  // ──────────────────────────────────────────────

  /**
   * 개별 행 체크박스 토글.
   * 행 클릭(상세 패널 열기)과 구분하기 위해 이벤트 전파는 호출 측에서 stopPropagation 처리한다.
   */
  function toggleSelectOne(userId) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  /**
   * 헤더 체크박스 토글 — 현재 페이지의 모든 사용자를 선택 또는 해제한다.
   * 이미 전부 선택된 상태라면 해제, 하나라도 미선택이면 전체 선택으로 동작한다.
   * (다른 페이지의 선택은 건드리지 않는다.)
   */
  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const idsInPage = users.map((u) => u.userId);
      if (idsInPage.length === 0) return prev;
      const allSelected = idsInPage.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        idsInPage.forEach((id) => next.delete(id));
      } else {
        idsInPage.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  /** 선택 전체 해제 */
  function clearSelection() {
    setSelectedIds(new Set());
  }

  /**
   * 대량 작업 실행 — 정지 또는 활성화.
   *
   * 백엔드는 현재 bulk endpoint 를 제공하지 않으므로, 클라이언트에서 개별 API 를
   * {@link Promise.allSettled} 로 병렬 호출한 뒤 성공/실패 건수를 집계하여 안내한다.
   * 한 건이 실패해도 나머지 요청은 계속되며, 끝난 후 목록을 새로고침하고 선택을 초기화한다.
   *
   * @param {'suspend' | 'activate'} action - 실행할 작업 종류
   */
  async function runBulk(action) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const actionLabel = action === 'suspend' ? '일괄 정지' : '일괄 활성화';
    // eslint-disable-next-line no-alert
    const ok = window.confirm(
      `선택한 ${ids.length}명을 ${actionLabel}하시겠습니까?\n` +
      (action === 'suspend'
        ? '※ 사유는 "관리자 일괄 정지"로 기록됩니다. 사유를 세부적으로 남기려면 개별 처리를 사용하세요.'
        : '※ 잠금(LOCKED) 상태 계정도 활성(ACTIVE)으로 전환됩니다.')
    );
    if (!ok) return;

    setBulkProcessing(true);
    try {
      // 각 사용자에 대해 단일 API 호출을 병렬 수행
      const results = await Promise.allSettled(
        ids.map((userId) => {
          if (action === 'suspend') {
            return suspendUser(userId, {
              reason: '관리자 일괄 정지',
              durationDays: null, // null → 영구 정지 (운영 판단에 따라 개별 처리 권장)
            });
          }
          return activateUser(userId);
        })
      );

      // 결과 집계 — 성공/실패 건수 및 실패 사유 수집
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed    = results.length - succeeded;
      const firstError = results.find((r) => r.status === 'rejected');

      let message = `대량 작업 완료\n성공: ${succeeded}건, 실패: ${failed}건`;
      if (firstError) {
        message += `\n\n첫 실패 사유: ${firstError.reason?.message ?? '알 수 없음'}`;
      }
      // eslint-disable-next-line no-alert
      alert(message);
    } catch (err) {
      // Promise.allSettled 는 reject 하지 않지만, 예외적 네트워크 오류 대비 catch 유지
      // eslint-disable-next-line no-alert
      alert(`대량 작업 중 오류 발생: ${err?.message ?? '알 수 없음'}`);
    } finally {
      setBulkProcessing(false);
      clearSelection();
      loadUsers();
    }
  }

  /**
   * 키워드 input 변경 핸들러.
   * 300ms 디바운스 후 keyword 상태를 업데이트 → 페이지 0으로 리셋.
   */
  function handleKeywordChange(e) {
    const val = e.target.value;
    setKeywordInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setKeyword(val.trim());
      setPage(0);
    }, 300);
  }

  /** 키워드 검색 폼 제출 (엔터) */
  function handleKeywordSubmit(e) {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setKeyword(keywordInput.trim());
    setPage(0);
  }

  /**
   * 상태 필터 버튼 클릭.
   * 필터 변경 시 페이지를 0으로 초기화.
   */
  function handleStatusFilter(value) {
    setStatusFilter(value);
    setPage(0);
  }

  /**
   * 역할 필터 셀렉트 변경.
   * 필터 변경 시 페이지를 0으로 초기화.
   */
  function handleRoleFilter(e) {
    setRoleFilter(e.target.value);
    setPage(0);
  }

  /**
   * 행 또는 상세 버튼 클릭 핸들러.
   * 이미 선택된 사용자를 다시 클릭하면 선택 해제(상세 패널 닫기).
   */
  function handleSelectUser(userId) {
    if (selectedUserId === userId) {
      onSelectUser(null); // 상세 패널 닫기
    } else {
      onSelectUser(userId);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <Container>
      {/* ── 상단 툴바 ── */}
      <Toolbar>
        <ToolbarLeft>
          {/* 키워드 검색 */}
          <SearchForm onSubmit={handleKeywordSubmit}>
            <SearchIcon>
              <MdSearch size={16} />
            </SearchIcon>
            <SearchInput
              type="text"
              value={keywordInput}
              onChange={handleKeywordChange}
              placeholder="이메일 또는 닉네임 검색"
            />
          </SearchForm>

          {/* 상태 필터 버튼 그룹 */}
          <FilterGroup>
            {STATUS_OPTIONS.map((opt) => (
              <FilterButton
                key={opt.value}
                $active={statusFilter === opt.value}
                onClick={() => handleStatusFilter(opt.value)}
              >
                {opt.label}
              </FilterButton>
            ))}
          </FilterGroup>

          {/* 역할 필터 셀렉트 */}
          <RoleSelect value={roleFilter} onChange={handleRoleFilter}>
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </RoleSelect>
        </ToolbarLeft>

        <ToolbarRight>
          {/* 총 건수 */}
          <TotalCount>
            총 <strong>{total.toLocaleString()}</strong>명
          </TotalCount>
          {/* 새로고침 버튼 */}
          <IconButton
            onClick={loadUsers}
            disabled={loading}
            title="새로고침"
          >
            <MdRefresh size={16} />
          </IconButton>
        </ToolbarRight>
      </Toolbar>

      {/* ── 에러 메시지 ── */}
      {error && <ErrorMsg>{error}</ErrorMsg>}

      {/*
        대량 선택 바 — 하나 이상 선택된 경우에만 표시 (P2-1, 2026-04-09).
        일괄 정지/일괄 활성화/선택 해제 3개 액션만 제공한다. 세부 사유/기간 입력이
        필요하면 개별 처리(상세 패널)를 사용하도록 유도한다.
       */}
      {selectedIds.size > 0 && (
        <BulkBar>
          <BulkInfo>
            선택 <strong>{selectedIds.size}</strong>명
          </BulkInfo>
          <BulkActions>
            <BulkSuspendButton
              type="button"
              onClick={() => runBulk('suspend')}
              disabled={bulkProcessing}
              title="선택한 사용자 일괄 정지"
            >
              <MdBlock size={16} />
              일괄 정지
            </BulkSuspendButton>
            <BulkActivateButton
              type="button"
              onClick={() => runBulk('activate')}
              disabled={bulkProcessing}
              title="선택한 사용자 일괄 활성화"
            >
              <MdCheckCircle size={16} />
              일괄 활성화
            </BulkActivateButton>
            <BulkCancelButton
              type="button"
              onClick={clearSelection}
              disabled={bulkProcessing}
              title="선택 해제"
            >
              <MdClose size={16} />
              선택 해제
            </BulkCancelButton>
            {bulkProcessing && <BulkStatus>처리 중...</BulkStatus>}
          </BulkActions>
        </BulkBar>
      )}

      {/* ── 목록 테이블 ── */}
      <TableWrap>
        <Table>
          <thead>
            <tr>
              {/*
                헤더 체크박스 — 현재 페이지의 모든 사용자 일괄 선택/해제.
                "indeterminate" 상태(일부만 선택)는 ref 로 DOM 속성을 직접 제어한다.
              */}
              <Th $w="36px">
                <HeaderCheckbox
                  users={users}
                  selectedIds={selectedIds}
                  onToggle={toggleSelectAll}
                  disabled={loading || bulkProcessing || users.length === 0}
                />
              </Th>
              <Th $w="32px">
                <MdPerson size={14} style={{ display: 'block', margin: '0 auto' }} />
              </Th>
              <Th>이메일</Th>
              <Th $w="110px">닉네임</Th>
              <Th $w="80px">역할</Th>
              <Th $w="80px">상태</Th>
              <Th $w="140px">가입일</Th>
              <Th $w="140px">최근 로그인</Th>
              <Th $w="56px">상세</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9}>
                  <CenterCell>불러오는 중...</CenterCell>
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <CenterCell>검색 결과가 없습니다.</CenterCell>
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const isSelected = selectedUserId === user.userId;
                const isChecked  = selectedIds.has(user.userId);
                const statusInfo = STATUS_BADGE[user.status] ?? { status: 'default', label: user.status ?? '-' };
                const roleInfo   = ROLE_BADGE[user.userRole] ?? { status: 'default', label: user.userRole ?? '-' };

                return (
                  <Tr
                    key={user.userId}
                    $selected={isSelected}
                    onClick={() => handleSelectUser(user.userId)}
                    title="클릭하여 상세 보기"
                  >
                    {/* 체크박스 칸 — 행 클릭 이벤트와 분리하기 위해 stopPropagation */}
                    <Td onClick={(e) => e.stopPropagation()}>
                      <RowCheckbox
                        type="checkbox"
                        checked={isChecked}
                        disabled={bulkProcessing}
                        onChange={() => toggleSelectOne(user.userId)}
                        aria-label={`사용자 ${user.userId} 선택`}
                      />
                    </Td>
                    {/* 아바타 칸 (이니셜) */}
                    <Td>
                      <Avatar>
                        {(user.nickname ?? user.email ?? '?')[0].toUpperCase()}
                      </Avatar>
                    </Td>
                    <Td>
                      <EmailText>{user.email ?? '-'}</EmailText>
                    </Td>
                    <Td>
                      <NicknameText>{user.nickname ?? '-'}</NicknameText>
                    </Td>
                    <Td>
                      <StatusBadge status={roleInfo.status} label={roleInfo.label} />
                    </Td>
                    <Td>
                      <StatusBadge status={statusInfo.status} label={statusInfo.label} />
                    </Td>
                    <Td>
                      <DateText>{formatDate(user.createdAt)}</DateText>
                    </Td>
                    <Td>
                      <DateText>{formatDate(user.lastLoginAt)}</DateText>
                    </Td>
                    <Td>
                      {/* 상세 보기 버튼 — 행 클릭과 동일 동작 */}
                      <DetailButton
                        $active={isSelected}
                        onClick={(e) => {
                          e.stopPropagation(); // 행 클릭 이벤트 중복 방지
                          handleSelectUser(user.userId);
                        }}
                        title={isSelected ? '닫기' : '상세 보기'}
                      >
                        <MdOpenInNew size={14} />
                      </DetailButton>
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
          <PageButton
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            이전
          </PageButton>
          <PageInfo>{page + 1} / {totalPages}</PageInfo>
          <PageButton
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page + 1 >= totalPages}
          >
            다음
          </PageButton>
        </Pagination>
      )}
    </Container>
  );
}

/**
 * 헤더 체크박스 컴포넌트 — indeterminate(일부 선택) 상태 DOM 제어용 소형 컴포넌트.
 *
 * React 는 input 의 {@code indeterminate} 속성을 props 로 직접 세팅할 수 없다 (HTML 표준 외
 * 속성). 따라서 ref 를 통해 DOM 에 직접 부여해야 한다. UserTable 본체에 섞으면 가독성이
 * 떨어지므로 작은 헬퍼 컴포넌트로 분리한다.
 *
 * @param {Object}   props
 * @param {Array}    props.users        현재 페이지에 표시된 사용자 목록
 * @param {Set}      props.selectedIds  선택된 사용자 ID 집합
 * @param {Function} props.onToggle     토글 콜백
 * @param {boolean}  props.disabled     비활성화 여부
 */
function HeaderCheckbox({ users, selectedIds, onToggle, disabled }) {
  const ref = useRef(null);

  // users 또는 selectedIds 변경 시 indeterminate 상태를 재계산하여 DOM 에 반영
  const idsInPage = users.map((u) => u.userId);
  const checkedCount = idsInPage.filter((id) => selectedIds.has(id)).length;
  const allChecked = idsInPage.length > 0 && checkedCount === idsInPage.length;
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
      aria-label="현재 페이지 전체 선택/해제"
    />
  );
}

/* ── styled-components ── */

const Container = styled.div``;

/** 상단 툴바: 검색/필터 영역 */
const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const ToolbarLeft = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const ToolbarRight = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

/** 키워드 검색 폼 (검색 아이콘 + input) */
const SearchForm = styled.form`
  position: relative;
  display: flex;
  align-items: center;
`;

const SearchIcon = styled.span`
  position: absolute;
  left: 9px;
  color: ${({ theme }) => theme.colors.textMuted};
  display: flex;
  align-items: center;
  pointer-events: none;
`;

const SearchInput = styled.input`
  padding: 6px 10px 6px 30px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  outline: none;
  width: 220px;
  background: ${({ theme }) => theme.colors.bgCard};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
  &::placeholder { color: ${({ theme }) => theme.colors.textMuted}; }
`;

/** 상태 필터 버튼 그룹 */
const FilterGroup = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const FilterButton = styled.button`
  padding: 5px 12px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border-radius: 4px;
  border: 1px solid ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.border};
  background: ${({ $active, theme }) => $active ? theme.colors.primaryLight : 'transparent'};
  color: ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.textSecondary};
  font-weight: ${({ $active, theme }) => $active ? theme.fontWeights.semibold : theme.fontWeights.normal};
  transition: all ${({ theme }) => theme.transitions.fast};
  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.primary};
  }
`;

/** 역할 필터 셀렉트 */
const RoleSelect = styled.select`
  padding: 5px 10px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  outline: none;
  background: ${({ theme }) => theme.colors.bgCard};
  color: ${({ theme }) => theme.colors.textSecondary};
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
`;

/** 총 건수 텍스트 */
const TotalCount = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
  white-space: nowrap;
`;

/** 새로고침 아이콘 버튼 */
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

/** 에러 메시지 박스 */
const ErrorMsg = styled.p`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  margin-bottom: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.errorBg};
  border-radius: 4px;
`;

/** 테이블 래퍼 (오버플로우 스크롤) */
const TableWrap = styled.div`
  overflow-x: auto;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  min-width: 700px;
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

/** 행: 선택 시 primaryLight 배경, 클릭 커서 */
const Tr = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight};
  background: ${({ $selected, theme }) =>
    $selected ? theme.colors.primaryLight : 'transparent'};
  cursor: pointer;
  transition: background ${({ theme }) => theme.transitions.fast};
  &:last-child { border-bottom: none; }
  &:hover {
    background: ${({ $selected, theme }) =>
      $selected ? theme.colors.primaryLight : theme.colors.bgHover};
  }
`;

const Td = styled.td`
  padding: 10px 12px;
  color: ${({ theme }) => theme.colors.textPrimary};
  vertical-align: middle;
`;

/** 이니셜 아바타 원형 */
const Avatar = styled.div`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.primaryLight};
  color: ${({ theme }) => theme.colors.primary};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  flex-shrink: 0;
`;

const EmailText = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
  max-width: 220px;
`;

const NicknameText = styled.span`
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
  max-width: 100px;
`;

const DateText = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  font-family: ${({ theme }) => theme.fonts.mono};
  white-space: nowrap;
`;

/** 상세 보기 버튼 */
const DetailButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  border: 1px solid ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.border};
  color: ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.textMuted};
  background: ${({ $active, theme }) => $active ? theme.colors.primaryLight : 'transparent'};
  transition: all ${({ theme }) => theme.transitions.fast};
  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.primary};
  }
`;

/** 로딩/빈 데이터 공통 셀 */
const CenterCell = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xxxl};
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

/** 페이지네이션 */
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

// ──────────────────────────────────────────────
// 대량 선택 UI (P2-1, 2026-04-09 추가)
// ──────────────────────────────────────────────

/**
 * 대량 선택 바 — 하나 이상 선택된 경우 테이블 상단에 표시.
 * primary 컬러로 주의를 끌고, 선택된 수/작업 버튼/해제 버튼을 수평 배치.
 */
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

/** 선택 건수 표시 텍스트 */
const BulkInfo = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.primary};

  strong {
    font-size: ${({ theme }) => theme.fontSizes.md};
    font-weight: ${({ theme }) => theme.fontWeights.bold};
    margin: 0 ${({ theme }) => theme.spacing.xs};
  }
`;

/** 대량 작업 버튼 그룹 */
const BulkActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

/** 대량 작업 공통 버튼 스타일 (inline-flex + 아이콘 포함) */
const BulkButtonBase = styled.button`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: 6px ${({ theme }) => theme.spacing.lg};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  border-radius: 4px;
  transition: all ${({ theme }) => theme.transitions.fast};
  white-space: nowrap;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

/** 일괄 정지 버튼 — 위험 액션이므로 error 컬러 */
const BulkSuspendButton = styled(BulkButtonBase)`
  color: #ffffff;
  background: ${({ theme }) => theme.colors.error};
  border: 1px solid ${({ theme }) => theme.colors.error};

  &:hover:not(:disabled) {
    opacity: 0.85;
  }
`;

/** 일괄 활성화 버튼 — 긍정 액션이므로 primary */
const BulkActivateButton = styled(BulkButtonBase)`
  color: #ffffff;
  background: ${({ theme }) => theme.colors.primary};
  border: 1px solid ${({ theme }) => theme.colors.primary};

  &:hover:not(:disabled) {
    opacity: 0.85;
  }
`;

/** 선택 해제 버튼 — outline 스타일 (취소 성격) */
const BulkCancelButton = styled(BulkButtonBase)`
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.bgHover};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

/** 처리 중 텍스트 (버튼 비활성과 짝을 이루어 진행 상태를 표시) */
const BulkStatus = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.primary};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  margin-left: ${({ theme }) => theme.spacing.sm};
`;

/**
 * 행/헤더 공통 체크박스.
 * accent-color 로 브라우저 기본 체크박스 색상을 primary 로 통일한다.
 * 크기는 16px 고정 — 작은 셀 안에서 클릭 타겟 확보.
 */
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
