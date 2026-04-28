/**
 * 관리자 사이드바 (11탭 네비게이션).
 * 현재 경로 활성 표시 + 아이콘.
 *
 * 반응형 동작:
 * - 1024px 초과: 240px 너비, 텍스트 + 아이콘 표시
 * - 1024px 이하: 64px 너비(아이콘 전용), 텍스트 숨김, tooltip으로 레이블 표시
 * - 768px 이하: 완전 숨김 (translateX(-100%)), open prop으로 토글
 *
 * 2026-04-08 재배치:
 *  - "콘텐츠 관리" → "게시판 관리"
 *  - "데이터 관리" → "영화 데이터"
 *  - "운영 도구" 해체 → "콘텐츠·이벤트" (도장깨기/퀴즈/월드컵/OCR만 남김)
 *  - 탭은 도메인별로 순서 재조정:
 *      대시보드 → 사용자 → 게시판 → 결제/포인트 → 콘텐츠·이벤트 →
 *      영화 데이터 → AI 운영 → 통계/분석 → 고객센터 → 시스템 → 설정
 *
 * @param {Object} props
 * @param {boolean} props.open - 모바일에서 사이드바 열림 여부 (AdminLayout에서 제어)
 * @param {Function} props.onNavClick - 네비게이션 항목 클릭 콜백 (모바일 자동 닫기)
 */

import { NavLink } from 'react-router-dom';
import styled, { css } from 'styled-components';
import {
  MdDashboard,
  MdPeople,
  MdForum,
  MdPayment,
  MdCelebration,
  MdMovie,
  MdSmartToy,
  MdBarChart,
  MdSupportAgent,
  MdMonitor,
  MdSettings,
  MdAutoAwesome,
} from 'react-icons/md';
import { ADMIN_ROUTES } from '../constants/routes';
import { media } from '../styles/media';

/**
 * 사이드바 메뉴 항목 (11탭).
 *
 * 도메인 기준 순서: 사용자 관리 → 게시판 → 결제 → 콘텐츠·이벤트 → 영화 데이터 →
 * AI 운영 → 통계 → 고객센터 → 시스템 → 설정.
 *
 * 각 탭은 "조회+조작"을 한 곳에 묶는다.
 * 예: 영화 데이터 탭 안에 데이터 현황(조회) + 영화/장르 마스터(조작) + 파이프라인이 모두 있음.
 */
const MENU_ITEMS = [
  // 2026-04-23: AI 어시스턴트 최상단 고정. 관리자가 "먼저 물어본다" 는 UX 지향 (설계서 §9).
  { path: ADMIN_ROUTES.ASSISTANT,       icon: MdAutoAwesome,  label: 'AI 어시스턴트' },
  { path: ADMIN_ROUTES.DASHBOARD,       icon: MdDashboard,    label: '대시보드' },
  { path: ADMIN_ROUTES.USERS,           icon: MdPeople,       label: '사용자 관리' },
  { path: ADMIN_ROUTES.BOARD,           icon: MdForum,        label: '게시판 관리' },
  { path: ADMIN_ROUTES.PAYMENT,         icon: MdPayment,      label: '결제/포인트' },
  { path: ADMIN_ROUTES.CONTENT_EVENTS,  icon: MdCelebration,  label: '콘텐츠·이벤트' },
  { path: ADMIN_ROUTES.DATA,            icon: MdMovie,        label: '영화 데이터' },
  { path: ADMIN_ROUTES.AI,              icon: MdSmartToy,     label: 'AI 운영' },
  { path: ADMIN_ROUTES.STATS,           icon: MdBarChart,     label: '통계/분석' },
  { path: ADMIN_ROUTES.SUPPORT,         icon: MdSupportAgent, label: '고객센터' },
  { path: ADMIN_ROUTES.SYSTEM,          icon: MdMonitor,      label: '시스템' },
  { path: ADMIN_ROUTES.SETTINGS,        icon: MdSettings,     label: '설정' },
];

export default function AdminSidebar({ open = false, onNavClick }) {
  return (
    <SidebarWrapper open={open}>
      {/* 로고 영역 */}
      <LogoArea>
        <LogoText>몽글픽</LogoText>
        {/* 아이콘 전용 모드(64px)에서는 뱃지 숨김 */}
        <LogoBadge>관리자</LogoBadge>
      </LogoArea>

      {/* 네비게이션 */}
      <Nav>
        {MENU_ITEMS.map((item) => (
          <NavItem key={item.path}>
            <StyledNavLink
              to={item.path}
              onClick={onNavClick}
              /* 축소 모드에서 tooltip을 위한 title */
              title={item.label}
            >
              <IconWrapper>
                <item.icon size={20} />
              </IconWrapper>
              <NavLabel>{item.label}</NavLabel>
            </StyledNavLink>
          </NavItem>
        ))}
      </Nav>
    </SidebarWrapper>
  );
}

/* ── styled-components ── */

/**
 * 사이드바 래퍼.
 * - 기본: 240px 고정 (텍스트 + 아이콘)
 * - 1024px 이하: 64px (아이콘 전용)
 * - 768px 이하: translateX(-100%) 숨김, open=true 시 translateX(0) 표시
 *
 * 라이트/다크 양쪽 모두 어두운 사이드바 배경 유지 (어드민 UI 관례).
 */
const SidebarWrapper = styled.aside`
  width: ${({ theme }) => theme.layout.sidebarWidth};
  height: 100vh;
  position: fixed;
  left: 0;
  top: 0;
  background: ${({ theme }) => theme.colors.bgSidebar};
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  z-index: 100;
  /* 사이드바 폭/위치 전환 트랜지션 */
  transition: width ${({ theme }) => theme.transitions.normal},
    transform ${({ theme }) => theme.transitions.normal},
    box-shadow ${({ theme }) => theme.transitions.normal};

  /* 1024px 이하: 아이콘 전용(64px) — 텍스트는 CSS로 숨김 */
  ${media.desktop} {
    width: ${({ theme }) => theme.layout.sidebarCollapsed};
  }

  /* 768px 이하: 완전 숨김 → open prop으로 슬라이드 인 */
  ${media.tablet} {
    width: ${({ theme }) => theme.layout.sidebarWidth};
    transform: translateX(-100%);
    box-shadow: none;

    ${({ open }) =>
      open &&
      css`
        transform: translateX(0);
        box-shadow: ${({ theme }) => theme.shadows.sidebar};
      `}
  }
`;

const LogoArea = styled.div`
  padding: ${({ theme }) => theme.spacing.xl};
  display: flex;
  align-items: baseline;
  gap: ${({ theme }) => theme.spacing.sm};
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  /* 아이콘 전용 모드에서 로고 영역을 아이콘 크기에 맞춤 */
  min-height: ${({ theme }) => theme.layout.headerHeight};
  overflow: hidden;
  white-space: nowrap;

  ${media.desktop} {
    justify-content: center;
    padding: ${({ theme }) => theme.spacing.lg} ${({ theme }) => theme.spacing.sm};
  }

  ${media.tablet} {
    justify-content: flex-start;
    padding: ${({ theme }) => theme.spacing.xl};
  }
`;

const LogoText = styled.h1`
  font-size: ${({ theme }) => theme.fontSizes.xl};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: #fff;
  flex-shrink: 0;

  /* 아이콘 전용 모드에서 텍스트 숨김 */
  ${media.desktop} {
    display: none;
  }

  ${media.tablet} {
    display: block;
  }
`;

/**
 * "관리자" 뱃지.
 * 아이콘 전용 모드(64px)에서는 숨긴다.
 */
const LogoBadge = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.primary};
  background: ${({ theme }) => theme.colors.primaryLight};
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  flex-shrink: 0;

  ${media.desktop} {
    display: none;
  }

  ${media.tablet} {
    display: inline;
  }
`;

const Nav = styled.nav`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.md} 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

/** 네비게이션 항목 래퍼 — tooltip 위치 기준점 */
const NavItem = styled.div`
  position: relative;

  /* 아이콘 전용 모드에서 hover 시 오른쪽 tooltip 표시 */
  ${media.desktop} {
    &:hover::after {
      content: attr(data-label);
      position: absolute;
      left: calc(${({ theme }) => theme.layout.sidebarCollapsed} + 8px);
      top: 50%;
      transform: translateY(-50%);
      background: rgba(15, 23, 42, 0.95);
      color: #fff;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      white-space: nowrap;
      pointer-events: none;
      z-index: 200;
    }
  }

  ${media.tablet} {
    &:hover::after {
      display: none;
    }
  }
`;

const StyledNavLink = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.xl};
  color: ${({ theme }) => theme.colors.textSidebar};
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  text-decoration: none;
  transition: background-color ${({ theme }) => theme.transitions.fast},
    color ${({ theme }) => theme.transitions.fast};
  border-left: 3px solid transparent;
  white-space: nowrap;
  overflow: hidden;

  &:hover {
    background: ${({ theme }) => theme.colors.bgSidebarHover};
    color: #fff;
    text-decoration: none;
  }

  &.active {
    background: ${({ theme }) => theme.colors.bgSidebarActive};
    color: ${({ theme }) => theme.colors.textSidebarActive};
    border-left-color: ${({ theme }) => theme.colors.primary};
  }

  /* 아이콘 전용 모드: 패딩 중앙 정렬, 텍스트는 NavLabel에서 숨김 */
  ${media.desktop} {
    padding: ${({ theme }) => theme.spacing.md};
    justify-content: center;
    border-left: none;
    border-radius: 6px;
    margin: 0 ${({ theme }) => theme.spacing.sm};

    &.active {
      border-left: none;
    }
  }

  ${media.tablet} {
    padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.xl};
    justify-content: flex-start;
    border-radius: 0;
    margin: 0;
    border-left: 3px solid transparent;

    &.active {
      border-left-color: ${({ theme }) => theme.colors.primary};
    }
  }
`;

/** 아이콘 래퍼 — flex-shrink 방지 */
const IconWrapper = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

/**
 * 네비게이션 텍스트 레이블.
 * 아이콘 전용 모드(1024px 이하)에서 숨기고,
 * 모바일 사이드바 열린 상태(768px 이하)에서 다시 표시한다.
 */
const NavLabel = styled.span`
  ${media.desktop} {
    display: none;
  }

  ${media.tablet} {
    display: inline;
  }
`;
