/**
 * 포인트 아이템 신규 등록 모달 — 2026-04-09 P1-⑪ 신규.
 *
 * Backend `POST /api/v1/admin/point/items` 엔드포인트와 `AdminPaymentService.createPointItem()`
 * 서비스는 이미 구현되어 있었으나, Frontend 에서 호출하는 UI 가 없어서 관리자가 신규
 * 포인트 아이템을 추가할 수 없는 공백 상태였다. 본 모달이 해당 공백을 메운다.
 *
 * ## 설계 결정
 * - **Backend DTO 필드명 그대로 사용** — `PointItemCreateRequest` (AdminPaymentDto.java) 는
 *   `itemName/itemDescription/itemPrice/itemCategory/isActive` 로 필드를 받으므로, 혼선
 *   없이 Backend DTO 스펙과 완전히 일치하는 key 로 전송한다. 기존 `PointItemTable` 이
 *   내부적으로 `item.name/price/...` 로 접근하는 것과는 별도의 "전송 레이어" 문제이며,
 *   등록 성공 후에는 {@link PointItemTable} 의 {@code loadItems()} 를 재호출하여 목록을
 *   재조회하므로 응답 형식 매핑에 의존하지 않는다.
 * - **유효성 검사**: 상품명 필수 / 가격 0 이상 / 카테고리 50자 이하. Backend 의 Bean
 *   Validation 과 동일한 기준을 클라이언트에서도 선검증하여 네트워크 비용을 절약한다.
 * - **카테고리 선택**: Backend 는 nullable 허용 + 기본 "general" 로 fallback 하므로, UI 에서는
 *   비워두는 것이 합법이다. 다만 운영 혼선을 줄이기 위해 기존 `PointItemTable` 이 사용하는
 *   카테고리 코드 5개(`SUBSCRIPTION_DISCOUNT`/`EXTRA_QUOTA`/`PROFILE_ITEM`/`GIFT`/`ETC`) 를
 *   드롭다운으로 제공하고, "기타/수동 입력" 옵션도 둔다.
 *
 * ## Props
 * @param {Object}   props
 * @param {boolean}  props.isOpen    - 모달 열림 여부
 * @param {Function} props.onClose   - 닫기 콜백
 * @param {Function} props.onCreated - 등록 성공 시 콜백 (목록 재조회용)
 */

import { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { MdClose, MdUpload } from 'react-icons/md';
import { createPointItem, uploadPointItemImage } from '../api/paymentApi';

/**
 * 카테고리 드롭다운 옵션 — 2026-04-27 정합화.
 *
 * Backend `PointItemCategory` 상수(소문자 5종) 와 동기화. 기존 레거시 enum
 * (`SUBSCRIPTION_DISCOUNT`/`PROFILE_ITEM` 등) 은 PointItemInitializer 가 비활성화
 * 처리하므로 신규 등록에서는 노출하지 않는다.
 *
 * "미지정"을 선택하면 Backend 가 기본 "general" 로 저장한다(상점 노출용 일반 카테고리).
 */
const CATEGORY_OPTIONS = [
  { value: '',         label: '미지정 (general)' },
  { value: 'avatar',   label: '아바타 (프로필 꾸미기)' },
  { value: 'badge',    label: '배지 (프로필 꾸미기)' },
  { value: 'coupon',   label: '쿠폰 (AI 이용권 등)' },
  { value: 'apply',    label: '응모권' },
  { value: 'hint',     label: '힌트' },
];

/**
 * 지급 분기 키(itemType) 드롭다운 옵션 — 2026-04-27 신규.
 *
 * Backend `PointItemType` enum 과 1:1 동기화. 미지정(빈값)은 NULL 로 저장되며,
 * 교환 시점에 UNSUPPORTED 로 판정되어 차단되므로 운영자가 누락을 시각적으로 인지할 수 있다.
 *
 * 신규 아바타·배지를 추가할 때는 카테고리 단위 `*_GENERIC` 옵션을 권장한다 — 운영자가 enum
 * 추가 없이 행 데이터(이미지/이름/유효기간)만 변경하면 새 아이템이 동작한다.
 */
const ITEM_TYPE_OPTIONS = [
  { value: '',                   label: '미지정 (교환 차단됨)', group: '' },
  /* 아바타·배지 일반화 sentinel — 신규 등록 시 권장 */
  { value: 'AVATAR_GENERIC',     label: '아바타 - 일반 (영구)',          group: '꾸미기' },
  { value: 'BADGE_GENERIC',      label: '배지 - 일반 (유효기간 가변)',  group: '꾸미기' },
  /* 레거시 호환 — 기존 시드 수정 시에만 사용 */
  { value: 'AVATAR_MONGLE',      label: '아바타 - 몽글이 (레거시)',     group: '레거시' },
  { value: 'BADGE_PREMIUM',      label: '배지 - 프리미엄 (30일 고정)',  group: '레거시' },
  /* AI 이용권 4종 */
  { value: 'AI_TOKEN_1',         label: 'AI 이용권 1회 (30일)',  group: 'AI 이용권' },
  { value: 'AI_TOKEN_5',         label: 'AI 이용권 5회 (30일)',  group: 'AI 이용권' },
  { value: 'AI_TOKEN_20',        label: 'AI 이용권 20회 (30일)', group: 'AI 이용권' },
  { value: 'AI_TOKEN_50',        label: 'AI 이용권 50회 (60일)', group: 'AI 이용권' },
  /* 기타 */
  { value: 'APPLY_MOVIE_TICKET', label: '영화 티켓 응모권',           group: '기타' },
  { value: 'QUIZ_HINT',          label: '퀴즈 힌트',                  group: '기타' },
];

/** 폼 초기값 — 모달 재오픈 시에도 동일한 값으로 리셋 */
const INITIAL_FORM = {
  itemName: '',
  itemDescription: '',
  itemPrice: '',
  itemCategory: '',
  itemType: '',
  amount: '',
  durationDays: '',
  imageUrl: '',
  isActive: true,
};

export default function PointItemCreateModal({ isOpen, onClose, onCreated }) {
  /* ── 폼 상태 ── */
  const [form, setForm]       = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  /* 이미지 업로드 진행 상태 — 업로드 중에는 등록 버튼 비활성화 */
  const [uploading, setUploading] = useState(false);
  /* 숨김 file input 참조 — "파일 선택" 버튼 클릭 시 트리거 */
  const fileInputRef = useRef(null);

  /**
   * 카테고리 → 업로드 subdir 매핑.
   *
   * Backend ImageService 의 ADMIN_ALLOWED_SUBDIRS = {avatars, badges} 만 허용.
   * 그 외 카테고리(coupon/apply/hint 등)는 일반적으로 이미지가 필요 없거나 카테고리 아이콘으로
   * 대체되므로 업로드 버튼 자체를 비활성화한다.
   */
  function resolveUploadSubdir(category) {
    if (category === 'avatar') return 'avatars';
    if (category === 'badge')  return 'badges';
    return null;
  }

  /* 모달이 열릴 때마다 폼 초기화 — 이전 입력 잔존 방지 */
  useEffect(() => {
    if (isOpen) {
      setForm(INITIAL_FORM);
      setError(null);
    }
  }, [isOpen]);

  /* 모달이 닫혀있으면 렌더링 생략 (키 다운 이벤트 등 비용 절약) */
  if (!isOpen) return null;

  /** 폼 필드 변경 헬퍼 — 입력 중 에러 메시지 자동 소거 */
  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  /**
   * 파일 선택 → 즉시 업로드 → imageUrl 자동 채움.
   *
   * 1. 카테고리에서 subdir 결정 (avatar→avatars / badge→badges)
   * 2. 클라이언트 측 사전 검증 (5MB / 허용 MIME)
   * 3. POST multipart 업로드
   * 4. 응답 URL 을 form.imageUrl 에 자동 입력
   *
   * 실패 시 error 상태로 안내. 같은 파일을 재선택해도 onChange 가 트리거되도록
   * input.value 를 매번 초기화한다.
   */
  async function handleFileSelected(e) {
    const file = e.target.files?.[0];
    /* input value 초기화 — 같은 파일 재선택 가능 */
    if (e.target) e.target.value = '';
    if (!file) return;

    const subdir = resolveUploadSubdir(form.itemCategory);
    if (!subdir) {
      setError('이미지 업로드는 카테고리가 아바타/배지일 때만 가능합니다.');
      return;
    }

    /* 사전 크기 검증 — 서버 한도(5MB) 와 동일 */
    const MAX_BYTES = 5 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      setError('파일 크기는 5MB 이하여야 합니다.');
      return;
    }

    /* 사전 MIME 검증 — 서버에서도 magic bytes 로 재검증되므로 1차 안내 목적 */
    const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (file.type && !ALLOWED_MIME.includes(file.type)) {
      setError('JPG/PNG/GIF/WEBP/SVG 형식만 업로드 가능합니다.');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      const result = await uploadPointItemImage(file, subdir);
      const url = result?.url || result?.data?.url;
      if (!url) {
        setError('업로드 응답이 비었습니다. 다시 시도해 주세요.');
        return;
      }
      setForm((prev) => ({ ...prev, imageUrl: url }));
    } catch (err) {
      setError(err?.message ?? '이미지 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  }

  /**
   * 등록 제출.
   *
   * 1. 클라이언트 측 유효성 검사 — 필수 필드, 가격 범위
   * 2. Backend DTO 형식으로 변환 (itemPrice 를 Number 로 캐스트)
   * 3. createPointItem() 호출
   * 4. 성공 시 onCreated 콜백으로 상위 컴포넌트에 알림 + 모달 닫기
   * 5. 실패 시 에러 메시지 표시
   */
  async function handleSubmit(e) {
    e.preventDefault();

    /* ── 유효성 검사 ── */
    const itemName = form.itemName.trim();
    if (!itemName) {
      setError('상품명을 입력해주세요.');
      return;
    }
    if (itemName.length > 200) {
      setError('상품명은 최대 200자까지 입력 가능합니다.');
      return;
    }

    const priceStr = String(form.itemPrice).trim();
    if (!priceStr) {
      setError('필요 포인트를 입력해주세요.');
      return;
    }
    const priceNum = Number(priceStr);
    if (!Number.isFinite(priceNum) || !Number.isInteger(priceNum) || priceNum < 0) {
      setError('필요 포인트는 0 이상의 정수여야 합니다.');
      return;
    }

    /* ── 선택 필드 검증 — 빈값/숫자 변환 ── */
    const amountNum = form.amount === '' || form.amount == null
      ? null
      : Number(form.amount);
    if (amountNum !== null && (!Number.isFinite(amountNum) || !Number.isInteger(amountNum) || amountNum < 0)) {
      setError('지급 수량은 0 이상의 정수여야 합니다.');
      return;
    }
    const durationNum = form.durationDays === '' || form.durationDays == null
      ? null
      : Number(form.durationDays);
    if (durationNum !== null && (!Number.isFinite(durationNum) || !Number.isInteger(durationNum) || durationNum < 0)) {
      setError('유효기간(일)은 0 이상의 정수여야 합니다 (무기한이면 비워두세요).');
      return;
    }

    /* ── Backend DTO 형식으로 payload 구성 ──
     * Backend `PointItemCreateRequest` 의 필드명과 1:1 매핑.
     * 빈 문자열은 null 로 정규화하여 "입력 안 함"을 명확히 한다. */
    const payload = {
      itemName,
      itemDescription: form.itemDescription.trim() || null,
      itemPrice: priceNum,
      itemCategory: form.itemCategory || null,
      itemType: form.itemType || null,
      amount: amountNum,
      durationDays: durationNum,
      imageUrl: form.imageUrl.trim() || null,
      isActive: !!form.isActive,
    };

    try {
      setLoading(true);
      setError(null);
      await createPointItem(payload);

      /* 등록 성공 — 상위에 알림 후 모달 닫기.
       * onCreated 는 loadItems() 재호출이 일반적. 응답 객체를 쓰지 않는 이유는
       * 기존 PointItemTable 이 내부적으로 사용하는 필드명(item.name 등)과 응답 DTO
       * 필드명(itemName 등)이 불일치하기 때문이다. 재조회로 일관성을 유지한다. */
      onCreated?.();
      onClose();
    } catch (err) {
      setError(err?.message ?? '등록 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Overlay onClick={onClose}>
      {/* 내부 클릭이 오버레이까지 전파되지 않도록 stopPropagation */}
      <ModalBox onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <ModalHeader>
          <ModalTitle>포인트 아이템 신규 등록</ModalTitle>
          <CloseButton onClick={onClose} aria-label="닫기" type="button">
            <MdClose size={20} />
          </CloseButton>
        </ModalHeader>

        {/* 안내 문구 */}
        <Notice>
          사용자가 <strong>포인트로 교환</strong>할 수 있는 신규 상품을 등록합니다.
          <br />
          등록 직후 "활성" 상태이면 포인트 상점 화면에 즉시 노출됩니다.
        </Notice>

        {/* 입력 폼 */}
        <form onSubmit={handleSubmit}>
          {/* 상품명 */}
          <FormGroup>
            <FormLabel>
              상품명 <RequiredMark>*</RequiredMark>
            </FormLabel>
            <TextInput
              type="text"
              value={form.itemName}
              onChange={(e) => handleChange('itemName', e.target.value)}
              placeholder="예: 프리미엄 프로필 테두리"
              maxLength={200}
              autoFocus
            />
          </FormGroup>

          {/* 설명 */}
          <FormGroup>
            <FormLabel>설명</FormLabel>
            <Textarea
              rows={3}
              value={form.itemDescription}
              onChange={(e) => handleChange('itemDescription', e.target.value)}
              placeholder="상품 설명 (선택)"
              maxLength={500}
            />
          </FormGroup>

          {/* 가격 + 카테고리 가로 배치 */}
          <FormRow>
            <FormGroup style={{ flex: 1 }}>
              <FormLabel>
                필요 포인트 <RequiredMark>*</RequiredMark>
              </FormLabel>
              <TextInput
                type="number"
                min={0}
                step={1}
                value={form.itemPrice}
                onChange={(e) => handleChange('itemPrice', e.target.value)}
                placeholder="0"
              />
            </FormGroup>

            <FormGroup style={{ flex: 1 }}>
              <FormLabel>카테고리</FormLabel>
              <Select
                value={form.itemCategory}
                onChange={(e) => handleChange('itemCategory', e.target.value)}
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </FormGroup>
          </FormRow>

          {/* 지급 분기 키 (itemType) — 아바타·배지 추가 시 GENERIC 권장 */}
          <FormGroup>
            <FormLabel>
              지급 분기 키 (itemType) <RequiredMark>*</RequiredMark>
            </FormLabel>
            <Select
              value={form.itemType}
              onChange={(e) => handleChange('itemType', e.target.value)}
            >
              {/* 그룹별로 optgroup 으로 묶어 가독성 확보 */}
              <option value="">미지정 (등록 후 교환 차단됨 — 권장 안 함)</option>
              {['꾸미기', 'AI 이용권', '응모권/힌트/레거시'].map((groupLabel) => {
                const opts = ITEM_TYPE_OPTIONS.filter((o) => {
                  if (groupLabel === '꾸미기') return o.group === '꾸미기';
                  if (groupLabel === 'AI 이용권') return o.group === 'AI 이용권';
                  return o.group === '기타' || o.group === '레거시';
                });
                if (opts.length === 0) return null;
                return (
                  <optgroup key={groupLabel} label={groupLabel}>
                    {opts.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </optgroup>
                );
              })}
            </Select>
            <FieldHint>
              신규 아바타·배지는 <strong>AVATAR_GENERIC</strong> / <strong>BADGE_GENERIC</strong> 을 권장합니다.
              미지정 시 사용자가 구매를 시도하면 "현재 판매되지 않는 아이템" 으로 차단됩니다.
            </FieldHint>
          </FormGroup>

          {/* 이미지 URL — 아바타/배지 시각화. 업로드 또는 직접 입력 둘 다 지원. */}
          <FormGroup>
            <FormLabel>이미지</FormLabel>
            <ImageRow>
              <ImagePreview>
                {form.imageUrl ? (
                  <img
                    src={form.imageUrl}
                    alt="미리보기"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                ) : (
                  <ImagePreviewEmpty>없음</ImagePreviewEmpty>
                )}
              </ImagePreview>
              <ImageInputs>
                <TextInput
                  type="text"
                  value={form.imageUrl}
                  onChange={(e) => handleChange('imageUrl', e.target.value)}
                  placeholder="/avatars/mongle.svg 또는 https://cdn.example.com/badges/star.png"
                  maxLength={500}
                />
                {/* 숨김 file input — 버튼 클릭으로 트리거 */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/svg+xml,image/png,image/jpeg,image/gif,image/webp"
                  style={{ display: 'none' }}
                  onChange={handleFileSelected}
                />
                <UploadButton
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || !resolveUploadSubdir(form.itemCategory)}
                  title={
                    !resolveUploadSubdir(form.itemCategory)
                      ? '아바타/배지 카테고리에서만 업로드 가능합니다'
                      : '파일 선택'
                  }
                >
                  <MdUpload size={16} />
                  {uploading ? '업로드 중...' : '파일 업로드'}
                </UploadButton>
              </ImageInputs>
            </ImageRow>
            <FieldHint>
              <strong>업로드</strong>(권장): 카테고리를 아바타/배지로 지정한 뒤 SVG/PNG (5MB 이하) 파일 선택.
              저장된 파일은 Backend <code>admin-assets/</code> 디렉토리에 격리됩니다. 또는 정적 자산 경로를 직접 입력할 수도 있습니다 (예: <code>/avatars/mongle.svg</code>).
            </FieldHint>
          </FormGroup>

          {/* 수량 + 유효기간 가로 배치 */}
          <FormRow>
            <FormGroup style={{ flex: 1 }}>
              <FormLabel>지급 수량 (amount)</FormLabel>
              <TextInput
                type="number"
                min={0}
                step={1}
                value={form.amount}
                onChange={(e) => handleChange('amount', e.target.value)}
                placeholder="비워두면 itemType 기본값"
              />
              <FieldHint>AI 이용권은 회수, 인벤토리 아이템은 발급 수(보통 1).</FieldHint>
            </FormGroup>

            <FormGroup style={{ flex: 1 }}>
              <FormLabel>유효기간 (일)</FormLabel>
              <TextInput
                type="number"
                min={0}
                step={1}
                value={form.durationDays}
                onChange={(e) => handleChange('durationDays', e.target.value)}
                placeholder="비워두면 무기한"
              />
              <FieldHint>아바타는 영구(빈값), 배지는 7/30/90일 등 자유.</FieldHint>
            </FormGroup>
          </FormRow>

          {/* 활성 여부 */}
          <CheckboxRow>
            <input
              id="createPointItem-isActive"
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => handleChange('isActive', e.target.checked)}
            />
            <label htmlFor="createPointItem-isActive">
              등록 직후 활성화 (체크 해제 시 숨김 상태로 저장)
            </label>
          </CheckboxRow>

          {/* 에러 메시지 */}
          {error && <ErrorMsg>{error}</ErrorMsg>}

          {/* 액션 버튼 */}
          <ButtonRow>
            <CancelButton type="button" onClick={onClose} disabled={loading || uploading}>
              취소
            </CancelButton>
            <SubmitButton type="submit" disabled={loading || uploading}>
              {loading ? '등록 중...' : '등록'}
            </SubmitButton>
          </ButtonRow>
        </form>
      </ModalBox>
    </Overlay>
  );
}

/* ── styled-components ── */

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalBox = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  width: 100%;
  max-width: 520px;
  padding: ${({ theme }) => theme.spacing.xxl};
  max-height: 90vh;
  overflow-y: auto;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const ModalTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.heading};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  transition: background ${({ theme }) => theme.transitions.fast};

  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
`;

/** 상단 안내 박스 */
const Notice = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgHover};
  border-left: 3px solid ${({ theme }) => theme.colors.primary};
  border-radius: 4px;
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  margin-bottom: ${({ theme }) => theme.spacing.xl};

  strong {
    color: ${({ theme }) => theme.colors.primary};
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
  }
`;

const FormGroup = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

/** 가격 + 카테고리 가로 배치용 래퍼 */
const FormRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const FormLabel = styled.label`
  display: block;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const RequiredMark = styled.span`
  color: ${({ theme }) => theme.colors.error};
  margin-left: 2px;
`;

/** 이미지 영역 컨테이너 — 미리보기 + 입력/업로드 가로 배치 */
const ImageRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.md};
`;

/** 이미지 미리보기 박스 — 64x64 썸네일 */
const ImagePreview = styled.div`
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bgHover};
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }
`;

const ImagePreviewEmpty = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
`;

/** 이미지 미리보기 옆 — URL 입력 + 업로드 버튼 세로 배치 */
const ImageInputs = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  min-width: 0;
`;

/** 파일 업로드 버튼 */
const UploadButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  align-self: flex-start;
  padding: 6px ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.primary};
  border-radius: 6px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.primary};
  background: ${({ theme }) => theme.colors.bgCard};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primary};
    color: #fff;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    color: ${({ theme }) => theme.colors.textMuted};
    border-color: ${({ theme }) => theme.colors.border};
  }
`;

/** 입력 필드 하단 보조 안내 — 운영자가 권장값을 인지하도록 */
const FieldHint = styled.p`
  margin-top: ${({ theme }) => theme.spacing.xs};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  line-height: 1.5;

  strong { color: ${({ theme }) => theme.colors.primary}; font-weight: 600; }
  code {
    font-family: ${({ theme }) => theme.fonts.mono};
    background: ${({ theme }) => theme.colors.bgHover};
    padding: 1px 4px;
    border-radius: 3px;
  }
`;

const TextInput = styled.input`
  width: 100%;
  height: 36px;
  padding: 0 ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.bgCard};
  transition: border-color ${({ theme }) => theme.transitions.fast};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }

  /* 숫자 스피너 제거 */
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
`;

const Textarea = styled.textarea`
  width: 100%;
  padding: ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.bgCard};
  resize: vertical;
  font-family: ${({ theme }) => theme.fonts.base};
  transition: border-color ${({ theme }) => theme.transitions.fast};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const Select = styled.select`
  width: 100%;
  height: 36px;
  padding: 0 ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.bgCard};
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

/** 활성 체크박스 행 */
const CheckboxRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.lg};

  input[type='checkbox'] {
    width: 16px;
    height: 16px;
    accent-color: ${({ theme }) => theme.colors.primary};
    cursor: pointer;
  }

  label {
    font-size: ${({ theme }) => theme.fontSizes.sm};
    color: ${({ theme }) => theme.colors.textSecondary};
    cursor: pointer;
  }
`;

const ErrorMsg = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.error};
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid #fecaca;
  border-radius: 4px;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const ButtonRow = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.md};
`;

const CancelButton = styled.button`
  height: 36px;
  padding: 0 ${({ theme }) => theme.spacing.xl};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgCard};
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.bgHover};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SubmitButton = styled.button`
  height: 36px;
  padding: 0 ${({ theme }) => theme.spacing.xl};
  border-radius: 6px;
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: #ffffff;
  background: ${({ theme }) => theme.colors.primary};
  transition: opacity ${({ theme }) => theme.transitions.fast};

  &:hover:not(:disabled) {
    opacity: 0.85;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
