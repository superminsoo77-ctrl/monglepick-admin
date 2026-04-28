/**
 * 배너 관리 서브탭.
 *
 * 기능:
 * - 배너 목록 테이블 (제목, 이미지 썸네일, 링크, 위치, 순서, 활성여부, 기간, 액션)
 * - 등록/수정 모달 (title, imageUrl, linkUrl, position, sortOrder, isActive, startDate, endDate)
 * - 삭제 확인 다이얼로그
 * - 페이지네이션 (10건/페이지)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { MdAdd, MdEdit, MdDelete, MdRefresh, MdBrokenImage } from 'react-icons/md';
import { fetchBanners, createBanner, updateBanner, deleteBanner } from '../api/settingsApi';
import StatusBadge from '@/shared/components/StatusBadge';
import { useAiPrefill } from '@/shared/hooks/useAiPrefill';
import AiPrefillBanner from '@/shared/components/AiPrefillBanner';

/** 배너 위치 옵션 */
const POSITIONS = [
  { value: 'MAIN', label: '메인' },
  { value: 'SUB', label: '서브' },
  { value: 'POPUP', label: '팝업' },
];

/** 위치 한국어 라벨 맵 */
const POSITION_LABELS = {
  MAIN: '메인',
  SUB: '서브',
  POPUP: '팝업',
};

/** 등록/수정 모달 초기값 */
const INITIAL_FORM = {
  title: '',
  imageUrl: '',
  linkUrl: '',
  position: 'MAIN',
  sortOrder: 0,
  isActive: true,
  startDate: '',
  endDate: '',
};

/** 날짜 포맷 함수 (날짜만) */
function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/** 날짜 범위 문자열 조합 */
function formatDateRange(startDate, endDate) {
  const start = formatDate(startDate);
  const end = formatDate(endDate);
  if (start === '-' && end === '-') return '-';
  return `${start} ~ ${end}`;
}

/** date input용 날짜 포맷 (YYYY-MM-DD) */
function toDateInputValue(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toISOString().slice(0, 10);
}

export default function BannerTab({ aiModal = null }) {
  /* v3 Phase G: AI 어시스턴트 prefill. banner_draft target_path 로 진입 시
   * `location.state.draft` 에 담긴 초안을 INITIAL_FORM 필드명으로 매핑해 초기값 세팅. */
  const { draft: aiDraft, isAiGenerated } = useAiPrefill();
  const aiAutoOpenedRef = useRef(false);

  /* ── 목록 상태 ── */
  const [banners, setBanners] = useState([]);
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

  /** 배너 목록 조회 */
  const loadBanners = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchBanners({ page, size: PAGE_SIZE });
      setBanners(result?.content ?? (Array.isArray(result) ? result : []));
      setTotalPages(result?.totalPages ?? 0);
    } catch (err) {
      setError(err.message ?? '배너 목록 조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadBanners();
  }, [loadBanners]);

  /* ── 모달 열기 (신규 등록) ── */
  function openCreateModal(prefill = null) {
    setEditTarget(null);
    if (prefill) {
      /* Agent banner_draft 필드명 → BannerTab INITIAL_FORM 필드명 매핑.
       * link→linkUrl, priority→sortOrder 차이 보정. 누락 필드는 INITIAL_FORM 기본값. */
      setForm({
        ...INITIAL_FORM,
        title:    prefill.title    ?? INITIAL_FORM.title,
        imageUrl: prefill.imageUrl ?? INITIAL_FORM.imageUrl,
        linkUrl:  prefill.link     ?? prefill.linkUrl ?? INITIAL_FORM.linkUrl,
        position: prefill.position ?? INITIAL_FORM.position,
        sortOrder:
          prefill.priority  ?? prefill.sortOrder
            ?? INITIAL_FORM.sortOrder,
      });
    } else {
      setForm(INITIAL_FORM);
    }
    setModalOpen(true);
  }

  /* v3 Phase G: aiModal='create' 로 진입 시 등록 모달 자동 오픈 + aiDraft prefill. */
  useEffect(() => {
    if (aiModal !== 'create' || aiAutoOpenedRef.current || modalOpen) return;
    aiAutoOpenedRef.current = true;
    openCreateModal(aiDraft || null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiModal, aiDraft]);

  /* ── 모달 열기 (수정) ── */
  function openEditModal(banner) {
    setEditTarget(banner);
    setForm({
      title: banner.title ?? '',
      imageUrl: banner.imageUrl ?? '',
      linkUrl: banner.linkUrl ?? '',
      position: banner.position ?? 'MAIN',
      sortOrder: banner.sortOrder ?? 0,
      isActive: banner.isActive !== false,
      startDate: toDateInputValue(banner.startDate),
      endDate: toDateInputValue(banner.endDate),
    });
    setModalOpen(true);
  }

  /** 폼 필드 변경 핸들러 */
  function handleFormChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : type === 'number' ? Number(value) : value,
    }));
  }

  /**
   * 등록/수정 제출.
   *
   * QA #118 (2026-04-23): 배너 링크가 `/page` 같은 상대경로로 저장되면 Client 에서
   * `window.open(linkUrl)` 이 현재 도메인 기준으로 해석돼 관리자 도메인(5174)으로 튕긴다.
   * 저장 직전에 스킴을 검사해 ① 비어있으면 null 로 저장 ② `http(s)://` 로 시작하면 그대로
   * ③ `//` 프로토콜 상대 URL 은 그대로 ④ 그 외에는 `https://` 를 자동 prefix 한다.
   * 내부 앱 경로를 의도한 경우 운영자가 확인 버튼으로 명시적으로 허용한다.
   */
  async function handleFormSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) {
      alert('제목을 입력해주세요.');
      return;
    }
    if (!form.imageUrl.trim()) {
      alert('이미지 URL을 입력해주세요.');
      return;
    }

    const rawLink = (form.linkUrl ?? '').trim();
    let normalizedLink = rawLink || null;
    if (rawLink) {
      if (/^https?:\/\//i.test(rawLink) || rawLink.startsWith('//')) {
        normalizedLink = rawLink;
      } else if (rawLink.startsWith('/')) {
        // 절대 경로 — 운영자가 내부 앱 경로를 의도한 것인지 확인.
        const ok = confirm(
          `링크 URL 이 내부 경로("${rawLink}")로 저장됩니다.\n` +
            `유저 페이지(5173)/관리자 페이지(5174) 중 어느 쪽으로 열릴지는 클릭한 위치에 따라 달라질 수 있습니다.\n` +
            `외부 사이트로 열려야 한다면 "취소" 후 https:// 를 포함한 전체 URL 을 입력해주세요.`,
        );
        if (!ok) return;
        normalizedLink = rawLink;
      } else {
        // 프로토콜 누락 — https:// 자동 prefix (http:// 은 의도적으로 지양)
        normalizedLink = `https://${rawLink}`;
      }
    }

    try {
      setFormLoading(true);
      // 날짜 빈 문자열은 null로 변환, 링크 URL 은 위에서 정규화한 값 사용
      const payload = {
        ...form,
        linkUrl: normalizedLink,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
      };
      const id = editTarget?.id ?? editTarget?.bannerId;
      if (editTarget) {
        await updateBanner(id, payload);
      } else {
        await createBanner(payload);
      }
      setModalOpen(false);
      if (!editTarget) setPage(0);
      else loadBanners();
    } catch (err) {
      alert(err.message ?? '처리 중 오류가 발생했습니다.');
    } finally {
      setFormLoading(false);
    }
  }

  /* ── 삭제 다이얼로그 오픈 ── */
  function openDeleteDialog(banner) {
    setDeleteTarget(banner);
  }

  /** 삭제 실행 */
  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleteLoading(true);
      const id = deleteTarget.id ?? deleteTarget.bannerId;
      await deleteBanner(id);
      setDeleteTarget(null);
      loadBanners();
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
          <SectionTitle>배너 관리</SectionTitle>
        </ToolbarLeft>
        <ToolbarRight>
          <IconButton onClick={loadBanners} disabled={loading} title="새로고침">
            <MdRefresh size={16} />
          </IconButton>
          <PrimaryButton onClick={() => openCreateModal()}>
            <MdAdd size={16} />
            배너 등록
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
              <Th $w="80px">이미지</Th>
              <Th $w="180px">링크 URL</Th>
              <Th $w="70px">위치</Th>
              <Th $w="60px">순서</Th>
              <Th $w="70px">활성</Th>
              <Th $w="180px">기간</Th>
              <Th $w="100px">액션</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8}>
                  <CenterCell>불러오는 중...</CenterCell>
                </td>
              </tr>
            ) : banners.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <CenterCell>등록된 배너가 없습니다.</CenterCell>
                </td>
              </tr>
            ) : (
              banners.map((banner) => (
                <Tr key={banner.id ?? banner.bannerId}>
                  <Td>
                    <TitleText>{banner.title}</TitleText>
                  </Td>
                  <Td>
                    {/* 이미지 URL이 있으면 썸네일, 없으면 아이콘 */}
                    {banner.imageUrl ? (
                      <Thumbnail
                        src={banner.imageUrl}
                        alt={banner.title}
                        onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                      />
                    ) : (
                      <NoImage><MdBrokenImage size={18} /></NoImage>
                    )}
                    <NoImage style={{ display: 'none' }}>
                      <MdBrokenImage size={18} />
                    </NoImage>
                  </Td>
                  <Td>
                    {banner.linkUrl ? (
                      <LinkText href={banner.linkUrl} target="_blank" rel="noreferrer">
                        {banner.linkUrl.length > 30
                          ? banner.linkUrl.slice(0, 30) + '…'
                          : banner.linkUrl}
                      </LinkText>
                    ) : (
                      <MutedText>-</MutedText>
                    )}
                  </Td>
                  <Td>
                    <StatusBadge
                      status="info"
                      label={POSITION_LABELS[banner.position] ?? banner.position ?? '-'}
                    />
                  </Td>
                  <Td>{banner.sortOrder ?? 0}</Td>
                  <Td>
                    <StatusBadge
                      status={banner.isActive !== false ? 'success' : 'default'}
                      label={banner.isActive !== false ? '활성' : '비활성'}
                    />
                  </Td>
                  <Td>
                    <DateRangeText>
                      {formatDateRange(banner.startDate, banner.endDate)}
                    </DateRangeText>
                  </Td>
                  <Td>
                    <ActionRow>
                      <TextButton onClick={() => openEditModal(banner)}>
                        <MdEdit size={13} /> 수정
                      </TextButton>
                      <DangerButton onClick={() => openDeleteDialog(banner)}>
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
              <ModalTitle>{editTarget ? '배너 수정' : '배너 등록'}</ModalTitle>
              <CloseButton onClick={() => setModalOpen(false)}>✕</CloseButton>
            </ModalHeader>

            {/* v3 Phase G: AI 프리필 배너 — 신규 등록 모드 + AI 유래 draft 있을 때만 */}
            {!editTarget && isAiGenerated && aiDraft && <AiPrefillBanner />}

            <ModalForm onSubmit={handleFormSubmit}>
              {/* 제목 */}
              <FormRow>
                <Label>제목 *</Label>
                <Input
                  name="title"
                  value={form.title}
                  onChange={handleFormChange}
                  placeholder="배너 제목을 입력하세요"
                  maxLength={200}
                />
              </FormRow>

              {/* 이미지 URL */}
              <FormRow>
                <Label>이미지 URL *</Label>
                <Input
                  name="imageUrl"
                  value={form.imageUrl}
                  onChange={handleFormChange}
                  placeholder="https://example.com/image.jpg"
                />
                {/* 이미지 미리보기 */}
                {form.imageUrl && (
                  <PreviewWrap>
                    <PreviewImg src={form.imageUrl} alt="미리보기" />
                  </PreviewWrap>
                )}
              </FormRow>

              {/* 링크 URL */}
              <FormRow>
                <Label>링크 URL</Label>
                <Input
                  name="linkUrl"
                  value={form.linkUrl}
                  onChange={handleFormChange}
                  placeholder="https://example.com/page"
                />
              </FormRow>

              {/* 위치 + 순서 (2열 배치) */}
              <FormRowDouble>
                <FormRow>
                  <Label>위치 *</Label>
                  <StyledSelect name="position" value={form.position} onChange={handleFormChange}>
                    {POSITIONS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </StyledSelect>
                </FormRow>
                <FormRow>
                  <Label>표시 순서</Label>
                  <Input
                    type="number"
                    name="sortOrder"
                    value={form.sortOrder}
                    onChange={handleFormChange}
                    min={0}
                  />
                </FormRow>
              </FormRowDouble>

              {/* 기간 (시작일 ~ 종료일) */}
              <FormRowDouble>
                <FormRow>
                  <Label>시작일</Label>
                  <Input
                    type="date"
                    name="startDate"
                    value={form.startDate}
                    onChange={handleFormChange}
                  />
                </FormRow>
                <FormRow>
                  <Label>종료일</Label>
                  <Input
                    type="date"
                    name="endDate"
                    value={form.endDate}
                    onChange={handleFormChange}
                  />
                </FormRow>
              </FormRowDouble>

              {/* 활성 여부 체크박스 */}
              <CheckLabel>
                <input
                  type="checkbox"
                  name="isActive"
                  checked={form.isActive}
                  onChange={handleFormChange}
                />
                배너 활성화
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
            <DialogTitle>배너 삭제</DialogTitle>
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
  max-width: 200px;
  display: block;
`;

const Thumbnail = styled.img`
  width: 56px;
  height: 32px;
  object-fit: cover;
  border-radius: 3px;
  border: 1px solid ${({ theme }) => theme.colors.borderLight};
  display: block;
`;

const NoImage = styled.div`
  width: 56px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  border: 1px solid ${({ theme }) => theme.colors.borderLight};
  background: ${({ theme }) => theme.colors.bgHover};
  color: ${({ theme }) => theme.colors.textMuted};
`;

const LinkText = styled.a`
  color: ${({ theme }) => theme.colors.primary};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`;

const MutedText = styled.span`
  color: ${({ theme }) => theme.colors.textMuted};
`;

const DateRangeText = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  white-space: nowrap;
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

/* 두 열 나란히 배치 래퍼 */
const FormRowDouble = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.md};
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

/* 이미지 미리보기 영역 */
const PreviewWrap = styled.div`
  margin-top: ${({ theme }) => theme.spacing.xs};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  overflow: hidden;
  max-width: 200px;
`;

const PreviewImg = styled.img`
  width: 100%;
  height: 80px;
  object-fit: cover;
  display: block;
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
