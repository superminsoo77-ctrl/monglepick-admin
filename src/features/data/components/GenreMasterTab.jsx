/**
 * 운영 도구 — 장르 마스터(GenreMaster) 관리 탭.
 *
 * 기능:
 * - 장르 목록 조회 (페이징)
 * - 신규 등록 모달 (genreCode/genreName)
 * - 수정 모달 (genreName 만)
 * - 삭제 버튼 (contents_count > 0일 때 경고)
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { MdRefresh, MdAdd, MdEdit, MdDelete } from 'react-icons/md';
import {
  fetchGenres,
  createGenre,
  updateGenre,
  deleteGenre,
} from '../api/genreApi';
/* 2026-04-09 P2-⑬ 확장: 대량 CSV 등록 인프라 재사용 */
import CsvImportButton from '@/shared/components/CsvImportButton';

const PAGE_SIZE = 10;
const MODE_CREATE = 'CREATE';
const MODE_EDIT = 'EDIT';
const EMPTY_FORM = { genreCode: '', genreName: '' };

/**
 * CSV 대량 등록 컬럼 정의 — 2026-04-09 P2-⑬ 재사용.
 *
 * 장르는 매우 단순한 구조이므로 두 필드만 매핑:
 * - `genreCode`: 시스템 식별자 (예: "ACTION", "SCI_FI") — 영문 대문자/언더스코어 권장
 * - `genreName`: 사용자 노출용 한국어 이름 (예: "액션", "SF")
 *
 * 두 필드 모두 필수. 기존 `createGenre()` API 를 그대로 재활용한다.
 * 중복 genreCode 는 Backend 에서 409 로 거부되며, 해당 행은 실패 목록에 수집된다.
 */
const CSV_IMPORT_COLUMNS = [
  {
    key: 'genreCode',
    header: 'genreCode',
    required: true,
    description: '시스템 식별자 (영문 대문자/언더스코어, 예: ACTION)',
    example: 'ACTION',
    example2: 'SCI_FI',
  },
  {
    key: 'genreName',
    header: 'genreName',
    required: true,
    description: '한국어 노출명 (예: 액션)',
    example: '액션',
    example2: 'SF',
  },
];

export default function GenreMasterTab() {
  const [genres, setGenres] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [modalMode, setModalMode] = useState(null);
  const [editTargetId, setEditTargetId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const loadGenres = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchGenres({ page, size: PAGE_SIZE });
      setGenres(result?.content ?? []);
      setTotalPages(result?.totalPages ?? 0);
    } catch (err) {
      setError(err.message || '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { loadGenres(); }, [loadGenres]);

  function openCreateModal() {
    setForm(EMPTY_FORM);
    setEditTargetId(null);
    setModalMode(MODE_CREATE);
  }

  function openEditModal(item) {
    setForm({ genreCode: item.genreCode ?? '', genreName: item.genreName ?? '' });
    setEditTargetId(item.genreId);
    setModalMode(MODE_EDIT);
  }

  function closeModal() {
    setModalMode(null);
    setEditTargetId(null);
    setForm(EMPTY_FORM);
    setSubmitting(false);
  }

  function handleFormChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    try {
      setSubmitting(true);
      if (modalMode === MODE_CREATE) {
        await createGenre({
          genreCode: form.genreCode?.trim(),
          genreName: form.genreName?.trim(),
        });
      } else if (modalMode === MODE_EDIT && editTargetId != null) {
        await updateGenre(editTargetId, { genreName: form.genreName?.trim() });
      }
      closeModal();
      loadGenres();
    } catch (err) {
      alert(err.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(item) {
    if (deletingId === item.genreId) return;
    const warning = (item.contentsCount ?? 0) > 0
      ? `\n※ 이 장르에 ${item.contentsCount}개의 영화가 연결되어 있습니다.\n해당 영화의 genres 컬럼은 자동 정리되지 않습니다.`
      : '';
    if (!confirm(`장르 "${item.genreName}"(${item.genreCode})를 삭제합니다.${warning}\n\n이 작업은 되돌릴 수 없습니다.`)) {
      return;
    }
    try {
      setDeletingId(item.genreId);
      await deleteGenre(item.genreId);
      loadGenres();
    } catch (err) {
      alert(err.message || '삭제 실패');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Container>
      <Toolbar>
        <ToolbarTitle>장르 마스터 관리</ToolbarTitle>
        <ToolbarRight>
          <PrimaryButton onClick={openCreateModal}>
            <MdAdd size={16} /> 신규 등록
          </PrimaryButton>
          {/*
            CSV 대량 등록 — 2026-04-09 P2-⑬ 확장.
            `createGenre()` 를 행별로 순차 호출. 중복 genreCode 는 Backend 409 로
            반환되어 실패 행 목록에 수집된다. 성공 건이 하나라도 있으면 목록 재조회.
          */}
          <CsvImportButton
            label="CSV 가져오기"
            columns={CSV_IMPORT_COLUMNS}
            onRowImport={createGenre}
            onComplete={(result) => {
              if (result.succeeded > 0) loadGenres();
            }}
            disabled={loading}
            templateName="genres"
          />
          <IconButton onClick={loadGenres} disabled={loading} title="새로고침">
            <MdRefresh size={16} />
          </IconButton>
        </ToolbarRight>
      </Toolbar>

      <HelperText>
        장르 마스터는 추천 엔진/필터/온보딩 장르 선택에 사용됩니다.
        <strong> genre_code는 시스템 식별자이므로 변경 불가</strong>하며, 한국어명만 수정 가능합니다.
      </HelperText>

      {error && <ErrorMsg>{error}</ErrorMsg>}

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th $w="60px">ID</Th>
              <Th $w="180px">코드</Th>
              <Th>한국어명</Th>
              <Th $w="120px">영화 수</Th>
              <Th $w="160px">액션</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5}><CenterCell>불러오는 중...</CenterCell></td></tr>
            ) : genres.length === 0 ? (
              <tr><td colSpan={5}><CenterCell>등록된 장르가 없습니다.</CenterCell></td></tr>
            ) : (
              genres.map((item) => (
                <Tr key={item.genreId}>
                  <Td><MutedText>{item.genreId}</MutedText></Td>
                  <Td><CodeText>{item.genreCode}</CodeText></Td>
                  <Td><NameText>{item.genreName}</NameText></Td>
                  <Td><MutedText>{(item.contentsCount ?? 0).toLocaleString()}</MutedText></Td>
                  <Td>
                    <ActionGroup>
                      <SmallButton onClick={() => openEditModal(item)}>
                        <MdEdit size={13} /> 수정
                      </SmallButton>
                      <DangerSmallButton
                        onClick={() => handleDelete(item)}
                        disabled={deletingId === item.genreId}
                      >
                        <MdDelete size={13} /> 삭제
                      </DangerSmallButton>
                    </ActionGroup>
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </TableWrap>

      {totalPages > 1 && (
        <Pagination>
          <PageButton onClick={() => setPage((p) => p - 1)} disabled={page === 0}>이전</PageButton>
          <PageInfo>{page + 1} / {totalPages}</PageInfo>
          <PageButton onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= totalPages}>다음</PageButton>
        </Pagination>
      )}

      {modalMode && (
        <Overlay onClick={closeModal}>
          <DialogBox onClick={(e) => e.stopPropagation()}>
            <DialogTitle>
              {modalMode === MODE_CREATE ? '장르 신규 등록' : '장르 수정'}
            </DialogTitle>
            <form onSubmit={handleSubmit}>
              <Field>
                <Label>장르 코드 (UNIQUE)</Label>
                <Input
                  type="text"
                  name="genreCode"
                  value={form.genreCode}
                  onChange={handleFormChange}
                  required={modalMode === MODE_CREATE}
                  disabled={modalMode === MODE_EDIT}
                  maxLength={50}
                  placeholder="예: ACTION, DRAMA, COMEDY"
                />
                {modalMode === MODE_EDIT && (
                  <FieldHint>장르 코드는 시스템 식별자이므로 변경 불가합니다.</FieldHint>
                )}
              </Field>
              <Field>
                <Label>한국어명 *</Label>
                <Input
                  type="text"
                  name="genreName"
                  value={form.genreName}
                  onChange={handleFormChange}
                  required
                  maxLength={100}
                  placeholder="예: 액션, 드라마, 코미디"
                />
              </Field>
              <DialogFooter>
                <CancelButton type="button" onClick={closeModal}>취소</CancelButton>
                <PrimaryButton type="submit" disabled={submitting}>
                  {submitting ? '저장 중...' : '저장'}
                </PrimaryButton>
              </DialogFooter>
            </form>
          </DialogBox>
        </Overlay>
      )}
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
const ToolbarTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;
const ToolbarRight = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;
const HelperText = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  background: ${({ theme }) => theme.colors.bgHover};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-radius: 4px;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  border-left: 3px solid ${({ theme }) => theme.colors.primary};
`;
const ErrorMsg = styled.p`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  margin-bottom: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.errorBg};
  border-radius: 4px;
`;
const PrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 14px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  border-radius: 4px;
  &:hover:not(:disabled) { opacity: 0.9; }
  &:disabled { opacity: 0.5; }
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
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
  &:disabled { opacity: 0.4; }
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
  &:last-child { border-bottom: none; }
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
`;
const Td = styled.td`
  padding: 10px 12px;
  color: ${({ theme }) => theme.colors.textPrimary};
  vertical-align: middle;
`;
const CodeText = styled.code`
  display: inline-block;
  font-family: 'Menlo', 'Monaco', monospace;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 3px;
  background: ${({ theme }) => theme.colors.bgHover};
  color: ${({ theme }) => theme.colors.textSecondary};
`;
const NameText = styled.div`
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;
const MutedText = styled.span`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.xs};
`;
const ActionGroup = styled.div`
  display: flex;
  gap: 4px;
`;
const SmallButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px 8px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 3px;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgCard};
  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.primary};
  }
  &:disabled { opacity: 0.4; }
`;
const DangerSmallButton = styled(SmallButton)`
  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.error};
    color: ${({ theme }) => theme.colors.error};
  }
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
  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.bgHover}; }
  &:disabled { opacity: 0.4; }
`;
const PageInfo = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
`;
const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
`;
const DialogBox = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  width: 100%;
  max-width: 480px;
  padding: ${({ theme }) => theme.spacing.xxl};
  box-shadow: ${({ theme }) => theme.shadows.lg};
`;
const DialogTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.textPrimary};
`;
const Field = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;
const Label = styled.label`
  display: block;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 4px;
`;
const Input = styled.input`
  width: 100%;
  padding: 7px 10px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.bgCard};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; outline: none; }
  &:disabled { background: ${({ theme }) => theme.colors.bgHover}; opacity: 0.7; }
`;
const FieldHint = styled.span`
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textMuted};
`;
const DialogFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.lg};
`;
const CancelButton = styled.button`
  padding: 7px 16px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgCard};
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
`;
