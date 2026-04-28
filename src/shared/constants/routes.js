/**
 * 관리자 페이지 라우트 상수 (11탭).
 *
 * 2026-04-08 재배치:
 *  - CONTENT(/admin/content) → BOARD(/admin/board)           "콘텐츠 관리" → "게시판 관리"
 *  - OPERATIONS(/admin/operations) → CONTENT_EVENTS(/admin/content-events)
 *                                    "운영 도구" → "콘텐츠·이벤트"
 *  - DATA 라벨은 "영화 데이터"로 변경 (경로는 /admin/data 유지)
 *
 * 운영 도구 탭은 해체되어, 12개 서브탭이 다음으로 흡수됨:
 *   업적 마스터 → 사용자
 *   카테고리 → 게시판
 *   영화 마스터, 장르 마스터 → 영화 데이터
 *   포인트팩, 리워드 정책 → 결제/포인트
 *   도장깨기 템플릿, 퀴즈, 월드컵 후보, OCR 이벤트 → 콘텐츠·이벤트(신규)
 *   인기 검색어 → 통계/분석(검색 탭 내부 섹션)
 *   앱 공지 → 고객센터(공지사항과 통합)
 *
 * 감사 로그는 설정 → 시스템으로 이동 (순수 조회 탭 성격).
 */
export const ADMIN_ROUTES = {
  ROOT: '/admin',
  /** 관리자 AI 어시스턴트 — 2026-04-23 신규. 사이드바 최상단 고정. */
  ASSISTANT: '/admin/assistant',
  DASHBOARD: '/admin/dashboard',
  USERS: '/admin/users',
  BOARD: '/admin/board',                  // 구 CONTENT — 게시판 관리
  PAYMENT: '/admin/payment',
  CONTENT_EVENTS: '/admin/content-events',// 구 OPERATIONS — 콘텐츠·이벤트
  DATA: '/admin/data',                    // 영화 데이터 (라벨만 변경)
  AI: '/admin/ai',
  SUPPORT: '/admin/support',
  STATS: '/admin/stats',
  SYSTEM: '/admin/system',
  SETTINGS: '/admin/settings',
  LOGIN: '/login',
};
