/**
 * 운영 도구 — 포인트팩(PointPackPrice) 관리 탭.
 *
 * 기능:
 * - 포인트팩 마스터 목록 조회 (페이징)
 * - 신규 등록 모달 ((price, pointsAmount) UNIQUE)
 * - 수정 모달
 * - 활성 토글
 * - hard delete
 *
 * 운영 주의:
 * - 1P=10원 통일 (v3.2)
 * - 가격 변경은 결제 검증에 영향. 폐지된 팩은 토글로 비활성화 권장
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { MdRefresh, MdAdd, MdEdit, MdDelete, MdToggleOn, MdToggleOff } from 'react-icons/md';
import {
  fetchPointPacks,
  createPointPack,
  updatePointPack,
  updatePointPackActive,
  deletePointPack,
} from '../api/pointPackApi';
/* v3 Phase G P1-B: AI 어시스턴트 draft 주입 인프라 */
import { useQueryParams } from '@/shared/hooks/useQueryParams';
import { useAiPrefill } from '@/shared/hooks/useAiPrefill';
import AiPrefillBanner from '@/shared/components/AiPrefillBanner';

const PAGE_SIZE = 10;
const MODE_CREATE = 'CREATE';
const MODE_EDIT = 'EDIT';
const EMPTY_FORM = {
  packName: '',
  price: '',
  pointsAmount: '',
  isActive: true,
  sortOrder: 0,
};

/** 숫자 천단위 콤마 포맷 */
function fmt(n) {
  return (n ?? 0).toLocaleString('ko-KR');
}

export default function PointPackTab() {
  const [packs, setPacks] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [modalMode, setModalMode] = useState(null);
  const [editTargetId, setEditTargetId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState(null);

  /* ── v3 Phase G P1-B: AI 어시스턴트 자동 모달 오픈 ── */
  const queryParams = useQueryParams();
  const { draft, isAiGenerated, bannerText } = useAiPrefill();
  /** ?modal=create 자동 오픈은 마운트 1회만 실행 */
  const aiModalConsumedRef = useRef(false);

  const loadPacks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchPointPacks({ page, size: PAGE_SIZE });
      setPacks(result?.content ?? []);
      setTotalPages(result?.totalPages ?? 0);
    } catch (err) {
      setError(err.message || '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { loadPacks(); }, [loadPacks]);

  /* v3 Phase G P1-B: ?modal=create 진입 시 생성 모달 자동 오픈.
   * AI draft 가 있으면 draft.packCode → packName, draft.points → pointsAmount,
   * draft.priceKrw → price 로 매핑해 폼 초기값 주입.
   * consumedRef 로 중복 발동을 차단한다. */
  useEffect(() => {
    if (aiModalConsumedRef.current) return;
    if (queryParams.modal !== 'create') return;
    aiModalConsumedRef.current = true;
    const prefill = isAiGenerated && draft
      ? {
          ...EMPTY_FORM,
          /* draft.packCode → packName, draft.points → pointsAmount,
           * draft.priceKrw → price 매핑 */
          packName:     draft.packCode  ?? EMPTY_FORM.packName,
          pointsAmount: draft.points    ?? EMPTY_FORM.pointsAmount,
          price:        draft.priceKrw  ?? EMPTY_FORM.price,
        }
      : EMPTY_FORM;
    setForm(prefill);
    setEditTargetId(null);
    setModalMode(MODE_CREATE);
  }, [queryParams.modal, isAiGenerated, draft]);

  function openCreateModal() {
    setForm(EMPTY_FORM);
    setEditTargetId(null);
    setModalMode(MODE_CREATE);
  }

  function openEditModal(item) {
    setForm({
      packName: item.packName ?? '',
      price: item.price ?? '',
      pointsAmount: item.pointsAmount ?? '',
      isActive: !!item.isActive,
      sortOrder: item.sortOrder ?? 0,
    });
    setEditTargetId(item.packId);
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

  /** 1P=10원 자동 동기화 — pointsAmount 입력 시 price = pointsAmount * 10 */
  function handleSyncPrice() {
    if (form.pointsAmount && !isNaN(form.pointsAmount)) {
      setForm((prev) => ({ ...prev, price: Number(prev.pointsAmount) * 10 }));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    try {
      setSubmitting(true);
      const payload = {
        packName: form.packName?.trim(),
        price: Number(form.price),
        pointsAmount: Number(form.pointsAmount),
        isActive: !!form.isActive,
        sortOrder: form.sortOrder === '' ? 0 : Number(form.sortOrder),
      };
      if (modalMode === MODE_CREATE) {
        await createPointPack(payload);
      } else if (modalMode === MODE_EDIT && editTargetId != null) {
        await updatePointPack(editTargetId, payload);
      }
      closeModal();
      loadPacks();
    } catch (err) {
      alert(err.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(item) {
    if (busyId === item.packId) return;
    try {
      setBusyId(item.packId);
      await updatePointPackActive(item.packId, !item.isActive);
      loadPacks();
    } catch (err) {
      alert(err.message || '상태 변경 실패');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item) {
    if (busyId === item.packId) return;
    if (!confirm(
      `포인트팩 "${item.packName}" (${fmt(item.price)}원 / ${fmt(item.pointsAmount)}P)를 삭제합니다.\n` +
      `결제 흐름에 영향을 줄 수 있습니다. 가능한 비활성화를 권장합니다.\n\n` +
      `정말 삭제하시겠습니까?`
    )) {
      return;
    }
    try {
      setBusyId(item.packId);
      await deletePointPack(item.packId);
      loadPacks();
    } catch (err) {
      alert(err.message || '삭제 실패');
    } finally {
      setBusyId(null);
    }
  }

  /** 입력된 price/pointsAmount의 환산률 표시 */
  const conversionRate = (form.price && form.pointsAmount && Number(form.pointsAmount) > 0)
    ? (Number(form.price) / Number(form.pointsAmount)).toFixed(2)
    : null;

  return (
    <Container>
      <Toolbar>
        <ToolbarTitle>포인트팩 관리</ToolbarTitle>
        <ToolbarRight>
          <PrimaryButton onClick={openCreateModal}>
            <MdAdd size={16} /> 신규 등록
          </PrimaryButton>
          <IconButton onClick={loadPacks} disabled={loading} title="새로고침">
            <MdRefresh size={16} />
          </IconButton>
        </ToolbarRight>
      </Toolbar>

      <HelperText>
        포인트팩은 결제 검증의 핵심 가격표입니다. <strong>1P = 10원</strong>으로 통일(v3.2).
        가격 변경은 결제 안정성에 영향을 주므로 가능한 비활성 토글을 사용하세요.
      </HelperText>

      {error && <ErrorMsg>{error}</ErrorMsg>}

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th $w="60px">ID</Th>
              <Th>팩 이름</Th>
              <Th $w="120px">가격(원)</Th>
              <Th $w="120px">지급 포인트</Th>
              <Th $w="80px">정렬</Th>
              <Th $w="80px">활성</Th>
              <Th $w="220px">액션</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7}><CenterCell>불러오는 중...</CenterCell></td></tr>
            ) : packs.length === 0 ? (
              <tr><td colSpan={7}><CenterCell>등록된 포인트팩이 없습니다.</CenterCell></td></tr>
            ) : (
              packs.map((item) => (
                <Tr key={item.packId}>
                  <Td><MutedText>{item.packId}</MutedText></Td>
                  <Td><NameText>{item.packName}</NameText></Td>
                  <Td><PriceText>{fmt(item.price)}원</PriceText></Td>
                  <Td><PointsText>{fmt(item.pointsAmount)}P</PointsText></Td>
                  <Td><MutedText>{item.sortOrder}</MutedText></Td>
                  <Td>
                    <StatusPill $active={item.isActive}>
                      {item.isActive ? '활성' : '비활성'}
                    </StatusPill>
                  </Td>
                  <Td>
                    <ActionGroup>
                      <SmallButton onClick={() => openEditModal(item)}>
                        <MdEdit size={13} /> 수정
                      </SmallButton>
                      <SmallButton
                        onClick={() => handleToggleActive(item)}
                        disabled={busyId === item.packId}
                      >
                        {item.isActive ? <MdToggleOff size={14} /> : <MdToggleOn size={14} />}
                        {item.isActive ? ' 비활성' : ' 활성'}
                      </SmallButton>
                      <DangerSmallButton
                        onClick={() => handleDelete(item)}
                        disabled={busyId === item.packId}
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
              {modalMode === MODE_CREATE ? '포인트팩 신규 등록' : '포인트팩 수정'}
            </DialogTitle>
            {/* v3 Phase G P1-B: AI 어시스턴트 draft 주입 시 안내 배너 */}
            {modalMode === MODE_CREATE && isAiGenerated && (
              <AiPrefillBanner text={bannerText} />
            )}
            <form onSubmit={handleSubmit}>
              <Field>
                <Label>팩 이름 *</Label>
                <Input
                  type="text"
                  name="packName"
                  value={form.packName}
                  onChange={handleFormChange}
                  required
                  maxLength={100}
                  placeholder="예: 100 포인트, 500 포인트"
                />
              </Field>
              <FieldRow>
                <Field>
                  <Label>지급 포인트 *</Label>
                  <Input
                    type="number"
                    name="pointsAmount"
                    value={form.pointsAmount}
                    onChange={handleFormChange}
                    onBlur={handleSyncPrice}
                    required
                    min="1"
                  />
                </Field>
                <Field>
                  <Label>가격 (KRW) *</Label>
                  <Input
                    type="number"
                    name="price"
                    value={form.price}
                    onChange={handleFormChange}
                    required
                    min="1"
                  />
                </Field>
              </FieldRow>
              <FieldHint>
                포인트 입력 후 가격 칸에서 포커스를 빼면 자동으로 1P=10원 환산됩니다.
                {conversionRate && (
                  <span> 현재 환산률: <strong>{conversionRate}원/P</strong></span>
                )}
              </FieldHint>
              <FieldRow>
                <Field>
                  <Label>정렬 순서</Label>
                  <Input
                    type="number"
                    name="sortOrder"
                    value={form.sortOrder}
                    onChange={handleFormChange}
                    min="0"
                  />
                </Field>
                <Field>
                  <CheckboxLabel>
                    <input
                      type="checkbox"
                      name="isActive"
                      checked={form.isActive}
                      onChange={handleFormChange}
                    />
                    <span>활성화 (사용자 상점 노출)</span>
                  </CheckboxLabel>
                </Field>
              </FieldRow>
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
const NameText = styled.span`
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;
const PriceText = styled.span`
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: 'Menlo', 'Monaco', monospace;
`;
const PointsText = styled.span`
  color: ${({ theme }) => theme.colors.primary};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  font-family: 'Menlo', 'Monaco', monospace;
`;
const MutedText = styled.span`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.xs};
`;
const StatusPill = styled.span`
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  border-radius: 10px;
  color: #fff;
  background: ${({ $active, theme }) =>
    $active ? theme.colors.success ?? '#10b981' : theme.colors.textMuted};
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
`;
const FieldHint = styled.span`
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textMuted};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;
const CheckboxLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  margin-top: 24px;
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
