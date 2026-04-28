/**
 * 관리자 계정 신규 등록 모달 — 2026-04-14 신규.
 *
 * 기능:
 *  - userId 또는 email 중 하나 + adminRole(필수) 입력
 *  - 클라이언트 측 유효성 검사 (최소 식별자 하나 + adminRole 선택)
 *  - 8종 역할 드롭다운 (AdminAccountTab 의 ROLES 와 동일한 순서/코드)
 *  - 서버 응답 성공 시 onSuccess 콜백으로 부모에게 목록 재조회 요청
 *
 * 설계 배경:
 *  - 기존 UI 는 역할 수정만 가능했고 "새 관리자 추가" 버튼이 없어 SUPER_ADMIN 도
 *    신규 관리자를 추가할 수 없었다. 본 모달이 공백을 메운다.
 *  - userId/email 2트랙을 둔 이유: 실제 운영 상황에서는 내부 ID 를 모르고 이메일만
 *    아는 경우가 많다. 둘 중 하나만 입력하면 되도록 유연성을 제공한다.
 *  - 비밀번호 입력란은 없다 — 기존 User 계정의 비밀번호를 그대로 사용하므로 불필요.
 */

import { useState } from 'react';
import styled from 'styled-components';
import { MdClose, MdAdminPanelSettings } from 'react-icons/md';
import { createAdmin } from '../api/settingsApi';

/**
 * 모달에서 선택 가능한 관리자 역할 — AdminAccountTab 의 ROLES 와 동일해야 한다.
 * Backend `AdminRole` enum 8종과 1:1 매칭.
 */
const ROLE_OPTIONS = [
  { value: 'SUPER_ADMIN',   label: '최고 관리자 (SUPER_ADMIN)',   description: '모든 기능 + 관리자 계정 관리 + 시스템 설정' },
  { value: 'ADMIN',         label: '일반 관리자 (ADMIN)',         description: '관리자 계정·시스템 설정 제외 전체 운영 기능' },
  { value: 'MODERATOR',     label: '모더레이터 (MODERATOR)',      description: '게시판 관리 전담 — 신고/혐오표현/게시글/리뷰' },
  { value: 'FINANCE_ADMIN', label: '재무 관리자 (FINANCE_ADMIN)', description: '결제·포인트·구독·환불·리워드 정책' },
  { value: 'SUPPORT_ADMIN', label: '고객센터 관리자 (SUPPORT_ADMIN)', description: '공지·FAQ·티켓·도움말' },
  { value: 'DATA_ADMIN',    label: '데이터 관리자 (DATA_ADMIN)',  description: '영화 마스터·장르·데이터 파이프라인' },
  { value: 'AI_OPS_ADMIN',  label: 'AI 운영 관리자 (AI_OPS_ADMIN)', description: 'AI 퀴즈 생성·채팅 로그·모델 버전 관리' },
  { value: 'STATS_ADMIN',   label: '통계/분석 관리자 (STATS_ADMIN)', description: '대시보드·통계·분석 탭 조회 전용 (쓰기 권한 없음)' },
];

export default function AdminAccountCreateModal({ onClose, onSuccess }) {
  /* ── 폼 상태 ── */
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [adminRole, setAdminRole] = useState('ADMIN');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  /** 현재 선택된 역할의 설명문 — 드롭다운 아래 안내에 활용 */
  const selectedRoleDesc =
    ROLE_OPTIONS.find((r) => r.value === adminRole)?.description ?? '';

  /**
   * 등록 버튼 핸들러.
   * - userId/email 중 하나라도 입력되어야 함
   * - adminRole 필수
   * - 서버 호출 후 성공 시 onSuccess 콜백 호출 → 부모가 목록 재조회
   */
  async function handleSubmit(e) {
    e?.preventDefault();

    // 클라이언트 검증 — 식별자 최소 하나
    if (!userId.trim() && !email.trim()) {
      setError('userId 또는 email 중 하나는 필수입니다.');
      return;
    }
    if (!adminRole) {
      setError('관리자 역할을 선택해주세요.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      // 공백은 서버에 전달하지 않는다 — Backend 는 StringUtils.hasText() 로 검사
      const payload = { adminRole };
      if (userId.trim()) payload.userId = userId.trim();
      if (email.trim()) payload.email = email.trim();

      await createAdmin(payload);

      // 부모에 성공 알림 → 목록 새로고침 + 모달 닫기
      onSuccess?.();
      onClose?.();
    } catch (err) {
      // Backend BusinessException 메시지(이미 관리자 / 사용자 없음 등)를 그대로 노출
      setError(err?.response?.data?.message ?? err.message ?? '관리자 등록 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Backdrop onClick={onClose}>
      {/* 배경 클릭 시 닫기, 내용 영역 클릭은 이벤트 전파 차단 */}
      <ModalBox onClick={(e) => e.stopPropagation()}>
        {/* ── 헤더 ── */}
        <Header>
          <HeaderLeft>
            <MdAdminPanelSettings size={18} />
            <HeaderTitle>관리자 계정 신규 등록</HeaderTitle>
          </HeaderLeft>
          <CloseBtn onClick={onClose} aria-label="닫기">
            <MdClose size={18} />
          </CloseBtn>
        </Header>

        {/* ── 안내문구 ── */}
        <Helper>
          기존 일반 사용자를 관리자로 승격시킵니다. userId 또는 email 중 하나만 입력하세요.
          비밀번호는 기존 사용자 계정의 것을 그대로 사용합니다.
        </Helper>

        {/* ── 폼 ── */}
        <Form onSubmit={handleSubmit}>
          <Field>
            <Label htmlFor="admin-create-userId">User ID</Label>
            <Input
              id="admin-create-userId"
              type="text"
              placeholder="예: user_abc123 (선택)"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              disabled={submitting}
              maxLength={50}
            />
          </Field>

          <OrDivider>또는</OrDivider>

          <Field>
            <Label htmlFor="admin-create-email">Email</Label>
            <Input
              id="admin-create-email"
              type="email"
              placeholder="예: admin@example.com (선택)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              maxLength={200}
            />
          </Field>

          <Field>
            <Label htmlFor="admin-create-role">관리자 역할</Label>
            <Select
              id="admin-create-role"
              value={adminRole}
              onChange={(e) => setAdminRole(e.target.value)}
              disabled={submitting}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
            {/* 선택된 역할 설명 — 운영자가 권한 범위 확인 용도 */}
            {selectedRoleDesc && <RoleDesc>📋 {selectedRoleDesc}</RoleDesc>}
          </Field>

          {error && <ErrorMsg>{error}</ErrorMsg>}

          {/* ── 액션 버튼 ── */}
          <ButtonRow>
            <SecondaryBtn type="button" onClick={onClose} disabled={submitting}>
              취소
            </SecondaryBtn>
            <PrimaryBtn type="submit" disabled={submitting}>
              {submitting ? '등록 중...' : '등록'}
            </PrimaryBtn>
          </ButtonRow>
        </Form>
      </ModalBox>
    </Backdrop>
  );
}

/* ── styled-components ── */

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: ${({ theme }) => theme.spacing.md};
`;

const ModalBox = styled.div`
  width: 100%;
  max-width: 480px;
  background: ${({ theme }) => theme.colors.bgCard};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  overflow: hidden;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight};
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  color: ${({ theme }) => theme.colors.primary};
`;

const HeaderTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const CloseBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  &:hover {
    background: ${({ theme }) => theme.colors.bgHover};
  }
`;

const Helper = styled.p`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.lg};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgHover};
  line-height: 1.5;
`;

const Form = styled.form`
  padding: ${({ theme }) => theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const Label = styled.label`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Input = styled.input`
  padding: 8px 10px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.bgCard};
  color: ${({ theme }) => theme.colors.textPrimary};
  outline: none;
  &:focus {
    border-color: ${({ theme }) => theme.colors.primary};
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const Select = styled.select`
  padding: 8px 10px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.bgCard};
  color: ${({ theme }) => theme.colors.textPrimary};
  outline: none;
  cursor: pointer;
  &:focus {
    border-color: ${({ theme }) => theme.colors.primary};
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const OrDivider = styled.div`
  text-align: center;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  margin: 0;
`;

const RoleDesc = styled.p`
  margin-top: 4px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  line-height: 1.5;
`;

const ErrorMsg = styled.p`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.error};
  background: ${({ theme }) => theme.colors.errorBg};
  border-radius: 4px;
`;

const ButtonRow = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.sm};
`;

const PrimaryBtn = styled.button`
  padding: 8px 18px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  background: ${({ theme }) => theme.colors.primary};
  color: white;
  border-radius: 4px;
  &:hover:not(:disabled) {
    opacity: 0.9;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SecondaryBtn = styled.button`
  padding: 8px 18px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.bgHover};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
