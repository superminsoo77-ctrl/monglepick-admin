/**
 * 감사 로그 서브탭 (읽기 전용).
 *
 * 2026-04-08: 설정 → 시스템 탭으로 이동. 조회 전용 성격이 시스템 모니터링(서비스 상태/
 * DB 상태/Ollama/Config)과 동일하여 통합. 설정 탭은 순수 CRUD 전용으로 정리함.
 *
 * 2026-04-23 Phase G 배치 C:
 *  - aiAuditFilter prop 추가. AI 어시스턴트 goto_audit_log 이벤트로 전달된
 *    초기 필터값(actionType / adminId)을 입력 상태와 확정 필터 상태 양쪽에 주입하여
 *    별도 "검색" 버튼 클릭 없이 자동으로 조회 결과를 표시한다.
 *
 * 기능:
 * - 관리자 활동 로그 목록 테이블 (actionType, targetType, targetId, description, adminId, IP, 시간)
 * - actionType 검색 필터 + 새로고침 버튼
 * - 페이지네이션 (10건/페이지)
 *
 * 데이터 변경 없이 조회만 가능한 읽기 전용 탭.
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { MdRefresh, MdSearch } from 'react-icons/md';
import { fetchAuditLogs } from '@/features/settings/api/settingsApi';
import AuditLogDetailModal from './AuditLogDetailModal';

/** 날짜+시간 포맷 함수 */
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

/** actionType 배지 색상 결정 함수 */
function getActionBadgeStatus(actionType) {
  if (!actionType) return 'default';
  const upper = actionType.toUpperCase();
  if (upper.includes('DELETE') || upper.includes('REMOVE')) return 'error';
  if (upper.includes('CREATE') || upper.includes('ADD')) return 'success';
  if (upper.includes('UPDATE') || upper.includes('MODIFY')) return 'warning';
  if (upper.includes('LOGIN') || upper.includes('ACCESS')) return 'info';
  return 'default';
}

/** actionType 배지 색상 맵 (인라인 사용) */
const ACTION_STATUS_COLORS = {
  error: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
  success: { bg: '#ecfdf5', text: '#059669', border: '#a7f3d0' },
  warning: { bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
  info: { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' },
  default: { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' },
};

/**
 * targetType 드롭다운 옵션 — 2026-04-09 P1-⑤ 신규.
 * Backend AdminAuditService 의 TARGET_* 상수와 1:1 매핑.
 */
const TARGET_TYPE_OPTIONS = [
  { value: '',                label: '전체 대상' },
  { value: 'USER',            label: 'USER (사용자)' },
  { value: 'PAYMENT',         label: 'PAYMENT (결제 주문)' },
  { value: 'SUBSCRIPTION',    label: 'SUBSCRIPTION (구독)' },
  { value: 'EXPORT_SOURCE',   label: 'EXPORT_SOURCE (CSV 내보내기)' },
  { value: 'POST',            label: 'POST (게시글)' },
  { value: 'FAQ',             label: 'FAQ' },
  { value: 'BANNER',          label: 'BANNER (배너)' },
];

/**
 * 감사 로그 탭 컴포넌트.
 *
 * @param {Object}      props
 * @param {Object|null} props.aiAuditFilter - AI 어시스턴트가 주입하는 초기 필터값.
 *   - actionType {string|undefined} — 액션 유형 키워드 (예: "DELETE")
 *   - adminId    {string|undefined} — 관리자 ID 필터
 *   null 이면 필터 초기값 없이 전체 조회.
 */
export default function AuditLogTab({ aiAuditFilter = null }) {
  /* ── 목록 상태 ── */
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* ── 검색/필터 입력 상태 (타이핑 중인 값, 아직 API 에 전달되지 않음) ── */
  /* AI 필터가 있으면 해당 값을 초기값으로 주입한다 */
  const [searchInput, setSearchInput] = useState(aiAuditFilter?.actionType ?? '');     // actionType 입력
  const [targetTypeInput, setTargetTypeInput] = useState(''); // targetType 입력
  const [fromDateInput, setFromDateInput] = useState(''); // 시작 시각 (datetime-local 문자열)
  const [toDateInput, setToDateInput] = useState('');     // 종료 시각 (datetime-local 문자열)

  /* ── 실제 API 요청에 사용되는 확정 필터 상태 ── */
  /* AI 필터가 있으면 초기 확정 필터로 즉시 적용 — 별도 "검색" 버튼 클릭 불필요 */
  const [actionTypeFilter, setActionTypeFilter] = useState(aiAuditFilter?.actionType ?? '');
  const [targetTypeFilter, setTargetTypeFilter] = useState('');
  const [fromDateFilter, setFromDateFilter]     = useState('');
  const [toDateFilter, setToDateFilter]         = useState('');

  /* ── 페이지네이션 상태 ── */
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const PAGE_SIZE = 10;

  /*
   * ── 상세 보기 모달 상태 (2026-04-09 P2-⑲ 추가) ──
   * 행 클릭 시 해당 로그 객체를 저장하고 모달을 연다. null 이면 닫힘 상태.
   */
  const [selectedLog, setSelectedLog] = useState(null);

  /**
   * datetime-local input 값(예: "2026-04-09T14:30")을 Backend 가 받는
   * ISO-8601 초 단위 문자열("2026-04-09T14:30:00")로 변환한다.
   * 빈 문자열이면 undefined 반환 → URLSearchParams 에서 자동으로 제외된다.
   */
  function toIsoOrUndefined(datetimeLocal) {
    if (!datetimeLocal) return undefined;
    return datetimeLocal.length === 16 ? `${datetimeLocal}:00` : datetimeLocal;
  }

  /** 감사 로그 목록 조회 */
  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = { page, size: PAGE_SIZE };
      /* 확정 필터 값이 있을 때만 파라미터에 실어 보낸다 — Spring 은 빈 문자열을 null 로
       * 인식하지 않으므로 여기서 조건부로 추가해야 한다. */
      if (actionTypeFilter.trim()) params.actionType = actionTypeFilter.trim();
      if (targetTypeFilter)        params.targetType = targetTypeFilter;
      const fromIso = toIsoOrUndefined(fromDateFilter);
      const toIso   = toIsoOrUndefined(toDateFilter);
      if (fromIso) params.fromDate = fromIso;
      if (toIso)   params.toDate   = toIso;

      const result = await fetchAuditLogs(params);
      setLogs(result?.content ?? (Array.isArray(result) ? result : []));
      setTotalPages(result?.totalPages ?? 0);
    } catch (err) {
      setError(err.message ?? '감사 로그 조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [page, actionTypeFilter, targetTypeFilter, fromDateFilter, toDateFilter]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  /**
   * 검색 실행 — 입력 중인 모든 필터 값을 확정 상태로 커밋하고 첫 페이지로 이동.
   * 폼 제출(Enter 또는 검색 버튼 클릭) 시 호출된다.
   */
  function handleSearch(e) {
    e.preventDefault();
    setPage(0);
    setActionTypeFilter(searchInput);
    setTargetTypeFilter(targetTypeInput);
    setFromDateFilter(fromDateInput);
    setToDateFilter(toDateInput);
  }

  /** 모든 필터 초기화 */
  function handleReset() {
    setSearchInput('');
    setTargetTypeInput('');
    setFromDateInput('');
    setToDateInput('');
    setPage(0);
    setActionTypeFilter('');
    setTargetTypeFilter('');
    setFromDateFilter('');
    setToDateFilter('');
  }

  /** 현재 확정 필터가 하나라도 적용되어 있는지 */
  const hasActiveFilter =
    !!actionTypeFilter || !!targetTypeFilter || !!fromDateFilter || !!toDateFilter;

  return (
    <Container>
      {/* ── 툴바 (타이틀 + 새로고침) ── */}
      <Toolbar>
        <ToolbarLeft>
          <SectionTitle>감사 로그</SectionTitle>
        </ToolbarLeft>
        <ToolbarRight>
          <IconButton onClick={loadLogs} disabled={loading} title="새로고침">
            <MdRefresh size={16} />
          </IconButton>
        </ToolbarRight>
      </Toolbar>

      {/*
        고급 필터 폼 — 2026-04-09 P1-⑤ 확장.
        기존에는 actionType 하나만 있었지만, 실제 감사 추적에 필요한
        "targetType(대상 유형) + 시간 범위(from~to)" 복합 조건을 추가한다.
        폼 제출(Enter 또는 검색 버튼) 시에만 API 를 재호출하여 타이핑 중
        불필요한 호출을 방지한다.
      */}
      <SearchForm onSubmit={handleSearch}>
        {/* actionType 텍스트 입력 */}
        <SearchInputWrap>
          <MdSearch size={15} />
          <SearchInput
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="액션 유형 키워드 (예: DELETE, REFUND)"
          />
        </SearchInputWrap>

        {/* targetType 드롭다운 */}
        <FilterSelect
          value={targetTypeInput}
          onChange={(e) => setTargetTypeInput(e.target.value)}
          title="대상 엔티티 유형 필터"
        >
          {TARGET_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </FilterSelect>

        {/* 시작 시각 datetime-local */}
        <DateFieldWrap>
          <DateLabel>시작</DateLabel>
          <DateInput
            type="datetime-local"
            value={fromDateInput}
            onChange={(e) => setFromDateInput(e.target.value)}
            max={toDateInput || undefined}
            title="시작 시각 (inclusive)"
          />
        </DateFieldWrap>

        {/* 종료 시각 datetime-local */}
        <DateFieldWrap>
          <DateLabel>종료</DateLabel>
          <DateInput
            type="datetime-local"
            value={toDateInput}
            onChange={(e) => setToDateInput(e.target.value)}
            min={fromDateInput || undefined}
            title="종료 시각 (exclusive)"
          />
        </DateFieldWrap>

        <SearchButton type="submit">검색</SearchButton>
        {hasActiveFilter && (
          <ResetButton type="button" onClick={handleReset}>
            초기화
          </ResetButton>
        )}
      </SearchForm>

      {/* 적용된 필터 표시 — 각 확정 필터별로 배지를 나열한다 */}
      {hasActiveFilter && (
        <FilterBadgeRow>
          {actionTypeFilter && (
            <FilterBadge>
              액션: <strong>{actionTypeFilter}</strong>
            </FilterBadge>
          )}
          {targetTypeFilter && (
            <FilterBadge>
              대상: <strong>{targetTypeFilter}</strong>
            </FilterBadge>
          )}
          {fromDateFilter && (
            <FilterBadge>
              이후: <strong>{fromDateFilter.replace('T', ' ')}</strong>
            </FilterBadge>
          )}
          {toDateFilter && (
            <FilterBadge>
              이전: <strong>{toDateFilter.replace('T', ' ')}</strong>
            </FilterBadge>
          )}
        </FilterBadgeRow>
      )}

      {/* ── 에러 메시지 ── */}
      {error && <ErrorMsg>{error}</ErrorMsg>}

      {/* ── 목록 테이블 ── */}
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th $w="130px">액션 유형</Th>
              <Th $w="110px">대상 유형</Th>
              <Th $w="110px">대상 ID</Th>
              <Th>설명</Th>
              <Th $w="110px">관리자 ID</Th>
              <Th $w="120px">IP 주소</Th>
              <Th $w="150px">시간</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7}>
                  <CenterCell>불러오는 중...</CenterCell>
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <CenterCell>
                    {hasActiveFilter
                      ? '지정한 필터 조건에 해당하는 감사 로그가 없습니다.'
                      : '감사 로그가 없습니다.'}
                  </CenterCell>
                </td>
              </tr>
            ) : (
              logs.map((log, idx) => {
                // 고유 키: auditId 우선, 없으면 인덱스 fallback
                const key = log.auditId ?? log.id ?? idx;
                const badgeStatus = getActionBadgeStatus(log.actionType);
                const badgeColors = ACTION_STATUS_COLORS[badgeStatus];
                return (
                  <Tr
                    key={key}
                    onClick={() => setSelectedLog(log)}
                    $clickable
                    title="클릭하여 상세 정보 및 JSON Diff 보기"
                  >
                    <Td>
                      {/* actionType 인라인 배지 */}
                      <ActionBadge
                        $bg={badgeColors.bg}
                        $text={badgeColors.text}
                        $border={badgeColors.border}
                      >
                        {log.actionType ?? '-'}
                      </ActionBadge>
                    </Td>
                    <Td>
                      <MonoText>{log.targetType ?? '-'}</MonoText>
                    </Td>
                    <Td>
                      <MonoText>{log.targetId ?? '-'}</MonoText>
                    </Td>
                    <Td>
                      <DescText title={log.description}>
                        {log.description ?? '-'}
                      </DescText>
                    </Td>
                    <Td>
                      <MonoText>{log.adminId ?? '-'}</MonoText>
                    </Td>
                    <Td>
                      <MonoText>{log.ipAddress ?? log.ip ?? '-'}</MonoText>
                    </Td>
                    <Td>
                      <TimeText>{formatDateTime(log.createdAt)}</TimeText>
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
          <PageInfo>
            {page + 1} / {totalPages}
          </PageInfo>
          <PageButton
            onClick={() => setPage((p) => p + 1)}
            disabled={page + 1 >= totalPages}
          >
            다음
          </PageButton>
        </Pagination>
      )}

      {/*
        상세 보기 모달 — 2026-04-09 P2-⑲.
        selectedLog 가 설정된 경우에만 내부 렌더링. 닫기 시 null 로 초기화.
      */}
      <AuditLogDetailModal
        log={selectedLog}
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
      />
    </Container>
  );
}

/* ── styled-components ── */

const Container = styled.div``;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const ToolbarLeft = styled.div`
  display: flex;
  align-items: center;
`;

const ToolbarRight = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-wrap: wrap;
`;

const SectionTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

/**
 * 검색 폼 래퍼 — 2026-04-09 P1-⑤ 확장.
 * 여러 필터 필드(텍스트/셀렉트/날짜 2개)를 가로로 배치하고, 공간이 부족하면
 * 자동 줄바꿈하여 좁은 화면에서도 사용 가능하도록 한다.
 */
const SearchForm = styled.form`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-wrap: wrap;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.bgHover};
  border: 1px solid ${({ theme }) => theme.colors.borderLight};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
`;

/** targetType 드롭다운 — 스타일은 SearchInputWrap 과 시각적 무게감 맞춤 */
const FilterSelect = styled.select`
  height: 32px;
  padding: 0 10px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  background: #ffffff;
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

/** 날짜 입력 필드 + 라벨 래퍼 */
const DateFieldWrap = styled.label`
  display: flex;
  align-items: center;
  gap: 4px;
`;

/** 날짜 입력 라벨 ("시작", "종료") */
const DateLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  white-space: nowrap;
`;

/** datetime-local 입력 — 기본 브라우저 스타일 유지하되 크기/컬러만 통일 */
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

/**
 * 적용 중인 필터를 여러 개 나열할 때 감싸는 flex 컨테이너.
 * 2026-04-09 P1-⑤ 확장 — 기존에는 단일 배지였지만 이제 최대 4개(action/target/from/to)까지 표시된다.
 */
const FilterBadgeRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const SearchInputWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  height: 32px;
  background: white;
  color: ${({ theme }) => theme.colors.textMuted};
  &:focus-within {
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const SearchInput = styled.input`
  border: none;
  outline: none;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  width: 200px;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: transparent;
  &::placeholder {
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const SearchButton = styled.button`
  padding: 5px 12px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  border-radius: 4px;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  &:hover {
    background: ${({ theme }) => theme.colors.primaryHover};
  }
`;

const ResetButton = styled.button`
  padding: 5px 10px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  &:hover {
    background: ${({ theme }) => theme.colors.bgHover};
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
  &:hover {
    background: ${({ theme }) => theme.colors.bgHover};
  }
  &:disabled {
    opacity: 0.4;
  }
`;

/**
 * 적용된 필터 표시 뱃지 — FilterBadgeRow 의 자식으로 사용한다.
 * 2026-04-09 P1-⑤ 확장 시 부모 컨테이너가 gap 을 제공하므로 자체 margin 은 제거.
 */
const FilterBadge = styled.div`
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
  cursor: ${({ $clickable }) => ($clickable ? 'pointer' : 'default')};
  transition: background ${({ theme }) => theme.transitions.fast};

  &:last-child {
    border-bottom: none;
  }
  &:hover {
    background: ${({ theme }) => theme.colors.bgHover};
  }
`;

const Td = styled.td`
  padding: 10px 12px;
  color: ${({ theme }) => theme.colors.textPrimary};
  vertical-align: middle;
`;

/* actionType 인라인 배지 */
const ActionBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 4px;
  background: ${({ $bg }) => $bg};
  color: ${({ $text }) => $text};
  border: 1px solid ${({ $border }) => $border};
  white-space: nowrap;
  letter-spacing: 0.3px;
`;

/* 고정폭 텍스트 (ID, IP 등) */
const MonoText = styled.span`
  font-family: 'Courier New', monospace;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

/* 설명 텍스트 (말줄임) */
const DescText = styled.span`
  display: block;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

/* 시간 텍스트 */
const TimeText = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  white-space: nowrap;
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
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.bgHover};
  }
  &:disabled {
    opacity: 0.4;
  }
`;

const PageInfo = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
`;
