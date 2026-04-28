/**
 * 공지사항 관리 탭 — 고객센터 공지 + 앱 메인 공지 통합.
 *
 * 2026-04-08 개편:
 *  - 구 운영 도구 > 앱 공지(AppNotice) 탭을 본 탭에 통합 (단일 진실 원본).
 *  - 앱 공지의 BANNER/POPUP/MODAL 노출 기능을 SupportNotice에 흡수.
 *  - displayType = LIST_ONLY 는 고객센터 공지 목록에만 노출 (기존 동작).
 *  - displayType = BANNER/POPUP/MODAL 은 추가로 앱 메인 화면에도 노출됨.
 *
 * 기능:
 * - 공지 목록 테이블 (제목, 카테고리, 노출 방식, 노출 기간, 고정, 활성, 작성일, 액션)
 * - 카테고리 필터 (NOTICE/MAINTENANCE/EVENT/UPDATE)
 * - 등록/수정 모달: 기본 필드 + 앱 메인 노출 설정 섹션
 * - 활성/비활성 토글 (앱 메인 노출 제어)
 * - 삭제 확인 다이얼로그
 * - 페이지네이션
 *
 * 백엔드: SupportNotice 엔티티 확장 필요
 *  신규 컬럼: display_type, link_url, image_url, start_at, end_at, priority, is_active
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { MdAdd, MdEdit, MdDelete, MdRefresh, MdPushPin, MdToggleOn, MdToggleOff } from 'react-icons/md';
import { fetchNotices, createNotice, updateNotice, deleteNotice, updateNoticeActive } from '../api/supportApi';
import StatusBadge from '@/shared/components/StatusBadge';
import { useQueryParams } from '@/shared/hooks/useQueryParams';
import { useAiPrefill } from '@/shared/hooks/useAiPrefill';
import AiPrefillBanner from '@/shared/components/AiPrefillBanner';

/** 공지 카테고리 (콘텐츠 분류) */
const CATEGORIES = [
  { value: '', label: '전체' },
  { value: 'NOTICE', label: '공지' },
  { value: 'MAINTENANCE', label: '점검' },
  { value: 'EVENT', label: '이벤트' },
  { value: 'UPDATE', label: '업데이트' },
];

const CATEGORY_LABELS = {
  NOTICE: '공지',
  MAINTENANCE: '점검',
  EVENT: '이벤트',
  UPDATE: '업데이트',
};

/**
 * 노출 방식(표시 위치) — 앱 공지 도메인에서 흡수한 필드.
 * LIST_ONLY: 고객센터 공지 목록에만 노출 (기본값)
 * BANNER: 앱 홈 배너
 * POPUP: 앱 시작 시 팝업
 * MODAL: 중요 공지 모달 (강제 확인)
 */
const DISPLAY_TYPES = [
  { value: 'LIST_ONLY', label: '목록 전용 (고객센터 공지)' },
  { value: 'BANNER',    label: 'BANNER (홈 배너)' },
  { value: 'POPUP',     label: 'POPUP (앱 시작 팝업)' },
  { value: 'MODAL',     label: 'MODAL (중요 공지 모달)' },
];

const DISPLAY_TYPE_COLOR = {
  LIST_ONLY: '#94a3b8',
  BANNER:    '#3b82f6',
  POPUP:     '#f59e0b',
  MODAL:     '#ef4444',
};

/** 등록/수정 모달 초기값 */
const INITIAL_FORM = {
  title: '',
  noticeType: 'NOTICE',     // 콘텐츠 카테고리
  content: '',
  isPinned: false,
  publishedAt: '',
  /* 앱 공지 흡수 필드 */
  displayType: 'BANNER',
  linkUrl: '',
  imageUrl: '',
  startAt: '',
  endAt: '',
  priority: 0,
  isActive: true,
};

/** datetime-local ↔ ISO 변환 유틸 */
function toIso(v) {
  if (!v) return null;
  return v.length === 16 ? `${v}:00` : v;
}
function fromIso(iso) {
  if (!iso) return '';
  return String(iso).substring(0, 16);
}

export default function NoticeTab() {
  /* ── URL 쿼리파라미터 / AI prefill ── */
  /**
   * ?modal=create  → 공지 등록 모달 자동 오픈
   * ?modal=edit&id=N → 해당 공지 수정 모달 자동 오픈 (목록 로드 후 매칭)
   * AI 어시스턴트가 draft 를 location.state 에 심어두면 모달 초기값으로 주입.
   */
  const { modal: queryModal, id: queryId } = useQueryParams();
  const { draft, bannerText } = useAiPrefill();

  /* ── 목록 상태 ── */
  const [notices, setNotices] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* ── 필터/페이지 상태 ── */
  const [filterCategory, setFilterCategory] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;

  /* ── 모달 상태 ── */
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // null: 신규, Object: 수정
  const [form, setForm] = useState(INITIAL_FORM);
  const [formLoading, setFormLoading] = useState(false);

  /* ── 삭제 확인 다이얼로그 상태 ── */
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  /* ── 활성 토글 busy 상태 ── */
  const [busyId, setBusyId] = useState(null);

  /** 목록 조회 */
  const loadNotices = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page, size: PAGE_SIZE };
      if (filterCategory) params.noticeType = filterCategory;
      const result = await fetchNotices(params);
      setNotices(result?.content ?? result ?? []);
      setTotal(result?.totalElements ?? (result?.length ?? 0));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filterCategory]);

  useEffect(() => { loadNotices(); }, [loadNotices]);

  /**
   * 쿼리파라미터 자동 모달 오픈 처리.
   *
   * - ?modal=create : 공지 등록 모달을 즉시 오픈. draft 가 있으면 폼 초기값으로 주입.
   * - ?modal=edit&id=N : 목록 로드 완료 후 해당 id 의 공지를 찾아 수정 모달 오픈.
   *
   * notices 목록이 바뀔 때마다 재평가하므로 페이지 진입 직후 목록 로드가 끝나면
   * 자동으로 트리거된다. 이미 모달이 열려 있으면 중복 실행 방지.
   */
  useEffect(() => {
    if (!queryModal || modalOpen) return;

    if (queryModal === 'create') {
      /* draft 필드명 (camelCase): title, type(→noticeType), pinned(→isPinned), content, startAt, endAt */
      const prefill = draft
        ? {
            ...INITIAL_FORM,
            title:       draft.title       ?? INITIAL_FORM.title,
            noticeType:  draft.type        ?? INITIAL_FORM.noticeType,
            content:     draft.content     ?? INITIAL_FORM.content,
            isPinned:    draft.pinned      ?? INITIAL_FORM.isPinned,
            startAt:     fromIso(draft.startAt) ?? INITIAL_FORM.startAt,
            endAt:       fromIso(draft.endAt)   ?? INITIAL_FORM.endAt,
          }
        : INITIAL_FORM;
      setEditTarget(null);
      setForm(prefill);
      setModalOpen(true);
      return;
    }

    if (queryModal === 'edit' && queryId && notices.length > 0 && !loading) {
      const target = notices.find(
        (n) => String(n.noticeId ?? n.id) === String(queryId)
      );
      if (target) {
        openEditModal(target);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryModal, queryId, notices, loading]);

  /* ── 필터 변경 시 첫 페이지로 ── */
  function handleCategoryChange(value) {
    setFilterCategory(value);
    setPage(0);
  }

  /* ── 모달 열기 (신규) ── */
  function openCreateModal() {
    setEditTarget(null);
    setForm(INITIAL_FORM);
    setModalOpen(true);
  }

  /* ── 모달 열기 (수정) ── */
  function openEditModal(notice) {
    setEditTarget(notice);
    setForm({
      title: notice.title ?? '',
      noticeType: notice.noticeType ?? 'NOTICE',
      content: notice.content ?? '',
      isPinned: notice.isPinned ?? false,
      publishedAt: fromIso(notice.publishedAt),
      displayType: notice.displayType ?? 'LIST_ONLY',
      linkUrl: notice.linkUrl ?? '',
      imageUrl: notice.imageUrl ?? '',
      startAt: fromIso(notice.startAt),
      endAt: fromIso(notice.endAt),
      priority: notice.priority ?? 0,
      isActive: notice.isActive ?? true,
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
    if (!form.title.trim()) { alert('제목을 입력해주세요.'); return; }
    if (!form.content.trim()) { alert('내용을 입력해주세요.'); return; }

    try {
      setFormLoading(true);
      const payload = {
        title: form.title.trim(),
        noticeType: form.noticeType,
        content: form.content,
        isPinned: !!form.isPinned,
        publishedAt: toIso(form.publishedAt),
        displayType: form.displayType,
        linkUrl: form.linkUrl || null,
        imageUrl: form.imageUrl || null,
        startAt: toIso(form.startAt),
        endAt: toIso(form.endAt),
        priority: form.priority === '' ? 0 : Number(form.priority),
        isActive: !!form.isActive,
      };
      const targetId = editTarget?.noticeId ?? editTarget?.id;
      if (targetId != null) {
        await updateNotice(targetId, payload);
      } else {
        await createNotice(payload);
      }
      setModalOpen(false);
      loadNotices();
    } catch (err) {
      alert(err.message || '처리 중 오류가 발생했습니다.');
    } finally {
      setFormLoading(false);
    }
  }

  /** 활성/비활성 토글 */
  async function handleToggleActive(notice) {
    const id = notice.noticeId ?? notice.id;
    if (busyId === id) return;
    try {
      setBusyId(id);
      await updateNoticeActive(id, !notice.isActive);
      loadNotices();
    } catch (err) {
      alert(err.message || '상태 변경 실패');
    } finally {
      setBusyId(null);
    }
  }

  /** 삭제 확인 다이얼로그 오픈 */
  function openDeleteDialog(notice) {
    setDeleteTarget(notice);
  }

  /** 삭제 실행 */
  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleteLoading(true);
      const id = deleteTarget.noticeId ?? deleteTarget.id;
      await deleteNotice(id);
      setDeleteTarget(null);
      loadNotices();
    } catch (err) {
      alert(err.message || '삭제 중 오류가 발생했습니다.');
    } finally {
      setDeleteLoading(false);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <Container>
      {/* ── 도움말 ── */}
      <HelperText>
        <strong>통합 공지 관리</strong> — LIST_ONLY는 고객센터 공지 목록에만,
        BANNER/POPUP/MODAL은 앱 메인 화면에도 노출됩니다.
        앱 메인 노출은 <strong>활성화 + 노출 기간(시작/종료일) 조건</strong>이 충족될 때만 적용됩니다.
      </HelperText>

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
          <IconButton onClick={loadNotices} disabled={loading} title="새로고침">
            <MdRefresh size={16} />
          </IconButton>
          <PrimaryButton onClick={openCreateModal}>
            <MdAdd size={16} />
            공지 등록
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
              <Th $w="80px">카테고리</Th>
              <Th $w="110px">노출 방식</Th>
              <Th $w="210px">노출 기간</Th>
              <Th $w="60px">고정</Th>
              <Th $w="70px">활성</Th>
              <Th $w="110px">작성일</Th>
              <Th $w="200px">액션</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8}>
                  <LoadingCell>불러오는 중...</LoadingCell>
                </td>
              </tr>
            ) : notices.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <EmptyCell>공지사항이 없습니다.</EmptyCell>
                </td>
              </tr>
            ) : (
              notices.map((notice) => {
                const id = notice.noticeId ?? notice.id;
                const displayType = notice.displayType ?? 'LIST_ONLY';
                return (
                  <Tr key={id}>
                    <Td>
                      <TitleCell>
                        {notice.isPinned && <MdPushPin size={13} color="#6366f1" title="고정됨" />}
                        <TitleText>{notice.title}</TitleText>
                      </TitleCell>
                    </Td>
                    <Td>
                      <StatusBadge
                        status="info"
                        label={CATEGORY_LABELS[notice.noticeType] ?? notice.noticeType ?? '-'}
                      />
                    </Td>
                    <Td>
                      <TypePill $color={DISPLAY_TYPE_COLOR[displayType] ?? '#888'}>
                        {displayType}
                      </TypePill>
                    </Td>
                    <Td>
                      <PeriodText>
                        {notice.startAt ? fromIso(notice.startAt).replace('T', ' ') : '∞'} ~{' '}
                        {notice.endAt ? fromIso(notice.endAt).replace('T', ' ') : '∞'}
                      </PeriodText>
                    </Td>
                    <Td>
                      <StatusBadge
                        status={notice.isPinned ? 'warning' : 'default'}
                        label={notice.isPinned ? '고정' : '-'}
                      />
                    </Td>
                    <Td>
                      <StatusBadge
                        status={notice.isActive ? 'success' : 'default'}
                        label={notice.isActive ? '활성' : '비활성'}
                      />
                    </Td>
                    <Td>{notice.createdAt ? String(notice.createdAt).slice(0, 10) : '-'}</Td>
                    <Td>
                      <ActionRow>
                        <TextButton onClick={() => openEditModal(notice)}>
                          <MdEdit size={14} /> 수정
                        </TextButton>
                        <TextButton
                          onClick={() => handleToggleActive(notice)}
                          disabled={busyId === id}
                          title={notice.isActive ? '비활성화' : '활성화'}
                        >
                          {notice.isActive ? <MdToggleOff size={14} /> : <MdToggleOn size={14} />}
                          {notice.isActive ? ' 비활성' : ' 활성'}
                        </TextButton>
                        <DangerButton onClick={() => openDeleteDialog(notice)}>
                          <MdDelete size={14} /> 삭제
                        </DangerButton>
                      </ActionRow>
                    </Td>
                  </Tr>
                );
              })
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

      {/* ── 등록/수정 모달 ── */}
      {modalOpen && (
        <Overlay onClick={() => setModalOpen(false)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>{editTarget ? '공지사항 수정' : '공지사항 등록'}</ModalTitle>
              <CloseButton onClick={() => setModalOpen(false)}>✕</CloseButton>
            </ModalHeader>

            <ModalForm onSubmit={handleFormSubmit}>
              {/* ── AI 어시스턴트 prefill 안내 배너 (draft 가 있을 때만 노출) ── */}
              {bannerText && <AiPrefillBanner text={bannerText} />}

              {/* ── 기본 정보 ── */}
              <FormRow>
                <Label>제목 *</Label>
                <Input
                  name="title"
                  value={form.title}
                  onChange={handleFormChange}
                  placeholder="공지사항 제목 입력"
                  maxLength={200}
                />
              </FormRow>

              <FormRow>
                <Label>카테고리 *</Label>
                <Select name="noticeType" value={form.noticeType} onChange={handleFormChange}>
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
                  placeholder="공지사항 내용을 입력하세요. (마크다운 허용)"
                  rows={8}
                />
              </FormRow>

              <FormRow>
                <Label>예약 발행 시간</Label>
                <Input
                  type="datetime-local"
                  name="publishedAt"
                  value={form.publishedAt}
                  onChange={handleFormChange}
                />
              </FormRow>

              <CheckRow>
                <CheckLabel>
                  <input
                    type="checkbox"
                    name="isPinned"
                    checked={form.isPinned}
                    onChange={handleFormChange}
                  />
                  상단 고정 (목록 상단)
                </CheckLabel>
                <CheckLabel>
                  <input
                    type="checkbox"
                    name="isActive"
                    checked={form.isActive}
                    onChange={handleFormChange}
                  />
                  활성 (앱 메인 노출 허용)
                </CheckLabel>
              </CheckRow>

              {/* ── 앱 메인 노출 섹션 (구 AppNotice 흡수) ── */}
              <Divider />
              <SectionTitle>앱 메인 화면 노출 설정</SectionTitle>
              <SectionHint>
                노출 방식이 LIST_ONLY 이면 고객센터 공지 목록에만 노출됩니다.
                BANNER/POPUP/MODAL 선택 시 활성 상태 + 노출 기간 내에서 앱 메인에 추가 노출됩니다.
              </SectionHint>

              <FieldGrid>
                <FormRow>
                  <Label>노출 방식</Label>
                  <Select name="displayType" value={form.displayType} onChange={handleFormChange}>
                    {DISPLAY_TYPES.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </Select>
                  {/* 노출 방식에 따른 안내 문구 */}
                  {form.displayType === 'LIST_ONLY' && (
                    <FieldWarning>
                      LIST_ONLY 선택 시 유저 앱 화면에 노출되지 않습니다. 유저에게 노출하려면 BANNER/POPUP/MODAL을 선택하세요.
                    </FieldWarning>
                  )}
                </FormRow>
                <FormRow>
                  <Label>우선순위 (높을수록 상단)</Label>
                  <Input
                    type="number"
                    name="priority"
                    value={form.priority}
                    onChange={handleFormChange}
                    min="0"
                  />
                </FormRow>
              </FieldGrid>

              <FormRow>
                <Label>링크 URL (배너/팝업 클릭 시 이동)</Label>
                <Input
                  type="text"
                  name="linkUrl"
                  value={form.linkUrl}
                  onChange={handleFormChange}
                  placeholder="https:// 혹은 앱 딥링크 (선택)"
                  maxLength={500}
                />
              </FormRow>

              <FormRow>
                <Label>이미지 URL (S3/CDN)</Label>
                <Input
                  type="text"
                  name="imageUrl"
                  value={form.imageUrl}
                  onChange={handleFormChange}
                  placeholder="BANNER/POPUP에 노출할 이미지 (선택)"
                  maxLength={500}
                />
              </FormRow>

              <FieldGrid>
                <FormRow>
                  <Label>노출 시작 (비워두면 즉시)</Label>
                  <Input
                    type="datetime-local"
                    name="startAt"
                    value={form.startAt}
                    onChange={handleFormChange}
                  />
                </FormRow>
                <FormRow>
                  <Label>노출 종료 (비워두면 무기한)</Label>
                  <Input
                    type="datetime-local"
                    name="endAt"
                    value={form.endAt}
                    onChange={handleFormChange}
                  />
                </FormRow>
              </FieldGrid>

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
            <DialogTitle>공지사항 삭제</DialogTitle>
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

const HelperText = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  background: ${({ theme }) => theme.colors.bgHover};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-radius: 4px;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  border-left: 3px solid ${({ theme }) => theme.colors.primary};
  line-height: 1.6;
`;

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
  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.primary};
  }
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

const TitleCell = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const TitleText = styled.span`
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 280px;
`;

const TypePill = styled.span`
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  border-radius: 10px;
  color: #fff;
  background: ${({ $color }) => $color};
`;

const PeriodText = styled.span`
  font-family: 'Menlo', 'Monaco', monospace;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textMuted};
  white-space: nowrap;
`;

const ActionRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xs};
  flex-wrap: wrap;
`;

const TextButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px 8px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 3px;
  color: ${({ theme }) => theme.colors.textSecondary};
  transition: all ${({ theme }) => theme.transitions.fast};
  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.primary};
  }
  &:disabled { opacity: 0.4; }
`;

const DangerButton = styled(TextButton)`
  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.error};
    color: ${({ theme }) => theme.colors.error};
  }
`;

const LoadingCell = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xxxl};
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

const EmptyCell = styled(LoadingCell)``;

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
  max-width: 680px;
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

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.lg};

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
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
  background: ${({ theme }) => theme.colors.bgCard};
  color: ${({ theme }) => theme.colors.textPrimary};
  outline: none;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
`;

const Select = styled.select`
  padding: 8px 12px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  outline: none;
  background: ${({ theme }) => theme.colors.bgCard};
  color: ${({ theme }) => theme.colors.textPrimary};
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
  background: ${({ theme }) => theme.colors.bgCard};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: inherit;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
`;

const CheckRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xl};
  flex-wrap: wrap;
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

const Divider = styled.hr`
  border: none;
  border-top: 1px dashed ${({ theme }) => theme.colors.border};
  margin: ${({ theme }) => theme.spacing.md} 0 0 0;
`;

const SectionTitle = styled.h4`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

/** 노출 방식 경고 안내 문구 */
const FieldWarning = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.error};
  background: ${({ theme }) => theme.colors.errorBg};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border-radius: 4px;
  margin: 0;
  line-height: 1.5;
`;

const SectionHint = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  line-height: 1.5;
  margin: -${({ theme }) => theme.spacing.sm} 0 0 0;
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
  background: ${({ theme }) => theme.colors.bgCard};
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
