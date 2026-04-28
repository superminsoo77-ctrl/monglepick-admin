/**
 * 관리자 테마 모드 관리 Zustand 스토어.
 *
 * 다크/라이트 모드 전환을 전역에서 관리한다.
 * - mode: 현재 테마 모드 ('light' | 'dark')
 * - toggleMode: 라이트 ↔ 다크 토글
 * - setMode: 특정 모드로 강제 설정
 *
 * 초기 모드 결정 우선순위:
 *   1. localStorage 저장값 ('monglepick_admin_theme_mode')
 *   2. OS 설정 (prefers-color-scheme)
 *   3. 기본값 'light' (Admin 특성 — 데이터 가독성 우선)
 *
 * localStorage를 통해 새로고침/재방문 시에도 선택한 테마를 유지한다.
 * data-theme 속성을 documentElement에 동기화하여 FOUC를 방지한다.
 *
 * @module shared/stores/useThemeStore
 *
 * @example
 * // 컴포넌트에서 현재 모드 구독
 * const mode = useThemeStore((s) => s.mode);
 *
 * // 토글 버튼
 * const toggleMode = useThemeStore((s) => s.toggleMode);
 * <button onClick={toggleMode}>테마 전환</button>
 */

import { create } from 'zustand';

/** localStorage 키 (Client와 분리하여 독립적으로 관리) */
const THEME_STORAGE_KEY = 'monglepick_admin_theme_mode';

/**
 * 초기 테마 모드 결정.
 * localStorage > OS 설정 > 기본값('light') 순서로 결정한다.
 * Admin은 데이터 가독성을 위해 기본값을 라이트 모드로 설정한다.
 *
 * @returns {'light' | 'dark'} 초기 테마 모드
 */
function getInitialMode() {
  /* 1. localStorage에 저장된 값이 있으면 사용 */
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* localStorage 접근 불가 환경 (SSR 등) 대비 */
  }

  /* 2. OS 설정 감지 (prefers-color-scheme) */
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  /* 3. 기본값: 라이트 모드 (어드민 데이터 밀도 UI 최적화) */
  return 'light';
}

/**
 * documentElement에 data-theme 속성과 color-scheme 스타일을 동기화한다.
 * FOUC 방지 인라인 스크립트와 일관성을 유지하기 위해 상태 변경 시 항상 호출한다.
 *
 * @param {'light' | 'dark'} mode - 적용할 테마 모드
 */
function syncDocumentTheme(mode) {
  try {
    document.documentElement.setAttribute('data-theme', mode);
    document.documentElement.style.colorScheme = mode;
  } catch {
    /* 환경에 따라 document에 접근 불가한 경우 무시 */
  }
}

const useThemeStore = create((set) => {
  /* 초기 모드 계산 및 document 동기화 */
  const initialMode = getInitialMode();
  syncDocumentTheme(initialMode);

  return {
    /** 현재 테마 모드 ('light' | 'dark') */
    mode: initialMode,

    /**
     * 테마 토글 (light ↔ dark).
     * localStorage에 즉시 영속 저장하여 새로고침 시 복원한다.
     * document 속성도 함께 동기화한다.
     */
    toggleMode: () =>
      set((state) => {
        const next = state.mode === 'light' ? 'dark' : 'light';
        try {
          localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch {
          /* localStorage 쓰기 실패 시 메모리 상태만 변경 */
        }
        syncDocumentTheme(next);
        return { mode: next };
      }),

    /**
     * 특정 모드로 강제 설정.
     * OS 설정 변경 감지 등 외부에서 호출할 때 사용한다.
     *
     * @param {'light' | 'dark'} mode - 설정할 테마 모드
     */
    setMode: (mode) => {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, mode);
      } catch {
        /* 무시 */
      }
      syncDocumentTheme(mode);
      set({ mode });
    },
  };
});

export default useThemeStore;
