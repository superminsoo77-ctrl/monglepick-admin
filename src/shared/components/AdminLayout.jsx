/**
 * 관리자 페이지 레이아웃.
 * 사이드바(고정) + 메인 콘텐츠 영역(Outlet).
 *
 * 반응형 브레이크포인트:
 * - 1024px 초과: 사이드바 240px 고정, 항상 표시
 * - 1024px 이하: 사이드바 64px (아이콘만) — AdminSidebar 내부에서 처리
 * - 768px 이하: 사이드바 완전 숨김, 햄버거 버튼으로 토글
 *
 * 헤더 우측:
 * - 테마 토글 버튼 (해/달 아이콘)
 * - 유저 정보
 * - 로그아웃 버튼
 */

import { useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import styled from 'styled-components';
import { MdMenu, MdClose, MdLightMode, MdDarkMode } from 'react-icons/md';
import AdminSidebar from './AdminSidebar';
import useAuthStore from '../stores/useAuthStore';
import useThemeStore from '../stores/useThemeStore';
import { media } from '../styles/media';

export default function AdminLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const mode = useThemeStore((s) => s.mode);
  const toggleMode = useThemeStore((s) => s.toggleMode);

  /** 모바일 사이드바 열림 상태 */
  const [sidebarOpen, setSidebarOpen] = useState(false);

  /** 사이드바 열기/닫기 토글 */
  const handleSidebarToggle = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  /** 오버레이 클릭 시 사이드바 닫기 */
  const handleOverlayClick = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  /** 사이드바 네비게이션 클릭 시 모바일에서 자동 닫기 */
  const handleNavClick = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  return (
    <LayoutWrapper>
      {/* 모바일 오버레이 — 사이드바 열린 상태에서만 표시 */}
      {sidebarOpen && <Overlay onClick={handleOverlayClick} />}

      {/* 사이드바 */}
      <AdminSidebar open={sidebarOpen} onNavClick={handleNavClick} />

      {/* 메인 콘텐츠 영역 */}
      <MainArea>
        {/* 상단 헤더 바 */}
        <Header>
          <HeaderLeft>
            {/* 햄버거 버튼 — tablet 이하에서만 표시 */}
            <HamburgerButton
              onClick={handleSidebarToggle}
              aria-label={sidebarOpen ? '메뉴 닫기' : '메뉴 열기'}
              aria-expanded={sidebarOpen}
            >
              {sidebarOpen ? <MdClose size={22} /> : <MdMenu size={22} />}
            </HamburgerButton>
          </HeaderLeft>

          <HeaderRight>
            {/* 테마 토글 버튼 */}
            <ThemeToggleButton
              onClick={toggleMode}
              aria-label={mode === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
              title={mode === 'dark' ? '라이트 모드' : '다크 모드'}
            >
              {mode === 'dark' ? (
                <MdLightMode size={18} />
              ) : (
                <MdDarkMode size={18} />
              )}
            </ThemeToggleButton>

            <UserInfo>{user?.nickname || user?.email || '관리자'}</UserInfo>
            <LogoutButton onClick={logout}>로그아웃</LogoutButton>
          </HeaderRight>
        </Header>

        {/* 페이지 콘텐츠 */}
        <Content>
          <Outlet />
        </Content>
      </MainArea>
    </LayoutWrapper>
  );
}

/* ── styled-components ── */

const LayoutWrapper = styled.div`
  display: flex;
  min-height: 100vh;
  position: relative;
`;

/**
 * 모바일 사이드바가 열렸을 때 뒤 배경을 어둡게 처리하는 오버레이.
 * 클릭 시 사이드바를 닫는다.
 */
const Overlay = styled.div`
  display: none;

  ${media.tablet} {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 90; /* 사이드바(100)보다 낮고, 헤더(50)보다 높음 */
    backdrop-filter: blur(2px);
  }
`;

const MainArea = styled.main`
  flex: 1;
  /* 사이드바 너비만큼 좌측 여백 — 반응형에서 단계적으로 축소 */
  margin-left: ${({ theme }) => theme.layout.sidebarWidth};
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-width: 0; /* flex 자식 overflow 방지 */

  /* 1024px 이하: 아이콘 전용 사이드바(64px) */
  ${media.desktop} {
    margin-left: ${({ theme }) => theme.layout.sidebarCollapsed};
  }

  /* 768px 이하: 사이드바 완전 숨김 → 여백 제거 */
  ${media.tablet} {
    margin-left: 0;
  }
`;

const Header = styled.header`
  height: ${({ theme }) => theme.layout.headerHeight};
  background: ${({ theme }) => theme.colors.bgCard};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 ${({ theme }) => theme.layout.contentPadding};
  position: sticky;
  top: 0;
  z-index: 50;

  ${media.mobile} {
    padding: 0 ${({ theme }) => theme.spacing.lg};
  }
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
`;

/**
 * 햄버거 메뉴 버튼.
 * 1024px 초과(데스크톱)에서는 숨기고, 이하에서만 표시한다.
 */
const HamburgerButton = styled.button`
  display: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 6px;
  color: ${({ theme }) => theme.colors.textSecondary};
  transition: background-color ${({ theme }) => theme.transitions.fast},
    color ${({ theme }) => theme.transitions.fast};

  &:hover {
    background: ${({ theme }) => theme.colors.bgHover};
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  /* 1024px 이하에서만 햄버거 버튼 노출 */
  ${media.desktop} {
    display: flex;
  }
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.lg};

  ${media.mobile} {
    gap: ${({ theme }) => theme.spacing.sm};
  }
`;

/**
 * 테마 토글 버튼 (해/달 아이콘).
 * 라이트 모드: 달 아이콘 표시 → 클릭 시 다크 전환
 * 다크 모드: 해 아이콘 표시 → 클릭 시 라이트 전환
 */
const ThemeToggleButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 6px;
  color: ${({ theme }) => theme.colors.textSecondary};
  transition: background-color ${({ theme }) => theme.transitions.fast},
    color ${({ theme }) => theme.transitions.fast};

  &:hover {
    background: ${({ theme }) => theme.colors.bgHover};
    color: ${({ theme }) => theme.colors.primary};
  }
`;

const UserInfo = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-weight: ${({ theme }) => theme.fontWeights.medium};

  /* 모바일에서 유저명 숨김 — 공간 절약 */
  ${media.mobile} {
    display: none;
  }
`;

const LogoutButton = styled.button`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  transition: color ${({ theme }) => theme.transitions.fast},
    border-color ${({ theme }) => theme.transitions.fast};

  &:hover {
    color: ${({ theme }) => theme.colors.error};
    border-color: ${({ theme }) => theme.colors.error};
  }
`;

const Content = styled.div`
  flex: 1;
  padding: ${({ theme }) => theme.layout.contentPadding};
  max-width: ${({ theme }) => theme.layout.contentMaxWidth};
  width: 100%;

  ${media.mobile} {
    padding: ${({ theme }) => theme.spacing.lg};
  }
`;
