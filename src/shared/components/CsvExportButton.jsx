/**
 * CSV 내보내기 버튼 — 2026-04-09 신규 (P1-2).
 *
 * 관리자 페이지의 각 테이블/통계 탭에 동일한 UX 로 CSV 다운로드 기능을
 * 제공하기 위한 재사용 가능한 버튼 컴포넌트.
 *
 * ## 두 가지 모드
 *
 * ### 1. 동기 모드 (rows prop 사용)
 * 이미 메모리에 있는 데이터 배열을 그대로 CSV 로 변환한다.
 * ```jsx
 * <CsvExportButton
 *   filename="users"
 *   columns={[{ header: '사용자 ID', accessor: 'userId' }, ...]}
 *   rows={currentPageUsers}
 * />
 * ```
 *
 * ### 2. 비동기 모드 (fetchAll prop 사용)
 * 페이징 데이터의 전체 집합이 필요한 경우, 클릭 시 fetchAll() 을 호출해서
 * 데이터를 비동기로 가져온 후 CSV 로 변환한다. 가져오는 동안 "가져오는 중..."
 * 로딩 상태를 표시하고 버튼은 disabled 처리.
 * ```jsx
 * <CsvExportButton
 *   filename="recommendation_logs"
 *   columns={columns}
 *   fetchAll={async () => (await fetchLogs({ size: 1000 })).content}
 * />
 * ```
 *
 * rows 와 fetchAll 이 동시에 제공되면 fetchAll 이 우선 사용된다.
 *
 * ## Props
 * - {string}   filename   - 파일명 (.csv 자동 부착, 날짜 접미사 자동 부착)
 * - {Array}    columns    - CSV 컬럼 정의 (csvExport.toCsv 포맷)
 * - {Array=}   rows       - 동기 모드용 데이터 배열
 * - {Function=} fetchAll  - 비동기 모드용 데이터 로더 (Promise<Array> 반환)
 * - {boolean=} disabled   - 외부에서 강제로 비활성화
 * - {string=}  label      - 버튼 라벨 (기본: "CSV 다운로드")
 */

import { useState } from 'react';
import styled from 'styled-components';
import { MdFileDownload } from 'react-icons/md';
import { downloadCsv, todayString, logCsvExport } from '@/shared/utils/csvExport';

export default function CsvExportButton({
  filename,
  columns,
  rows,
  fetchAll,
  disabled = false,
  label = 'CSV 다운로드',
  /**
   * 감사 로그 소스 식별자 — 2026-04-09 P1-2 확장 추가.
   *
   * 지정되면 다운로드 완료 직후 Backend 의 감사 로그 API 를 호출하여
   * admin_audit_logs 에 "누가 언제 어떤 소스를 몇 건 내보냈는가"를 기록한다.
   * 생략(null/undefined)하면 로깅 호출을 건너뛴다 — 마스터 데이터 등 개인정보가
   * 전혀 없는 소스에서는 선택적으로 비활성화할 수 있다.
   *
   * @type {string}
   */
  auditSource,
  /**
   * 현재 적용 중인 필터 조건을 사람이 읽을 수 있는 문자열로 요약한 값.
   * 감사 로그의 filterInfo 필드에 그대로 기록된다. 예: "period=7d, status=COMPLETED".
   * 생략 시 null 로 전송.
   *
   * @type {string}
   */
  auditFilterInfo,
}) {
  /* 비동기 모드에서 데이터 로딩 중 여부 */
  const [loading, setLoading] = useState(false);

  /**
   * CSV 다운로드 핸들러.
   *
   * fetchAll 이 제공되면 비동기로 데이터를 가져오고, 아니면 rows 를 그대로 사용한다.
   * 데이터가 비어있으면 경고를 띄우고 조기 종료한다.
   */
  async function handleClick() {
    // 이미 로딩 중이면 중복 클릭 무시
    if (loading) return;

    let dataRows;

    try {
      if (typeof fetchAll === 'function') {
        // 비동기 모드 — fetchAll 호출
        setLoading(true);
        dataRows = await fetchAll();
      } else {
        // 동기 모드 — rows 그대로 사용
        dataRows = Array.isArray(rows) ? rows : [];
      }
    } catch (err) {
      // 데이터 로딩 실패 — 사용자에게 경고
      // eslint-disable-next-line no-alert
      alert(`CSV 내보내기 데이터 로딩 실패: ${err?.message ?? '알 수 없는 오류'}`);
      setLoading(false);
      return;
    }

    setLoading(false);

    // 데이터가 비어있으면 내보내기 생략 — 빈 CSV 다운로드는 불필요한 혼란을 초래
    if (!Array.isArray(dataRows) || dataRows.length === 0) {
      // eslint-disable-next-line no-alert
      alert('내보낼 데이터가 없습니다.');
      return;
    }

    // 파일명에 날짜 접미사 부착 → 운영자가 여러 시점의 CSV 를 구분하기 쉽도록
    const baseName = filename || 'export';
    const fullName = `${baseName}_${todayString()}.csv`;

    try {
      downloadCsv(fullName, columns, dataRows);
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(`CSV 생성 실패: ${err?.message ?? '알 수 없는 오류'}`);
      return;
    }

    /*
     * 다운로드 성공 후 감사 로그 기록 — 2026-04-09 P1-2 확장.
     *
     * auditSource 가 지정된 경우에만 호출한다. 민감 데이터가 전혀 없는 마스터 소스
     * (장르 목록 등)에서는 auditSource 를 생략하여 감사 로그 노이즈를 줄일 수 있다.
     *
     * fire-and-forget 패턴 — await 하지 않고 별도 Promise 로 처리하여 버튼 UX 를
     * 막지 않는다. logCsvExport 내부에서 예외를 삼키므로 여기서 catch 불필요.
     */
    if (auditSource) {
      logCsvExport({
        source: auditSource,
        filename: fullName,
        rowCount: dataRows.length,
        filterInfo: auditFilterInfo ?? null,
      });
    }
  }

  /* 비활성화 조건:
   *  1. 외부 disabled prop
   *  2. 비동기 로딩 중
   *  3. 동기 모드에서 rows 가 비어있고 fetchAll 도 없을 때
   */
  const isEmpty = typeof fetchAll !== 'function' && (!Array.isArray(rows) || rows.length === 0);
  const actualDisabled = disabled || loading || isEmpty;

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={actualDisabled}
      title={isEmpty ? '내보낼 데이터가 없습니다' : '테이블 데이터를 CSV 로 다운로드'}
    >
      <MdFileDownload size={16} />
      {loading ? '가져오는 중...' : label}
    </Button>
  );
}

/* ── styled-components ── */

/**
 * 버튼 스타일 — 테이블 헤더 우측에 위치하며 기존 PageButton 과 시각적 무게감을
 * 맞추기 위해 outline 스타일(배경 없음 + 테두리) 을 사용한다.
 */
const Button = styled.button`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: 6px ${({ theme }) => theme.spacing.lg};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  background: ${({ theme }) => theme.colors.bgCard};
  transition: all ${({ theme }) => theme.transitions.fast};
  white-space: nowrap;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.bgHover};
    color: ${({ theme }) => theme.colors.textPrimary};
    border-color: ${({ theme }) => theme.colors.primary};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
