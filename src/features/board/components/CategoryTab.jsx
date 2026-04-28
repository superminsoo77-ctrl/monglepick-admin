/**
 * 게시판 관리 — 게시글 카테고리(Category/CategoryChild) 관리 탭.
 *
 * 2026-04-08: 운영 도구 탭 해체로 "게시판 관리" 탭으로 이동. 게시글 카테고리는
 * 게시판 도메인에 속한다.
 *
 * 기능:
 * - 좌측: 상위 카테고리 목록 (페이징, 신규/수정/삭제)
 * - 우측: 선택된 상위 카테고리의 하위 카테고리 목록 (신규/수정/삭제)
 * - 상위 선택 시 하위 자동 로드
 * - 상위 삭제 시 하위 자동 정리 경고
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { MdRefresh, MdAdd, MdEdit, MdDelete, MdChevronRight } from 'react-icons/md';
import {
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  fetchCategoryChildren,
  createCategoryChild,
  updateCategoryChild,
  deleteCategoryChild,
} from '../api/categoryApi';

const PAGE_SIZE = 15;

/** 모달 종류 */
const MODAL_PARENT_CREATE = 'PARENT_CREATE';
const MODAL_PARENT_EDIT = 'PARENT_EDIT';
const MODAL_CHILD_CREATE = 'CHILD_CREATE';
const MODAL_CHILD_EDIT = 'CHILD_EDIT';

export default function CategoryTab() {
  /* ── 상위 목록 ── */
  const [categories, setCategories] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [parentLoading, setParentLoading] = useState(true);
  const [parentError, setParentError] = useState(null);

  /* ── 선택된 상위 + 하위 목록 ── */
  const [selectedParent, setSelectedParent] = useState(null);
  const [children, setChildren] = useState([]);
  const [childLoading, setChildLoading] = useState(false);
  const [childError, setChildError] = useState(null);

  /* ── 모달 ── */
  const [modalMode, setModalMode] = useState(null);
  const [modalTarget, setModalTarget] = useState(null);
  const [modalForm, setModalForm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState(null);

  /** 상위 목록 조회 */
  const loadCategories = useCallback(async () => {
    try {
      setParentLoading(true);
      setParentError(null);
      const result = await fetchCategories({ page, size: PAGE_SIZE });
      setCategories(result?.content ?? []);
      setTotalPages(result?.totalPages ?? 0);
    } catch (err) {
      setParentError(err.message || '조회 실패');
    } finally {
      setParentLoading(false);
    }
  }, [page]);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  /** 하위 목록 조회 (선택된 상위 변경 시) */
  const loadChildren = useCallback(async (parentId) => {
    if (parentId == null) {
      setChildren([]);
      return;
    }
    try {
      setChildLoading(true);
      setChildError(null);
      const result = await fetchCategoryChildren(parentId);
      setChildren(Array.isArray(result) ? result : []);
    } catch (err) {
      setChildError(err.message || '조회 실패');
      setChildren([]);
    } finally {
      setChildLoading(false);
    }
  }, []);

  function handleSelectParent(parent) {
    setSelectedParent(parent);
    loadChildren(parent.categoryId);
  }

  /* ── 모달 핸들러 ── */

  function openParentCreate() {
    setModalMode(MODAL_PARENT_CREATE);
    setModalTarget(null);
    setModalForm('');
  }
  function openParentEdit(item) {
    setModalMode(MODAL_PARENT_EDIT);
    setModalTarget(item);
    setModalForm(item.upCategory ?? '');
  }
  function openChildCreate() {
    if (!selectedParent) return alert('먼저 상위 카테고리를 선택하세요.');
    setModalMode(MODAL_CHILD_CREATE);
    setModalTarget(null);
    setModalForm('');
  }
  function openChildEdit(item) {
    setModalMode(MODAL_CHILD_EDIT);
    setModalTarget(item);
    setModalForm(item.categoryChild ?? '');
  }
  function closeModal() {
    setModalMode(null);
    setModalTarget(null);
    setModalForm('');
    setSubmitting(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    const trimmed = modalForm?.trim();
    if (!trimmed) return alert('카테고리명을 입력하세요.');

    try {
      setSubmitting(true);
      switch (modalMode) {
        case MODAL_PARENT_CREATE:
          await createCategory({ upCategory: trimmed });
          loadCategories();
          break;
        case MODAL_PARENT_EDIT:
          await updateCategory(modalTarget.categoryId, { upCategory: trimmed });
          loadCategories();
          if (selectedParent?.categoryId === modalTarget.categoryId) {
            setSelectedParent({ ...selectedParent, upCategory: trimmed });
          }
          break;
        case MODAL_CHILD_CREATE:
          await createCategoryChild({
            categoryId: selectedParent.categoryId,
            categoryChild: trimmed,
          });
          loadChildren(selectedParent.categoryId);
          break;
        case MODAL_CHILD_EDIT:
          await updateCategoryChild(modalTarget.categoryChildId, { categoryChild: trimmed });
          loadChildren(selectedParent.categoryId);
          break;
        default:
          break;
      }
      closeModal();
    } catch (err) {
      alert(err.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  /* ── 삭제 ── */

  async function handleDeleteParent(item) {
    if (busyId === `p_${item.categoryId}`) return;
    if (!confirm(
      `상위 카테고리 "${item.upCategory}"를 삭제합니다.\n` +
      `이 카테고리의 모든 하위 카테고리도 함께 삭제됩니다.\n\n` +
      `정말 삭제하시겠습니까?`
    )) return;
    try {
      setBusyId(`p_${item.categoryId}`);
      await deleteCategory(item.categoryId);
      if (selectedParent?.categoryId === item.categoryId) {
        setSelectedParent(null);
        setChildren([]);
      }
      loadCategories();
    } catch (err) {
      alert(err.message || '삭제 실패');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteChild(item) {
    if (busyId === `c_${item.categoryChildId}`) return;
    if (!confirm(`하위 카테고리 "${item.categoryChild}"를 삭제하시겠습니까?`)) return;
    try {
      setBusyId(`c_${item.categoryChildId}`);
      await deleteCategoryChild(item.categoryChildId);
      loadChildren(selectedParent.categoryId);
    } catch (err) {
      alert(err.message || '삭제 실패');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Container>
      <HelperText>
        커뮤니티 게시판의 상위/하위 카테고리 마스터를 관리합니다.
        좌측에서 상위 카테고리를 선택하면 우측에 하위 카테고리 목록이 표시됩니다.
        <strong> 상위 카테고리 삭제 시 모든 하위 카테고리가 함께 삭제됩니다.</strong>
      </HelperText>

      <Layout>
        {/* ── 좌측: 상위 카테고리 ── */}
        <Pane>
          <PaneHeader>
            <PaneTitle>상위 카테고리</PaneTitle>
            <ToolbarRight>
              <PrimaryButton onClick={openParentCreate}>
                <MdAdd size={16} /> 신규
              </PrimaryButton>
              <IconButton onClick={loadCategories} disabled={parentLoading}>
                <MdRefresh size={16} />
              </IconButton>
            </ToolbarRight>
          </PaneHeader>
          {parentError && <ErrorMsg>{parentError}</ErrorMsg>}
          <ListWrap>
            {parentLoading ? (
              <CenterCell>불러오는 중...</CenterCell>
            ) : categories.length === 0 ? (
              <CenterCell>상위 카테고리가 없습니다.</CenterCell>
            ) : (
              categories.map((item) => (
                <ListItem
                  key={item.categoryId}
                  $selected={selectedParent?.categoryId === item.categoryId}
                  onClick={() => handleSelectParent(item)}
                >
                  <ItemBody>
                    <ItemName>{item.upCategory}</ItemName>
                    <ItemMeta>ID {item.categoryId}</ItemMeta>
                  </ItemBody>
                  <ItemActions>
                    <SmallButton onClick={(e) => { e.stopPropagation(); openParentEdit(item); }}>
                      <MdEdit size={13} />
                    </SmallButton>
                    <DangerSmallButton
                      onClick={(e) => { e.stopPropagation(); handleDeleteParent(item); }}
                      disabled={busyId === `p_${item.categoryId}`}
                    >
                      <MdDelete size={13} />
                    </DangerSmallButton>
                    <MdChevronRight size={16} />
                  </ItemActions>
                </ListItem>
              ))
            )}
          </ListWrap>
          {totalPages > 1 && (
            <Pagination>
              <PageButton onClick={() => setPage((p) => p - 1)} disabled={page === 0}>이전</PageButton>
              <PageInfo>{page + 1} / {totalPages}</PageInfo>
              <PageButton
                onClick={() => setPage((p) => p + 1)}
                disabled={page + 1 >= totalPages}
              >
                다음
              </PageButton>
            </Pagination>
          )}
        </Pane>

        {/* ── 우측: 하위 카테고리 ── */}
        <Pane>
          <PaneHeader>
            <PaneTitle>
              하위 카테고리
              {selectedParent && <ParentChip>{selectedParent.upCategory}</ParentChip>}
            </PaneTitle>
            <ToolbarRight>
              <PrimaryButton onClick={openChildCreate} disabled={!selectedParent}>
                <MdAdd size={16} /> 신규
              </PrimaryButton>
            </ToolbarRight>
          </PaneHeader>
          {childError && <ErrorMsg>{childError}</ErrorMsg>}
          <ListWrap>
            {!selectedParent ? (
              <CenterCell>좌측에서 상위 카테고리를 선택하세요.</CenterCell>
            ) : childLoading ? (
              <CenterCell>불러오는 중...</CenterCell>
            ) : children.length === 0 ? (
              <CenterCell>하위 카테고리가 없습니다.</CenterCell>
            ) : (
              children.map((item) => (
                <ListItem key={item.categoryChildId}>
                  <ItemBody>
                    <ItemName>{item.categoryChild}</ItemName>
                    <ItemMeta>ID {item.categoryChildId}</ItemMeta>
                  </ItemBody>
                  <ItemActions>
                    <SmallButton onClick={() => openChildEdit(item)}>
                      <MdEdit size={13} />
                    </SmallButton>
                    <DangerSmallButton
                      onClick={() => handleDeleteChild(item)}
                      disabled={busyId === `c_${item.categoryChildId}`}
                    >
                      <MdDelete size={13} />
                    </DangerSmallButton>
                  </ItemActions>
                </ListItem>
              ))
            )}
          </ListWrap>
        </Pane>
      </Layout>

      {/* ── 모달 ── */}
      {modalMode && (
        <Overlay onClick={closeModal}>
          <DialogBox onClick={(e) => e.stopPropagation()}>
            <DialogTitle>
              {modalMode === MODAL_PARENT_CREATE && '상위 카테고리 신규 등록'}
              {modalMode === MODAL_PARENT_EDIT && '상위 카테고리 수정'}
              {modalMode === MODAL_CHILD_CREATE && '하위 카테고리 신규 등록'}
              {modalMode === MODAL_CHILD_EDIT && '하위 카테고리 수정'}
            </DialogTitle>
            <form onSubmit={handleSubmit}>
              {(modalMode === MODAL_CHILD_CREATE || modalMode === MODAL_CHILD_EDIT) && selectedParent && (
                <Field>
                  <Label>상위 카테고리</Label>
                  <Input value={selectedParent.upCategory} disabled />
                </Field>
              )}
              <Field>
                <Label>카테고리명 *</Label>
                <Input
                  type="text"
                  value={modalForm}
                  onChange={(e) => setModalForm(e.target.value)}
                  required
                  maxLength={100}
                  autoFocus
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

const HelperText = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  background: ${({ theme }) => theme.colors.bgHover};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-radius: 4px;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  border-left: 3px solid ${({ theme }) => theme.colors.primary};
`;

const Layout = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.lg};
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const Pane = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  background: ${({ theme }) => theme.colors.bgCard};
  display: flex;
  flex-direction: column;
  min-height: 400px;
`;

const PaneHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.md};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const PaneTitle = styled.h3`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ParentChip = styled.span`
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  border-radius: 10px;
  color: #fff;
  background: ${({ theme }) => theme.colors.primary};
`;

const ToolbarRight = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const ErrorMsg = styled.p`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  margin: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.errorBg};
  border-radius: 4px;
`;

const PrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
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
  background: ${({ theme }) => theme.colors.bgCard};
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
  &:disabled { opacity: 0.4; }
`;

const ListWrap = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: ${({ theme }) => theme.spacing.sm};
`;

const ListItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.borderLight};
  border-radius: 4px;
  margin-bottom: 4px;
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};
  background: ${({ $selected, theme }) =>
    $selected ? theme.colors.bgHover : theme.colors.bgCard};
  border-color: ${({ $selected, theme }) =>
    $selected ? theme.colors.primary : theme.colors.borderLight};
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
`;

const ItemBody = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const ItemName = styled.span`
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ItemMeta = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const ItemActions = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const SmallButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 6px;
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
  padding: ${({ theme }) => theme.spacing.sm};
  border-top: 1px solid ${({ theme }) => theme.colors.borderLight};
`;

const PageButton = styled.button`
  padding: 4px 12px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgCard};
  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.bgHover}; }
  &:disabled { opacity: 0.4; }
`;

const PageInfo = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
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
