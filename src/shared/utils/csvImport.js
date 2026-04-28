/**
 * CSV 임포트 유틸리티 — 2026-04-09 P2-⑬ 신규.
 *
 * 관리자 페이지의 마스터 데이터 탭(영화/장르/업적/리워드 정책 등)에서 CSV 파일로
 * 대량 등록 기능을 제공하기 위한 순수 JS 파서. `csvExport.js` 와 짝을 이루며,
 * papaparse 같은 외부 라이브러리 의존을 피해 번들 크기를 최소화한다.
 *
 * ## 지원 사양
 *
 * - **RFC 4180** 기본 준수
 *   - 필드 구분자: `,` (콤마)
 *   - 행 구분자: CRLF(`\r\n`), LF(`\n`), CR(`\r`) 모두 허용
 *   - 큰따옴표(`"`)로 감싼 필드 내부의 콤마/개행/큰따옴표 지원
 *   - 이스케이프된 큰따옴표(`""`) → `"` 변환
 * - **UTF-8 BOM** 자동 제거 (`\uFEFF`) — Excel 에서 저장한 CSV 대응
 * - **빈 행 스킵** — 오직 `,` 와 공백만 있는 행도 정규화하여 무시
 * - **헤더 행** 첫 번째 비공백 행을 자동으로 헤더로 간주
 *
 * ## 의도적 제약
 *
 * - **셀 타입 추론 없음** — 모든 값은 문자열로 반환한다. 숫자/불리언/JSON 변환은
 *   호출 측(`CsvImportButton` 의 `columns[].transform`)에서 책임진다. 파서가 섣불리
 *   타입을 추론하면 "001" → 1 같이 데이터 손실이 발생할 수 있기 때문이다.
 * - **스트리밍 파싱 없음** — 전체 텍스트를 한 번에 파싱한다. 관리자 CSV 는 일반적으로
 *   수천 행 이내라 메모리 부담이 적고, 진행률 UI 는 파싱이 아닌 **업로드 루프**에서
 *   제공된다.
 *
 * @module shared/utils/csvImport
 */

/** UTF-8 BOM 코드 포인트 — Excel 이 붙이는 bytes-order-mark */
const UTF8_BOM = '\uFEFF';

/**
 * CSV 텍스트를 RFC 4180 규칙에 따라 토큰화한다.
 *
 * <p>내부 상태 머신 기반으로 한 문자씩 순회하며 필드/행을 수집한다.
 * 정규식으로 split 하는 방식은 인용 필드 안의 콤마/개행을 처리할 수 없어서
 * 명시적으로 구현했다.</p>
 *
 * @param {string} text CSV 원본 문자열
 * @returns {string[][]} 행 배열 — 각 행은 셀 문자열 배열
 */
function tokenize(text) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;

  // BOM 제거 — 파일 맨 앞에 있는 경우
  const input = text.startsWith(UTF8_BOM) ? text.slice(1) : text;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '"') {
        // 다음 글자가 "" 이면 이스케이프된 큰따옴표로 해석
        if (input[i + 1] === '"') {
          currentField += '"';
          i += 1; // 다음 " 건너뛰기
        } else {
          // 종료 따옴표
          inQuotes = false;
        }
      } else {
        // 인용 내부의 개행/콤마는 그냥 필드에 추가
        currentField += ch;
      }
      continue;
    }

    // 인용 밖 ─ 일반 상태
    if (ch === '"') {
      // 필드가 비어 있을 때만 인용 시작으로 해석 (RFC 4180 엄격 모드)
      // 필드 중간의 따옴표는 리터럴로 취급
      if (currentField.length === 0) {
        inQuotes = true;
      } else {
        currentField += ch;
      }
    } else if (ch === ',') {
      currentRow.push(currentField);
      currentField = '';
    } else if (ch === '\r') {
      // CR 단독 또는 CRLF — 행 종료 후 LF 건너뛰기
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
      if (input[i + 1] === '\n') i += 1;
    } else if (ch === '\n') {
      // LF 단독 — 행 종료
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += ch;
    }
  }

  // 파일 마지막 행(개행 없이 종료된 경우) flush
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

/**
 * 토큰화된 행 배열에서 빈 행(모든 셀이 공백)을 제거한다.
 *
 * @param {string[][]} rows
 * @returns {string[][]}
 */
function dropEmptyRows(rows) {
  return rows.filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));
}

/**
 * CSV 텍스트를 `{ headers, rows }` 형태로 파싱한다.
 *
 * <p>첫 번째 비어있지 않은 행을 헤더로 간주하고, 나머지 행을 객체 배열로 변환한다.
 * 헤더 셀 값은 trim() 되며 중복 헤더가 있으면 마지막 값이 우선한다 (Excel 기본 동작과 동일).
 * 행의 셀 수가 헤더보다 적으면 누락된 셀은 빈 문자열로 채우고, 많으면 초과분은 무시한다.</p>
 *
 * @param {string} text CSV 원본 문자열
 * @returns {{ headers: string[], rows: Record<string, string>[], rawRowCount: number }}
 *   - {@code headers}: 헤더 셀 배열
 *   - {@code rows}: 헤더를 key 로 하는 객체 배열
 *   - {@code rawRowCount}: BOM/빈 행 제거 후 헤더 포함 총 행 수 (데이터 행 수 = rawRowCount - 1)
 * @throws {Error} 파일이 비어 있거나 헤더 행이 없는 경우
 */
export function parseCsv(text) {
  if (typeof text !== 'string') {
    throw new Error('[csvImport] 입력 text 는 문자열이어야 합니다.');
  }

  const rawRows = tokenize(text);
  const nonEmptyRows = dropEmptyRows(rawRows);

  if (nonEmptyRows.length === 0) {
    throw new Error('CSV 파일이 비어 있거나 모든 행이 공백입니다.');
  }

  // 첫 행을 헤더로 사용 — trim 하여 앞뒤 공백 제거
  const headers = nonEmptyRows[0].map((h) => String(h ?? '').trim());

  if (headers.length === 0 || headers.every((h) => h === '')) {
    throw new Error('유효한 헤더 행을 찾을 수 없습니다.');
  }

  // 나머지 행을 { header: value } 객체로 변환
  const rows = [];
  for (let i = 1; i < nonEmptyRows.length; i++) {
    const rawCells = nonEmptyRows[i];
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j];
      if (!key) continue; // 빈 헤더 키는 스킵
      obj[key] = rawCells[j] !== undefined ? String(rawCells[j]) : '';
    }
    rows.push(obj);
  }

  return {
    headers,
    rows,
    rawRowCount: nonEmptyRows.length,
  };
}

/**
 * 파일 객체(브라우저 File API) 를 UTF-8 텍스트로 읽는다.
 *
 * <p>`FileReader` 를 Promise 로 감싼 편의 헬퍼. 호출 측에서 async/await 로
 * 사용할 수 있다.</p>
 *
 * @param {File} file 브라우저 File 객체
 * @returns {Promise<string>} 파일의 UTF-8 텍스트
 * @throws {Error} FileReader 실패 또는 file 이 File 인스턴스가 아닌 경우
 */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    if (!file || typeof file.name !== 'string') {
      reject(new Error('유효한 파일이 아닙니다.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('파일 내용을 문자열로 읽을 수 없습니다.'));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('파일 읽기 실패'));
    };
    reader.readAsText(file, 'utf-8');
  });
}

/**
 * CSV 행 객체를 컬럼 정의에 따라 Backend 전송용 payload 로 변환한다.
 *
 * @param {Record<string, string>} row      파싱된 CSV 행 (헤더를 key 로 하는 객체)
 * @param {Array<{
 *   key: string,
 *   header: string,
 *   required?: boolean,
 *   transform?: (raw: string, row: Record<string, string>) => unknown
 * }>} columns 컬럼 정의
 * @returns {{ payload: Record<string, unknown>, errors: string[] }}
 *   - {@code payload}: Backend 에 POST 할 객체
 *   - {@code errors}: 이 행에서 발생한 검증 에러 메시지 배열 (비어 있으면 정상)
 */
export function rowToPayload(row, columns) {
  const payload = {};
  const errors = [];

  for (const col of columns) {
    const rawValue = row[col.header];
    const trimmed = rawValue != null ? String(rawValue).trim() : '';

    /* 필수 필드 검증 — 빈 문자열도 누락으로 간주 */
    if (col.required && trimmed === '') {
      errors.push(`필수 필드 누락: ${col.header}`);
      continue;
    }

    /* 선택 필드가 비어있으면 payload 에서 제외 (null/빈 문자열 Backend 에 전달 안 함) */
    if (!col.required && trimmed === '') {
      continue;
    }

    /* transform 이 있으면 적용 — 실패 시 에러 추가 */
    if (typeof col.transform === 'function') {
      try {
        const transformed = col.transform(trimmed, row);
        payload[col.key] = transformed;
      } catch (err) {
        errors.push(`${col.header} 변환 실패: ${err?.message ?? String(err)}`);
      }
    } else {
      payload[col.key] = trimmed;
    }
  }

  return { payload, errors };
}
