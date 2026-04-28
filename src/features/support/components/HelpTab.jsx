/**
 * 도움말 관리 탭 컴포넌트.
 *
 * 기능:
 * - 도움말 목록 테이블 (제목, 카테고리, 순서, 작성일, 액션)
 * - 카테고리 필터
 * - 등록/수정 모달 (title, category, content, displayOrder)
 * - 삭제 확인 다이얼로그
 * - 페이지네이션
 *
 * Phase G P1 (2026-04-23):
 * - ?modal=create 쿼리 시 도움말 등록 모달 자동 오픈
 * - AI 어시스턴트 draft(help_article_draft) → 모달 초기값 주입
 *   draft 필드: title, category, content
 * - 모달 상단 AiPrefillBanner 노출 (draft && isAiGenerated 조건)
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { MdAdd, MdEdit, MdDelete, MdRefresh } from 'react-icons/md';
import {
  fetchHelpArticles,
  createHelpArticle,
  updateHelpArticle,
  deleteHelpArticle,
} from '../api/supportApi';
import StatusBadge from '@/shared/components/StatusBadge';
import { useQueryParams } from '@/shared/hooks/useQueryParams';
import { useAiPrefill } from '@/shared/hooks/useAiPrefill';
import AiPrefillBanner from '@/shared/components/AiPrefillBanner';

/**
 * 도움말 카테고리 옵션.
 *
 * <p>도움말 엔티티({@code SupportHelpArticle.category})도 FAQ와 동일한
 * {@code SupportCategory} enum 을 공유한다. 따라서 허용 값은 아래 6종 으로 고정된다:
 * GENERAL / ACCOUNT / CHAT / RECOMMENDATION / COMMUNITY / PAYMENT.</p>
 */
const CATEGORIES = [
  { value: '', label: '전체' },
  { value: 'GENERAL', label: '일반' },
  { value: 'ACCOUNT', label: '계정' },
  { value: 'CHAT', label: '채팅' },
  { value: 'RECOMMENDATION', label: '추천' },
  { value: 'COMMUNITY', label: '커뮤니티' },
  { value: 'PAYMENT', label: '결제' },
];

/** 카테고리 API 값 → 한국어 라벨 매핑 (목록 표시용) */
const CATEGORY_LABELS = {
  GENERAL: '일반',
  ACCOUNT: '계정',
  CHAT: '채팅',
  RECOMMENDATION: '추천',
  COMMUNITY: '커뮤니티',
  PAYMENT: '결제',
};

/**
 * 등록/수정 폼 초기값.
 * 과거 'GETTING_STARTED' 기본값으로 인해 모든 신규 도움말 등록이 400 으로 실패하던 버그 수정.
 */
const INITIAL_FORM = {
  title: '',
  category: 'GENERAL',
  content: '',
  displayOrder: 0,
};

export default function HelpTab() {
  /* ── URL 쿼리파라미터 / AI prefill ── */
  /**
   * ?modal=create → 도움말 등록 모달 자동 오픈.
   * AI 어시스턴트가 draft(help_article_draft)를 location.state 에 심어두면
   * 모달 초기값(title, category, content)으로 주입한다.
   */
  const { modal: queryModal } = useQueryParams();
  const { draft, bannerText } = useAiPrefill();

  /* ── 목록 상태 ── */
  const [articles, setArticles] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* ── 필터/페이지 상태 ── */
  const [filterCategory, setFilterCategory] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;

  /* ── 모달 상태 ── */
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [formLoading, setFormLoading] = useState(false);

  /* ── 삭제 다이얼로그 상태 ── */
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  /** 도움말 목록 조회 */
  const loadArticles = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page, size: PAGE_SIZE };
      if (filterCategory) params.category = filterCategory;
      const result = await fetchHelpArticles(params);
      setArticles(result?.content ?? result ?? []);
      setTotal(result?.totalElements ?? (result?.length ?? 0));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filterCategory]);

  useEffect(() => { loadArticles(); }, [loadArticles]);

  /**
   * 쿼리파라미터 자동 모달 오픈 처리.
   *
   * - ?modal=create : 도움말 등록 모달을 즉시 오픈.
   *   draft(help_article_draft)가 있으면 title/category/content 폼 초기값으로 주입.
   *
   * 이미 모달이 열려 있으면 중복 실행 방지.
   */
  useEffect(() => {
    if (!queryModal || modalOpen) return;

    if (queryModal === 'create') {
      /* draft 필드명(camelCase): title, category, content */
      const prefill = draft
        ? {
            ...INITIAL_FORM,
            title:    draft.title    ?? INITIAL_FORM.title,
            category: draft.category ?? INITIAL_FORM.category,
            content:  draft.content  ?? INITIAL_FORM.content,
          }
        : INITIAL_FORM;
      setEditTarget(null);
      setForm(prefill);
      setModalOpen(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryModal]);

  /** 카테고리 필터 변경 — 첫 페이지로 리셋 */
  function handleCategoryChange(value) {
    setFilterCategory(value);
    setPage(0);
  }

  /** 신규 등록 모달 오픈 */
  function openCreateModal() {
    setEditTarget(null);
    setForm(INITIAL_FORM);
    setModalOpen(true);
  }

  /** 수정 모달 오픈 */
  function openEditModal(article) {
    setEditTarget(article);
    setForm({
      title: article.title ?? '',
      /* Backend SupportCategory enum 과 일치해야 한다. 기본값은 INITIAL_FORM 과 통일. */
      category: article.category ?? 'GENERAL',
      content: article.content ?? '',
      displayOrder: article.displayOrder ?? 0,
    });
    setModalOpen(true);
  }

  /** 폼 필드 변경 핸들러 */
  function handleFormChange(e) {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value,
    }));
  }

  /** 등록/수정 제출 */
  async function handleFormSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) { alert('제목을 입력해주세요.'); return; }
    if (!form.content.trim()) { alert('내용을 입력해주세요.'); return; }

    try {
      setFormLoading(true);
      if (editTarget) {
        await updateHelpArticle(editTarget.id, form);
      } else {
        await createHelpArticle(form);
      }
      setModalOpen(false);
      loadArticles();
    } catch (err) {
      alert(err.message || '처리 중 오류가 발생했습니다.');
    } finally {
      setFormLoading(false);
    }
  }

  /** 삭제 확인 다이얼로그 오픈 */
  function openDeleteDialog(article) {
    setDeleteTarget(article);
  }

  /** 삭제 실행 */
  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleteLoading(true);
      await deleteHelpArticle(deleteTarget.id);
      setDeleteTarget(null);
      loadArticles();
    } catch (err) {
      alert(err.message || '삭제 중 오류가 발생했습니다.');
    } finally {
      setDeleteLoading(false);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <Container>
      {/* ── 툴바 ── */}
      <Toolbar>
        <ToolbarLeft>
          {CATEGORIES.map((cat) => (
            <FilterButton
              key={cat.value}
              $active={filterCategory === cat.value}
              onClick={() => handleCategoryChange(cat.value)}
            >
              {cat.label}
            </FilterButton>
          ))}
        </ToolbarLeft>
        <ToolbarRight>
          <IconButton onClick={loadArticles} disabled={loading} title="새로고침">
            <MdRefresh size={16} />
          </IconButton>
          <PrimaryButton onClick={openCreateModal}>
            <MdAdd size={16} />
            도움말 등록
          </PrimaryButton>
        </ToolbarRight>
      </Toolbar>

      {/* ── 에러 메시지 ── */}
      {error && <ErrorMsg>{error}</ErrorMsg>}

      {/* ── 목록 테이블 ── */}
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>제목</Th>
              <Th $w="110px">카테고리</Th>
              <Th $w="60px">순서</Th>
              <Th $w="120px">작성일</Th>
              <Th $w="100px">액션</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5}><CenterCell>불러오는 중...</CenterCell></td></tr>
            ) : articles.length === 0 ? (
              <tr><td colSpan={5}><CenterCell>도움말이 없습니다.</CenterCell></td></tr>
            ) : (
              articles.map((article) => (
                <Tr key={article.id}>
                  <Td>
                    <TitleText>{article.title}</TitleText>
                  </Td>
                  <Td>
                    <StatusBadge
                      status="info"
                      label={CATEGORY_LABELS[article.category] ?? article.category}
                    />
                  </Td>
                  <Td>{article.displayOrder ?? '-'}</Td>
                  <Td>{article.createdAt ? article.createdAt.slice(0, 10) : '-'}</Td>
                  <Td>
                    <ActionRow>
                      <TextButton onClick={() => openEditModal(article)}>
                        <MdEdit size={14} /> 수정
                      </TextButton>
                      <DangerButton onClick={() => openDeleteDialog(article)}>
                        <MdDelete size={14} /> 삭제
                      </DangerButton>
                    </ActionRow>
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </TableWrap>

      {/* ── 페이지네이션 ── */}
      {totalPages > 1 && (
        <Pagination>
          <PageButton onClick={() => setPage((p) => p - 1)} disabled={page === 0}>이전</PageButton>
          <PageInfo>{page + 1} / {totalPages}</PageInfo>
          <PageButton onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= totalPages}>다음</PageButton>
        </Pagination>
      )}

      {/* ── 등록/수정 모달 ── */}
      {modalOpen && (
        <Overlay onClick={() => setModalOpen(false)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>{editTarget ? '도움말 수정' : '도움말 등록'}</ModalTitle>
              <CloseButton onClick={() => setModalOpen(false)}>✕</CloseButton>
            </ModalHeader>

            <ModalForm onSubmit={handleFormSubmit}>
              {/* ── AI 어시스턴트 prefill 안내 배너 (draft 가 있을 때만 노출) ── */}
              {bannerText && <AiPrefillBanner text={bannerText} />}

              <FormRow>
                <Label>제목 *</Label>
                <Input
                  name="title"
                  value={form.title}
                  onChange={handleFormChange}
                  placeholder="도움말 제목 입력"
                  maxLength={200}
                />
              </FormRow>

              <FormRow>
                <Label>카테고리 *</Label>
                <Select name="category" value={form.category} onChange={handleFormChange}>
                  {CATEGORIES.slice(1).map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </Select>
              </FormRow>

              <FormRow>
                <Label>내용 *</Label>
                <Textarea
                  name="content"
                  value={form.content}
                  onChange={handleFormChange}
                  placeholder="도움말 내용을 입력하세요. 마크다운 형식을 지원합니다."
                  rows={9}
                />
              </FormRow>

              <FormRow>
                <Label>표시 순서</Label>
                <Input
                  type="number"
                  name="displayOrder"
                  value={form.displayOrder}
                  onChange={handleFormChange}
                  min={0}
                  style={{ width: '120px' }}
                />
              </FormRow>

              <ModalFooter>
                <CancelButton type="button" onClick={() => setModalOpen(false)}>취소</CancelButton>
                <SubmitButton type="submit" disabled={formLoading}>
                  {formLoading ? '저장 중...' : editTarget ? '수정 완료' : '등록'}
                </SubmitButton>
              </ModalFooter>
            </ModalForm>
          </Modal>
        </Overlay>
      )}

      {/* ── 삭제 확인 다이얼로그 ── */}
      {deleteTarget && (
        <Overlay onClick={() => setDeleteTarget(null)}>
          <DialogBox onClick={(e) => e.stopPropagation()}>
            <DialogTitle>도움말 삭제</DialogTitle>
            <DialogDesc>
              <strong>"{deleteTarget.title}"</strong>을(를) 삭제합니다.
              <br />이 작업은 되돌릴 수 없습니다.
            </DialogDesc>
            <DialogFooter>
              <CancelButton onClick={() => setDeleteTarget(null)}>취소</CancelButton>
              <DeleteConfirmButton onClick={handleDelete} disabled={deleteLoading}>
                {deleteLoading ? '삭제 중...' : '삭제'}
              </DeleteConfirmButton>
            </DialogFooter>
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
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const ToolbarLeft = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xs};
  flex-wrap: wrap;
`;

const ToolbarRight = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
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
  &:hover { border-color: ${({ theme }) => theme.colors.primary}; color: ${({ theme }) => theme.colors.primary}; }
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

const PrimaryButton = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  border-radius: 4px;
  &:hover { background: ${({ theme }) => theme.colors.primaryHover}; }
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
  &:last-child { border-bottom: none; }
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
`;

const Td = styled.td`
  padding: 10px 12px;
  color: ${({ theme }) => theme.colors.textPrimary};
  vertical-align: middle;
`;

const TitleText = styled.span`
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
  max-width: 400px;
`;

const ActionRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const TextButton = styled.button`
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px 8px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 3px;
  color: ${({ theme }) => theme.colors.textSecondary};
  transition: all ${({ theme }) => theme.transitions.fast};
  &:hover { border-color: ${({ theme }) => theme.colors.primary}; color: ${({ theme }) => theme.colors.primary}; }
`;

const DangerButton = styled(TextButton)`
  &:hover { border-color: ${({ theme }) => theme.colors.error}; color: ${({ theme }) => theme.colors.error}; }
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
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
`;

const Modal = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: ${({ theme }) => theme.shadows.lg};
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.xl};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const ModalTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`;

const CloseButton = styled.button`
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.textMuted};
  &:hover { color: ${({ theme }) => theme.colors.textPrimary}; }
`;

const ModalForm = styled.form`
  padding: ${({ theme }) => theme.spacing.xl};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const FormRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const Label = styled.label`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Input = styled.input`
  padding: 8px 12px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  outline: none;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
`;

const Select = styled.select`
  padding: 8px 12px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  outline: none;
  background: white;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
`;

const Textarea = styled.textarea`
  padding: 8px 12px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  resize: vertical;
  outline: none;
  line-height: 1.6;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
`;

const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.sm};
  padding-top: ${({ theme }) => theme.spacing.sm};
`;

const CancelButton = styled.button`
  padding: 7px 16px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
`;

const SubmitButton = styled.button`
  padding: 7px 16px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  border-radius: 4px;
  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.primaryHover}; }
  &:disabled { opacity: 0.5; }
`;

const DialogBox = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  width: 100%;
  max-width: 400px;
  padding: ${({ theme }) => theme.spacing.xxl};
  box-shadow: ${({ theme }) => theme.shadows.lg};
`;

const DialogTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const DialogDesc = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  line-height: 1.6;
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const DialogFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const DeleteConfirmButton = styled.button`
  padding: 7px 16px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  background: ${({ theme }) => theme.colors.error};
  color: #fff;
  border-radius: 4px;
  &:hover:not(:disabled) { opacity: 0.85; }
  &:disabled { opacity: 0.5; }
`;
