/**
 * CSV 내보내기 유틸리티 — 2026-04-09 신규 추가 (P1-2).
 *
 * 관리자 페이지 통계/로그 테이블에서 "CSV 다운로드" 기능을 제공하기 위한
 * 순수 JS 구현체. papaparse/xlsx 같은 외부 라이브러리 의존을 피해
 * 번들 크기 증가를 최소화한다.
 *
 * ## 핵심 기능
 * - 객체 배열(rows) + 컬럼 정의(columns) → RFC 4180 준수 CSV 문자열 생성
 * - Excel 한글 호환: UTF-8 BOM(\uFEFF) prefix 자동 추가
 * - 값 이스케이프: 콤마/큰따옴표/개행 포함 셀은 큰따옴표로 감싸고 내부 "는 ""로 이스케이프
 * - 브라우저 다운로드: Blob + temporary anchor 클릭
 * - accessor가 문자열 또는 함수(row) → 복잡한 파생 값 지원
 *
 * ## 사용 예시
 * ```js
 * import { downloadCsv } from '@/shared/utils/csvExport';
 *
 * downloadCsv(
 *   'users_2026-04-09.csv',
 *   [
 *     { header: '사용자 ID', accessor: 'userId' },
 *     { header: '닉네임',     accessor: 'nickname' },
 *     { header: '포인트',     accessor: (row) => row.point?.balance ?? 0 },
 *   ],
 *   rowsArray,
 * );
 * ```
 *
 * ## 왜 BOM을 앞에 붙이는가
 * MS Excel은 UTF-8 BOM 없이 CSV를 열면 한글을 CP949로 해석해서 깨진다.
 * `\uFEFF` 를 파일 맨 앞에 붙이면 Excel이 UTF-8 로 인식한다. 이 방식은
 * Google Sheets, LibreOffice, macOS Numbers 에서도 모두 정상 동작한다.
 *
 * @module shared/utils/csvExport
 */

/** UTF-8 BOM — Excel 한글 인코딩 자동 감지용 */
const UTF8_BOM = '\uFEFF';

/**
 * 단일 셀 값을 CSV-safe 문자열로 변환한다.
 *
 * RFC 4180 규칙:
 * 1. null/undefined → 빈 문자열
 * 2. 내부에 `,` | `"` | `\n` | `\r` 이 있으면 전체를 `"..."` 로 감싸고, 내부 `"` 는 `""` 로 이중화
 * 3. 숫자/불리언은 toString 결과를 그대로 사용
 * 4. Date는 ISO 문자열로 변환
 * 5. 객체/배열은 JSON 직렬화 후 동일 규칙 적용
 *
 * @param {unknown} value 셀 값 (어떤 타입이든 허용)
 * @returns {string} CSV-safe 셀 문자열
 */
export function escapeCsvCell(value) {
  // null / undefined → 빈 문자열
  if (value === null || value === undefined) return '';

  // Date → ISO 문자열 (타임존 정보 보존)
  let stringified;
  if (value instanceof Date) {
    stringified = Number.isNaN(value.getTime()) ? '' : value.toISOString();
  } else if (typeof value === 'object') {
    // 객체/배열 → JSON 직렬화 (감사 로그 beforeData/afterData 같은 케이스 대응)
    try {
      stringified = JSON.stringify(value);
    } catch {
      stringified = String(value);
    }
  } else {
    stringified = String(value);
  }

  // 이스케이프가 필요한 문자 포함 여부 확인
  const needsQuoting =
    stringified.includes(',') ||
    stringified.includes('"') ||
    stringified.includes('\n') ||
    stringified.includes('\r');

  if (!needsQuoting) return stringified;

  // 내부 큰따옴표는 두 번으로 이중화 후 전체를 큰따옴표로 감싼다 (RFC 4180)
  const escaped = stringified.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * 컬럼 정의의 accessor 로부터 row 의 값을 추출한다.
 *
 * @param {Object} row 데이터 한 행
 * @param {string | Function} accessor 문자열 키 또는 (row) → value 함수
 * @returns {unknown} 추출된 값
 */
function getCellValue(row, accessor) {
  if (typeof accessor === 'function') {
    try {
      return accessor(row);
    } catch {
      // accessor 함수 내부 예외는 빈 값으로 처리 — 한 행 오류가 전체 다운로드를 막지 않도록
      return '';
    }
  }
  // 문자열 accessor — 점 표기 지원 (예: 'point.balance')
  if (typeof accessor === 'string') {
    if (!accessor.includes('.')) return row?.[accessor];
    return accessor.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), row);
  }
  return '';
}

/**
 * rows + columns 를 RFC 4180 CSV 문자열로 변환한다.
 *
 * 헤더 행은 columns[].header 를 사용하며, 데이터 행은 각 컬럼의 accessor 결과를
 * {@link escapeCsvCell} 로 직렬화한다. 행 구분자는 CRLF(\r\n) — RFC 4180 표준이며
 * Windows/Excel 호환성이 가장 높다.
 *
 * @param {Array<{header: string, accessor: string | Function}>} columns 컬럼 정의
 * @param {Array<Object>} rows 데이터 배열
 * @returns {string} 완성된 CSV 문자열 (BOM 미포함 — downloadCsv 에서 추가)
 */
export function toCsv(columns, rows) {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error('[csvExport] columns 는 최소 1개 이상 필요합니다.');
  }
  if (!Array.isArray(rows)) {
    throw new Error('[csvExport] rows 는 배열이어야 합니다.');
  }

  const lines = [];

  // 헤더 행 — 각 header 자체도 이스케이프 (한글/쉼표 포함 가능)
  lines.push(columns.map((col) => escapeCsvCell(col.header)).join(','));

  // 데이터 행
  for (const row of rows) {
    const cells = columns.map((col) => escapeCsvCell(getCellValue(row, col.accessor)));
    lines.push(cells.join(','));
  }

  // RFC 4180 행 구분자: CRLF
  return lines.join('\r\n');
}

/**
 * CSV 파일을 브라우저에서 다운로드한다.
 *
 * BOM + CSV 본문을 UTF-8 Blob 으로 만들고, 임시 {@code <a>} 요소를 생성하여
 * click() 이벤트를 발생시킨다. 다운로드 후 anchor 와 ObjectURL 을 즉시 정리한다.
 *
 * @param {string} filename 저장할 파일명 (.csv 확장자 자동 부착)
 * @param {Array<{header: string, accessor: string | Function}>} columns 컬럼 정의
 * @param {Array<Object>} rows 데이터 배열
 * @throws {Error} columns/rows 가 유효하지 않거나, 브라우저가 Blob API 를 지원하지 않는 경우
 */
export function downloadCsv(filename, columns, rows) {
  // CSV 문자열 생성
  const csvBody = toCsv(columns, rows);

  // BOM 부착 → Excel 한글 호환
  const csvWithBom = UTF8_BOM + csvBody;

  // Blob 생성 — MIME은 text/csv 이지만 Excel 호환을 위해 charset 명시
  const blob = new Blob([csvWithBom], { type: 'text/csv;charset=utf-8;' });

  // 확장자 자동 보정 — 파일명에 .csv 가 없으면 부착
  const safeFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`;

  // ObjectURL + 임시 anchor 로 다운로드 트리거
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeFilename;

  // DOM에 부착 → click → 제거 (Safari는 부착 없이 click이 동작하지 않음)
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // ObjectURL 정리 — 메모리 누수 방지
  URL.revokeObjectURL(url);
}

/**
 * CSV 임포트 템플릿 파일을 동적으로 생성하여 다운로드한다 — 2026-04-09 P2-⑬ 확장.
 *
 * <p>관리자가 마스터 데이터를 대량 등록하기 전에 "어떤 형식의 CSV 를 업로드해야 하는지"
 * 알 수 있도록, {@link CsvImportButton} 에서 사용하는 {@code CSV_IMPORT_COLUMNS} 정의로부터
 * 런타임에 CSV 텍스트를 생성한다. 정적 파일을 `public/` 에 두는 방식과 달리 **컬럼 정의가
 * 한 곳(`CSV_IMPORT_COLUMNS`)에만 존재**하므로 실제 임포트와 템플릿이 자동 동기화된다.</p>
 *
 * <h3>템플릿 구조</h3>
 * <ol>
 *   <li>1행: 헤더 (`columns[].header`)</li>
 *   <li>2행 이후: 예시 행들 — 각 컬럼의 `example`, `example2`, `example3`, ... 필드 값.
 *       해당 슬롯에 값이 하나라도 있는 컬럼이 존재하면 그 슬롯에 대응하는 행이 생성된다.
 *       모든 컬럼의 해당 슬롯이 비어 있으면 그 슬롯부터는 추가하지 않는다.</li>
 * </ol>
 *
 * <p>예시 행은 운영자가 "어떤 값을 넣어야 하는지" 즉시 파악할 수 있도록 제공한다.
 * 실제 업로드 전에는 예시 행을 삭제하거나 수정해야 한다.</p>
 *
 * <p><strong>2026-04-14 확장</strong>: 기존 `example` + `example2` 2슬롯 고정에서
 * `example{N}` 패턴(N=2..{@link MAX_EXAMPLE_SLOTS})으로 확장. 리워드 정책처럼
 * CONTENT/ENGAGEMENT/MILESTONE/ATTENDANCE 등 다양한 카테고리별 샘플을 제공해야
 * 하는 템플릿의 가독성을 위해 추가.</p>
 *
 * @param {string} filename           저장할 파일명 (`_template.csv` 접미어 자동 부착)
 * @param {Array<{
 *   header: string,
 *   required?: boolean,
 *   example?: unknown,
 *   example2?: unknown,
 *   example3?: unknown,
 *   example4?: unknown,
 *   example5?: unknown,
 *   example6?: unknown,
 *   description?: string
 * }>} columns                        임포트 컬럼 정의 (CsvImportButton 과 동일 포맷)
 */
export function downloadCsvTemplate(filename, columns) {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error('[csvExport] 템플릿 컬럼 정의가 비어 있습니다.');
  }

  /*
   * 템플릿 전용 컬럼 정의 — 기존 `toCsv()` 에 그대로 전달한다.
   * accessor 는 각 행 객체에서 header 값을 가져오도록 고정한다 (샘플 행도 동일 구조).
   */
  const templateColumns = columns.map((col) => ({
    header: col.header,
    accessor: col.header,
  }));

  /*
   * 예시 행 N개 지원 — `example`(슬롯 1), `example2`(슬롯 2), ..., `example{MAX}`(슬롯 MAX).
   *
   * 각 슬롯마다 모든 컬럼을 순회하여 해당 슬롯의 값을 모은다. 슬롯 전체가 비어 있으면
   * 그 행과 이후 슬롯은 추가하지 않는다 (중간 구멍은 허용 — 예: example 있고 example2 없는데
   * example3 있으면 example2 행은 빈 행으로 포함된다. 하지만 설계상 연속 채우기를 권장).
   */
  const MAX_EXAMPLE_SLOTS = 6;
  const rows = [];
  for (let slot = 1; slot <= MAX_EXAMPLE_SLOTS; slot++) {
    const field = slot === 1 ? 'example' : `example${slot}`;
    const row = {};
    let hasAny = false;
    for (const col of columns) {
      const val = col[field];
      if (val !== undefined && val !== null && val !== '') {
        row[col.header] = val;
        hasAny = true;
      } else {
        row[col.header] = '';
      }
    }
    if (hasAny) {
      rows.push(row);
    } else if (slot === 1) {
      // 슬롯 1이 완전히 비어 있으면 최소 1개 빈 행을 삽입(헤더만 있는 CSV 방지)
      rows.push(row);
      break;
    } else {
      // 슬롯 N>=2 이 비어 있으면 종료 — 뒤쪽 슬롯은 무시
      break;
    }
  }

  const safeName = filename.endsWith('_template.csv')
    ? filename
    : (filename.endsWith('.csv')
        ? filename.replace(/\.csv$/, '_template.csv')
        : `${filename}_template.csv`);

  downloadCsv(safeName, templateColumns, rows);
}

/**
 * 현재 날짜를 `YYYY-MM-DD` 형식으로 반환한다 — 파일명 생성용 편의 함수.
 *
 * @returns {string} 예: "2026-04-09"
 */
export function todayString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * CSV 내보내기 이벤트를 Backend `admin_audit_logs` 테이블에 기록한다 — 2026-04-09 신규.
 *
 * CSV 내보내기는 브라우저에서만 발생하므로 서버가 이 이벤트를 자동으로 감지하지 못한다.
 * 이 헬퍼는 다운로드 완료 직후 명시적으로 호출되어
 * {@code POST /api/v1/admin/audit-logs/csv-export} 를 통해 감사 로그를 남긴다.
 *
 * ## 왜 필요한가
 * - **개인정보 유출 추적**: CSV 에는 사용자·결제 등 민감 데이터가 포함될 수 있으므로
 *   "누가 언제 어떤 소스에서 몇 건을 내보냈는가" 는 GDPR/개인정보보호법 감사 대응의 핵심 기록이다.
 * - **내부 통제**: 비정상적 대량 내보내기를 사후 탐지할 수 있다.
 * - **사용 패턴 분석**: 어떤 데이터 소스가 자주 내보내지는지 파악하여 대시보드 개선 근거로 활용.
 *
 * ## 실패 정책
 * 감사 로그 기록 실패가 사용자의 CSV 다운로드 경험을 깨뜨려서는 안 된다. 이 함수는
 * 내부에서 예외를 잡아 {@code console.warn} 으로만 남기고 절대 throw 하지 않는다.
 * 호출 측은 await 하지 않고 fire-and-forget 패턴으로 사용하는 것을 권장한다.
 *
 * ## 동적 import 이유
 * 이 모듈({@code csvExport.js})은 API 의존성이 전혀 없는 순수 유틸이어야 tree-shaking 과
 * 테스트가 쉽다. backendApi 를 정적으로 import 하면 이 유틸이 HTTP 계층에 묶이므로,
 * 실제 호출 시점에만 동적으로 가져와서 모듈 경계를 유지한다.
 *
 * @param {Object} meta                   내보내기 메타데이터
 * @param {string} meta.source            데이터 소스 식별자 (예: "recommendation_logs")
 * @param {string} [meta.filename]        실제 다운로드된 파일명 (선택)
 * @param {number} meta.rowCount          내보낸 행 수
 * @param {string} [meta.filterInfo]      필터 조건 요약 (예: "period=7d, status=COMPLETED")
 * @returns {Promise<void>} 성공/실패 여부와 무관하게 항상 resolve
 */
export async function logCsvExport(meta) {
  try {
    // 동적 import — 순수 유틸 모듈의 HTTP 의존을 제거
    const { backendApi } = await import('@/shared/api/axiosInstance');

    await backendApi.post('/api/v1/admin/audit-logs/csv-export', {
      source: meta.source,
      filename: meta.filename ?? null,
      rowCount: meta.rowCount ?? 0,
      filterInfo: meta.filterInfo ?? null,
    });
  } catch (err) {
    // 감사 로그 기록 실패는 사용자 경험에 영향을 주지 않도록 삼킨다.
    // 개발/운영 시 누락을 인지할 수 있도록 경고 레벨 로그만 남긴다.
    // eslint-disable-next-line no-console
    console.warn('[csvExport] 감사 로그 기록 실패:', err?.message ?? err);
  }
}
