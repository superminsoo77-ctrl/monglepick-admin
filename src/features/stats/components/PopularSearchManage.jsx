/**
 * 인기 검색어 운영 관리 섹션 (PopularSearchKeyword CRUD).
 *
 * 2026-04-08: 운영 도구 탭 해체로 "통계/분석 > 검색 분석" 탭의 하단 섹션으로
 * 이동. 검색 품질 지표/TOP 20 조회(SearchTab 상단)와 수동 운영(본 컴포넌트)을
 * 한 화면에서 함께 본다 — 조회와 조작을 동일 도메인에 묶는 원칙.
 *
 * 기능:
 * - 인기 검색어 마스터 목록 조회 (페이징)
 * - 신규 등록 모달 (keyword UNIQUE)
 * - 수정 모달 (displayRank/manualPriority/isExcluded/adminNote)
 * - 블랙리스트 토글
 * - 삭제 (hard delete)
 *
 * 운영 모델:
 * - SearchHistory 자동 집계 결과에서 isExcluded=true 키워드는 노출 차단
 * - manualPriority가 높을수록 상단 노출 가중치
 * - displayRank가 있으면 고정 노출 순위
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { MdRefresh, MdAdd, MdEdit, MdDelete, MdBlock, MdCheckCircle } from 'react-icons/md';
import {
  fetchPopularKeywords,
  createPopularKeyword,
  updatePopularKeyword,
  updatePopularKeywordExcluded,
  deletePopularKeyword,
} from '../api/popularSearchApi';

const PAGE_SIZE = 10;
const MODE_CREATE = 'CREATE';
const MODE_EDIT = 'EDIT';
const EMPTY_FORM = {
  keyword: '',
  displayRank: '',
  manualPriority: 0,
  isExcluded: false,
  adminNote: '',
};

export default function PopularSearchManage() {
  const [keywords, setKeywords] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [modalMode, setModalMode] = useState(null);
  const [editTargetId, setEditTargetId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const loadKeywords = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchPopularKeywords({ page, size: PAGE_SIZE });
      setKeywords(result?.content ?? []);
      setTotalPages(result?.totalPages ?? 0);
    } catch (err) {
      setError(err.message || '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { loadKeywords(); }, [loadKeywords]);

  function openCreateModal() {
    setForm(EMPTY_FORM);
    setEditTargetId(null);
    setModalMode(MODE_CREATE);
  }

  function openEditModal(item) {
    setForm({
      keyword: item.keyword ?? '',
      displayRank: item.displayRank ?? '',
      manualPriority: item.manualPriority ?? 0,
      isExcluded: !!item.isExcluded,
      adminNote: item.adminNote ?? '',
    });
    setEditTargetId(item.id);
    setModalMode(MODE_EDIT);
  }

  function closeModal() {
    setModalMode(null);
    setEditTargetId(null);
    setForm(EMPTY_FORM);
    setSubmitting(false);
  }

  function handleFormChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    try {
      setSubmitting(true);
      const toIntOrNull = (v) => (v === '' || v == null ? null : parseInt(v, 10));
      const payload = {
        displayRank: toIntOrNull(form.displayRank),
        manualPriority: form.manualPriority === '' ? 0 : Number(form.manualPriority),
        isExcluded: !!form.isExcluded,
        adminNote: form.adminNote || null,
      };
      if (modalMode === MODE_CREATE) {
        payload.keyword = form.keyword?.trim();
        await createPopularKeyword(payload);
      } else if (modalMode === MODE_EDIT && editTargetId != null) {
        await updatePopularKeyword(editTargetId, payload);
      }
      closeModal();
      loadKeywords();
    } catch (err) {
      alert(err.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleExcluded(item) {
    if (busyId === item.id) return;
    try {
      setBusyId(item.id);
      await updatePopularKeywordExcluded(item.id, !item.isExcluded);
      loadKeywords();
    } catch (err) {
      alert(err.message || '상태 변경 실패');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item) {
    if (busyId === item.id) return;
    if (!confirm(`인기 검색어 "${item.keyword}"를 삭제합니다.\n이 작업은 되돌릴 수 없습니다.`)) {
      return;
    }
    try {
      setBusyId(item.id);
      await deletePopularKeyword(item.id);
      loadKeywords();
    } catch (err) {
      alert(err.message || '삭제 실패');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Container>
      <Toolbar>
        <ToolbarTitle>인기 검색어 관리</ToolbarTitle>
        <ToolbarRight>
          <PrimaryButton onClick={openCreateModal}>
            <MdAdd size={16} /> 신규 등록
          </PrimaryButton>
          <IconButton onClick={loadKeywords} disabled={loading} title="새로고침">
            <MdRefresh size={16} />
          </IconButton>
        </ToolbarRight>
      </Toolbar>

      <HelperText>
        인기 검색어는 SearchHistory에서 자동 집계되지만, 본 화면에서 부적절 키워드를
        <strong> 제외(블랙리스트)</strong>하거나 마케팅 목적으로
        <strong> 강제 노출(displayRank/manualPriority)</strong>할 수 있습니다.
      </HelperText>

      {error && <ErrorMsg>{error}</ErrorMsg>}

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th $w="60px">ID</Th>
              <Th>키워드</Th>
              <Th $w="100px">노출순위</Th>
              <Th $w="100px">수동가중</Th>
              <Th $w="100px">상태</Th>
              <Th>관리자 메모</Th>
              <Th $w="220px">액션</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7}><CenterCell>불러오는 중...</CenterCell></td></tr>
            ) : keywords.length === 0 ? (
              <tr><td colSpan={7}><CenterCell>등록된 키워드가 없습니다.</CenterCell></td></tr>
            ) : (
              keywords.map((item) => (
                <Tr key={item.id}>
                  <Td><MutedText>{item.id}</MutedText></Td>
                  <Td><KeywordText>{item.keyword}</KeywordText></Td>
                  <Td><MutedText>{item.displayRank ?? '-'}</MutedText></Td>
                  <Td><MutedText>{item.manualPriority ?? 0}</MutedText></Td>
                  <Td>
                    {item.isExcluded ? (
                      <StatusPill $color="#ef4444">제외</StatusPill>
                    ) : (
                      <StatusPill $color="#10b981">노출</StatusPill>
                    )}
                  </Td>
                  <Td>
                    <NoteText>{item.adminNote ?? '-'}</NoteText>
                  </Td>
                  <Td>
                    <ActionGroup>
                      <SmallButton onClick={() => openEditModal(item)}>
                        <MdEdit size={13} /> 수정
                      </SmallButton>
                      <SmallButton
                        onClick={() => handleToggleExcluded(item)}
                        disabled={busyId === item.id}
                        title={item.isExcluded ? '노출 복원' : '블랙리스트 추가'}
                      >
                        {item.isExcluded ? <MdCheckCircle size={13} /> : <MdBlock size={13} />}
                        {item.isExcluded ? ' 복원' : ' 제외'}
                      </SmallButton>
                      <DangerSmallButton
                        onClick={() => handleDelete(item)}
                        disabled={busyId === item.id}
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
              {modalMode === MODE_CREATE ? '인기 검색어 신규 등록' : '인기 검색어 수정'}
            </DialogTitle>
            <form onSubmit={handleSubmit}>
              <Field>
                <Label>키워드 (UNIQUE)</Label>
                <Input
                  type="text"
                  name="keyword"
                  value={form.keyword}
                  onChange={handleFormChange}
                  required={modalMode === MODE_CREATE}
                  disabled={modalMode === MODE_EDIT}
                  maxLength={200}
                  placeholder="검색어 본문"
                />
                {modalMode === MODE_EDIT && (
                  <FieldHint>키워드 본문은 식별자이므로 변경 불가합니다.</FieldHint>
                )}
              </Field>
              <FieldRow>
                <Field>
                  <Label>고정 노출 순위 (선택)</Label>
                  <Input
                    type="number"
                    name="displayRank"
                    value={form.displayRank}
                    onChange={handleFormChange}
                    min={1}
                    placeholder="비워두면 자동 순위"
                  />
                </Field>
                <Field>
                  <Label>수동 가중치</Label>
                  <Input
                    type="number"
                    name="manualPriority"
                    value={form.manualPriority}
                    onChange={handleFormChange}
                    min={0}
                  />
                </Field>
              </FieldRow>
              <Field>
                <CheckboxLabel>
                  <input
                    type="checkbox"
                    name="isExcluded"
                    checked={form.isExcluded}
                    onChange={handleFormChange}
                  />
                  <span>블랙리스트(자동 집계 결과에서 제외)</span>
                </CheckboxLabel>
              </Field>
              <Field>
                <Label>관리자 메모</Label>
                <Textarea
                  name="adminNote"
                  value={form.adminNote}
                  onChange={handleFormChange}
                  rows={3}
                  placeholder="제외 사유, 마케팅 목적 등"
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
const KeywordText = styled.span`
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;
const MutedText = styled.span`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.xs};
`;
const NoteText = styled.span`
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  max-width: 280px;
`;
const StatusPill = styled.span`
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  border-radius: 10px;
  color: #fff;
  background: ${({ $color }) => $color};
`;
const ActionGroup = styled.div`
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
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
  max-width: 540px;
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
  flex: 1;
`;
const FieldRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
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
const Textarea = styled.textarea`
  width: 100%;
  padding: 7px 10px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  resize: vertical;
  background: ${({ theme }) => theme.colors.bgCard};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: inherit;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; outline: none; }
`;
const FieldHint = styled.span`
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textMuted};
`;
const CheckboxLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
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
