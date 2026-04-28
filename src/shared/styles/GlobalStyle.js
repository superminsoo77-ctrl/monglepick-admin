/**
 * 관리자 페이지 글로벌 스타일.
 * 밝은/어두운 두 테마를 모두 지원한다.
 * 테마 전환 시 색상 변화에 부드러운 트랜지션을 적용한다.
 */

import { createGlobalStyle } from 'styled-components';

const GlobalStyle = createGlobalStyle`
  /* ── 리셋 ── */
  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  /* ── 기본 ── */
  html {
    font-size: 14px;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    /* color-scheme: 브라우저 기본 UI(스크롤바, 폼 요소 등)에 테마 반영 */
    color-scheme: ${({ theme }) => theme.mode === 'dark' ? 'dark' : 'light'};
  }

  body {
    font-family: ${({ theme }) => theme.fonts.base};
    background-color: ${({ theme }) => theme.colors.bgMain};
    color: ${({ theme }) => theme.colors.textPrimary};
    line-height: 1.5;
    min-height: 100vh;
    /* 테마 전환 트랜지션 — background/color만 적용하여 성능 최적화 */
    transition: background-color 0.2s ease, color 0.2s ease;
  }

  #root {
    min-height: 100vh;
  }

  /* ── 링크 ── */
  a {
    color: ${({ theme }) => theme.colors.primary};
    text-decoration: none;
    &:hover { text-decoration: underline; }
  }

  /* ── 테이블 ── */
  table {
    border-collapse: collapse;
    width: 100%;
  }

  /* ── 스크롤바 ── */
  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.colors.border};
    border-radius: 3px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: ${({ theme }) => theme.colors.textMuted};
  }

  /* ── 입력 필드 ── */
  input, textarea, select, button {
    font-family: inherit;
    font-size: inherit;
  }

  /* 입력 필드 다크 모드 자동 배경색 방지 */
  input, textarea, select {
    background-color: ${({ theme }) => theme.colors.bgInput};
    color: ${({ theme }) => theme.colors.textPrimary};
    transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
  }

  /* Chrome 자동완성 색상 재정의 */
  input:-webkit-autofill,
  input:-webkit-autofill:hover,
  input:-webkit-autofill:focus {
    -webkit-text-fill-color: ${({ theme }) => theme.colors.textPrimary};
    -webkit-box-shadow: 0 0 0px 1000px ${({ theme }) => theme.colors.bgInput} inset;
    transition: background-color 5000s ease-in-out 0s;
  }

  button {
    cursor: pointer;
    border: none;
    background: none;
  }

  /* ── 카드/패널 전환 트랜지션 ── */
  /* styled-components로 생성된 카드 요소들이 전환 시 자연스럽게 변하도록 */
  div, section, aside, header, main, nav, article {
    transition: background-color 0.2s ease, border-color 0.2s ease;
  }
`;

export default GlobalStyle;
