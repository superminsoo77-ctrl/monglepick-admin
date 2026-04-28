/**
 * 게시글 관리 탭 컴포넌트.
 *
 * 기능:
 * - 게시글 목록 테이블 (title, category, userId, viewCount, likeCount, commentCount, isBlinded, isDeleted, 작성일, 액션)
 * - 상단: keyword 검색 input + category select + 새로고침
 * - 수정 모달: title / content / category / editReason 필드
 * - 삭제 확인 다이얼로그
 * - 페이지네이션
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { MdRefresh, MdEdit, MdDelete, MdSearch } from 'react-icons/md';
import { fetchPosts, updatePost, deletePost } from '../api/contentApi';
import StatusBadge from '@/shared/components/StatusBadge';

/** 게시글 카테고리 옵션 */
const CATEGORY_OPTIONS = [
  { value: '', label: '전체 카테고리' },
  { value: 'FREE', label: '자유' },
  { value: 'DISCUSSION', label: '토론' },
  { value: 'RECOMMENDATION', label: '추천' },
  { value: 'NEWS', label: '뉴스' },
];

/** 카테고리 한국어 라벨 */
const CATEGORY_LABELS = {
  FREE: '자유',
  DISCUSSION: '토론',
  RECOMMENDATION: '추천',
  NEWS: '뉴스',
};

/** 수정 폼 초기값 */
const INITIAL_FORM = {
  title: '',
  content: '',
  category: 'FREE',
  editReason: '',
};

/** 페이지당 항목 수 */
const PAGE_SIZE = 10;

/**
 * 날짜 문자열을 YYYY.MM.DD HH:MM 형식으로 포맷.
 * @param {string} dateStr - ISO 날짜 문자열
 * @returns {string}
 */
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 백엔드 DTO 호환: postId / id 둘 다 허용 */
function getPostId(post) {
  return post?.id ?? post?.postId ?? null;
}

export default function PostTab() {
  /* ── 목록 상태 ── */
  const [posts, setPosts] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* ── 필터/페이지 상태 ── */
  const [keyword, setKeyword] = useState('');
  const [keywordInput, setKeywordInput] = useState(''); // 입력 버퍼 (엔터/버튼 확정)
  const [filterCategory, setFilterCategory] = useState('');
  const [page, setPage] = useState(0);

  /* ── 수정 모달 상태 ── */
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [formLoading, setFormLoading] = useState(false);

  /* ── 삭제 확인 다이얼로그 상태 ── */
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  /** 게시글 목록 조회 */
  const loadPosts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = { page, size: PAGE_SIZE };
      if (keyword) params.keyword = keyword;
      if (filterCategory) params.category = filterCategory;
      const result = await fetchPosts(params);
      setPosts(result?.content ?? []);
      setTotalPages(result?.totalPages ?? 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, keyword, filterCategory]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  /** 키워드 검색 확정 (엔터 또는 버튼 클릭) */
  function handleSearch() {
    setKeyword(keywordInput.trim());
    setPage(0);
  }

  /** 검색 input에서 엔터 처리 */
  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSearch();
  }

  /** 카테고리 필터 변경 시 첫 페이지로 초기화 */
  function handleCategoryChange(e) {
    setFilterCategory(e.target.value);
    setPage(0);
  }

  /** 수정 모달 열기 */
  function openEditModal(post) {
    setEditTarget(post);
    setForm({
      title: post.title ?? '',
      content: post.content ?? '',
      category: post.category ?? 'FREE',
      editReason: '',
    });
  }

  /** 수정 모달 닫기 */
  function closeEditModal() {
    setEditTarget(null);
  }

  /** 폼 필드 변경 핸들러 */
  function handleFormChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  /** 게시글 수정 제출 */
  async function handleEditSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) { alert('제목을 입력해주세요.'); return; }
    if (!form.content.trim()) { alert('내용을 입력해주세요.'); return; }
    if (!form.editReason.trim()) { alert('수정 사유를 입력해주세요.'); return; }

    const postId = getPostId(editTarget);
    if (postId == null) {
      alert('수정할 게시글 ID를 찾을 수 없습니다.');
      return;
    }

    try {
      setFormLoading(true);
      await updatePost(postId, form);
      closeEditModal();
      loadPosts();
    } catch (err) {
      alert(err.message || '수정 중 오류가 발생했습니다.');
    } finally {
      setFormLoading(false);
    }
  }

  /** 삭제 다이얼로그 열기 */
  function openDeleteDialog(post) {
    setDeleteTarget(post);
  }

  /** 삭제 다이얼로그 닫기 */
  function closeDeleteDialog() {
    setDeleteTarget(null);
  }

  /** 게시글 삭제 실행 */
  async function handleDelete() {
    if (!deleteTarget) return;
    const postId = getPostId(deleteTarget);
    if (postId == null) {
      alert('삭제할 게시글 ID를 찾을 수 없습니다.');
      return;
    }
    try {
      setDeleteLoading(true);
      await deletePost(postId);
      closeDeleteDialog();
      loadPosts();
    } catch (err) {
      alert(err.message || '삭제 중 오류가 발생했습니다.');
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <Container>
      {/* ── 툴바: 키워드 검색 + 카테고리 필터 + 새로고침 ── */}
      <Toolbar>
        <ToolbarLeft>
          {/* 키워드 검색 */}
          <SearchWrap>
            <SearchInput
              type="text"
              placeholder="제목/내용 검색..."
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <SearchButton onClick={handleSearch}>
              <MdSearch size={16} />
            </SearchButton>
          </SearchWrap>
          {/* 카테고리 select */}
          <FilterSelect value={filterCategory} onChange={handleCategoryChange}>
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </FilterSelect>
        </ToolbarLeft>
        <ToolbarRight>
          <IconButton onClick={loadPosts} disabled={loading} title="새로고침">
            <MdRefresh size={16} />
          </IconButton>
        </ToolbarRight>
      </Toolbar>

      {/* ── 에러 메시지 ── */}
      {error && <ErrorMsg>{error}</ErrorMsg>}

      {/* ── 게시글 목록 테이블 ── */}
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>제목</Th>
              <Th $w="80px">카테고리</Th>
              <Th $w="110px">작성자 ID</Th>
              <Th $w="70px">조회수</Th>
              <Th $w="70px">좋아요</Th>
              <Th $w="70px">댓글수</Th>
              <Th $w="80px">블라인드</Th>
              <Th>수정 사유</Th>
              <Th $w="140px">작성일</Th>
              <Th $w="100px">액션</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9}>
                  <CenterCell>불러오는 중...</CenterCell>
                </td>
              </tr>
            ) : posts.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <CenterCell>게시글이 없습니다.</CenterCell>
                </td>
              </tr>
            ) : (
              posts.map((post) => (
                <Tr key={getPostId(post) ?? `${post.userId}-${post.createdAt}`}>
                  {/* 제목 */}
                  <Td>
                    <TitleText>{post.title ?? '-'}</TitleText>
                  </Td>
                  {/* 카테고리 */}
                  <Td>
                    <StatusBadge
                      status="info"
                      label={CATEGORY_LABELS[post.category] ?? post.category ?? '-'}
                    />
                  </Td>
                  {/* 작성자 ID */}
                  <Td>
                    <MutedText>{post.userId ?? '-'}</MutedText>
                  </Td>
                  {/* 조회수 */}
                  <Td>
                    <MutedText>{(post.viewCount ?? 0).toLocaleString()}</MutedText>
                  </Td>
                  {/* 좋아요 */}
                  <Td>
                    <MutedText>{(post.likeCount ?? 0).toLocaleString()}</MutedText>
                  </Td>
                  {/* 댓글수 */}
                  <Td>
                    <MutedText>{(post.commentCount ?? 0).toLocaleString()}</MutedText>
                  </Td>
                  {/* 블라인드 여부 */}
                  <Td>
                    <StatusBadge
                      status={post.isBlinded ? 'warning' : 'default'}
                      label={post.isBlinded ? '블라인드' : '정상'}
                    />
                  </Td>
                  {/* 수정 사유 */}
                  <Td>
                    <EditReasonText title={post.adminEditReason ?? ''}>
                      {post.adminEditReason ?? '-'}
                    </EditReasonText>
                  </Td>
                  {/* 작성일 */}
                  <Td>
                    <MutedText>{formatDate(post.createdAt)}</MutedText>
                  </Td>
                  {/* 액션 버튼 */}
                  <Td>
                    <ActionRow>
                      <TextButton onClick={() => openEditModal(post)}>
                        <MdEdit size={13} /> 수정
                      </TextButton>
                      <DangerButton onClick={() => openDeleteDialog(post)}>
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
          <PageInfo>{page + 1} / {totalPages}</PageInfo>
          <PageButton onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= totalPages}>
            다음
          </PageButton>
        </Pagination>
      )}

      {/* ── 수정 모달 ── */}
      {editTarget && (
        <Overlay onClick={closeEditModal}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>게시글 수정</ModalTitle>
              <CloseButton onClick={closeEditModal}>✕</CloseButton>
            </ModalHeader>

            <ModalForm onSubmit={handleEditSubmit}>
              {/* 제목 */}
              <FormRow>
                <Label>제목 *</Label>
                <Input
                  name="title"
                  value={form.title}
                  onChange={handleFormChange}
                  placeholder="게시글 제목"
                  maxLength={200}
                />
              </FormRow>

              {/* 카테고리 */}
              <FormRow>
                <Label>카테고리 *</Label>
                <Select name="category" value={form.category} onChange={handleFormChange}>
                  {CATEGORY_OPTIONS.slice(1).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </FormRow>

              {/* 내용 */}
              <FormRow>
                <Label>내용 *</Label>
                <Textarea
                  name="content"
                  value={form.content}
                  onChange={handleFormChange}
                  placeholder="게시글 내용"
                  rows={8}
                />
              </FormRow>

              {/* 수정 사유 */}
              <FormRow>
                <Label>수정 사유 *</Label>
                <Input
                  name="editReason"
                  value={form.editReason}
                  onChange={handleFormChange}
                  placeholder="관리자 수정 사유를 입력해주세요."
                  maxLength={500}
                />
              </FormRow>

              <ModalFooter>
                <CancelButton type="button" onClick={closeEditModal}>
                  취소
                </CancelButton>
                <SubmitButton type="submit" disabled={formLoading}>
                  {formLoading ? '저장 중...' : '수정 완료'}
                </SubmitButton>
              </ModalFooter>
            </ModalForm>
          </Modal>
        </Overlay>
      )}

      {/* ── 삭제 확인 다이얼로그 ── */}
      {deleteTarget && (
        <Overlay onClick={closeDeleteDialog}>
          <DialogBox onClick={(e) => e.stopPropagation()}>
            <DialogTitle>게시글 삭제</DialogTitle>
            <DialogDesc>
              <strong>"{deleteTarget.title}"</strong>을(를) 삭제합니다.
              <br />이 작업은 되돌릴 수 없습니다.
            </DialogDesc>
            <DialogFooter>
              <CancelButton onClick={closeDeleteDialog}>취소</CancelButton>
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
  gap: ${({ theme }) => theme.spacing.sm};
  flex-wrap: wrap;
`;

const ToolbarRight = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

/** 검색 input + 버튼 묶음 */
const SearchWrap = styled.div`
  display: flex;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  overflow: hidden;
`;

const SearchInput = styled.input`
  padding: 6px 10px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: none;
  outline: none;
  width: 200px;
`;

const SearchButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  background: ${({ theme }) => theme.colors.bgHover};
  border-left: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textSecondary};
  transition: background ${({ theme }) => theme.transitions.fast};
  &:hover { background: ${({ theme }) => theme.colors.border}; }
`;

const FilterSelect = styled.select`
  padding: 6px 10px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  outline: none;
  background: white;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
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
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
  &:disabled { opacity: 0.4; }
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
  display: block;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
`;

const MutedText = styled.span`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.xs};
`;

const EditReasonText = styled.span`
  display: block;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
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
  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.bgHover}; }
  &:disabled { opacity: 0.4; }
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
  &:hover:not(:disabled) { opacity: 0.85; }
  &:disabled { opacity: 0.5; }
`;
