/**
 * localStorage 래퍼 유틸리티 (관리자용).
 * monglepick-client의 storage.js 패턴과 동일.
 * 관리자 전용 키 접두사(monglepick_admin_)로 사용자 세션과 분리.
 */

/** 관리자 인증 토큰 저장 키 */
const TOKEN_KEY = 'monglepick_admin_token';
/** 관리자 사용자 정보 저장 키 */
const USER_KEY = 'monglepick_admin_user';

/**
 * localStorage에서 값을 안전하게 가져온다.
 * @param {string} key
 * @returns {string|null}
 */
function safeGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * localStorage에 값을 안전하게 저장한다.
 * @param {string} key
 * @param {string} value
 */
function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 시크릿 모드 등에서 무시
  }
}

/**
 * localStorage에서 값을 안전하게 삭제한다.
 * @param {string} key
 */
function safeRemoveItem(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // 무시
  }
}

// ── JWT payload 디코딩 (가드용) ──
/**
 * JWT payload 를 base64url 디코딩해 role/sub/exp 만 확인한다.
 * 서명 검증은 하지 않는다 — 이 값은 "이 토큰이 ADMIN 맞는지" 클라이언트 사전 체크 전용.
 * 최종 권한 검증은 Backend/Agent 가 서명 검증으로 수행한다.
 */
function decodeJwtPayloadUnsafe(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    );
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

// ── 인증 토큰 ──
/**
 * Admin 용 JWT 를 반환.
 *
 * 2026-04-23 재발방지 가드: 토큰이 있어도 payload.role 이 'ADMIN' 이 아니면 null 리턴.
 * 배경 — 같은 브라우저에서 Client(유저)와 Admin(관리자)을 동시에 로그인한 상태에서
 * 드물게 `monglepick_admin_token` 슬롯에 유저 토큰이 들어가 있는 케이스가 관찰됐다.
 * Admin 의 모든 outbound 요청이 이 함수를 통해 토큰을 얻으므로, 여기서 role 검증을
 * 한 번 더 하면 유저 토큰이 혼입됐을 때도 401 이 나 재로그인이 유도된다.
 *
 * 검증 실패 시 토큰을 자동 제거하지는 않는다(신뢰할 수 없는 상태로 두되 사용 차단만).
 * 명시적 로그아웃/재로그인 흐름으로 복구한다.
 */
export function getToken() {
  const raw = safeGetItem(TOKEN_KEY);
  if (!raw) return null;
  const payload = decodeJwtPayloadUnsafe(raw);
  if (!payload) {
    // 파싱 불가 — 손상된 토큰. 사용 차단.
    if (typeof console !== 'undefined') {
      console.warn('[admin-storage] JWT 디코딩 실패 — 토큰 사용 차단');
    }
    return null;
  }
  const role = payload.role || payload.admin_role;
  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    if (typeof console !== 'undefined') {
      console.warn(
        '[admin-storage] 관리자 토큰이 아님 (role=%s) — 사용 차단. 다시 로그인해 주세요.',
        role,
      );
    }
    return null;
  }
  return raw;
}
export function setToken(token) {
  safeSetItem(TOKEN_KEY, token);
}
export function removeToken() {
  safeRemoveItem(TOKEN_KEY);
}

// ── 사용자 정보 ──
export function getUser() {
  const json = safeGetItem(USER_KEY);
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
export function setUser(user) {
  try {
    safeSetItem(USER_KEY, JSON.stringify(user));
  } catch {
    // 직렬화 실패 무시
  }
}
export function removeUser() {
  safeRemoveItem(USER_KEY);
}

/**
 * 모든 관리자 localStorage 데이터를 삭제한다.
 */
export function clearAll() {
  removeToken();
  removeUser();
}
