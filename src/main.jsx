/**
 * 몽글픽 관리자 앱 엔트리포인트.
 * ThemeProvider + GlobalStyle + BrowserRouter.
 *
 * useThemeStore에서 현재 모드를 구독하여
 * lightTheme / darkTheme 중 알맞은 객체를 ThemeProvider에 전달한다.
 * Zustand 스토어 상태 변경 시 React 리렌더링을 통해 테마가 즉시 교체된다.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme, darkTheme } from './shared/styles/theme';
import GlobalStyle from './shared/styles/GlobalStyle';
import useThemeStore from './shared/stores/useThemeStore';
import App from './App';

/**
 * 테마 프로바이더 래퍼 컴포넌트.
 * useThemeStore를 구독하여 모드에 맞는 테마 객체를 ThemeProvider에 주입한다.
 * main.jsx 최상단에서 createRoot 이후에 훅을 사용하기 위해 별도 컴포넌트로 분리한다.
 */
function ThemedApp() {
  const mode = useThemeStore((s) => s.mode);
  const theme = mode === 'dark' ? darkTheme : lightTheme;

  return (
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      <App />
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemedApp />
    </BrowserRouter>
  </StrictMode>,
);
