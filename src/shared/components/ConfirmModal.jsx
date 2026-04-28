/**
 * 공용 확인 모달 (Confirm / Alert 대체).
 *
 * window.confirm / window.alert 의 네이티브 팝업을 대체하는 Promise/Callback 기반 모달.
 * 2026-04-14 신규 — 구독 연장/취소 alert 제거 요청 대응으로 추가.
 *
 * 두 모드를 지원한다:
 * 1. confirm : 취소 + 확인 2버튼 (파괴적 액션 확인)
 * 2. alert   : 확인 1버튼 (안내만)
 *
 * 메모 입력이 필요한 경우 `withReason=true` 로 설정하면 textarea 가 표시되며,
 * onConfirm 콜백에 입력값이 전달된다.
 *
 * @param {Object}   props
 * @param {boolean}  props.isOpen         - 모달 열림 여부
 * @param {string}   props.title          - 타이틀
 * @param {ReactNode} props.description   - 본문(문자열 또는 JSX)
 * @param {string}   [props.confirmText]  - 확인 버튼 텍스트 (기본 "확인")
 * @param {string}   [props.cancelText]   - 취소 버튼 텍스트 (기본 "취소")
 * @param {string}   [props.variant]      - primary|danger|warning|success (기본 primary)
 * @param {boolean}  [props.withReason]   - 메모 입력 필드 표시 여부
 * @param {string}   [props.reasonLabel]  - 메모 필드 레이블
 * @param {string}   [props.reasonPlaceholder]
 * @param {boolean}  [props.reasonRequired] - 메모 필수 여부
 * @param {boolean}  [props.loading]      - 진행 중 표시
 * @param {string}   [props.error]        - 에러 메시지
 * @param {Function} props.onConfirm      - (reason?) => void|Promise
 * @param {Function} props.onClose        - 취소/닫기 콜백
 */

import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { MdClose } from 'react-icons/md';

export default function ConfirmModal({
  isOpen,
  title,
  description,
  confirmText = '확인',
  cancelText = '취소',
  variant = 'primary',
  withReason = false,
  reasonLabel = '메모',
  reasonPlaceholder = '',
  reasonRequired = false,
  loading = false,
  error = null,
  onConfirm,
  onClose,
  hideCancel = false,
}) {
  /* 메모 입력 값 (withReason=true 일 때만 사용) */
  const [reason, setReason] = useState('');
  /* 내부 유효성 에러 (외부 error prop 보다 먼저 표시) */
  const [localError, setLocalError] = useState(null);

  /* 열릴 때마다 폼 초기화 */
  useEffect(() => {
    if (isOpen) {
      setReason('');
      setLocalError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleConfirm() {
    if (withReason && reasonRequired && !reason.trim()) {
      setLocalError(`${reasonLabel}는(은) 필수입니다.`);
      return;
    }
    setLocalError(null);
    try {
      await onConfirm?.(withReason ? reason.trim() : undefined);
    } catch {
      /* 호출부에서 error prop 으로 표시 */
    }
  }

  return (
    <Overlay onClick={loading ? undefined : onClose}>
      <ModalBox onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>{title}</ModalTitle>
          {!loading && (
            <CloseButton onClick={onClose} aria-label="닫기">
              <MdClose size={20} />
            </CloseButton>
          )}
        </ModalHeader>

        {description && <Description>{description}</Description>}

        {withReason && (
          <FormGroup>
            <FormLabel>
              {reasonLabel}
              {reasonRequired && <RequiredMark> *</RequiredMark>}
            </FormLabel>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setLocalError(null);
              }}
              placeholder={reasonPlaceholder}
              maxLength={500}
              disabled={loading}
            />
            <CharCount>{reason.length} / 500</CharCount>
          </FormGroup>
        )}

        {(localError || error) && (
          <ErrorMsg>{localError || error}</ErrorMsg>
        )}

        <ButtonRow>
          {!hideCancel && (
            <CancelButton type="button" onClick={onClose} disabled={loading}>
              {cancelText}
            </CancelButton>
          )}
          <ConfirmButton
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            $variant={variant}
          >
            {loading ? '처리 중...' : confirmText}
          </ConfirmButton>
        </ButtonRow>
      </ModalBox>
    </Overlay>
  );
}

/* ── styled-components ── */

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
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
  max-width: 440px;
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

  &:hover {
    background: ${({ theme }) => theme.colors.bgHover};
  }
`;

const Description = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  line-height: 1.6;
  margin-bottom: ${({ theme }) => theme.spacing.xl};
  white-space: pre-line;
`;

const FormGroup = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const FormLabel = styled.label`
  display: block;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const RequiredMark = styled.span`
  color: ${({ theme }) => theme.colors.error};
`;

const Textarea = styled.textarea`
  width: 100%;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
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

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const CharCount = styled.div`
  text-align: right;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  margin-top: ${({ theme }) => theme.spacing.xs};
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

/** variant 별 색상 매핑 */
function variantColor(theme, variant) {
  switch (variant) {
    case 'danger':  return theme.colors.error;
    case 'warning': return theme.colors.warning ?? '#f59e0b';
    case 'success': return theme.colors.success;
    default:        return theme.colors.primary;
  }
}

const ConfirmButton = styled.button`
  height: 36px;
  padding: 0 ${({ theme }) => theme.spacing.xl};
  border-radius: 6px;
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: #ffffff;
  background: ${({ theme, $variant }) => variantColor(theme, $variant)};
  transition: opacity ${({ theme }) => theme.transitions.fast};

  &:hover:not(:disabled) {
    opacity: 0.85;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
