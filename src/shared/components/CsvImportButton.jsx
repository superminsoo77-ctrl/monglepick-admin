/**
 * CSV 대량 임포트 버튼 + 미리보기 모달 — 2026-04-09 P2-⑬ 신규.
 *
 * 관리자 페이지의 각 마스터 탭(영화/장르/업적/리워드 정책 등) 에서 CSV 파일로
 * 대량 등록 기능을 제공하기 위한 재사용 가능한 컴포넌트. 단일 행 등록 API 를
 * 반복 호출하는 방식으로 Backend 수정 없이 동작한다.
 *
 * ## 워크플로우
 *
 * 1. 버튼 클릭 → 숨겨진 `<input type="file">` 트리거
 * 2. CSV 파일 선택 → `readFileAsText` → `parseCsv` 로 파싱
 * 3. 파싱 결과 미리보기 모달 오픈 — 헤더 매핑/상위 5행/총 건수
 * 4. 운영자가 "가져오기 시작" 클릭 → 각 행에 대해 `columns` 로 payload 생성 → `onRowImport(payload)` 순차 호출
 * 5. 진행률 업데이트 + 실패 집계
 * 6. 완료 시 결과 요약 표시 → 운영자가 "닫기" 클릭 → `onComplete(result)` 콜백 호출
 *
 * ## Props
 *
 * @param {Object} props
 * @param {string} [props.label='CSV 가져오기']  - 버튼 라벨
 * @param {Array<{
 *   key: string,                                               // 백엔드 payload 의 필드명
 *   header: string,                                            // CSV 헤더 이름 (정확 일치)
 *   required?: boolean,                                        // 필수 여부
 *   transform?: (raw: string, row: object) => unknown,         // 값 변환 함수 (문자열 → 숫자/불리언/JSON 등)
 *   description?: string,                                      // 미리보기 모달 헤더 테이블에 표시되는 설명
 * }>} props.columns                                            - 컬럼 매핑 정의
 * @param {(payload: object) => Promise<unknown>} props.onRowImport - 단일 행 등록 함수 (에러 throw 가능)
 * @param {(result: {succeeded: number, failed: number}) => void} [props.onComplete] - 임포트 종료 콜백 (목록 재조회 등)
 * @param {boolean} [props.disabled=false]                      - 외부 비활성화
 */

import { useRef, useState } from 'react';
import styled from 'styled-components';
import { MdUploadFile, MdClose, MdCheckCircle, MdErrorOutline, MdFileDownload } from 'react-icons/md';
import { parseCsv, readFileAsText, rowToPayload } from '@/shared/utils/csvImport';
import { downloadCsvTemplate } from '@/shared/utils/csvExport';

/** 미리보기 모달에서 상위 몇 행까지 노출할지 */
const PREVIEW_ROW_LIMIT = 5;

/** 한 파일 당 최대 허용 행 수 — 브라우저 타임아웃·Backend 과부하 방지 */
const MAX_IMPORT_ROWS = 1000;

export default function CsvImportButton({
  label = 'CSV 가져오기',
  columns,
  onRowImport,
  onComplete,
  disabled = false,
  /**
   * 템플릿 파일명 접두어 — 2026-04-09 P2-⑬ 확장.
   * 지정되면 "템플릿 다운로드" 버튼이 함께 렌더링되며, 클릭 시 `${templateName}_template.csv`
   * 로 동적 생성된 CSV 를 다운로드한다. 생략하면 템플릿 버튼을 숨긴다.
   *
   * 예: `templateName="movies"` → `movies_template.csv`
   */
  templateName,
}) {
  /** 숨겨진 파일 input 참조 — 버튼 클릭 시 프로그래매틱 open */
  const fileInputRef = useRef(null);

  /* ── 모달 및 파싱 상태 ── */
  const [isOpen, setIsOpen] = useState(false);
  /** 선택된 파일 메타 */
  const [fileMeta, setFileMeta] = useState(null);
  /** { headers, rows, rawRowCount } 또는 null */
  const [parseResult, setParseResult] = useState(null);
  /** 파싱/검증 에러 */
  const [parseError, setParseError] = useState(null);

  /* ── 임포트 진행 상태 ── */
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  /** 완료 후 결과 — null 이면 아직 실행 전 */
  const [importResult, setImportResult] = useState(null);
  /** 실패한 행 상세 — { index, errors, serverMessage } 배열 */
  const [failures, setFailures] = useState([]);

  /**
   * 숨겨진 파일 input 을 프로그래매틱하게 열기.
   * 버튼 클릭 시 호출된다.
   */
  function handleButtonClick() {
    if (disabled) return;
    fileInputRef.current?.click();
  }

  /**
   * 템플릿 CSV 다운로드 — 2026-04-09 P2-⑬ 확장.
   *
   * `columns` 정의로부터 런타임에 CSV 텍스트를 생성하여 다운로드한다.
   * 운영자가 "어떤 형식의 CSV 를 업로드해야 하는지" 즉시 파악할 수 있도록
   * 예시 행이 포함된다.
   *
   * 실패 시 사용자 경고 후 무시 (템플릿 다운로드는 보조 기능이므로 업무 흐름 차단 금지).
   */
  function handleDownloadTemplate() {
    if (!templateName) return;
    try {
      downloadCsvTemplate(templateName, columns);
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(`템플릿 생성 실패: ${err?.message ?? '알 수 없는 오류'}`);
    }
  }

  /**
   * 파일 선택 핸들러.
   *
   * 1. 파일 확장자가 .csv 인지 확인 (느슨한 검증)
   * 2. 텍스트로 읽기 → parseCsv
   * 3. 결과가 비어있거나 최대 행 수 초과 시 에러
   * 4. 성공 시 모달 오픈
   */
  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    /* 동일 파일 재선택을 가능하게 하려면 value 를 초기화해야 한다 */
    e.target.value = '';

    /* 확장자 검증 — 정확하지 않지만 실수 방지용 */
    if (!/\.csv$/i.test(file.name)) {
      // eslint-disable-next-line no-alert
      alert('CSV 파일만 지원합니다. (.csv 확장자 필요)');
      return;
    }

    setFileMeta({ name: file.name, size: file.size });
    setParseError(null);
    setParseResult(null);
    setImportResult(null);
    setFailures([]);
    setIsOpen(true);

    try {
      const text = await readFileAsText(file);
      const result = parseCsv(text);

      if (result.rows.length === 0) {
        throw new Error('데이터 행이 없습니다. 헤더만 존재하는 파일입니다.');
      }
      if (result.rows.length > MAX_IMPORT_ROWS) {
        throw new Error(
          `최대 ${MAX_IMPORT_ROWS}건까지 한 번에 가져올 수 있습니다. ` +
          `현재 파일: ${result.rows.length}건 — 파일을 나눠서 가져오세요.`
        );
      }
      setParseResult(result);
    } catch (err) {
      setParseError(err?.message ?? '파일을 해석할 수 없습니다.');
    }
  }

  /** 모달 닫기 — 임포트 진행 중에는 차단 */
  function handleClose() {
    if (importing) return;
    setIsOpen(false);
    setFileMeta(null);
    setParseResult(null);
    setParseError(null);
    setProgress({ current: 0, total: 0 });
    /* 완료 후 닫을 때는 결과를 상위에 전파 */
    if (importResult && typeof onComplete === 'function') {
      onComplete(importResult);
    }
    setImportResult(null);
    setFailures([]);
  }

  /**
   * 임포트 실행.
   *
   * 각 행에 대해 순차적으로 `onRowImport(payload)` 를 호출한다. Promise.all 이 아닌
   * 순차 호출을 쓰는 이유:
   * - 진행률을 한 행씩 사용자에게 피드백하기 위해
   * - Backend 측 과부하/레이트리미트 방지
   * - 실패 시 행 번호와 에러를 정확히 추적
   *
   * 한 행이 실패해도 나머지는 계속 진행한다. 실패한 행은 `failures` 배열에 수집되며
   * 모달 하단에 요약 표시된다.
   */
  async function handleStartImport() {
    if (!parseResult || importing) return;

    const totalRows = parseResult.rows.length;
    setImporting(true);
    setImportResult(null);
    setFailures([]);
    setProgress({ current: 0, total: totalRows });

    let succeeded = 0;
    const failureDetails = [];

    for (let i = 0; i < totalRows; i++) {
      const row = parseResult.rows[i];

      /* 컬럼 정의에 따라 payload 생성 + 검증 */
      const { payload, errors } = rowToPayload(row, columns);
      if (errors.length > 0) {
        failureDetails.push({
          index: i + 2, // 헤더가 1행이므로 사용자 입장에서 +2
          errors,
          serverMessage: null,
        });
        setProgress({ current: i + 1, total: totalRows });
        continue;
      }

      /* API 호출 — 실패는 catch 해서 수집 */
      try {
        // eslint-disable-next-line no-await-in-loop
        await onRowImport(payload);
        succeeded += 1;
      } catch (err) {
        failureDetails.push({
          index: i + 2,
          errors: [],
          serverMessage: err?.message ?? String(err),
        });
      }

      setProgress({ current: i + 1, total: totalRows });
      setFailures([...failureDetails]);
    }

    const result = { succeeded, failed: failureDetails.length };
    setImportResult(result);
    setImporting(false);
  }

  const canStartImport = parseResult && !importing && !importResult && !parseError;

  return (
    <>
      {/* 숨겨진 파일 선택 input */}
      <HiddenFileInput
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleFileChange}
      />

      {/*
        트리거 + 템플릿 다운로드 버튼 그룹.
        templateName 이 지정된 경우에만 "템플릿" 버튼이 함께 렌더링된다.
      */}
      <ButtonGroup>
        <TriggerButton
          type="button"
          onClick={handleButtonClick}
          disabled={disabled}
          title={disabled ? '비활성화됨' : 'CSV 파일로 대량 등록'}
        >
          <MdUploadFile size={16} />
          {label}
        </TriggerButton>
        {templateName && (
          <TemplateButton
            type="button"
            onClick={handleDownloadTemplate}
            title={`${templateName}_template.csv 다운로드 — 헤더 + 예시 행 포함`}
          >
            <MdFileDownload size={14} />
            템플릿
          </TemplateButton>
        )}
      </ButtonGroup>

      {/* 미리보기/진행 모달 */}
      {isOpen && (
        <Overlay onClick={handleClose}>
          <ModalBox onClick={(e) => e.stopPropagation()}>
            {/* 헤더 */}
            <Header>
              <HeaderTitle>CSV 가져오기</HeaderTitle>
              <CloseButton
                type="button"
                onClick={handleClose}
                disabled={importing}
                title={importing ? '임포트 진행 중에는 닫을 수 없습니다' : '닫기'}
              >
                <MdClose size={20} />
              </CloseButton>
            </Header>

            {/* 파일 정보 */}
            {fileMeta && (
              <FileInfo>
                <strong>{fileMeta.name}</strong>
                <FileSize>({(fileMeta.size / 1024).toFixed(1)} KB)</FileSize>
              </FileInfo>
            )}

            {/* 파싱 에러 */}
            {parseError && (
              <ErrorBox>
                <MdErrorOutline size={18} />
                <div>
                  <ErrorTitle>파일을 해석할 수 없습니다</ErrorTitle>
                  <ErrorDesc>{parseError}</ErrorDesc>
                </div>
              </ErrorBox>
            )}

            {/* 파싱 성공 — 헤더 매핑 + 미리보기 */}
            {parseResult && !parseError && (
              <>
                <Section>
                  <SectionLabel>
                    데이터 요약 · <strong>{parseResult.rows.length}행</strong>
                  </SectionLabel>
                  <MappingTable>
                    <thead>
                      <tr>
                        <MappingTh $w="30%">CSV 헤더</MappingTh>
                        <MappingTh $w="30%">Backend 필드</MappingTh>
                        <MappingTh>필수/설명</MappingTh>
                      </tr>
                    </thead>
                    <tbody>
                      {columns.map((col) => {
                        const hasHeader = parseResult.headers.includes(col.header);
                        return (
                          <tr key={col.key}>
                            <MappingTd $dim={!hasHeader}>
                              {col.header}
                              {!hasHeader && <MissingTag>(누락)</MissingTag>}
                            </MappingTd>
                            <MappingTd $mono>{col.key}</MappingTd>
                            <MappingTd>
                              {col.required && <RequiredTag>필수</RequiredTag>}
                              {col.description && <DescText>{col.description}</DescText>}
                            </MappingTd>
                          </tr>
                        );
                      })}
                    </tbody>
                  </MappingTable>
                </Section>

                <Section>
                  <SectionLabel>
                    미리보기 · 상위 {Math.min(PREVIEW_ROW_LIMIT, parseResult.rows.length)}행
                  </SectionLabel>
                  <PreviewTableWrap>
                    <PreviewTable>
                      <thead>
                        <tr>
                          {parseResult.headers.map((h) => (
                            <PreviewTh key={h}>{h}</PreviewTh>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parseResult.rows.slice(0, PREVIEW_ROW_LIMIT).map((row, idx) => (
                          <tr key={idx}>
                            {parseResult.headers.map((h) => (
                              <PreviewTd key={h} title={row[h]}>
                                {row[h]}
                              </PreviewTd>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </PreviewTable>
                  </PreviewTableWrap>
                </Section>
              </>
            )}

            {/* 진행률 바 */}
            {importing && (
              <ProgressSection>
                <ProgressLabel>
                  가져오는 중... {progress.current} / {progress.total}
                </ProgressLabel>
                <ProgressBarTrack>
                  <ProgressBarFill
                    $percent={progress.total > 0 ? (progress.current / progress.total) * 100 : 0}
                  />
                </ProgressBarTrack>
              </ProgressSection>
            )}

            {/* 완료 결과 */}
            {importResult && (
              <ResultBox $success={importResult.failed === 0}>
                {importResult.failed === 0 ? (
                  <MdCheckCircle size={22} />
                ) : (
                  <MdErrorOutline size={22} />
                )}
                <ResultText>
                  완료 — 성공 <strong>{importResult.succeeded}</strong>건 / 실패{' '}
                  <strong>{importResult.failed}</strong>건
                </ResultText>
              </ResultBox>
            )}

            {/* 실패 상세 목록 */}
            {failures.length > 0 && (
              <Section>
                <SectionLabel>실패 상세 · {failures.length}건</SectionLabel>
                <FailureList>
                  {failures.slice(0, 20).map((f) => (
                    <FailureItem key={f.index}>
                      <FailureRow>행 {f.index}</FailureRow>
                      <FailureMessage>
                        {f.errors.length > 0
                          ? f.errors.join(', ')
                          : (f.serverMessage ?? '알 수 없는 오류')}
                      </FailureMessage>
                    </FailureItem>
                  ))}
                  {failures.length > 20 && (
                    <FailureMore>...외 {failures.length - 20}건 생략</FailureMore>
                  )}
                </FailureList>
              </Section>
            )}

            {/* 푸터 액션 */}
            <Footer>
              <FooterButton
                type="button"
                onClick={handleClose}
                disabled={importing}
              >
                {importResult ? '닫기' : '취소'}
              </FooterButton>
              {canStartImport && (
                <FooterPrimaryButton type="button" onClick={handleStartImport}>
                  <MdUploadFile size={16} />
                  가져오기 시작 ({parseResult.rows.length}건)
                </FooterPrimaryButton>
              )}
            </Footer>
          </ModalBox>
        </Overlay>
      )}
    </>
  );
}

/* ── styled-components ── */

/** 실제 DOM 에는 존재하지만 보이지 않는 파일 선택 input */
const HiddenFileInput = styled.input`
  display: none;
`;

/**
 * 트리거 버튼 + 템플릿 다운로드 버튼 그룹.
 * 두 버튼을 시각적으로 연결된 하나의 컨트롤로 묶어 운영자가 "가져오기" 와
 * "템플릿 다운로드" 가 짝 기능임을 인지하도록 설계. 2026-04-09 P2-⑬ 확장.
 */
const ButtonGroup = styled.div`
  display: inline-flex;
  align-items: stretch;
`;

/** 트리거 버튼 — primary 톤 outline */
const TriggerButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: 6px ${({ theme }) => theme.spacing.lg};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.primary};
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.primary};
  border-radius: 4px 0 0 4px;
  transition: all ${({ theme }) => theme.transitions.fast};
  white-space: nowrap;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primaryLight};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /*
   * 템플릿 버튼이 없는 경우(ButtonGroup 의 유일한 자식) 모서리를 양쪽 모두 둥글게
   * 복구한다. styled-components 에서 "유일 자식" 셀렉터는 부모의 :only-child 로
   * 표현할 수 있으나, 여기서는 단순히 last-child 도 우측 둥글게 하여 안전하게 처리.
   */
  &:last-child {
    border-radius: 4px;
  }
`;

/**
 * 템플릿 다운로드 버튼 — 트리거 버튼에 붙어 있는 작은 secondary 버튼.
 * 좌측 테두리를 공유하여 하나의 컨트롤처럼 보이도록 border-left 제거.
 */
const TemplateButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 6px ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.primary};
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.primary};
  border-left: none;
  border-radius: 0 4px 4px 0;
  transition: all ${({ theme }) => theme.transitions.fast};
  white-space: nowrap;

  &:hover {
    background: ${({ theme }) => theme.colors.primaryLight};
  }
`;

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
  max-width: 820px;
  max-height: 92vh;
  overflow-y: auto;
  padding: ${({ theme }) => theme.spacing.xxl};
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const HeaderTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.heading};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.bgHover};
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
`;

const FileInfo = styled.div`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.bgHover};
  border-radius: 4px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.lg};

  strong {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const FileSize = styled.span`
  margin-left: ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
`;

/** 파싱 에러 박스 */
const ErrorBox = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.errorBg};
  border-left: 3px solid ${({ theme }) => theme.colors.error};
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.error};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const ErrorTitle = styled.p`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

const ErrorDesc = styled.p`
  margin-top: 2px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  line-height: 1.5;
`;

const Section = styled.section`
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const SectionLabel = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: ${({ theme }) => theme.spacing.sm};

  strong {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

/** 컬럼 매핑 테이블 */
const MappingTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  overflow: hidden;
`;

const MappingTh = styled.th`
  padding: 8px 10px;
  text-align: left;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgHover};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  width: ${({ $w }) => $w ?? 'auto'};
`;

const MappingTd = styled.td`
  padding: 6px 10px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ $dim, theme }) => ($dim ? theme.colors.textMuted : theme.colors.textPrimary)};
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight};
  font-family: ${({ $mono, theme }) => ($mono ? theme.fonts.mono : 'inherit')};
`;

const MissingTag = styled.span`
  margin-left: 6px;
  font-size: 10px;
  color: ${({ theme }) => theme.colors.error};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`;

const RequiredTag = styled.span`
  display: inline-block;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 700;
  color: #ffffff;
  background: ${({ theme }) => theme.colors.error};
  border-radius: 3px;
  margin-right: 6px;
`;

const DescText = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
`;

/** 미리보기 테이블 — 가로 스크롤 허용 */
const PreviewTableWrap = styled.div`
  overflow-x: auto;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  max-height: 240px;
`;

const PreviewTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-family: ${({ theme }) => theme.fonts.mono};
`;

const PreviewTh = styled.th`
  padding: 6px 10px;
  text-align: left;
  font-size: 10px;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgHover};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  white-space: nowrap;
`;

const PreviewTd = styled.td`
  padding: 4px 10px;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight};
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

/** 진행률 섹션 */
const ProgressSection = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const ProgressLabel = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const ProgressBarTrack = styled.div`
  width: 100%;
  height: 8px;
  background: ${({ theme }) => theme.colors.bgHover};
  border-radius: 4px;
  overflow: hidden;
`;

const ProgressBarFill = styled.div`
  height: 100%;
  width: ${({ $percent }) => $percent}%;
  background: ${({ theme }) => theme.colors.primary};
  transition: width 0.15s ease;
`;

/** 완료 결과 박스 */
const ResultBox = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  border-radius: 4px;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  ${({ $success }) =>
    $success
      ? 'background: #ecfdf5; border-left: 3px solid #10b981; color: #059669;'
      : 'background: #fef2f2; border-left: 3px solid #ef4444; color: #dc2626;'}
`;

const ResultText = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  line-height: 1.5;

  strong {
    font-weight: ${({ theme }) => theme.fontWeights.bold};
  }
`;

/** 실패 상세 목록 */
const FailureList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 180px;
  overflow-y: auto;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
`;

const FailureItem = styled.li`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  padding: 6px 10px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight};

  &:last-child {
    border-bottom: none;
  }
`;

const FailureRow = styled.span`
  flex-shrink: 0;
  width: 60px;
  font-family: ${({ theme }) => theme.fonts.mono};
  color: ${({ theme }) => theme.colors.error};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`;

const FailureMessage = styled.span`
  flex: 1;
  color: ${({ theme }) => theme.colors.textSecondary};
  word-break: break-all;
`;

const FailureMore = styled.li`
  padding: 6px 10px;
  font-size: 10px;
  color: ${({ theme }) => theme.colors.textMuted};
  text-align: center;
  font-style: italic;
`;

/** 푸터 액션 바 */
const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.lg};
  padding-top: ${({ theme }) => theme.spacing.md};
  border-top: 1px solid ${({ theme }) => theme.colors.borderLight};
`;

const FooterButton = styled.button`
  padding: 7px 16px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.bgHover};
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const FooterPrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: 7px 16px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: #ffffff;
  background: ${({ theme }) => theme.colors.primary};
  border-radius: 4px;

  &:hover {
    opacity: 0.85;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
