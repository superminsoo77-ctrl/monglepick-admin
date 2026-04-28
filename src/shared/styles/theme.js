/**
 * 관리자 페이지 디자인 토큰.
 * 사용자 클라이언트(glassmorphism+glow)와 완전히 다른 실용적 어드민 테마.
 * 데이터 밀도 높은 UI 최적화.
 *
 * 구조: baseTheme(공통 토큰) + lightTheme + darkTheme 3분할.
 * ThemeProvider에 mode에 따라 lightTheme 또는 darkTheme을 주입한다.
 *
 * 사이드바는 라이트/다크 모두 어두운 배경을 유지한다 (어드민 특성).
 */

/* ============================================================
 * 공통 토큰 (색상 무관)
 * ============================================================ */
const baseTheme = {
  /* ── 타이포그래피 ── */
  fonts: {
    base: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif",
    mono: "'Fira Code', 'Consolas', monospace",
  },
  fontSizes: {
    xs: '12px',
    sm: '13px',
    md: '14px',
    lg: '16px',
    xl: '18px',
    xxl: '24px',
    heading: '20px',
  },
  fontWeights: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  /* ── 간격 ── */
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    xxl: '24px',
    xxxl: '32px',
  },

  /* ── 레이아웃 ── */
  layout: {
    sidebarWidth: '240px',
    sidebarCollapsed: '64px',
    headerHeight: '56px',
    contentPadding: '24px',
    contentMaxWidth: '1400px',
    cardRadius: '8px',
  },

  /* ── 트랜지션 ── */
  transitions: {
    fast: '150ms ease',
    normal: '200ms ease',
    slow: '300ms ease',
  },
};

/* ============================================================
 * 라이트 테마 (기본값 — 어드민 데이터 가독성 최적화)
 * ============================================================ */
export const lightTheme = {
  ...baseTheme,

  /** 테마 모드 식별자 */
  mode: 'light',

  colors: {
    /* 브랜드 */
    primary: '#6366f1',
    primaryHover: '#4f46e5',
    primaryLight: '#eef2ff',
    primaryBg: '#f5f3ff',

    /* 배경 */
    bgMain: '#f8fafc',
    bgCard: '#ffffff',
    bgHover: '#f1f5f9',
    bgElevated: '#f8fafc',

    /* 사이드바 — 라이트 모드에서도 다크 사이드바 유지 (어드민 UI 관례) */
    bgSidebar: '#1e293b',
    bgSidebarHover: 'rgba(255,255,255,0.05)',
    bgSidebarActive: 'rgba(99,102,241,0.15)',

    /* 텍스트 */
    textPrimary: '#0f172a',
    textSecondary: '#475569',
    textMuted: '#94a3b8',
    textSidebar: '#cbd5e1',
    textSidebarActive: '#ffffff',

    /* 상태 */
    success: '#10b981',
    successBg: '#ecfdf5',
    warning: '#f59e0b',
    warningBg: '#fffbeb',
    error: '#ef4444',
    errorBg: '#fef2f2',
    info: '#3b82f6',
    infoBg: '#eff6ff',

    /* 경계선 */
    border: '#e2e8f0',
    borderLight: '#f1f5f9',
    borderFocus: '#6366f1',

    /* 입력 필드 */
    bgInput: '#ffffff',
    bgInputFocus: '#ffffff',
  },

  shadows: {
    sm: '0 1px 2px rgba(0,0,0,0.05)',
    md: '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)',
    lg: '0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.06)',
    card: '0 1px 3px rgba(0,0,0,0.08)',
    sidebar: '2px 0 8px rgba(0,0,0,0.15)',
  },
};

/* ============================================================
 * 다크 테마 (신규)
 * ============================================================ */
export const darkTheme = {
  ...baseTheme,

  /** 테마 모드 식별자 */
  mode: 'dark',

  colors: {
    /* 브랜드 — 다크 배경 대비 약간 밝게 */
    primary: '#818cf8',
    primaryHover: '#6366f1',
    primaryLight: 'rgba(129,140,248,0.15)',
    primaryBg: 'rgba(129,140,248,0.1)',

    /* 배경 */
    bgMain: '#0f172a',
    bgCard: '#1e293b',
    bgHover: '#1e293b',
    bgElevated: '#334155',

    /* 사이드바 — 다크 모드에서는 더 어두운 배경 */
    bgSidebar: '#0f172a',
    bgSidebarHover: 'rgba(255,255,255,0.05)',
    bgSidebarActive: 'rgba(129,140,248,0.15)',

    /* 텍스트 */
    textPrimary: '#f1f5f9',
    textSecondary: '#94a3b8',
    textMuted: '#64748b',
    textSidebar: '#cbd5e1',
    textSidebarActive: '#ffffff',

    /* 상태 */
    success: '#34d399',
    successBg: 'rgba(52,211,153,0.1)',
    warning: '#fbbf24',
    warningBg: 'rgba(251,191,36,0.1)',
    error: '#f87171',
    errorBg: 'rgba(248,113,113,0.1)',
    info: '#60a5fa',
    infoBg: 'rgba(96,165,250,0.1)',

    /* 경계선 */
    border: '#334155',
    borderLight: '#1e293b',
    borderFocus: '#818cf8',

    /* 입력 필드 */
    bgInput: '#1e293b',
    bgInputFocus: '#334155',
  },

  shadows: {
    sm: '0 1px 2px rgba(0,0,0,0.3)',
    md: '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
    lg: '0 4px 6px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.3)',
    card: '0 1px 3px rgba(0,0,0,0.3)',
    sidebar: '2px 0 8px rgba(0,0,0,0.4)',
  },
};

/* 하위 호환 — 기존 `import theme from './theme'` 유지 */
export default lightTheme;
