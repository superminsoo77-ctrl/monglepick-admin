/**
 * 포인트 아이템 관리 컴포넌트.
 *
 * 교환 가능한 포인트 아이템 목록을 조회하고 인라인 수정 기능을 제공한다.
 * - 아이템 목록 테이블 (이름/카테고리/가격/설명/활성여부)
 * - 행의 수정 버튼 클릭 시 인라인 편집 모드 진입
 * - 수정 저장 시 updatePointItem API 호출
 * - 활성/비활성 토글 버튼으로 빠른 상태 변경 (ConfirmModal 확인)
 *
 * 2026-04-14 변경:
 *  - 백엔드 DTO(PointItemResponse / PointItemUpdateRequest) 필드 정합화.
 *    기존 코드가 item.id / item.name / item.price / item.description / item.active /
 *    item.category 를 사용했지만 실제 필드는 pointItemId / itemName / itemPrice /
 *    itemDescription / isActive / itemCategory 이다. 이로 인해 화면에 데이터가
 *    비어 보이는 것처럼 표시되던 문제를 해결한다.
 *  - window.confirm / alert 제거 → ConfirmModal 교체
 *  - 업데이트 페이로드 역시 필드명 통일
 *
 * @module PointItemTable
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { MdRefresh, MdEdit, MdCheck, MdClose, MdAdd, MdImageNotSupported } from 'react-icons/md';
import { fetchPointItems, updatePointItem } from '../api/paymentApi';
import StatusBadge from '@/shared/components/StatusBadge';
import ConfirmModal from '@/shared/components/ConfirmModal';
import PointItemCreateModal from './PointItemCreateModal';

/**
 * 카테고리 한국어 레이블 — 2026-04-27 정합화.
 *
 * Backend `PointItemCategory` 정규값(소문자 5종) + 레거시값을 모두 포함.
 * 신규 등록은 `coupon`/`avatar`/`badge`/`apply`/`hint` 만 사용하며,
 * `subscription_discount`/`profile_item` 등은 PointItemInitializer 가 비활성화 처리한 잔재.
 */
const CATEGORY_LABEL = {
  general:               '일반',
  coupon:                '쿠폰',
  avatar:                '아바타',
  badge:                 '배지',
  apply:                 '응모권',
  hint:                  '힌트',
  ai:                    'AI 이용권 (레거시)',
  subscription_discount: '구독 할인 (레거시)',
  extra_quota:           '추가 쿼터 (레거시)',
  profile_item:          '프로필 아이템 (레거시)',
  gift:                  '선물 (레거시)',
  etc:                   '기타 (레거시)',
};

/**
 * 인라인 편집용 카테고리 옵션 — 신규 등록 모달의 옵션과 동일.
 * Backend 정규 5종만 노출하여 레거시 값 신규 입력을 차단한다.
 */
const EDITABLE_CATEGORY_OPTIONS = [
  { value: '',         label: '미지정 (general)' },
  { value: 'avatar',   label: '아바타' },
  { value: 'badge',    label: '배지' },
  { value: 'coupon',   label: '쿠폰' },
  { value: 'apply',    label: '응모권' },
  { value: 'hint',     label: '힌트' },
];

/**
 * 인라인 편집용 itemType 옵션 — 신규 등록 모달의 옵션과 동일하게 유지하되,
 * 좁은 인라인 편집 셀에 적합하도록 group label 없이 평탄화.
 */
const EDITABLE_ITEM_TYPE_OPTIONS = [
  { value: '',                   label: '미지정 (교환 차단)' },
  { value: 'AVATAR_GENERIC',     label: 'AVATAR_GENERIC' },
  { value: 'BADGE_GENERIC',      label: 'BADGE_GENERIC' },
  { value: 'AVATAR_MONGLE',      label: 'AVATAR_MONGLE (레거시)' },
  { value: 'BADGE_PREMIUM',      label: 'BADGE_PREMIUM (레거시)' },
  { value: 'AI_TOKEN_1',         label: 'AI_TOKEN_1' },
  { value: 'AI_TOKEN_5',         label: 'AI_TOKEN_5' },
  { value: 'AI_TOKEN_20',        label: 'AI_TOKEN_20' },
  { value: 'AI_TOKEN_50',        label: 'AI_TOKEN_50' },
  { value: 'APPLY_MOVIE_TICKET', label: 'APPLY_MOVIE_TICKET' },
  { value: 'QUIZ_HINT',          label: 'QUIZ_HINT' },
];

function displayCategory(category) {
  if (!category) return '-';
  return CATEGORY_LABEL[category] ?? CATEGORY_LABEL[category.toLowerCase()] ?? category;
}

/** 편집 가능한 필드 초기값 추출 — 2026-04-27: itemType/amount/durationDays/imageUrl 포함. */
function toEditForm(item) {
  return {
    itemName:        item.itemName ?? '',
    itemPrice:       String(item.itemPrice ?? ''),
    itemDescription: item.itemDescription ?? '',
    itemCategory:    item.itemCategory ?? '',
    itemType:        item.itemType ?? '',
    amount:          item.amount != null ? String(item.amount) : '',
    durationDays:    item.durationDays != null ? String(item.durationDays) : '',
    imageUrl:        item.imageUrl ?? '',
    isActive:        item.isActive ?? true,
  };
}

export default function PointItemTable() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* 인라인 편집 상태 */
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [editError, setEditError] = useState(null);

  /* 신규 등록 모달 */
  const [createModalOpen, setCreateModalOpen] = useState(false);

  /* 활성/비활성 토글 모달 */
  const [toggleTarget, setToggleTarget] = useState(null);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [toggleError, setToggleError] = useState(null);

  /** 아이템 목록 조회 */
  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchPointItems();
      setItems(Array.isArray(result) ? result : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  /* 초기 로드 */
  useEffect(() => {
    loadItems();
  }, [loadItems]);

  /** 편집 모드 진입 */
  function startEdit(item) {
    setEditingId(item.pointItemId);
    setEditForm(toEditForm(item));
    setEditError(null);
  }

  /** 편집 취소 */
  function cancelEdit() {
    setEditingId(null);
    setEditForm({});
    setEditError(null);
  }

  /** 편집 폼 필드 변경 */
  function handleEditChange(field, value) {
    setEditForm((prev) => ({ ...prev, [field]: value }));
    setEditError(null);
  }

  /** 편집 저장 */
  async function handleSave(itemId) {
    /* 유효성 검사 */
    if (!editForm.itemName?.trim()) {
      setEditError('아이템 이름을 입력해주세요.');
      return;
    }
    const price = Number(editForm.itemPrice);
    if (!editForm.itemPrice || Number.isNaN(price) || price < 0) {
      setEditError('가격을 올바르게 입력해주세요.');
      return;
    }

    /* 선택 필드 검증 — 0 이상 정수 또는 빈값(=NULL) */
    const amountNum = editForm.amount === '' || editForm.amount == null
      ? null : Number(editForm.amount);
    if (amountNum !== null && (!Number.isFinite(amountNum) || !Number.isInteger(amountNum) || amountNum < 0)) {
      setEditError('지급 수량은 0 이상의 정수여야 합니다.');
      return;
    }
    const durationNum = editForm.durationDays === '' || editForm.durationDays == null
      ? null : Number(editForm.durationDays);
    if (durationNum !== null && (!Number.isFinite(durationNum) || !Number.isInteger(durationNum) || durationNum < 0)) {
      setEditError('유효기간(일)은 0 이상의 정수여야 합니다.');
      return;
    }

    try {
      setSavingId(itemId);
      setEditError(null);
      const payload = {
        itemName:        editForm.itemName.trim(),
        itemPrice:       price,
        itemDescription: editForm.itemDescription.trim(),
        itemCategory:    (editForm.itemCategory ?? '').trim() || 'general',
        itemType:        (editForm.itemType ?? '').trim() || null,
        amount:          amountNum,
        durationDays:    durationNum,
        imageUrl:        (editForm.imageUrl ?? '').trim() || null,
        isActive:        editForm.isActive,
      };
      const updated = await updatePointItem(itemId, payload);

      setItems((prev) =>
        prev.map((it) => (it.pointItemId === itemId ? { ...it, ...updated } : it))
      );
      setEditingId(null);
      setEditForm({});
    } catch (err) {
      setEditError(err.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setSavingId(null);
    }
  }

  /** 활성/비활성 토글 모달 열기 */
  function openToggle(item) {
    setToggleError(null);
    setToggleTarget(item);
  }

  /** 토글 확인 */
  async function runToggle() {
    if (!toggleTarget) return;
    const itemId = toggleTarget.pointItemId;
    const nextActive = !toggleTarget.isActive;

    setToggleLoading(true);
    setToggleError(null);
    try {
      /* 활성/비활성 토글은 isActive 외 모든 필드를 보존해야 한다 — 신규 itemType/amount/...
       * 필드도 그대로 전달해 운영자가 토글 한 번으로 데이터를 잃지 않도록 한다. */
      const updated = await updatePointItem(itemId, {
        itemName:        toggleTarget.itemName,
        itemPrice:       toggleTarget.itemPrice,
        itemDescription: toggleTarget.itemDescription,
        itemCategory:    toggleTarget.itemCategory ?? 'general',
        itemType:        toggleTarget.itemType ?? null,
        amount:          toggleTarget.amount ?? null,
        durationDays:    toggleTarget.durationDays ?? null,
        imageUrl:        toggleTarget.imageUrl ?? null,
        isActive:        nextActive,
      });
      setItems((prev) =>
        prev.map((it) => (it.pointItemId === itemId ? { ...it, ...updated } : it))
      );
      setToggleTarget(null);
    } catch (err) {
      setToggleError(err?.message ?? '처리 실패');
    } finally {
      setToggleLoading(false);
    }
  }

  return (
    <Section>
      <SectionHeader>
        <SectionTitle>포인트 아이템 ({items.length}개)</SectionTitle>
        <HeaderActions>
          <CreateButton
            type="button"
            onClick={() => setCreateModalOpen(true)}
            disabled={loading || editingId !== null}
            title={editingId !== null ? '편집 중에는 신규 등록 불가' : '신규 아이템 등록'}
          >
            <MdAdd size={16} />
            신규 등록
          </CreateButton>
          <RefreshButton onClick={loadItems} disabled={loading} title="새로고침">
            <MdRefresh size={16} />
          </RefreshButton>
        </HeaderActions>
      </SectionHeader>

      <GuideText>
        행의 수정 버튼을 클릭하면 인라인 편집 모드로 전환됩니다.
        활성 토글로 아이템을 즉시 활성/비활성화할 수 있습니다.
      </GuideText>

      {error && <ErrorMsg>{error}</ErrorMsg>}
      {editError && <AlertMsg $type="error">{editError}</AlertMsg>}

      <TableWrapper>
        {loading ? (
          <CenterMsg>불러오는 중...</CenterMsg>
        ) : items.length === 0 ? (
          <CenterMsg>등록된 아이템이 없습니다.</CenterMsg>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>이미지</Th>
                <Th>아이템명</Th>
                <Th>카테고리</Th>
                <Th>itemType</Th>
                <Th>가격 (P)</Th>
                <Th>유효기간</Th>
                <Th>설명</Th>
                <Th>활성</Th>
                <Th>액션</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isEditing = editingId === item.pointItemId;
                const isSaving  = savingId === item.pointItemId;

                return isEditing ? (
                  /* ── 편집 행 ── */
                  <EditRow key={item.pointItemId}>
                    {/* 이미지 — 편집 모드에서는 URL 입력 + 썸네일 미리보기 */}
                    <Td>
                      <ThumbColumn>
                        <Thumbnail
                          src={editForm.imageUrl?.trim() || item.imageUrl || null}
                          alt={item.itemName}
                        />
                        <EditInput
                          type="text"
                          value={editForm.imageUrl}
                          onChange={(e) => handleEditChange('imageUrl', e.target.value)}
                          placeholder="/avatars/x.svg"
                          maxLength={500}
                          style={{ width: '160px' }}
                        />
                      </ThumbColumn>
                    </Td>

                    <Td>
                      <EditInput
                        type="text"
                        value={editForm.itemName}
                        onChange={(e) => handleEditChange('itemName', e.target.value)}
                        placeholder="아이템명"
                        maxLength={200}
                        autoFocus
                      />
                    </Td>

                    <Td>
                      <EditSelect
                        value={editForm.itemCategory}
                        onChange={(e) => handleEditChange('itemCategory', e.target.value)}
                      >
                        {EDITABLE_CATEGORY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </EditSelect>
                    </Td>

                    <Td>
                      <EditSelect
                        value={editForm.itemType}
                        onChange={(e) => handleEditChange('itemType', e.target.value)}
                      >
                        {EDITABLE_ITEM_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </EditSelect>
                    </Td>

                    <Td>
                      <EditInput
                        type="number"
                        min={0}
                        value={editForm.itemPrice}
                        onChange={(e) => handleEditChange('itemPrice', e.target.value)}
                        placeholder="0"
                        style={{ width: '90px' }}
                      />
                    </Td>

                    <Td>
                      <EditInput
                        type="number"
                        min={0}
                        value={editForm.durationDays}
                        onChange={(e) => handleEditChange('durationDays', e.target.value)}
                        placeholder="무기한"
                        style={{ width: '80px' }}
                        title="유효기간(일). 비워두면 무기한."
                      />
                    </Td>

                    <Td>
                      <EditInput
                        type="text"
                        value={editForm.itemDescription}
                        onChange={(e) => handleEditChange('itemDescription', e.target.value)}
                        placeholder="설명 (선택)"
                        maxLength={500}
                        style={{ width: '100%', minWidth: '180px' }}
                      />
                    </Td>

                    <Td>
                      <ActiveCheckbox
                        type="checkbox"
                        checked={editForm.isActive}
                        onChange={(e) => handleEditChange('isActive', e.target.checked)}
                      />
                    </Td>

                    <Td>
                      <ActionGroup>
                        <IconButton
                          $variant="success"
                          disabled={isSaving}
                          onClick={() => handleSave(item.pointItemId)}
                          title="저장"
                        >
                          {isSaving ? '...' : <MdCheck size={15} />}
                        </IconButton>
                        <IconButton
                          $variant="default"
                          disabled={isSaving}
                          onClick={cancelEdit}
                          title="취소"
                        >
                          <MdClose size={15} />
                        </IconButton>
                      </ActionGroup>
                    </Td>
                  </EditRow>
                ) : (
                  /* ── 일반 행 ── */
                  <tr key={item.pointItemId}>
                    <Td>
                      <Thumbnail src={item.imageUrl} alt={item.itemName} />
                    </Td>
                    <Td bold>{item.itemName ?? '-'}</Td>
                    <Td muted>{displayCategory(item.itemCategory)}</Td>
                    <Td mono>
                      {item.itemType ? (
                        <ItemTypeBadge $unsupported={item.itemType === 'UNKNOWN'}>
                          {item.itemType}
                        </ItemTypeBadge>
                      ) : (
                        <ItemTypeBadge $unsupported>미지정</ItemTypeBadge>
                      )}
                    </Td>
                    <Td mono>
                      {item.itemPrice != null ? `${Number(item.itemPrice).toLocaleString()}P` : '-'}
                    </Td>
                    <Td muted>
                      {item.durationDays != null ? `${item.durationDays}일` : '무기한'}
                    </Td>
                    <Td muted>{item.itemDescription || '-'}</Td>
                    <Td>
                      <ActiveToggle
                        $active={item.isActive}
                        disabled={isSaving}
                        onClick={() => openToggle(item)}
                        title={item.isActive ? '클릭하여 비활성화' : '클릭하여 활성화'}
                      >
                        <StatusBadge
                          status={item.isActive ? 'success' : 'default'}
                          label={item.isActive ? '활성' : '비활성'}
                        />
                      </ActiveToggle>
                    </Td>
                    <Td>
                      <EditButton
                        onClick={() => startEdit(item)}
                        disabled={editingId !== null || isSaving}
                        title="수정"
                      >
                        <MdEdit size={14} />
                        수정
                      </EditButton>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </TableWrapper>

      {/* 신규 등록 모달 */}
      <PointItemCreateModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={loadItems}
      />

      {/* 활성/비활성 토글 모달 */}
      <ConfirmModal
        isOpen={!!toggleTarget}
        title={toggleTarget?.isActive ? '아이템 비활성화' : '아이템 활성화'}
        description={
          toggleTarget
            ? `"${toggleTarget.itemName}"을(를) ${toggleTarget.isActive ? '비활성화' : '활성화'}하시겠습니까?`
            : null
        }
        confirmText={toggleTarget?.isActive ? '비활성화' : '활성화'}
        cancelText="취소"
        variant={toggleTarget?.isActive ? 'warning' : 'primary'}
        loading={toggleLoading}
        error={toggleError}
        onConfirm={runToggle}
        onClose={() => {
          if (!toggleLoading) setToggleTarget(null);
        }}
      />
    </Section>
  );
}

/* ── styled-components ── */

const Section = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.xxl};
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const SectionTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.heading};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const CreateButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: 6px ${({ theme }) => theme.spacing.lg};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: #ffffff;
  background: ${({ theme }) => theme.colors.primary};
  border-radius: 4px;
  transition: opacity ${({ theme }) => theme.transitions.fast};
  white-space: nowrap;

  &:hover:not(:disabled) {
    opacity: 0.85;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const GuideText = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const RefreshButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.border};
  transition: background ${({ theme }) => theme.transitions.fast};

  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
  &:disabled { opacity: 0.5; }
`;

const ErrorMsg = styled.p`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const AlertMsg = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-radius: 4px;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.error};
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid #fecaca;
`;

const TableWrapper = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  overflow-x: auto;
  box-shadow: ${({ theme }) => theme.shadows.card};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 980px;
`;

/* ── 이미지 썸네일 ────────────────────────────────────────
 *
 * 정적 자산은 monglepick-client (5173) 측에서만 호스팅되므로 admin (5174) 에서
 * 경로 그대로 로드하면 404 가 난다. 동적으로 monglepick-client origin 을 prefix.
 * 운영 배포 시에는 nginx 가 동일 origin 으로 묶지만 dev 에서는 명시적 prefix 가 안전.
 *
 * 외부 URL(http/https) 은 그대로 사용. 운영자는 CDN URL 을 직접 입력 가능.
 */
const CLIENT_ASSETS_ORIGIN = (import.meta?.env?.VITE_CLIENT_ASSETS_ORIGIN
  ?? 'http://localhost:5173').replace(/\/$/, '');

function resolveImageSrc(src) {
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  if (src.startsWith('/')) return `${CLIENT_ASSETS_ORIGIN}${src}`;
  return src;
}

/**
 * 안전한 이미지 썸네일 — 경로 없거나 로드 실패 시 placeholder 아이콘.
 * styled-components 의 기본 export 와 React 컴포넌트가 같은 이름을 가져도 무방.
 */
function Thumbnail({ src, alt }) {
  const [errored, setErrored] = useState(false);
  const resolved = resolveImageSrc(src);
  if (!resolved || errored) {
    return (
      <ThumbPlaceholder title={alt}>
        <MdImageNotSupported size={16} />
      </ThumbPlaceholder>
    );
  }
  return <ThumbImg src={resolved} alt={alt || ''} onError={() => setErrored(true)} />;
}

const ThumbImg = styled.img`
  width: 36px;
  height: 36px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bgHover};
`;

const ThumbPlaceholder = styled.div`
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: ${({ theme }) => theme.colors.textMuted};
  background: ${({ theme }) => theme.colors.bgHover};
  border: 1px dashed ${({ theme }) => theme.colors.border};
`;

/** 편집 행에서 썸네일 + URL 입력을 세로 정렬 */
const ThumbColumn = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.xs};
`;

/** itemType 표시 배지 — 미지정/UNKNOWN 은 경고 색 */
const ItemTypeBadge = styled.span`
  display: inline-block;
  padding: 2px 8px;
  border-radius: ${({ theme }) => theme.layout?.cardRadius || '4px'};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  font-family: ${({ theme }) => theme.fonts.mono};
  ${({ $unsupported, theme }) => $unsupported
    ? `color: ${theme.colors.warning ?? theme.colors.error}; background: ${theme.colors.warningBg ?? theme.colors.errorBg}; border: 1px solid ${theme.colors.warning ?? theme.colors.error};`
    : `color: ${theme.colors.textSecondary}; background: ${theme.colors.bgHover}; border: 1px solid ${theme.colors.border};`}
`;

/** 인라인 편집 select — EditInput 과 시각 통일 */
const EditSelect = styled.select`
  height: 30px;
  padding: 0 ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.primary};
  border-radius: 4px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.bgCard};
  cursor: pointer;
  min-width: 140px;

  &:focus {
    outline: none;
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.primaryLight};
  }
`;

const Th = styled.th`
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  text-align: left;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgHover};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  white-space: nowrap;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const Td = styled.td`
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ muted, theme }) => muted ? theme.colors.textMuted : theme.colors.textPrimary};
  font-family: ${({ mono, theme }) => mono ? theme.fonts.mono : 'inherit'};
  font-weight: ${({ bold, theme }) => bold ? theme.fontWeights.medium : 'inherit'};
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight};
  white-space: nowrap;

  tr:last-child & { border-bottom: none; }
`;

const EditRow = styled.tr`
  background: ${({ theme }) => theme.colors.primaryBg};

  td {
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
    padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.lg};
  }
`;

const EditInput = styled.input`
  height: 30px;
  padding: 0 ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.primary};
  border-radius: 4px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.bgCard};
  width: 100%;
  min-width: 100px;

  &:focus {
    outline: none;
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.primaryLight};
  }

  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
`;

const ActiveCheckbox = styled.input`
  width: 16px;
  height: 16px;
  accent-color: ${({ theme }) => theme.colors.primary};
  cursor: pointer;
`;

const ActiveToggle = styled.button`
  background: none;
  border: none;
  padding: 0;
  cursor: ${({ disabled }) => disabled ? 'not-allowed' : 'pointer'};
  opacity: ${({ disabled }) => disabled ? 0.5 : 1};
  transition: opacity ${({ theme }) => theme.transitions.fast};

  &:hover:not(:disabled) {
    opacity: 0.75;
  }
`;

const ActionGroup = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const IconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  transition: opacity ${({ theme }) => theme.transitions.fast};

  ${({ $variant, theme }) => {
    switch ($variant) {
      case 'success':
        return `color: #ffffff; background: ${theme.colors.success};`;
      default:
        return `color: ${theme.colors.textSecondary}; background: ${theme.colors.bgHover}; border: 1px solid ${theme.colors.border};`;
    }
  }}

  &:hover:not(:disabled) { opacity: 0.8; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

const EditButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.bgHover};
    color: ${({ theme }) => theme.colors.primary};
    border-color: ${({ theme }) => theme.colors.primary};
  }

  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

const CenterMsg = styled.p`
  padding: ${({ theme }) => theme.spacing.xxl};
  text-align: center;
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.md};
`;
