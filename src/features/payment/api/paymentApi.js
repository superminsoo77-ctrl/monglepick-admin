/**
 * 결제/포인트 관리 탭 API 호출 함수 모음.
 *
 * 모든 요청은 backendApi(Spring Boot :8080)를 통해 처리된다.
 * PAYMENT_ADMIN_ENDPOINTS 상수를 사용하며 하드코딩 금지.
 *
 * @module paymentApi
 */

import { backendApi } from '@/shared/api/axiosInstance';
import { PAYMENT_ADMIN_ENDPOINTS } from '@/shared/constants/api';

/* ── 결제 주문 ── */

/**
 * 결제 내역 목록 조회.
 * @param {Object} params - 검색 조건
 * @param {string} [params.status]    - 결제 상태 필터 (COMPLETED|PENDING|FAILED|REFUNDED)
 * @param {string} [params.orderType] - 결제 유형 필터 (SUBSCRIPTION|POINT_PACK)
 * @param {string} [params.userId]    - 특정 사용자 ID 필터
 * @param {string} [params.fromDate]  - 생성일 시작 inclusive (ISO-8601, 예: 2026-04-01T00:00:00)
 * @param {string} [params.toDate]    - 생성일 종료 exclusive (ISO-8601)
 * @param {number} [params.page=0]    - 페이지 번호 (0-base)
 * @param {number} [params.size=20]   - 페이지 크기
 * @returns {Promise<{content: Array, totalElements: number, totalPages: number}>}
 */
export function fetchPaymentOrders(params = {}) {
  const { page = 0, size = 20, ...rest } = params;
  const query = new URLSearchParams({ page, size, ...rest }).toString();
  return backendApi.get(`${PAYMENT_ADMIN_ENDPOINTS.ORDERS}?${query}`);
}

/**
 * 결제 주문 상세 조회.
 * @param {string} orderId - 주문 ID
 * @returns {Promise<Object>} 주문 상세 정보
 */
export function fetchOrderDetail(orderId) {
  return backendApi.get(PAYMENT_ADMIN_ENDPOINTS.ORDER_DETAIL(orderId));
}

/**
 * 환불 처리.
 * @param {string} orderId      - 환불할 주문 ID
 * @param {Object} data         - 환불 요청 데이터
 * @param {string} data.reason  - 환불 사유
 * @param {number} [data.amount] - 부분 환불 금액 (생략 시 전액 환불)
 * @returns {Promise<Object>} 환불 결과
 */
export function refundOrder(orderId, data) {
  return backendApi.post(PAYMENT_ADMIN_ENDPOINTS.REFUND(orderId), data);
}

/**
 * PG(Toss) 재조회 동기화 — 2026-04-24 추가.
 *
 * Toss 콘솔에서 직접 취소했거나 웹훅이 유실되어 DB 는 COMPLETED 인데 PG 는 CANCELED 인
 * 주문의 DB 상태를 PG 에 맞춰 동기화한다. 일반 {@link refundOrder} 가 cancelPayment 재호출로
 * ALREADY_CANCELED 500 에러를 유발하는 문제를 근본적으로 회피한다.
 *
 * 동작: Toss getPayment (read-only) 만 호출 → DB/PG 상태 비교 → 불일치 시 포인트 회수 +
 * DB REFUNDED 마킹. cancelPayment 는 절대 호출하지 않는다.
 *
 * @param {string} orderId - 동기화할 주문 UUID
 * @returns {Promise<{result: 'SYNCED'|'NO_CHANGE'|'MISMATCH', dbStatus: string, pgStatus: string, pointsRecovered: number, message: string}>}
 */
export function syncOrderFromPg(orderId) {
  return backendApi.post(PAYMENT_ADMIN_ENDPOINTS.SYNC_FROM_PG(orderId));
}

/**
 * 보상 실패 주문 목록 조회.
 *
 * Toss Payments 콜백 실패 또는 포인트/구독 지급 실패로 `COMPENSATION_FAILED`
 * 상태가 된 주문을 반환한다. 별도 엔드포인트 없이 결제 목록 API에 상태 필터로
 * 조회하며, 응답의 `content` 배열만 추출해 평탄화한다.
 *
 * @returns {Promise<Array>} 보상 실패 주문 목록 (빈 배열 가능)
 */
export function fetchFailedOrders() {
  // 백엔드는 /payment/orders/failed 엔드포인트를 제공하지 않는다.
  // 대신 ORDERS 목록에 status=COMPENSATION_FAILED 필터로 조회한다.
  const query = new URLSearchParams({ status: 'COMPENSATION_FAILED', page: 0, size: 100 }).toString();
  return backendApi
    .get(`${PAYMENT_ADMIN_ENDPOINTS.ORDERS}?${query}`)
    .then((page) => (Array.isArray(page?.content) ? page.content : []));
}

/**
 * 보상 실패 건 수동 보상 처리.
 *
 * 백엔드는 `POST /api/v1/admin/subscription/{orderId}/compensate` (설계서 잔존 경로)이며,
 * body로 `adminNote`(필수)를 받는다. 실제로는 주문 UUID를 복구하는 엔드포인트다.
 *
 * @param {string} orderId - 복구할 주문 UUID
 * @param {Object} [data]  - 보상 요청 데이터
 * @param {string} [data.adminNote] - 보상 메모 (관리자 입력). 미지정 시 기본값 사용.
 * @returns {Promise<Object>} 복구 결과
 */
export function compensateOrder(orderId, data = {}) {
  return backendApi.post(PAYMENT_ADMIN_ENDPOINTS.COMPENSATE(orderId), {
    adminNote: data.adminNote?.trim() || '관리자 수동 보상 처리',
  });
}

/* ── 구독 ── */

/**
 * 구독 목록 조회.
 * @param {Object} params              - 검색 조건
 * @param {string} [params.status]     - 상태 필터 (ACTIVE|CANCELLED|EXPIRED)
 * @param {string} [params.planCode]   - 플랜 코드 필터 (monthly_basic|monthly_premium|yearly_basic|yearly_premium)
 * @param {string} [params.userId]     - 특정 사용자 ID 필터
 * @param {string} [params.fromDate]   - 구독 생성일 시작 inclusive (ISO-8601)
 * @param {string} [params.toDate]     - 구독 생성일 종료 exclusive (ISO-8601)
 * @param {number} [params.page=0]     - 페이지 번호
 * @param {number} [params.size=20]    - 페이지 크기
 * @returns {Promise<{content: Array, totalElements: number, totalPages: number}>}
 */
export function fetchSubscriptions(params = {}) {
  const { page = 0, size = 20, ...rest } = params;
  const query = new URLSearchParams({ page, size, ...rest }).toString();
  return backendApi.get(`${PAYMENT_ADMIN_ENDPOINTS.SUBSCRIPTIONS}?${query}`);
}

/**
 * 구독 수동 취소.
 *
 * 백엔드 AdminPaymentController.cancelSubscription 은 `PUT` 메서드이므로 동일하게 사용한다.
 *
 * @param {string|number} id - 구독 레코드 ID (PK)
 * @returns {Promise<Object>} 취소 결과
 */
export function cancelSubscription(id) {
  return backendApi.put(PAYMENT_ADMIN_ENDPOINTS.CANCEL_SUB(id));
}

/**
 * 구독 연장 (1주기).
 *
 * 백엔드 AdminPaymentController.extendSubscription 은 `PUT` 메서드이며,
 * body 로 adminNote (선택)를 받는다.
 *
 * @param {string|number} id - 구독 레코드 ID (PK)
 * @param {Object} [data]    - 연장 요청 데이터
 * @param {string} [data.adminNote] - 관리자 메모
 * @returns {Promise<Object>} 연장 결과
 */
export function extendSubscription(id, data = {}) {
  return backendApi.put(PAYMENT_ADMIN_ENDPOINTS.EXTEND_SUB(id), {
    adminNote: data.adminNote?.trim() || null,
  });
}

/* ── 포인트 ── */

/**
 * 포인트 수동 지급 또는 차감.
 *
 * 백엔드(`AdminManualPointRequest`)는 `amount` 부호로 지급(+)/차감(-)을 구분한다.
 * 프론트 UI 는 편의상 `type='EARN'|'DEDUCT'`로 입력받으므로, 여기서 부호를 결정해 전달한다.
 *
 * @param {Object} data          - 지급/차감 요청 데이터
 * @param {string} data.userId   - 대상 사용자 ID
 * @param {number} data.amount   - 포인트 금액 (항상 양수 입력)
 * @param {string} data.reason   - 처리 사유
 * @param {string} [data.type='EARN'] - 처리 유형 (EARN: 지급 | DEDUCT: 차감)
 * @returns {Promise<Object>} 처리 결과 (잔액 포함)
 */
export function manualPointTransfer(data) {
  const { userId, amount, reason, type = 'EARN' } = data;
  /* 백엔드 규약: 양수=지급, 음수=차감. UI type 을 amount 부호로 변환한다. */
  const signedAmount = type === 'DEDUCT'
    ? -Math.abs(Number(amount))
    : Math.abs(Number(amount));
  return backendApi.post(PAYMENT_ADMIN_ENDPOINTS.POINT_MANUAL, {
    userId,
    amount: signedAmount,
    reason,
  });
}

/**
 * 특정 사용자의 포인트 변동 이력 조회 (날짜 범위 필터 지원).
 *
 * 백엔드 `/point/histories` 는 userId / fromDate / toDate 쿼리 파라미터를 지원한다.
 * 모두 nullable — 생략한 조건은 WHERE 절에서 자동 제외된다.
 *
 * @param {string} userId             - 사용자 ID (nullable — 빈 값이면 전체 사용자)
 * @param {Object} params             - 검색 조건
 * @param {string} [params.fromDate]  - 변동일 시작 inclusive (ISO-8601, 예: 2026-04-01T00:00:00)
 * @param {string} [params.toDate]    - 변동일 종료 exclusive (ISO-8601)
 * @param {number} [params.page=0]    - 페이지 번호 (0-base)
 * @param {number} [params.size=20]   - 페이지 크기
 * @returns {Promise<{content: Array, totalElements: number, totalPages: number}>}
 */
export function fetchPointHistory(userId, params = {}) {
  const { page = 0, size = 20, fromDate, toDate } = params;
  const qp = new URLSearchParams({ page, size });
  if (userId)   qp.append('userId',   userId);
  if (fromDate) qp.append('fromDate', fromDate);
  if (toDate)   qp.append('toDate',   toDate);
  return backendApi.get(`${PAYMENT_ADMIN_ENDPOINTS.POINT_HISTORIES}?${qp.toString()}`);
}

/**
 * 포인트 교환 아이템 목록 조회.
 * @returns {Promise<Array>} 아이템 목록
 */
export function fetchPointItems() {
  return backendApi.get(PAYMENT_ADMIN_ENDPOINTS.POINT_ITEMS);
}

/**
 * 포인트 아이템 신규 등록 — 2026-04-09 P0 누락분 보강.
 *
 * Backend `AdminPaymentService.createPointItem()` + `POST /api/v1/admin/point/items`
 * 엔드포인트는 이미 구현되어 있었으나 Frontend 호출부가 없어 관리자가 UI 에서
 * 신규 포인트 상품을 추가할 수 없었다. 본 함수는 해당 API 를 연결한다.
 *
 * UI 연결(신규 등록 모달)은 후속 작업으로 분리되어 있으며, 그 시점까지는
 * 개발자 콘솔/테스트 스크립트에서 직접 호출할 수 있다.
 *
 * @param {Object} data                   - 포인트 아이템 등록 요청
 * @param {string} data.itemName          - 아이템 이름 (필수)
 * @param {string} [data.itemDescription] - 설명 (선택)
 * @param {number} data.itemPrice         - 가격 (필수, 원 단위)
 * @param {string} [data.itemCategory]    - 카테고리 (미지정 시 "general")
 * @param {boolean} [data.isActive]       - 활성화 여부 (기본 true)
 * @returns {Promise<Object>} 등록된 아이템 응답 DTO
 */
export function createPointItem(data) {
  return backendApi.post(PAYMENT_ADMIN_ENDPOINTS.POINT_ITEMS, data);
}

/**
 * 포인트 아이템 정보 수정.
 * @param {string|number} id  - 아이템 ID
 * @param {Object} data       - 수정할 데이터 (name, price, description, active 등)
 * @returns {Promise<Object>} 수정된 아이템 정보
 */
export function updatePointItem(id, data) {
  return backendApi.put(PAYMENT_ADMIN_ENDPOINTS.POINT_ITEM_DETAIL(id), data);
}

/**
 * 포인트 아이템 이미지 업로드 (2026-04-27 신규).
 *
 * <p>운영자가 신규 아바타·배지 등록 시 SVG/PNG 등 이미지 파일을 직접 업로드한다.
 * Backend 가 검증(magic bytes / SVG XSS 패턴 / 5MB 한도) 후 절대 URL 을 반환하며,
 * 호출 측은 이 URL 을 PointItem 등록·수정 요청의 {@code imageUrl} 필드에 채워 넣는다.</p>
 *
 * @param {File}   file   업로드 파일 (input[type=file].files[0])
 * @param {string} subdir "avatars" | "badges" — 아바타/배지 카테고리에 따라 분기
 * @returns {Promise<{url: string}>} 업로드된 이미지의 절대 URL
 */
export function uploadPointItemImage(file, subdir) {
  const form = new FormData();
  form.append('file', file);
  form.append('subdir', subdir);
  return backendApi.post(PAYMENT_ADMIN_ENDPOINTS.POINT_ITEM_IMAGE_UPLOAD, form, {
    /* axios 가 자동으로 multipart boundary 설정 — 명시적 Content-Type 지정하지 않는다.
     * 일부 axios 인스턴스가 application/json 을 기본 헤더로 강제하면 이 옵션이 명시적 override. */
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}
