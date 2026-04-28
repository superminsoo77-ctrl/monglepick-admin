/**
 * 약관/정책 관리 서브탭.
 *
 * 기능:
 * - 약관 목록 테이블 (제목, 유형, 버전, 필수여부, 활성여부, 생성일, 액션)
 * - 등록/수정 모달 (title, content, type, version, isRequired)
 * - 삭제 확인 다이얼로그
 * - 페이지네이션 (10건/페이지)
 *
 * Phase G P1 (2026-04-23):
 * - ?modal=create 쿼리 시 약관 등록 모달 자동 오픈
 * - AI 어시스턴트 draft(term_draft) → 모달 초기값 주입
 *   draft 필드: type, version, content
 * - 모달 상단 AiPrefillBanner 노출 (draft && isAiGenerated 조건)
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { MdAdd, MdEdit, MdDelete, MdRefresh } from 'react-icons/md';
import { fetchTerms, createTerm, updateTerm, deleteTerm } from '../api/settingsApi';
import StatusBadge from '@/shared/components/StatusBadge';
import { useQueryParams } from '@/shared/hooks/useQueryParams';
import { useAiPrefill } from '@/shared/hooks/useAiPrefill';
import AiPrefillBanner from '@/shared/components/AiPrefillBanner';

/** 약관 유형 옵션 */
const TERM_TYPES = [
  { value: 'TERMS_OF_SERVICE', label: '서비스 이용약관' },
  { value: 'PRIVACY_POLICY', label: '개인정보 처리방침' },
  { value: 'MARKETING', label: '마케팅 수신 동의' },
];

/** 유형 한국어 라벨 맵 */
const TYPE_LABELS = {
  TERMS_OF_SERVICE: '서비스 이용약관',
  PRIVACY_POLICY: '개인정보 처리방침',
  MARKETING: '마케팅 동의',
};

/** 등록/수정 모달 초기값 */
const INITIAL_FORM = {
  title: '',
  content: '',
  type: 'TERMS_OF_SERVICE',
  version: '',
  isRequired: true,
};

/** 날짜 포맷 함수 */
function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export default function TermsTab() {
  /* ── URL 쿼리파라미터 / AI prefill ── */
  /**
   * ?modal=create → 약관 등록 모달 자동 오픈.
   * AI 어시스턴트가 draft(term_draft)를 location.state 에 심어두면
   * 모달 초기값(type, version, content)으로 주입한다.
   */
  const { modal: queryModal } = useQueryParams();
  const { draft, bannerText } = useAiPrefill();

  /* ── 목록 상태 ── */
  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* ── 페이지네이션 상태 ── */
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const PAGE_SIZE = 10;

  /* ── 등록/수정 모달 상태 ── */
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // null: 신규, Object: 수정 대상
  const [form, setForm] = useState(INITIAL_FORM);
  const [formLoading, setFormLoading] = useState(false);

  /* ── 삭제 확인 다이얼로그 상태 ── */
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  /** 약관 목록 조회 */
  const loadTerms = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchTerms({ page, size: PAGE_SIZE });
      // 페이징 응답 구조: { content: [], totalPages: n } 또는 배열
      setTerms(result?.content ?? (Array.isArray(result) ? result : []));
      setTotalPages(result?.totalPages ?? 0);
    } catch (err) {
      setError(err.message ?? '약관 목록 조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadTerms();
  }, [loadTerms]);

  /**
   * 쿼리파라미터 자동 모달 오픈 처리.
   *
   * - ?modal=create : 약관 등록 모달을 즉시 오픈.
   *   draft(term_draft)가 있으면 type/version/content 폼 초기값으로 주입.
   *   draft.type 이 TERM_TYPES 에 없는 값이면 INITIAL_FORM 기본값(TERMS_OF_SERVICE) 사용.
   *
   * 이미 모달이 열려 있으면 중복 실행 방지.
   */
  useEffect(() => {
    if (!queryModal || modalOpen) return;

    if (queryModal === 'create') {
      const validTypes = TERM_TYPES.map((t) => t.value);
      const mappedType = draft?.type && validTypes.includes(draft.type)
        ? draft.type
        : INITIAL_FORM.type;
      const prefill = draft
        ? {
            ...INITIAL_FORM,
            type:    mappedType,
            version: draft.version ?? INITIAL_FORM.version,
            content: draft.content ?? INITIAL_FORM.content,
          }
        : INITIAL_FORM;
      setEditTarget(null);
      setForm(prefill);
      setModalOpen(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryModal]);

  /* ── 모달 열기 (신규 등록) ── */
  function openCreateModal() {
    setEditTarget(null);
    setForm(INITIAL_FORM);
    setModalOpen(true);
  }

  /* ── 모달 열기 (수정) ── */
  function openEditModal(term) {
    setEditTarget(term);
    setForm({
      title: term.title ?? '',
      content: term.content ?? '',
      type: term.type ?? 'TERMS_OF_SERVICE',
      version: term.version ?? '',
      isRequired: term.isRequired ?? true,
    });
    setModalOpen(true);
  }

  /** 폼 필드 변경 핸들러 (input/select/textarea/checkbox 통합) */
  function handleFormChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  }

  /** 등록/수정 제출 */
  async function handleFormSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) {
      alert('제목을 입력해주세요.');
      return;
    }
    if (!form.content.trim()) {
      alert('내용을 입력해주세요.');
      return;
    }
    if (!form.version.trim()) {
      alert('버전을 입력해주세요. (예: 1.0)');
      return;
    }

    try {
      setFormLoading(true);
      const id = editTarget?.id ?? editTarget?.termId;
      if (editTarget) {
        await updateTerm(id, form);
      } else {
        await createTerm(form);
      }
      setModalOpen(false);
      // 등록 후 첫 페이지로 이동하여 최신 데이터 확인
      if (!editTarget) setPage(0);
      else loadTerms();
    } catch (err) {
      alert(err.message ?? '처리 중 오류가 발생했습니다.');
    } finally {
      setFormLoading(false);
    }
  }

  /* ── 삭제 다이얼로그 오픈 ── */
  function openDeleteDialog(term) {
    setDeleteTarget(term);
  }

  /** 삭제 실행 */
  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleteLoading(true);
      const id = deleteTarget.id ?? deleteTarget.termId;
      await deleteTerm(id);
      setDeleteTarget(null);
      loadTerms();
    } catch (err) {
      alert(err.message ?? '삭제 중 오류가 발생했습니다.');
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <Container>
      {/* ── 툴바 ── */}
      <Toolbar>
        <ToolbarLeft>
          <SectionTitle>약관/정책 관리</SectionTitle>
        </ToolbarLeft>
        <ToolbarRight>
          <IconButton onClick={loadTerms} disabled={loading} title="새로고침">
            <MdRefresh size={16} />
          </IconButton>
          <PrimaryButton onClick={openCreateModal}>
            <MdAdd size={16} />
            약관 등록
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
              <Th $w="160px">유형</Th>
              <Th $w="80px">버전</Th>
              <Th $w="80px">필수</Th>
              <Th $w="80px">활성</Th>
              <Th $w="110px">생성일</Th>
              <Th $w="100px">액션</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7}>
                  <CenterCell>불러오는 중...</CenterCell>
                </td>
              </tr>
            ) : terms.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <CenterCell>등록된 약관이 없습니다.</CenterCell>
                </td>
              </tr>
            ) : (
              terms.map((term) => (
                <Tr key={term.id ?? term.termId}>
                  <Td>
                    <TitleText>{term.title}</TitleText>
                  </Td>
                  <Td>
                    <StatusBadge
                      status="info"
                      label={TYPE_LABELS[term.type] ?? term.type ?? '-'}
                    />
                  </Td>
                  <Td>{term.version ?? '-'}</Td>
                  <Td>
                    <StatusBadge
                      status={term.isRequired ? 'warning' : 'default'}
                      label={term.isRequired ? '필수' : '선택'}
                    />
                  </Td>
                  <Td>
                    <StatusBadge
                      status={term.isActive !== false ? 'success' : 'default'}
                      label={term.isActive !== false ? '활성' : '비활성'}
                    />
                  </Td>
                  <Td>{formatDate(term.createdAt)}</Td>
                  <Td>
                    <ActionRow>
                      <TextButton onClick={() => openEditModal(term)}>
                        <MdEdit size={13} /> 수정
                      </TextButton>
                      <DangerButton onClick={() => openDeleteDialog(term)}>
                        <MdDelete size={13} /> 삭제
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
          <PageButton onClick={() => setPage((p) => p - 1)} disabled={page === 0}>
            이전
          </PageButton>
          <PageInfo>
            {page + 1} / {totalPages}
          </PageInfo>
          <PageButton
            onClick={() => setPage((p) => p + 1)}
            disabled={page + 1 >= totalPages}
          >
            다음
          </PageButton>
        </Pagination>
      )}

      {/* ── 등록/수정 모달 ── */}
      {modalOpen && (
        <Overlay onClick={() => setModalOpen(false)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>{editTarget ? '약관 수정' : '약관 등록'}</ModalTitle>
              <CloseButton onClick={() => setModalOpen(false)}>✕</CloseButton>
            </ModalHeader>

            <ModalForm onSubmit={handleFormSubmit}>
              {/* ── AI 어시스턴트 prefill 안내 배너 (draft 가 있을 때만 노출) ── */}
              {bannerText && <AiPrefillBanner text={bannerText} />}

              {/* 제목 */}
              <FormRow>
                <Label>제목 *</Label>
                <Input
                  name="title"
                  value={form.title}
                  onChange={handleFormChange}
                  placeholder="약관 제목을 입력하세요"
                  maxLength={200}
                />
              </FormRow>

              {/* 유형 */}
              <FormRow>
                <Label>유형 *</Label>
                <StyledSelect name="type" value={form.type} onChange={handleFormChange}>
                  {TERM_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </StyledSelect>
              </FormRow>

              {/* 버전 */}
              <FormRow>
                <Label>버전 *</Label>
                <Input
                  name="version"
                  value={form.version}
                  onChange={handleFormChange}
                  placeholder="예: 1.0, 2.1"
                  maxLength={20}
                />
              </FormRow>

              {/* 내용 */}
              <FormRow>
                <Label>내용 *</Label>
                <Textarea
                  name="content"
                  value={form.content}
                  onChange={handleFormChange}
                  placeholder="약관 본문을 입력하세요"
                  rows={8}
                />
              </FormRow>

              {/* 필수 여부 체크박스 */}
              <CheckLabel>
                <input
                  type="checkbox"
                  name="isRequired"
                  checked={form.isRequired}
                  onChange={handleFormChange}
                />
                필수 동의 약관
              </CheckLabel>

              <ModalFooter>
                <CancelButton type="button" onClick={() => setModalOpen(false)}>
                  취소
                </CancelButton>
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
            <DialogTitle>약관 삭제</DialogTitle>
            <DialogDesc>
              <strong>"{deleteTarget.title}"</strong>을(를) 삭제합니다.
              <br />
              이 작업은 되돌릴 수 없습니다.
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
  align-items: center;
`;

const ToolbarRight = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const SectionTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
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
  transition: background ${({ theme }) => theme.transitions.fast};
  &:hover {
    background: ${({ theme }) => theme.colors.bgHover};
  }
  &:disabled {
    opacity: 0.4;
  }
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
  transition: background ${({ theme }) => theme.transitions.fast};
  &:hover {
    background: ${({ theme }) => theme.colors.primaryHover};
  }
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
  &:last-child {
    border-bottom: none;
  }
  &:hover {
    background: ${({ theme }) => theme.colors.bgHover};
  }
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
  max-width: 280px;
  display: block;
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
  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.primary};
  }
`;

const DangerButton = styled(TextButton)`
  &:hover {
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
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.bgHover};
  }
  &:disabled {
    opacity: 0.4;
  }
`;

const PageInfo = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
`;

/* ── 모달 공통 ── */

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
  max-width: 580px;
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
  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
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
  width: 100%;
  &:focus {
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const StyledSelect = styled.select`
  padding: 8px 12px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  outline: none;
  background: white;
  width: 100%;
  &:focus {
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const Textarea = styled.textarea`
  padding: 8px 12px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  resize: vertical;
  outline: none;
  line-height: 1.6;
  width: 100%;
  &:focus {
    border-color: ${({ theme }) => theme.colors.primary};
  }
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
  &:hover {
    background: ${({ theme }) => theme.colors.bgHover};
  }
`;

const SubmitButton = styled.button`
  padding: 7px 16px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  border-radius: 4px;
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primaryHover};
  }
  &:disabled {
    opacity: 0.5;
  }
`;

/* ── 삭제 다이얼로그 ── */

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
  &:hover:not(:disabled) {
    opacity: 0.85;
  }
  &:disabled {
    opacity: 0.5;
  }
`;
