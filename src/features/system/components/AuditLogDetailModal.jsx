/**
 * 감사 로그 상세 보기 + JSON Diff 뷰어 — 2026-04-09 P2-⑲ 신규.
 *
 * 관리자 감사 로그 목록(`AuditLogTab`) 에서 한 행을 클릭하면 열리는 모달로,
 * 해당 감사 로그 엔트리의 모든 메타데이터와 함께 `beforeData` / `afterData`
 * JSON 스냅샷을 사이드-바이-사이드 형태로 비교 렌더링한다.
 *
 * ## 왜 JSON Diff 가 필요한가
 *
 * `AdminAuditService` 는 사용자 제재·역할 변경·수동 포인트·이용권 발급 등
 * 민감 액션에서 변경 전/후 상태를 JSON 문자열로 `admin_audit_logs` 테이블에
 * 함께 기록한다. 예를 들어 역할 변경은 `{"role":"USER"}` → `{"role":"ADMIN"}`
 * 형태로 남는데, 단순 텍스트 설명만으로는 "실제로 어떤 필드가 바뀌었는가" 를
 * 즉각 파악하기 어렵다. 본 모달은 두 JSON 을 키 단위로 분해하여 다음 4개
 * 상태로 시각적으로 구분한다.
 *
 * - `added` (초록): `before` 에 없던 키가 `after` 에 생김
 * - `removed` (빨강): `before` 에 있던 키가 `after` 에서 사라짐
 * - `changed` (주황): 동일 키의 값이 달라짐
 * - `unchanged` (회색): 값 동일 — 컨텍스트 제공용
 *
 * ## 엣지 케이스 처리
 *
 * - `beforeData` 와 `afterData` 가 **둘 다 null/빈 문자열**: 변경 스냅샷이
 *   기록되지 않은 감사 로그(예: 단순 조회 이벤트). 안내 메시지만 표시.
 * - **하나만 있음**: "생성"(before 없음) 또는 "삭제"(after 없음) 이벤트로 간주.
 *   단일 컬럼만 렌더링하고 배지로 종류 표시.
 * - **JSON 파싱 실패**: 저장된 값이 정상 JSON 이 아닐 수 있으므로(예: 레거시
 *   텍스트 로그) parse 실패 시 원본 문자열을 그대로 monospace 로 노출.
 * - **중첩 객체/배열**: 키의 값이 primitive 가 아니면 `JSON.stringify` 로
 *   직렬화하여 문자열 비교. 구조적 diff 는 하지 않음(가독성보다 단순함 우선).
 *
 * ## Props
 * @param {Object}   props
 * @param {Object}   props.log    - 감사 로그 엔트리 (AuditLogResponse)
 * @param {boolean}  props.isOpen - 모달 열림 여부
 * @param {Function} props.onClose - 닫기 콜백
 */

import styled from 'styled-components';
import { MdClose } from 'react-icons/md';

/**
 * 날짜 포맷 — 목록과 동일한 스타일 사용 (ko-KR locale).
 */
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
 * 문자열을 JSON 으로 파싱한다. 실패 시 null 반환.
 *
 * AdminAuditService 가 저장한 값은 문자열로 오지만, 혹시 객체 형태로 오는 경우도
 * 방어한다 (ex. Jackson 이 JSON 컬럼을 Map 으로 역직렬화하는 설정 대비).
 *
 * @param {unknown} raw
 * @returns {Object | null} 파싱된 객체 또는 null
 */
function parseJsonSafe(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') return raw; // 이미 파싱된 상태
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * 값을 사람이 읽을 수 있는 문자열로 직렬화한다.
 *
 * - primitive → 그대로 String(value)
 * - null/undefined → "null"
 * - 객체/배열 → JSON.stringify (중첩 구조는 문자열 비교로만 처리)
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
 *
 * 반환 형식:
 * ```
 * [
 *   { key: 'role', status: 'changed', before: '"USER"',   after: '"ADMIN"' },
 *   { key: 'suspendedUntil', status: 'added', before: null, after: '"2026-04-16T..."' },
 *   { key: 'status', status: 'unchanged', before: '"ACTIVE"', after: '"ACTIVE"' },
 * ]
 * ```
 *
 * 정렬 순서: changed → added → removed → unchanged → 알파벳
 * (사람 눈에 가장 중요한 변경을 먼저 보여주기 위함)
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

  /* 중요도 순 정렬 — changed/added/removed 먼저, unchanged 마지막 */
  const statusOrder = { changed: 0, added: 1, removed: 2, unchanged: 3 };
  entries.sort((a, b) => {
    const orderDiff = statusOrder[a.status] - statusOrder[b.status];
    if (orderDiff !== 0) return orderDiff;
    return a.key.localeCompare(b.key);
  });

  return entries;
}

/**
 * diff 상태에 따른 레이블/색상 맵.
 */
const STATUS_STYLES = {
  changed:   { label: '변경', color: '#f59e0b', bg: '#fffbeb' },
  added:     { label: '추가', color: '#10b981', bg: '#ecfdf5' },
  removed:   { label: '삭제', color: '#ef4444', bg: '#fef2f2' },
  unchanged: { label: '동일', color: '#94a3b8', bg: '#f8fafc' },
};

export default function AuditLogDetailModal({ log, isOpen, onClose }) {
  /* 모달이 닫혀있거나 로그 데이터가 없으면 렌더링 생략 */
  if (!isOpen || !log) return null;

  /* before/after JSON 파싱 */
  const beforeObj = parseJsonSafe(log.beforeData);
  const afterObj = parseJsonSafe(log.afterData);

  /*
   * 렌더링 모드 결정:
   * - 'none':       둘 다 없음 → 안내 메시지만
   * - 'created':    before 없음 + after 있음 → 생성 이벤트
   * - 'deleted':    before 있음 + after 없음 → 삭제 이벤트
   * - 'updated':    둘 다 있음 → 키별 diff
   * - 'raw':        파싱 실패 → 원본 문자열 그대로 노출
   */
  const hasBeforeRaw = !!log.beforeData;
  const hasAfterRaw = !!log.afterData;
  const parsedBefore = hasBeforeRaw ? beforeObj : null;
  const parsedAfter = hasAfterRaw ? afterObj : null;

  let mode;
  if (!hasBeforeRaw && !hasAfterRaw) mode = 'none';
  else if (hasBeforeRaw && !parsedBefore) mode = 'raw';
  else if (hasAfterRaw && !parsedAfter) mode = 'raw';
  else if (!parsedBefore && parsedAfter) mode = 'created';
  else if (parsedBefore && !parsedAfter) mode = 'deleted';
  else mode = 'updated';

  /* updated 모드에서만 diff 계산 — 성능상 불필요한 경우 회피 */
  const diffEntries = mode === 'updated' ? computeDiff(parsedBefore, parsedAfter) : [];

  return (
    <Overlay onClick={onClose}>
      {/* 내부 클릭 전파 방지 */}
      <ModalBox onClick={(e) => e.stopPropagation()}>
        {/* ── 헤더 ── */}
        <ModalHeader>
          <HeaderTitle>
            감사 로그 상세 <LogId>#{log.id ?? log.auditLogId ?? '-'}</LogId>
          </HeaderTitle>
          <CloseButton onClick={onClose} aria-label="닫기" type="button">
            <MdClose size={20} />
          </CloseButton>
        </ModalHeader>

        {/* ── 메타 정보 그리드 ── */}
        <MetaGrid>
          <MetaItem>
            <MetaLabel>액션 유형</MetaLabel>
            <MetaValue>
              <ActionBadge>{log.actionType ?? '-'}</ActionBadge>
            </MetaValue>
          </MetaItem>
          <MetaItem>
            <MetaLabel>대상 유형</MetaLabel>
            <MetaValue mono>{log.targetType ?? '-'}</MetaValue>
          </MetaItem>
          <MetaItem>
            <MetaLabel>대상 ID</MetaLabel>
            <MetaValue mono>{log.targetId ?? '-'}</MetaValue>
          </MetaItem>
          <MetaItem>
            <MetaLabel>관리자 ID</MetaLabel>
            <MetaValue mono>{log.adminId ?? '-'}</MetaValue>
          </MetaItem>
          <MetaItem>
            <MetaLabel>IP 주소</MetaLabel>
            <MetaValue mono>{log.ipAddress ?? '-'}</MetaValue>
          </MetaItem>
          <MetaItem>
            <MetaLabel>기록 시각</MetaLabel>
            <MetaValue>{formatDateTime(log.createdAt)}</MetaValue>
          </MetaItem>
        </MetaGrid>

        {/* ── 설명 ── */}
        {log.description && (
          <DescriptionBox>
            <DescriptionLabel>설명</DescriptionLabel>
            <DescriptionText>{log.description}</DescriptionText>
          </DescriptionBox>
        )}

        {/* ── JSON Diff 섹션 ── */}
        <SectionLabel>변경 데이터 스냅샷</SectionLabel>

        {mode === 'none' && (
          <EmptyNotice>
            이 감사 로그에는 변경 전/후 스냅샷이 기록되지 않았습니다.
            <br />
            <span>
              {'('}조회·인증 등 상태를 변경하지 않는 이벤트이거나, 구(舊) 레거시 로그입니다
              {')'}
            </span>
          </EmptyNotice>
        )}

        {mode === 'raw' && (
          <>
            <RawNotice>
              ⚠️ JSON 파싱에 실패하여 원본 문자열을 그대로 표시합니다.
            </RawNotice>
            <DiffGrid>
              <DiffColumn>
                <DiffColumnHeader $type="before">변경 전 (raw)</DiffColumnHeader>
                <RawBox>{log.beforeData || '(없음)'}</RawBox>
              </DiffColumn>
              <DiffColumn>
                <DiffColumnHeader $type="after">변경 후 (raw)</DiffColumnHeader>
                <RawBox>{log.afterData || '(없음)'}</RawBox>
              </DiffColumn>
            </DiffGrid>
          </>
        )}

        {mode === 'created' && (
          <>
            <EventBadge $type="created">신규 생성 이벤트</EventBadge>
            <RawBox>
              {Object.entries(parsedAfter).map(([k, v]) => (
                <RawLine key={k}>
                  <RawKey>{k}</RawKey>: <RawVal>{stringifyValue(v)}</RawVal>
                </RawLine>
              ))}
            </RawBox>
          </>
        )}

        {mode === 'deleted' && (
          <>
            <EventBadge $type="deleted">삭제 이벤트</EventBadge>
            <RawBox>
              {Object.entries(parsedBefore).map(([k, v]) => (
                <RawLine key={k}>
                  <RawKey>{k}</RawKey>: <RawVal>{stringifyValue(v)}</RawVal>
                </RawLine>
              ))}
            </RawBox>
          </>
        )}

        {mode === 'updated' && (
          <>
            <DiffSummary>
              총 <strong>{diffEntries.length}</strong>개 필드 중{' '}
              <ChangedCount>{diffEntries.filter((e) => e.status === 'changed').length}개 변경</ChangedCount>
              {' · '}
              <AddedCount>{diffEntries.filter((e) => e.status === 'added').length}개 추가</AddedCount>
              {' · '}
              <RemovedCount>{diffEntries.filter((e) => e.status === 'removed').length}개 삭제</RemovedCount>
            </DiffSummary>
            <DiffTable>
              <thead>
                <tr>
                  <DiffTh $w="80px">상태</DiffTh>
                  <DiffTh $w="160px">필드</DiffTh>
                  <DiffTh>변경 전</DiffTh>
                  <DiffTh>변경 후</DiffTh>
                </tr>
              </thead>
              <tbody>
                {diffEntries.map((entry) => {
                  const style = STATUS_STYLES[entry.status];
                  return (
                    <DiffRow key={entry.key} $bg={style.bg}>
                      <DiffTd>
                        <StatusBadge $color={style.color}>{style.label}</StatusBadge>
                      </DiffTd>
                      <DiffTd>
                        <KeyText>{entry.key}</KeyText>
                      </DiffTd>
                      <DiffTd>
                        <ValText $muted={entry.status === 'added'}>
                          {entry.before ?? '—'}
                        </ValText>
                      </DiffTd>
                      <DiffTd>
                        <ValText $muted={entry.status === 'removed'}>
                          {entry.after ?? '—'}
                        </ValText>
                      </DiffTd>
                    </DiffRow>
                  );
                })}
              </tbody>
            </DiffTable>
          </>
        )}

        {/* ── 푸터 ── */}
        <ModalFooter>
          <FooterButton type="button" onClick={onClose}>
            닫기
          </FooterButton>
        </ModalFooter>
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
  max-width: 880px;
  max-height: 90vh;
  overflow-y: auto;
  padding: ${({ theme }) => theme.spacing.xxl};
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const HeaderTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.heading};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const LogId = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.textMuted};
  margin-left: ${({ theme }) => theme.spacing.sm};
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  transition: background ${({ theme }) => theme.transitions.fast};

  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
`;

/** 메타 정보 — 3열 그리드 */
const MetaGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: ${({ theme }) => theme.spacing.lg};
  padding: ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.bgHover};
  border-radius: 6px;
  margin-bottom: ${({ theme }) => theme.spacing.lg};

  @media (max-width: 640px) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

const MetaItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const MetaLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const MetaValue = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: ${({ mono, theme }) => (mono ? theme.fonts.mono : 'inherit')};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

/** actionType 배지 */
const ActionBadge = styled.span`
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.primaryLight};
  color: ${({ theme }) => theme.colors.primary};
  border: 1px solid ${({ theme }) => theme.colors.primary};
  letter-spacing: 0.3px;
`;

const DescriptionBox = styled.div`
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  border: 1px solid ${({ theme }) => theme.colors.borderLight};
  border-radius: 6px;
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const DescriptionLabel = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const DescriptionText = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  line-height: 1.5;
  word-break: break-all;
`;

const SectionLabel = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

/** 스냅샷 없음 안내 */
const EmptyNotice = styled.div`
  padding: ${({ theme }) => theme.spacing.xl};
  text-align: center;
  background: ${({ theme }) => theme.colors.bgHover};
  border: 1px dashed ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  line-height: 1.6;

  span {
    font-size: ${({ theme }) => theme.fontSizes.xs};
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

/** JSON 파싱 실패 경고 */
const RawNotice = styled.p`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: #fffbeb;
  border-left: 3px solid #f59e0b;
  border-radius: 4px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: #92400e;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

/** created/deleted 이벤트 배지 */
const EventBadge = styled.div`
  display: inline-block;
  padding: 4px 12px;
  border-radius: 16px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  margin-bottom: ${({ theme }) => theme.spacing.md};

  ${({ $type }) => {
    if ($type === 'created') return 'background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0;';
    if ($type === 'deleted') return 'background: #fef2f2; color: #dc2626; border: 1px solid #fecaca;';
    return 'background: #f1f5f9; color: #475569;';
  }}
`;

/** raw/created/deleted 에서 사용하는 box */
const RawBox = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 6px;
  font-family: 'Courier New', monospace;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  line-height: 1.6;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
`;

const RawLine = styled.div`
  padding: 2px 0;
`;

const RawKey = styled.span`
  color: #93c5fd;
`;

const RawVal = styled.span`
  color: #fcd34d;
`;

/** raw 모드 2컬럼 그리드 */
const DiffGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.md};

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const DiffColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const DiffColumnHeader = styled.div`
  padding: 6px 12px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  border-radius: 4px;
  text-align: center;

  ${({ $type }) => {
    if ($type === 'before') return 'background: #fef2f2; color: #dc2626; border: 1px solid #fecaca;';
    if ($type === 'after') return 'background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0;';
    return '';
  }}
`;

/** updated 모드 diff 요약 */
const DiffSummary = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.md};

  strong {
    color: ${({ theme }) => theme.colors.textPrimary};
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
  }
`;

const ChangedCount = styled.span`
  color: #f59e0b;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`;

const AddedCount = styled.span`
  color: #10b981;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`;

const RemovedCount = styled.span`
  color: #ef4444;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`;

/** updated 모드 diff 테이블 */
const DiffTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  overflow: hidden;
`;

const DiffTh = styled.th`
  padding: 8px 12px;
  text-align: left;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgHover};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  white-space: nowrap;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  width: ${({ $w }) => $w ?? 'auto'};
`;

const DiffRow = styled.tr`
  background: ${({ $bg }) => $bg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight};

  &:last-child {
    border-bottom: none;
  }
`;

const DiffTd = styled.td`
  padding: 8px 12px;
  vertical-align: top;
  word-break: break-all;
`;

const StatusBadge = styled.span`
  display: inline-block;
  padding: 2px 8px;
  font-size: 10px;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: #ffffff;
  background: ${({ $color }) => $color};
  border-radius: 3px;
  letter-spacing: 0.3px;
`;

const KeyText = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
`;

const ValText = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ $muted, theme }) => ($muted ? theme.colors.textMuted : theme.colors.textPrimary)};
`;

/** 푸터 */
const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-top: ${({ theme }) => theme.spacing.xl};
  padding-top: ${({ theme }) => theme.spacing.lg};
  border-top: 1px solid ${({ theme }) => theme.colors.borderLight};
`;

const FooterButton = styled.button`
  height: 36px;
  padding: 0 ${({ theme }) => theme.spacing.xl};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgCard};
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    background: ${({ theme }) => theme.colors.bgHover};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;
