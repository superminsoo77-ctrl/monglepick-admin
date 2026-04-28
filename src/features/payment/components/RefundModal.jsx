/**
 * 환불 처리 모달 컴포넌트.
 *
 * 관리자가 결제 주문을 환불 처리할 때 사용한다.
 * 환불 사유를 입력하고 refundOrder API를 호출하면 전액 환불로 처리된다.
 *
 * 2026-04-09 변경: 부분 환불 UI 제거 (P0-1 데이터 무결성 이슈 대응)
 *   - 기존에는 "전액/부분" 라디오 + 금액 입력 필드가 있었으나,
 *     백엔드 `PaymentService.refundOrder(orderId, userId, reason)` 시그니처에는
 *     amount 파라미터가 없어서 부분 금액을 입력해도 항상 전액 환불로 처리되었다.
 *   - UI가 "부분 환불 성공"으로 표시되지만 실제로는 전액이 환불되는
 *     심각한 오인 피드백을 유발했으므로 부분 환불 옵션을 일괄 제거한다.
 *   - 도메인 레이어에 부분 환불(amount 파라미터 + Toss 부분취소 +
 *     포인트 비례 회수 + 재환불 정책)을 추가하는 작업은 별도 이슈로 분리한다.
 *
 * @param {Object}   props
 * @param {boolean}  props.isOpen    - 모달 열림 여부
 * @param {Object}   props.order     - 환불할 주문 정보 { orderId, amount, userId, ... }
 * @param {Function} props.onClose   - 닫기 콜백
 * @param {Function} props.onSuccess - 환불 성공 후 콜백 (목록 새로고침용)
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { MdClose } from 'react-icons/md';
import { refundOrder } from '../api/paymentApi';
import { useAiPrefill } from '@/shared/hooks/useAiPrefill';
import AiPrefillBanner from '@/shared/components/AiPrefillBanner';

export default function RefundModal({ isOpen, order, onClose, onSuccess }) {
  /* v3 Phase G: AI Assistant 가 state.draft 에 reason 을 실어 보낸 경우 초기값으로 주입 */
  const { draft: aiDraft, isAiGenerated } = useAiPrefill();

  /* 환불 사유 입력값 */
  const [reason, setReason] = useState('');
  /* API 호출 중 로딩 상태 */
  const [loading, setLoading] = useState(false);
  /* 사용자에게 노출할 에러 메시지 */
  const [error, setError] = useState(null);

  /* 모달 열릴 때마다 폼 초기화 */
  useEffect(() => {
    if (isOpen) {
      setReason(aiDraft?.reason ?? '');
      setError(null);
    }
  }, [isOpen, aiDraft]);

  /* 모달 닫혀있으면 렌더링 생략 */
  if (!isOpen || !order) return null;

  /** 환불 처리 제출 — 백엔드는 항상 전액 환불 */
  async function handleSubmit(e) {
    e.preventDefault();

    if (!reason.trim()) {
      setError('환불 사유를 입력해주세요.');
      return;
    }

    /* 백엔드 refundOrder(orderId, userId, reason) 시그니처에 amount 가 없으므로
     * reason 만 전달한다. 부분 환불은 별도 이슈로 지원 예정. */
    const payload = { reason: reason.trim() };

    try {
      setLoading(true);
      setError(null);
      await refundOrder(order.orderId, payload);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message || '환불 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Overlay onClick={onClose}>
      {/* 내부 클릭 시 닫힘 방지 */}
      <ModalBox onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <ModalHeader>
          <ModalTitle>환불 처리</ModalTitle>
          <CloseButton onClick={onClose} aria-label="닫기">
            <MdClose size={20} />
          </CloseButton>
        </ModalHeader>

        {/* v3 Phase G: AI 프리필 배너 — state.draft 로 진입했을 때만 노출 */}
        {isAiGenerated && aiDraft && <AiPrefillBanner />}

        {/* 주문 정보 요약 */}
        <OrderSummary>
          <SummaryRow>
            <SummaryLabel>주문 ID</SummaryLabel>
            <SummaryValue>{order.orderId}</SummaryValue>
          </SummaryRow>
          <SummaryRow>
            <SummaryLabel>결제 금액</SummaryLabel>
            <SummaryValue highlight>{order.amount?.toLocaleString()}원</SummaryValue>
          </SummaryRow>
          {order.userId && (
            <SummaryRow>
              <SummaryLabel>사용자</SummaryLabel>
              <SummaryValue>{order.userId}</SummaryValue>
            </SummaryRow>
          )}
        </OrderSummary>

        {/* 전액 환불 안내 — 부분 환불 미지원 (2026-04-09) */}
        <FullRefundNotice>
          이 요청은 <strong>전액 환불</strong>로 처리됩니다.
          <br />
          POINT_PACK 주문은 지급된 포인트도 자동으로 회수됩니다.
          <br />
          <NoticeSub>※ 부분 환불은 현재 지원되지 않습니다.</NoticeSub>
        </FullRefundNotice>

        {/* 환불 폼 */}
        <form onSubmit={handleSubmit}>
          {/* 환불 사유 */}
          <FormGroup>
            <FormLabel>환불 사유 <RequiredMark>*</RequiredMark></FormLabel>
            <Textarea
              rows={4}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError(null);
              }}
              placeholder="환불 사유를 상세히 입력해주세요."
              maxLength={500}
            />
            <CharCount>{reason.length} / 500</CharCount>
          </FormGroup>

          {/* 에러 메시지 */}
          {error && <ErrorMsg>{error}</ErrorMsg>}

          {/* 액션 버튼 */}
          <ButtonRow>
            <CancelButton type="button" onClick={onClose} disabled={loading}>
              취소
            </CancelButton>
            <ConfirmButton type="submit" disabled={loading}>
              {loading ? '처리 중...' : '전액 환불'}
            </ConfirmButton>
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
  max-width: 480px;
  padding: ${({ theme }) => theme.spacing.xxl};
  max-height: 90vh;
  overflow-y: auto;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.xl};
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

const OrderSummary = styled.div`
  background: ${({ theme }) => theme.colors.bgHover};
  border-radius: 6px;
  padding: ${({ theme }) => theme.spacing.lg};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const SummaryRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.xs} 0;

  & + & {
    border-top: 1px solid ${({ theme }) => theme.colors.borderLight};
  }
`;

const SummaryLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const SummaryValue = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ $highlight, theme }) =>
    $highlight ? theme.colors.error : theme.colors.textPrimary};
  font-family: ${({ theme }) => theme.fonts.mono};
`;

const FormGroup = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const FormLabel = styled.label`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const RequiredMark = styled.span`
  color: ${({ theme }) => theme.colors.error};
`;

/**
 * 전액 환불 안내 박스.
 * 부분 환불 UI 제거(2026-04-09)에 따른 사용자 오인 차단용 안내.
 * 경고 톤의 옅은 배경 + 좌측 컬러 바로 주의를 끌되 파괴적 느낌은 배제한다.
 */
const FullRefundNotice = styled.div`
  background: ${({ theme }) => theme.colors.bgHover};
  border-left: 3px solid ${({ theme }) => theme.colors.error};
  border-radius: 6px;
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.textPrimary};

  strong {
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
    color: ${({ theme }) => theme.colors.error};
  }
`;

/** 안내 박스 하단 보조 문구(부분 환불 미지원 고지) */
const NoticeSub = styled.span`
  display: inline-block;
  margin-top: ${({ theme }) => theme.spacing.xs};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
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

const ConfirmButton = styled.button`
  height: 36px;
  padding: 0 ${({ theme }) => theme.spacing.xl};
  border-radius: 6px;
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: #ffffff;
  background: ${({ theme }) => theme.colors.error};
  transition: opacity ${({ theme }) => theme.transitions.fast};

  &:hover:not(:disabled) {
    opacity: 0.85;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
