/**
 * 사용자 액션 모달 컴포넌트.
 *
 * 여섯 가지 모드를 하나의 컴포넌트에서 처리:
 * - 'role'          : 역할 변경 (USER ↔ ADMIN)
 * - 'suspend'       : 계정 정지 (사유 + durationDays 임시 정지)
 * - 'activate'      : 계정 복구 확인
 * - 'points'        : 수동 포인트 지급/회수 (Phase 6-2)
 * - 'grant-tokens'  : 수동 AI 이용권 발급 (Phase 6-3)
 * - 'history'       : 제재 이력 조회 (Phase 6-1 보강)
 *
 * @param {Object}   props
 * @param {boolean}  props.isOpen   - 모달 표시 여부
 * @param {string}   props.mode     - 'role' | 'suspend' | 'activate' | 'points' | 'grant-tokens' | 'history'
 * @param {Object}   props.user     - 대상 사용자 객체
 * @param {Function} props.onClose  - 모달 닫기 콜백
 * @param {Function} props.onSuccess - 처리 완료 후 콜백 (목록 갱신 등)
 * @param {Object}   [props.aiDraft]    - AI 어시스턴트가 채운 폼 초기값 (v3 Phase G).
 *                                       mode 별 draft 필드:
 *                                       - suspend: { reason, durationDays }
 *                                       - role:    { role }
 *                                       - points:  { amount, reason }
 *                                       - grant-tokens: { count, reason }
 * @param {boolean}  [props.aiDraftFromAssistant] - true 이면 모달 상단에 "AI 채움" 배너 노출
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import {
  updateUserRole,
  suspendUser,
  activateUser,
  adjustUserPoints,
  grantAiTokens,
  fetchSuspensionHistory,
} from '../api/usersApi';
import AiPrefillBanner from '@/shared/components/AiPrefillBanner';

/** 역할 옵션 */
const ROLE_OPTIONS = [
  { value: 'USER',  label: '일반 사용자 (USER)' },
  { value: 'ADMIN', label: '관리자 (ADMIN)' },
];

export default function UserActionModal({
  isOpen,
  mode,
  user,
  onClose,
  onSuccess,
  aiDraft = null,
  aiDraftFromAssistant = false,
}) {
  /* ── 폼 상태 ── */
  /** 역할 변경 모드: 선택된 역할 값 */
  const [selectedRole, setSelectedRole] = useState('USER');
  /** 계정 정지 모드: 정지 사유 텍스트 */
  const [suspendReason, setSuspendReason] = useState('');
  /** 계정 정지 모드: 임시 정지 일수 (''=영구) */
  const [durationDays, setDurationDays] = useState('');
  /** 포인트 조정 모드: 변동량 (양수=지급, 음수=회수) */
  const [pointAmount, setPointAmount] = useState('');
  /** 포인트/이용권 조정 공용 사유 */
  const [adjustReason, setAdjustReason] = useState('');
  /** 이용권 발급 모드: 발급 수량 */
  const [tokenCount, setTokenCount] = useState('');
  /** 제재 이력 모드: 이력 리스트 */
  const [historyList, setHistoryList] = useState([]);
  /** API 호출 중 로딩 상태 */
  const [loading, setLoading] = useState(false);
  /** 에러 메시지 */
  const [error, setError] = useState(null);

  /**
   * 모달이 열릴 때마다 폼 초기화.
   * 역할 변경 모드에서는 현재 사용자 역할을 기본값으로 설정.
   */
  useEffect(() => {
    if (isOpen) {
      // v3 Phase G: aiDraft 가 있으면 기본값 대신 draft 값으로 초기화.
      // mode 별 draft 필드가 다르므로 각각 분기 — 누락 필드는 기존 기본값 유지.
      const draft = aiDraft || {};
      setSelectedRole(draft.role ?? user?.userRole ?? 'USER');
      setSuspendReason(draft.reason ?? '');
      setDurationDays(
        draft.durationDays !== undefined && draft.durationDays !== null
          ? String(draft.durationDays)
          : '',
      );
      setPointAmount(
        draft.amount !== undefined && draft.amount !== null
          ? String(draft.amount)
          : '',
      );
      // points / grant-tokens 공용 사유 필드 — points 모드는 draft.reason, tokens 모드도 동일
      setAdjustReason(draft.reason ?? '');
      setTokenCount(
        draft.count !== undefined && draft.count !== null
          ? String(draft.count)
          : '',
      );
      setHistoryList([]);
      setError(null);

      // 'history' 모드이면 즉시 이력 조회
      if (mode === 'history' && user?.userId) {
        setLoading(true);
        fetchSuspensionHistory(user.userId)
          .then((list) => setHistoryList(Array.isArray(list) ? list : []))
          .catch((err) => setError(err.message || '이력 조회 실패'))
          .finally(() => setLoading(false));
      }
    }
  }, [isOpen, user, mode, aiDraft]);

  /** 모달 외부 클릭 시 닫기 */
  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  /**
   * 역할 변경 제출 핸들러.
   * PUT /admin/users/{userId}/role { role }
   */
  async function handleRoleSubmit(e) {
    e.preventDefault();
    if (!user?.userId) return;
    if (selectedRole === user.userRole) {
      setError('현재 역할과 동일합니다. 다른 역할을 선택해주세요.');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await updateUserRole(user.userId, { role: selectedRole });
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message || '역할 변경 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  /**
   * 계정 정지 제출 핸들러.
   * PUT /admin/users/{userId}/suspend { reason }
   */
  async function handleSuspendSubmit(e) {
    e.preventDefault();
    if (!user?.userId) return;
    if (!suspendReason.trim()) {
      setError('정지 사유를 입력해주세요.');
      return;
    }

    // 임시 정지 일수 파싱 — ''이면 영구 정지, 양수면 임시 정지
    let parsedDays = null;
    if (durationDays !== '') {
      const n = Number(durationDays);
      if (!Number.isInteger(n) || n <= 0) {
        setError('임시 정지 일수는 1 이상의 정수여야 합니다.');
        return;
      }
      parsedDays = n;
    }

    try {
      setLoading(true);
      setError(null);
      await suspendUser(user.userId, {
        reason: suspendReason.trim(),
        durationDays: parsedDays,
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message || '계정 정지 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  /**
   * 포인트 조정 제출 핸들러 (Phase 6-2).
   * POST /admin/users/{userId}/points/adjust { amount, reason }
   */
  async function handlePointsSubmit(e) {
    e.preventDefault();
    if (!user?.userId) return;
    const amount = Number(pointAmount);
    if (!Number.isInteger(amount) || amount === 0) {
      setError('변동량은 0이 아닌 정수여야 합니다. (양수=지급, 음수=회수)');
      return;
    }
    if (!adjustReason.trim()) {
      setError('사유를 입력해주세요.');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await adjustUserPoints(user.userId, {
        amount,
        reason: adjustReason.trim(),
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message || '포인트 조정 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  /**
   * AI 이용권 발급 제출 핸들러 (Phase 6-3).
   * POST /admin/users/{userId}/tokens/grant { count, reason }
   */
  async function handleGrantTokensSubmit(e) {
    e.preventDefault();
    if (!user?.userId) return;
    const count = Number(tokenCount);
    if (!Number.isInteger(count) || count < 1) {
      setError('발급 수량은 1 이상의 정수여야 합니다.');
      return;
    }
    if (!adjustReason.trim()) {
      setError('사유를 입력해주세요.');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await grantAiTokens(user.userId, {
        count,
        reason: adjustReason.trim(),
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message || '이용권 발급 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  /**
   * 계정 복구 제출 핸들러.
   * PUT /admin/users/{userId}/activate
   */
  async function handleActivateSubmit() {
    if (!user?.userId) return;
    try {
      setLoading(true);
      setError(null);
      await activateUser(user.userId);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message || '계정 복구 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  /* 모달이 닫혀 있으면 렌더링하지 않음 */
  if (!isOpen || !user) return null;

  return (
    <Overlay onClick={handleOverlayClick}>
      {/* ── 역할 변경 모달 ── */}
      {mode === 'role' && (
        <Modal onClick={(e) => e.stopPropagation()}>
          <ModalHeader>
            <ModalTitle>역할 변경</ModalTitle>
            <CloseButton onClick={onClose} title="닫기">✕</CloseButton>
          </ModalHeader>

          {aiDraftFromAssistant && aiDraft && (
            <AiPrefillBanner />
          )}

          <ModalBody>
            {/* 대상 사용자 요약 */}
            <UserSummary>
              <UserSummaryLabel>대상 사용자</UserSummaryLabel>
              <UserSummaryValue>
                {user.nickname ?? user.email ?? user.userId}
              </UserSummaryValue>
            </UserSummary>

            <Form onSubmit={handleRoleSubmit}>
              <FormRow>
                <Label htmlFor="role-select">변경할 역할</Label>
                <Select
                  id="role-select"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </Select>
              </FormRow>

              {/* 에러 메시지 */}
              {error && <ErrorMsg>{error}</ErrorMsg>}

              <ModalFooter>
                <CancelButton type="button" onClick={onClose} disabled={loading}>
                  취소
                </CancelButton>
                <PrimaryButton type="submit" disabled={loading}>
                  {loading ? '변경 중...' : '역할 변경'}
                </PrimaryButton>
              </ModalFooter>
            </Form>
          </ModalBody>
        </Modal>
      )}

      {/* ── 계정 정지 모달 ── */}
      {mode === 'suspend' && (
        <Modal onClick={(e) => e.stopPropagation()}>
          <ModalHeader>
            <ModalTitle>계정 정지</ModalTitle>
            <CloseButton onClick={onClose} title="닫기">✕</CloseButton>
          </ModalHeader>

          {aiDraftFromAssistant && aiDraft && (
            <AiPrefillBanner />
          )}

          <ModalBody>
            {/* 대상 사용자 요약 */}
            <UserSummary>
              <UserSummaryLabel>대상 사용자</UserSummaryLabel>
              <UserSummaryValue>
                {user.nickname ?? user.email ?? user.userId}
              </UserSummaryValue>
            </UserSummary>

            <WarnNotice>
              계정을 정지하면 해당 사용자는 서비스에 로그인할 수 없습니다.
            </WarnNotice>

            <Form onSubmit={handleSuspendSubmit}>
              <FormRow>
                <Label htmlFor="suspend-reason">
                  정지 사유 <Required>*</Required>
                </Label>
                <Textarea
                  id="suspend-reason"
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  placeholder="정지 사유를 상세히 입력해주세요. (이 내용은 내부 기록에만 사용됩니다)"
                  rows={4}
                  maxLength={500}
                />
                <CharCount>{suspendReason.length} / 500</CharCount>
              </FormRow>

              <FormRow>
                <Label htmlFor="suspend-duration">
                  임시 정지 일수 (비워두면 영구 정지)
                </Label>
                <DurationInput
                  id="suspend-duration"
                  type="number"
                  min="1"
                  max="3650"
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value)}
                  placeholder="예: 7, 30, 90 (영구 정지는 비워두기)"
                />
                <DurationHint>
                  {durationDays !== '' && Number(durationDays) > 0
                    ? `${durationDays}일 후 자동 복구 대상 (user_status 이력에 기록됨)`
                    : '비워두면 관리자가 수동 복구하기 전까지 영구 정지'}
                </DurationHint>
              </FormRow>

              {/* 에러 메시지 */}
              {error && <ErrorMsg>{error}</ErrorMsg>}

              <ModalFooter>
                <CancelButton type="button" onClick={onClose} disabled={loading}>
                  취소
                </CancelButton>
                <DangerButton type="submit" disabled={loading || !suspendReason.trim()}>
                  {loading ? '처리 중...' : '계정 정지'}
                </DangerButton>
              </ModalFooter>
            </Form>
          </ModalBody>
        </Modal>
      )}

      {/* ── 수동 포인트 지급/회수 (Phase 6-2) ── */}
      {mode === 'points' && (
        <Modal onClick={(e) => e.stopPropagation()}>
          <ModalHeader>
            <ModalTitle>수동 포인트 조정</ModalTitle>
            <CloseButton onClick={onClose} title="닫기">✕</CloseButton>
          </ModalHeader>
          <ModalBody>
            <UserSummary>
              <UserSummaryLabel>대상 사용자</UserSummaryLabel>
              <UserSummaryValue>
                {user.nickname ?? user.email ?? user.userId}
              </UserSummaryValue>
            </UserSummary>
            <WarnNotice>
              양수=지급(bonus), 음수=회수(revoke), 0=불가.
              PointsHistory INSERT-ONLY 원장에 자동 기록됩니다.
            </WarnNotice>
            <Form onSubmit={handlePointsSubmit}>
              <FormRow>
                <Label htmlFor="point-amount">
                  변동량 <Required>*</Required>
                </Label>
                <DurationInput
                  id="point-amount"
                  type="number"
                  value={pointAmount}
                  onChange={(e) => setPointAmount(e.target.value)}
                  placeholder="예: 500 (지급) 또는 -300 (회수)"
                />
                <DurationHint>
                  {pointAmount !== '' && Number(pointAmount) !== 0
                    ? Number(pointAmount) > 0
                      ? `${Number(pointAmount).toLocaleString()}P 지급`
                      : `${Math.abs(Number(pointAmount)).toLocaleString()}P 회수 (잔액 부족 시 실패)`
                    : '양수=지급, 음수=회수, 0=금지'}
                </DurationHint>
              </FormRow>
              <FormRow>
                <Label htmlFor="point-reason">
                  사유 <Required>*</Required>
                </Label>
                <Textarea
                  id="point-reason"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="CS 보상, 운영 사고 복구, 프로모션 등"
                  rows={3}
                  maxLength={300}
                />
                <CharCount>{adjustReason.length} / 300</CharCount>
              </FormRow>
              {error && <ErrorMsg>{error}</ErrorMsg>}
              <ModalFooter>
                <CancelButton type="button" onClick={onClose} disabled={loading}>취소</CancelButton>
                <PrimaryButton type="submit" disabled={loading}>
                  {loading ? '처리 중...' : '실행'}
                </PrimaryButton>
              </ModalFooter>
            </Form>
          </ModalBody>
        </Modal>
      )}

      {/* ── 수동 AI 이용권 발급 (Phase 6-3) ── */}
      {mode === 'grant-tokens' && (
        <Modal onClick={(e) => e.stopPropagation()}>
          <ModalHeader>
            <ModalTitle>수동 AI 이용권 발급</ModalTitle>
            <CloseButton onClick={onClose} title="닫기">✕</CloseButton>
          </ModalHeader>
          <ModalBody>
            <UserSummary>
              <UserSummaryLabel>대상 사용자</UserSummaryLabel>
              <UserSummaryValue>
                {user.nickname ?? user.email ?? user.userId}
              </UserSummaryValue>
            </UserSummary>
            <WarnNotice>
              user_ai_quota.purchased_ai_tokens가 발급 수량만큼 증가합니다.
              사과 보상, 마케팅 캠페인, 운영 사고 복구 등에 사용하세요.
            </WarnNotice>
            <Form onSubmit={handleGrantTokensSubmit}>
              <FormRow>
                <Label htmlFor="token-count">
                  발급 수량 <Required>*</Required>
                </Label>
                <DurationInput
                  id="token-count"
                  type="number"
                  min="1"
                  max="1000"
                  value={tokenCount}
                  onChange={(e) => setTokenCount(e.target.value)}
                  placeholder="1 이상의 정수"
                />
              </FormRow>
              <FormRow>
                <Label htmlFor="token-reason">
                  발급 사유 <Required>*</Required>
                </Label>
                <Textarea
                  id="token-reason"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="사과 보상, 마케팅, 운영 복구 등"
                  rows={3}
                  maxLength={300}
                />
                <CharCount>{adjustReason.length} / 300</CharCount>
              </FormRow>
              {error && <ErrorMsg>{error}</ErrorMsg>}
              <ModalFooter>
                <CancelButton type="button" onClick={onClose} disabled={loading}>취소</CancelButton>
                <PrimaryButton type="submit" disabled={loading}>
                  {loading ? '처리 중...' : '발급'}
                </PrimaryButton>
              </ModalFooter>
            </Form>
          </ModalBody>
        </Modal>
      )}

      {/* ── 제재 이력 조회 (Phase 6-1 보강) ── */}
      {mode === 'history' && (
        <Modal onClick={(e) => e.stopPropagation()}>
          <ModalHeader>
            <ModalTitle>제재 이력</ModalTitle>
            <CloseButton onClick={onClose} title="닫기">✕</CloseButton>
          </ModalHeader>
          <ModalBody>
            <UserSummary>
              <UserSummaryLabel>대상 사용자</UserSummaryLabel>
              <UserSummaryValue>
                {user.nickname ?? user.email ?? user.userId}
              </UserSummaryValue>
            </UserSummary>
            {error && <ErrorMsg>{error}</ErrorMsg>}
            <HistoryList>
              {loading ? (
                <HistoryEmpty>불러오는 중...</HistoryEmpty>
              ) : historyList.length === 0 ? (
                <HistoryEmpty>제재 이력이 없습니다.</HistoryEmpty>
              ) : (
                historyList.map((h) => (
                  <HistoryItem key={h.userStatusId}>
                    <HistoryHead>
                      <HistoryStatus $suspended={h.status === 'SUSPENDED'}>
                        {h.status}
                      </HistoryStatus>
                      <HistoryTime>{h.createdAt ?? '-'}</HistoryTime>
                    </HistoryHead>
                    {h.suspendReason && (
                      <HistoryReason>{h.suspendReason}</HistoryReason>
                    )}
                    {h.suspendedUntil && (
                      <HistoryMeta>해제 예정: {h.suspendedUntil}</HistoryMeta>
                    )}
                    {h.suspendedBy && (
                      <HistoryMeta>처리자: {h.suspendedBy}</HistoryMeta>
                    )}
                  </HistoryItem>
                ))
              )}
            </HistoryList>
            <ModalFooter>
              <CancelButton type="button" onClick={onClose}>닫기</CancelButton>
            </ModalFooter>
          </ModalBody>
        </Modal>
      )}

      {/* ── 계정 복구 확인 다이얼로그 ── */}
      {mode === 'activate' && (
        <DialogBox onClick={(e) => e.stopPropagation()}>
          <DialogTitle>계정 복구</DialogTitle>
          <DialogDesc>
            <strong>{user.nickname ?? user.email ?? user.userId}</strong> 님의
            계정을 복구하시겠습니까?
            <br />
            복구 후 사용자는 즉시 서비스에 로그인할 수 있습니다.
          </DialogDesc>

          {/* 에러 메시지 */}
          {error && <ErrorMsg>{error}</ErrorMsg>}

          <DialogFooter>
            <CancelButton onClick={onClose} disabled={loading}>
              취소
            </CancelButton>
            <SuccessButton onClick={handleActivateSubmit} disabled={loading}>
              {loading ? '처리 중...' : '계정 복구'}
            </SuccessButton>
          </DialogFooter>
        </DialogBox>
      )}
    </Overlay>
  );
}

/* ── styled-components ── */

/** 모달 오버레이: 화면 전체를 덮는 반투명 배경 */
const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
`;

/** 모달 컨테이너 (역할 변경 / 계정 정지용) */
const Modal = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  width: 100%;
  max-width: 480px;
  box-shadow: ${({ theme }) => theme.shadows.lg};
  overflow: hidden;
`;

/** 모달 헤더 */
const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.xl};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bgHover};
`;

/** 모달 제목 */
const ModalTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`;

/** 모달 닫기 버튼 */
const CloseButton = styled.button`
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.textMuted};
  &:hover { color: ${({ theme }) => theme.colors.textPrimary}; }
`;

/** 모달 본문 영역 */
const ModalBody = styled.div`
  padding: ${({ theme }) => theme.spacing.xl};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`;

/** 대상 사용자 요약 박스 */
const UserSummary = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.bgHover};
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.colors.border};
`;

const UserSummaryLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  flex-shrink: 0;
`;

const UserSummaryValue = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

/** 경고 안내 텍스트 (계정 정지 모드) */
const WarnNotice = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.warning};
  background: ${({ theme }) => theme.colors.warningBg};
  border: 1px solid #fde68a;
  border-radius: 6px;
  padding: ${({ theme }) => theme.spacing.md};
  line-height: 1.5;
`;

/** 폼 */
const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`;

/** 폼 행 */
const FormRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

/** 폼 레이블 */
const Label = styled.label`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

/** 필수 입력 표시 */
const Required = styled.span`
  color: ${({ theme }) => theme.colors.error};
  margin-left: 2px;
`;

/** 셀렉트 박스 (역할 선택) */
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

/** 텍스트에리어 (정지 사유 입력) */
const Textarea = styled.textarea`
  padding: 8px 12px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-family: ${({ theme }) => theme.fonts.base};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  resize: vertical;
  outline: none;
  line-height: 1.6;
  background: ${({ theme }) => theme.colors.bgCard};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
`;

/** 글자 수 카운터 */
const CharCount = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  text-align: right;
`;

/** 임시 정지 일수 입력 */
const DurationInput = styled.input`
  padding: 8px 12px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  outline: none;
  background: ${({ theme }) => theme.colors.bgCard};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
`;

/** 임시 정지 일수 안내 */
const DurationHint = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
`;

/* ── 제재 이력 패널 ── */

const HistoryList = styled.div`
  max-height: 55vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const HistoryEmpty = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xxl};
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

const HistoryItem = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.borderLight};
  border-radius: 4px;
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.bgCard};
`;

const HistoryHead = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const HistoryStatus = styled.span`
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  border-radius: 10px;
  color: #fff;
  background: ${({ $suspended, theme }) =>
    $suspended ? theme.colors.error : theme.colors.success ?? '#10b981'};
`;

const HistoryTime = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textMuted};
  font-family: 'Menlo', 'Monaco', monospace;
`;

const HistoryReason = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-top: 4px;
`;

const HistoryMeta = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textMuted};
  margin-top: 2px;
`;

/** 에러 메시지 */
const ErrorMsg = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.error};
  background: ${({ theme }) => theme.colors.errorBg};
  border-radius: 4px;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
`;

/** 모달 하단 버튼 행 */
const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.sm};
`;

/** 취소 버튼 */
const CancelButton = styled.button`
  padding: 7px 16px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.bgHover}; }
  &:disabled { opacity: 0.5; }
`;

/** 기본 액션 버튼 (역할 변경) */
const PrimaryButton = styled.button`
  padding: 7px 16px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  border-radius: 4px;
  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.primaryHover}; }
  &:disabled { opacity: 0.5; }
`;

/** 위험 액션 버튼 (계정 정지) */
const DangerButton = styled.button`
  padding: 7px 16px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  background: ${({ theme }) => theme.colors.error};
  color: #fff;
  border-radius: 4px;
  &:hover:not(:disabled) { opacity: 0.85; }
  &:disabled { opacity: 0.5; }
`;

/* ── 계정 복구 다이얼로그 전용 스타일 ── */

/** 확인 다이얼로그 박스 (작은 크기) */
const DialogBox = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  width: 100%;
  max-width: 400px;
  padding: ${({ theme }) => theme.spacing.xxl};
  box-shadow: ${({ theme }) => theme.shadows.lg};
`;

/** 다이얼로그 제목 */
const DialogTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

/** 다이얼로그 설명 텍스트 */
const DialogDesc = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  line-height: 1.6;
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

/** 다이얼로그 버튼 행 */
const DialogFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.sm};
`;

/** 성공 액션 버튼 (계정 복구) */
const SuccessButton = styled.button`
  padding: 7px 16px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  background: ${({ theme }) => theme.colors.success};
  color: #fff;
  border-radius: 4px;
  &:hover:not(:disabled) { opacity: 0.85; }
  &:disabled { opacity: 0.5; }
`;
