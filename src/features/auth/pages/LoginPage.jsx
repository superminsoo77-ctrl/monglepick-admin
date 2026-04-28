/**
 * 관리자 로그인 페이지.
 * 일반 로그인 폼 (이메일 + 비밀번호) → ADMIN 역할 검증.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { backendApi } from '@/shared/api/axiosInstance';
import { AUTH_ENDPOINTS } from '@/shared/constants/api';
import { ADMIN_ROUTES } from '@/shared/constants/routes';
import useAuthStore from '@/shared/stores/useAuthStore';

/* ── 테스트 관리자 시드 계정 (운영 DB 사전 등록, 2026-04-15 추가) ──
 * 로그인 폼 작성 없이 즉시 입장하기 위한 원클릭 버튼용 자격증명.
 * 운영 DB 의 monglepick_test_admin@monglepick.com / admin1234 (UserRole=ADMIN, AdminRole=SUPER_ADMIN) 와 동일 값.
 */
const TEST_ADMIN_EMAIL = 'monglepick_test_admin@monglepick.com';
const TEST_ADMIN_PASSWORD = 'admin1234';

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  /**
   * 공통 로그인 처리.
   *
   * <p>일반 폼 제출과 "테스트 관리자 로그인" 버튼이 동일한 경로를 타도록 추출했다.
   * Backend `/api/v1/auth/login` 에서 ADMIN role 검증 후 JWT 발급, 실패 시 메시지 표시.</p>
   */
  const performLogin = async (loginEmail, loginPassword) => {
    setError('');
    setLoading(true);

    try {
      const data = await backendApi.post(AUTH_ENDPOINTS.LOGIN, {
        email: loginEmail,
        password: loginPassword,
      });

      /* Zustand + localStorage 저장 */
      login({ accessToken: data.accessToken, user: data.user });
      navigate(ADMIN_ROUTES.DASHBOARD, { replace: true });
    } catch (err) {
      setError(err.message || '로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  /** 로그인 폼 제출 */
  const handleSubmit = async (e) => {
    e.preventDefault();
    await performLogin(email, password);
  };

  /** 테스트 관리자 원클릭 로그인 — 운영 DB 시드 계정으로 즉시 진입 */
  const handleTestAdminLogin = async () => {
    await performLogin(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);
  };

  return (
    <Wrapper>
      <Card>
        <Logo>몽글픽</Logo>
        <SubTitle>관리자 로그인</SubTitle>

        <Form onSubmit={handleSubmit}>
          <Input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <Input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <ErrorMsg>{error}</ErrorMsg>}
          <SubmitButton type="submit" disabled={loading}>
            {loading ? '로그인 중...' : '로그인'}
          </SubmitButton>

          {/*
            테스트 관리자 원클릭 로그인 버튼 (2026-04-15 추가).
            운영 DB 에 사전 적재된 monglepick_test_admin@monglepick.com / admin1234 로
            폼 입력 없이 즉시 진입한다. 시연/QA 편의용.
          */}
          <Divider>또는</Divider>
          <TestLoginButton type="button" onClick={handleTestAdminLogin} disabled={loading}>
            테스트 관리자로 로그인
          </TestLoginButton>
          <TestLoginHint>monglepick_test_admin@monglepick.com</TestLoginHint>
        </Form>
      </Card>
    </Wrapper>
  );
}

/* ── styled-components ── */

const Wrapper = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme }) => theme.colors.bgMain};
`;

const Card = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  padding: 48px 40px;
  border-radius: 12px;
  box-shadow: ${({ theme }) => theme.shadows.lg};
  width: 100%;
  max-width: 400px;
  text-align: center;
`;

const Logo = styled.h1`
  font-size: 28px;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.primary};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const SubTitle = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.textMuted};
  margin-bottom: ${({ theme }) => theme.spacing.xxl};
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const Input = styled.input`
  padding: 12px 16px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 8px;
  font-size: ${({ theme }) => theme.fontSizes.md};
  outline: none;
  transition: border-color ${({ theme }) => theme.transitions.fast};

  &:focus {
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const ErrorMsg = styled.p`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  text-align: left;
`;

const SubmitButton = styled.button`
  padding: 12px;
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  border-radius: 8px;
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  transition: background ${({ theme }) => theme.transitions.fast};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primaryHover};
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

/* ── 테스트 관리자 원클릭 로그인용 보조 UI ────────────────────── */

/** "또는" 구분선 — 폼 제출 / 테스트 로그인 사이의 시각적 분리 */
const Divider = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
  margin: ${({ theme }) => theme.spacing.sm} 0;

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: ${({ theme }) => theme.colors.border};
  }
`;

/**
 * 테스트 관리자 로그인 버튼.
 *
 * <p>일반 SubmitButton 과 시각적으로 구분되도록 outline 스타일로 처리.
 * 운영 DB 에 시드된 SUPER_ADMIN 계정으로 즉시 진입하므로,
 * 의도치 않은 클릭을 막기 위해 강조색 대신 보조색을 사용한다.</p>
 */
const TestLoginButton = styled.button`
  padding: 12px;
  background: transparent;
  color: ${({ theme }) => theme.colors.primary};
  border: 1px solid ${({ theme }) => theme.colors.primary};
  border-radius: 8px;
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primary};
    color: #fff;
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

/** 테스트 계정 식별용 힌트 텍스트 */
const TestLoginHint = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  text-align: center;
  margin-top: -${({ theme }) => theme.spacing.sm};
`;
