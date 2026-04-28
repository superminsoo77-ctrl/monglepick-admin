/**
 * FAQ 관리 탭 컴포넌트.
 *
 * 기능:
 * - FAQ 목록 테이블 (질문, 카테고리, 공개여부, 순서, 액션)
 * - 카테고리 필터
 * - 등록/수정 모달 (category, question, answer, isPublished)
 * - 삭제 확인 다이얼로그
 * - 페이지네이션
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { MdAdd, MdEdit, MdDelete, MdRefresh } from 'react-icons/md';
import { fetchFaqs, createFaq, updateFaq, deleteFaq } from '../api/supportApi';
import StatusBadge from '@/shared/components/StatusBadge';
import { useQueryParams } from '@/shared/hooks/useQueryParams';
import { useAiPrefill } from '@/shared/hooks/useAiPrefill';
import AiPrefillBanner from '@/shared/components/AiPrefillBanner';

/**
 * FAQ 카테고리 옵션.
 *
 * <p>Backend {@code SupportCategory} enum 과 1:1 동기화되어야 한다.
 * 정의 위치: {@code monglepick-backend/.../domain/support/entity/SupportCategory.java}</p>
 *
 * <p>허용 값: GENERAL / ACCOUNT / CHAT / RECOMMENDATION / COMMUNITY / PAYMENT (6종)</p>
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

/** 카테고리 API 값 → 한국어 라벨 매핑 (목록/상세 표시용) */
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
 * 기본 카테고리는 Backend enum 이 실제로 허용하는 값으로 설정해야 한다.
 * (과거 'SERVICE' 였던 시기에 모든 FAQ 등록이 400 으로 실패했던 버그 수정)
 */
const INITIAL_FORM = {
  category: 'GENERAL',
  question: '',
  answer: '',
  isPublished: true,
};

export default function FaqTab() {
  /* ── URL 쿼리파라미터 / AI prefill ── */
  /**
   * ?modal=create  → FAQ 등록 모달 자동 오픈
   * AI 어시스턴트가 draft 를 location.state 에 심어두면 모달 초기값으로 주입.
   * draft 필드명: category, question, answer, tags (현재 폼은 tags 미지원 → 무시)
   */
  const { modal: queryModal } = useQueryParams();
  const { draft, bannerText } = useAiPrefill();

  /* ── 목록 상태 ── */
  const [faqs, setFaqs] = useState([]);
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

  /** FAQ 목록 조회 */
  const loadFaqs = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page, size: PAGE_SIZE };
      if (filterCategory) params.category = filterCategory;
      const result = await fetchFaqs(params);
      setFaqs(result?.content ?? result ?? []);
      setTotal(result?.totalElements ?? (result?.length ?? 0));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filterCategory]);

  useEffect(() => { loadFaqs(); }, [loadFaqs]);

  /**
   * ?modal=create 쿼리가 있으면 FAQ 등록 모달을 자동 오픈.
   * draft 가 있으면 category/question/answer 필드를 초기값으로 주입.
   * (tags 필드는 현재 FaqTab 폼에 없으므로 무시)
   */
  useEffect(() => {
    if (queryModal !== 'create' || modalOpen) return;
    const prefill = draft
      ? {
          ...INITIAL_FORM,
          category:    draft.category ?? INITIAL_FORM.category,
          question:    draft.question ?? INITIAL_FORM.question,
          answer:      draft.answer   ?? INITIAL_FORM.answer,
        }
      : INITIAL_FORM;
    setEditTarget(null);
    setForm(prefill);
    setModalOpen(true);
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
  function openEditModal(faq) {
    setEditTarget(faq);
    setForm({
      /* Backend SupportCategory enum 값을 그대로 사용. 기본값은 INITIAL_FORM 과 통일. */
      category: faq.category ?? 'GENERAL',
      question: faq.question ?? '',
      answer: faq.answer ?? '',
      isPublished: faq.isPublished ?? true,
    });
    setModalOpen(true);
  }

  /** 폼 필드 변경 핸들러 */
  function handleFormChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  }

  /** 등록/수정 제출 */
  async function handleFormSubmit(e) {
    e.preventDefault();
    if (!form.question.trim()) { alert('질문을 입력해주세요.'); return; }
    if (!form.answer.trim()) { alert('답변을 입력해주세요.'); return; }

    try {
      setFormLoading(true);
      if (editTarget) {
        await updateFaq(editTarget.id, form);
      } else {
        await createFaq(form);
      }
      setModalOpen(false);
      loadFaqs();
    } catch (err) {
      alert(err.message || '처리 중 오류가 발생했습니다.');
    } finally {
      setFormLoading(false);
    }
  }

  /** 삭제 확인 다이얼로그 오픈 */
  function openDeleteDialog(faq) {
    setDeleteTarget(faq);
  }

  /** 삭제 실행 */
  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleteLoading(true);
      await deleteFaq(deleteTarget.id);
      setDeleteTarget(null);
      loadFaqs();
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
          <IconButton onClick={loadFaqs} disabled={loading} title="새로고침">
            <MdRefresh size={16} />
          </IconButton>
          <PrimaryButton onClick={openCreateModal}>
            <MdAdd size={16} />
            FAQ 등록
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
              <Th>질문</Th>
              <Th $w="100px">카테고리</Th>
              <Th $w="70px">공개</Th>
              <Th $w="60px">순서</Th>
              <Th $w="100px">액션</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5}><CenterCell>불러오는 중...</CenterCell></td></tr>
            ) : faqs.length === 0 ? (
              <tr><td colSpan={5}><CenterCell>FAQ가 없습니다.</CenterCell></td></tr>
            ) : (
              faqs.map((faq) => (
                <Tr key={faq.id}>
                  <Td>
                    <QuestionText>{faq.question}</QuestionText>
                  </Td>
                  <Td>
                    <StatusBadge
                      status="info"
                      label={CATEGORY_LABELS[faq.category] ?? faq.category}
                    />
                  </Td>
                  <Td>
                    <StatusBadge
                      status={faq.isPublished ? 'success' : 'default'}
                      label={faq.isPublished ? '공개' : '비공개'}
                    />
                  </Td>
                  <Td>{faq.displayOrder ?? '-'}</Td>
                  <Td>
                    <ActionRow>
                      <TextButton onClick={() => openEditModal(faq)}>
                        <MdEdit size={14} /> 수정
                      </TextButton>
                      <DangerButton onClick={() => openDeleteDialog(faq)}>
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
              <ModalTitle>{editTarget ? 'FAQ 수정' : 'FAQ 등록'}</ModalTitle>
              <CloseButton onClick={() => setModalOpen(false)}>✕</CloseButton>
            </ModalHeader>

            <ModalForm onSubmit={handleFormSubmit}>
              {/* ── AI 어시스턴트 prefill 안내 배너 (draft 가 있을 때만 노출) ── */}
              {bannerText && <AiPrefillBanner text={bannerText} />}

              <FormRow>
                <Label>카테고리 *</Label>
                <Select name="category" value={form.category} onChange={handleFormChange}>
                  {CATEGORIES.slice(1).map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </Select>
              </FormRow>

              <FormRow>
                <Label>질문 *</Label>
                <Input
                  name="question"
                  value={form.question}
                  onChange={handleFormChange}
                  placeholder="자주 묻는 질문을 입력하세요."
                  maxLength={300}
                />
              </FormRow>

              <FormRow>
                <Label>답변 *</Label>
                <Textarea
                  name="answer"
                  value={form.answer}
                  onChange={handleFormChange}
                  placeholder="질문에 대한 답변을 입력하세요."
                  rows={7}
                />
              </FormRow>

              <CheckRow>
                <CheckLabel>
                  <input
                    type="checkbox"
                    name="isPublished"
                    checked={form.isPublished}
                    onChange={handleFormChange}
                  />
                  즉시 공개
                </CheckLabel>
              </CheckRow>

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
            <DialogTitle>FAQ 삭제</DialogTitle>
            <DialogDesc>
              <strong>"{deleteTarget.question}"</strong>
              <br />위 FAQ를 삭제합니다. 이 작업은 되돌릴 수 없습니다.
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

const QuestionText = styled.span`
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
  max-width: 420px;
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

const CheckRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xl};
`;

const CheckLabel = styled.label`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  user-select: none;
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
