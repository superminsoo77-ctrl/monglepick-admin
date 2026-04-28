/**
 * 관리자 API 상수 정의.
 *
 * 서비스 분류:
 * - @service Backend  → backendApi  (Spring Boot :8080) — /api/v1/admin/*
 * - @service Agent    → agentApi    (FastAPI :8000)     — /api/v1/admin/*
 */

/** API 버전 접두사 */
export const API_VERSION = '/api/v1';

/** 관리자 API 접두사 */
const ADMIN = `${API_VERSION}/admin`;

/* ── 인증 (Backend) ── */
export const AUTH_ENDPOINTS = {
  /** 관리자 전용 로그인 — 백엔드에서 ADMIN role 검증 후 JWT 발급 (일반 유저 403 차단) */
  LOGIN: `${API_VERSION}/admin/auth/login`,
  REFRESH: `/jwt/refresh`,
  LOGOUT: `${API_VERSION}/auth/logout`,
};

/* ── 시스템 (윤형주) ── */
export const SYSTEM_ENDPOINTS = {
  /** 4개 서비스 헬스체크 집계 - GET (Backend) */
  SERVICES: `${ADMIN}/system/services`,
  /** 5개 DB 상태 - GET (Agent) */
  DB: `${ADMIN}/system/db`,
  /** Ollama 모델 상태 - GET (Agent) */
  OLLAMA: `${ADMIN}/system/ollama`,
  /** vLLM 모델 상태(Chat/Vision) - GET (Agent) */
  VLLM: `${ADMIN}/system/vllm`,
  /** 현재 설정값 조회 - GET (Backend) */
  CONFIG: `${ADMIN}/system/config`,
};

/* ── 결제/포인트 관리 (윤형주) ──
 *
 * 백엔드 AdminPaymentController(@RequestMapping("/api/v1/admin")) 기준 경로/메서드.
 *
 * 주의사항:
 * - 보상 실패 건 목록은 별도 엔드포인트가 없다.
 *   ORDERS 경로에 `status=COMPENSATION_FAILED` 필터로 조회한다 (paymentApi.fetchFailedOrders 참조).
 * - 보상 복구(COMPENSATE) 경로는 설계서에 맞춰 `/subscription/{orderId}/compensate`(POST)이며,
 *   {orderId}는 주문 UUID로 해석된다. AdminCompensateRequest는 adminNote 필수.
 * - 구독 취소/연장은 PUT 메서드를 사용한다 (AdminPaymentController cancel/extend).
 * - 포인트 이력은 전역 목록 엔드포인트에 userId 쿼리 파라미터로 필터링한다.
 */
export const PAYMENT_ADMIN_ENDPOINTS = {
  ORDERS: `${ADMIN}/payment/orders`,
  ORDER_DETAIL: (orderId) => `${ADMIN}/payment/orders/${orderId}`,
  REFUND: (orderId) => `${ADMIN}/payment/orders/${orderId}/refund`,
  /**
   * PG(Toss) 재조회 동기화 — POST, body 없음.
   *
   * Toss 콘솔에서 직접 취소하거나 웹훅이 유실되어 DB 상태와 PG 상태가 어긋난 주문을
   * 복구하기 위한 엔드포인트. Toss getPayment 만 호출하고 cancelPayment 는 호출하지 않으므로
   * 일반 REFUND 와 달리 ALREADY_CANCELED 500 에러가 나지 않는다.
   * 응답: {result: SYNCED|NO_CHANGE|MISMATCH, dbStatus, pgStatus, pointsRecovered, message}
   * 2026-04-24 추가.
   */
  SYNC_FROM_PG: (orderId) => `${ADMIN}/payment/orders/${orderId}/sync-from-pg`,
  /** 보상 복구 — POST, body={adminNote} */
  COMPENSATE: (orderId) => `${ADMIN}/subscription/${orderId}/compensate`,
  SUBSCRIPTIONS: `${ADMIN}/subscription`,
  /** 구독 취소 — PUT (body 없음) */
  CANCEL_SUB: (id) => `${ADMIN}/subscription/${id}/cancel`,
  /** 구독 연장 — PUT (body 선택) */
  EXTEND_SUB: (id) => `${ADMIN}/subscription/${id}/extend`,
  /** 포인트 수동 지급/차감 — POST, body={userId, amount(±), reason} */
  POINT_MANUAL: `${ADMIN}/point/manual`,
  /** 포인트 변동 이력 — GET, query: userId/page/size */
  POINT_HISTORIES: `${ADMIN}/point/histories`,
  POINT_ITEMS: `${ADMIN}/point/items`,
  POINT_ITEM_DETAIL: (id) => `${ADMIN}/point/items/${id}`,
  /** 포인트 아이템 이미지 업로드 — POST multipart, fields: file, subdir(avatars|badges) */
  POINT_ITEM_IMAGE_UPLOAD: `${ADMIN}/point/items/images`,
};

/* ── 고객센터 관리 (윤형주) ──
 * 2026-04-08: 앱 공지(AppNotice) 통합으로 NOTICE_ACTIVE 추가 (활성 토글 PATCH).
 *             구 /api/v1/admin/app-notices/* 엔드포인트는 /notices/*로 흡수됨.
 */
export const SUPPORT_ADMIN_ENDPOINTS = {
  /* 공지사항 */
  NOTICES: `${ADMIN}/notices`,
  NOTICE_DETAIL: (id) => `${ADMIN}/notices/${id}`,
  NOTICE_REORDER: `${ADMIN}/notices/reorder`,
  NOTICE_ACTIVE: (id) => `${ADMIN}/notices/${id}/active`,
  /* FAQ */
  FAQ: `${ADMIN}/faq`,
  FAQ_DETAIL: (id) => `${ADMIN}/faq/${id}`,
  FAQ_REORDER: `${ADMIN}/faq/reorder`,
  /* 도움말 */
  HELP: `${ADMIN}/help-articles`,
  HELP_DETAIL: (id) => `${ADMIN}/help-articles/${id}`,
  /* 티켓 */
  TICKETS: `${ADMIN}/tickets`,
  TICKET_DETAIL: (id) => `${ADMIN}/tickets/${id}`,
  TICKET_STATUS: (id) => `${ADMIN}/tickets/${id}/status`,
  TICKET_REPLY: (id) => `${ADMIN}/tickets/${id}/reply`,
  /* 2026-04-08: 비속어 사전(PROFANITY*) 엔드포인트 제거 */
};

/* ── AI 운영 (윤형주) ──
 * 2026-04-08: REVIEW_GENERATE / REVIEW_HISTORY 제거 — AI 리뷰 생성 기능 삭제
 */
export const AI_ADMIN_ENDPOINTS = {
  QUIZ_GENERATE: `${ADMIN}/ai/quiz/generate`,
  QUIZ_HISTORY: `${ADMIN}/ai/quiz/history`,
  CHAT_SESSIONS: `${ADMIN}/ai/chat/sessions`,
  CHAT_MESSAGES: (sessionId) => `${ADMIN}/ai/chat/sessions/${sessionId}/messages`,
  CHAT_STATS: `${ADMIN}/ai/chat/stats`,
  /* ── 리뷰 인증 (2026-04-14 추가) — Backend ──
   * 도장깨기 코스 리뷰를 AI 에이전트가 "영화 줄거리 ↔ 리뷰 유사도" 로 판정한 기록의
   * 모니터링·수동 오버라이드 API 묶음. 에이전트 자체는 추후 개발 예정이며, 본 묶음은
   * 에이전트 판정 결과를 관리자가 검수·오버라이드할 수 있게 한다.
   */
  REVIEW_VERIFY_QUEUE:     `${ADMIN}/ai/review-verification/queue`,
  REVIEW_VERIFY_OVERVIEW:  `${ADMIN}/ai/review-verification/overview`,
  REVIEW_VERIFY_DETAIL:    (id) => `${ADMIN}/ai/review-verification/${id}`,
  REVIEW_VERIFY_APPROVE:   (id) => `${ADMIN}/ai/review-verification/${id}/approve`,
  REVIEW_VERIFY_REJECT:    (id) => `${ADMIN}/ai/review-verification/${id}/reject`,
  REVIEW_VERIFY_REVERIFY:  (id) => `${ADMIN}/ai/review-verification/${id}/reverify`,
  /* ── 채팅 추천 칩 (2026-04-23 추가) — Backend ──
   * 채팅 환영 화면 추천 질문 칩(ChatWindow.jsx)의 DB 풀을 운영자가 직접 CRUD.
   * Public EP(/api/v1/chat/suggestions)와 분리 — 본 묶음은 Admin 전용 CRUD.
   * 목록 조회: GET ?page=0&size=20&isActive=true&fromDate=&toDate=
   * 등록: POST / 수정: PUT /{id} / 삭제: DELETE /{id} / 활성토글: PATCH /{id}/active */
  CHAT_SUGGESTIONS:       `${ADMIN}/chat-suggestions`,
  CHAT_SUGGESTION_DETAIL: (id) => `${ADMIN}/chat-suggestions/${id}`,
  CHAT_SUGGESTION_ACTIVE: (id) => `${ADMIN}/chat-suggestions/${id}/active`,
};

/* ── 데이터 관리 (윤형주 — Agent) ── */
// 2026-04-14: Agent 가 실제로 제공하는 경로와 일치시킴 (기존 /data/stats, /data/health 는
// 미구현이라 "데이터 현황" 탭이 비어 보였던 원인). admin_data.py 의 데이터 현황 3EP 와 매핑:
//   OVERVIEW     → /admin/data/overview     (5DB 건수 카드)
//   DISTRIBUTION → /admin/data/distribution (소스별 분포)
//   QUALITY      → /admin/data/quality      (NULL 비율 등 품질)
//
// 2026-04-15: 파이프라인 계약 정렬.
//   Agent admin_data.py 는 job-id 기반이라 프론트가 가정했던 `status` / `checkpoint` /
//   `log/stream` 엔드포인트가 아예 없었다. 실제 라우트와 맞추고, UI 가 쓰던 polling·SSE
//   구독은 이후 Pipeline 컴포넌트 리팩토링에서 job-id 기반으로 대체한다.
//   - PIPELINE_LOG   : /pipeline/log/stream → /pipeline/logs (Query: job_id)
//   - PIPELINE_STATUS: /pipeline/status 미존재 → /pipeline (작업 목록) 로 대체
//                      (UI 는 "실행 가능 작업" 목록만 보여주고 상태는 /history 에서 유추)
//   - PIPELINE_CHECKPOINT: 제거 (Agent 미제공 — Pipeline 컴포넌트에서도 호출 제거)
//   - MOVIE_DB_STATUS: 제거 (Agent 미제공 — Movie 상세에서 호출 제거, 상세 자체는 /movies/{id})
export const DATA_ADMIN_ENDPOINTS = {
  OVERVIEW: `${ADMIN}/data/overview`,
  DISTRIBUTION: `${ADMIN}/data/distribution`,
  QUALITY: `${ADMIN}/data/quality`,
  MOVIES: `${ADMIN}/movies`,
  MOVIE_DETAIL: (id) => `${ADMIN}/movies/${id}`,
  PIPELINE_TASKS: `${ADMIN}/pipeline`,          // 작업 목록(9건)
  PIPELINE_RUN: `${ADMIN}/pipeline/run`,
  PIPELINE_LOGS: `${ADMIN}/pipeline/logs`,      // SSE, Query param: job_id
  PIPELINE_CANCEL: `${ADMIN}/pipeline/cancel`,
  PIPELINE_HISTORY: `${ADMIN}/pipeline/history`,
  PIPELINE_STATS: `${ADMIN}/pipeline/stats`,
  PIPELINE_RETRY: `${ADMIN}/pipeline/retry-failed`,
};
