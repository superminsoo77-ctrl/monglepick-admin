/**
 * 관리자 AI 어시스턴트 SSE API.
 *
 * Agent 의 `POST /api/v1/admin/assistant/chat` 에 fetch 요청을 보내고
 * ReadableStream 으로 SSE 이벤트를 실시간 파싱하여 콜백으로 전달한다.
 *
 * monglepick-client 의 `features/chat/api/chatApi.js` 와 동일한 파서 패턴을
 * 사용한다 (EventSource 는 Authorization 헤더를 못 보내므로 fetch + 수동 파싱).
 *
 * 지원 SSE 이벤트 (Step 2 시점):
 *  - session      : { session_id }
 *  - status       : { phase, message, keepalive? }
 *  - tool_call    : { tool_name, arguments, tier }
 *  - tool_result  : { tool_name, ok, status_code, latency_ms, row_count, ref_id, error }
 *  - token        : { delta }                (최종 응답 텍스트)
 *  - done         : {}
 *  - error        : { message, ... }
 *
 * Phase F (v3, 2026-04-23) 신규 추가 이벤트:
 *  - form_prefill : { target_path, draft_fields, action_label, summary, tool_name }
 *                   AI 가 폼 초안을 작성했을 때 발행. Client 가 "열기" 버튼을 렌더.
 *  - navigation   : { target_path, label, context_summary, candidates?, tool_name }
 *                   AI 가 대상 화면을 찾아 링크를 제공할 때 발행.
 *
 * 예비 보관 이벤트(확장성):
 *  - confirmation_required / chart_data / table_data / report_chunk
 *
 * 보안:
 *  - JWT 는 shared/utils/storage 의 getToken() 으로만 접근.
 *  - 자동 재시도는 Step 3 에서 필요해지면 도입 (Admin 용도는 비로그인 없음, 단건 실행 모델).
 */

import { getToken } from '../../../shared/utils/storage';
import { SERVICE_URLS } from '../../../shared/api/serviceUrls';

const API_BASE = `${SERVICE_URLS.AGENT}/api/v1`;


/**
 * SSE POST 요청을 공통 처리한다 — chat / resume 양쪽이 재사용.
 *
 * @internal
 */
async function _postAdminAssistantSse(path, bodyObj, callbacks, signal) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(bodyObj),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    const err = new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    err.status = response.status;
    throw err;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // sse-starlette 가 \r\n 을 쓰는 경우가 있어 LF 로 정규화.
      const chunk = decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      buffer += chunk;
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() || '';
      for (const block of blocks) {
        if (block.trim()) parseSseBlock(block, callbacks);
      }
    }
    if (buffer.trim()) parseSseBlock(buffer, callbacks);
  } finally {
    reader.cancel().catch(() => {});
  }
}


/**
 * SSE 스트리밍 대화 요청. 이벤트가 발생할 때마다 콜백이 호출된다.
 *
 * @param {Object} params
 * @param {string} params.message       사용자 입력 (1~3000자)
 * @param {string} [params.sessionId]   세션 ID (빈 문자열이면 신규)
 * @param {Object} callbacks            이벤트 콜백
 * @param {Function} [callbacks.onSession]
 * @param {Function} [callbacks.onStatus]
 * @param {Function} [callbacks.onToolCall]
 * @param {Function} [callbacks.onToolResult]
 * @param {Function} [callbacks.onToken]
 * @param {Function} [callbacks.onConfirmationRequired]
 * @param {Function} [callbacks.onFormPrefill]   form_prefill 이벤트 — AI 가 폼 초안 완성 시
 * @param {Function} [callbacks.onNavigation]    navigation 이벤트 — AI 가 화면 링크 제공 시
 * @param {Function} [callbacks.onChartData]
 * @param {Function} [callbacks.onTableData]
 * @param {Function} [callbacks.onDone]
 * @param {Function} [callbacks.onError]
 * @param {AbortSignal} [signal]        요청 취소용
 * @returns {Promise<void>}
 */
export async function streamAdminAssistant(
  { message, sessionId = '' },
  callbacks = {},
  signal,
) {
  return _postAdminAssistantSse(
    '/admin/assistant/chat',
    { session_id: sessionId, message },
    callbacks,
    signal,
  );
}


/**
 * HITL 승인/거절 재개 요청 (Step 5b).
 *
 * `confirmation_required` SSE 이벤트를 받은 뒤 사용자가 모달에서 승인/거절을 누르면
 * 이 함수가 호출된다. Agent 는 동일 session_id 의 thread_id checkpoint 에서 risk_gate 를
 * 재개하고, 승인이면 tool_executor → narrator → done, 거절이면 token(거절 안내) → done 을
 * 동일 SSE 파이프라인으로 흘려보낸다. 따라서 callbacks 는 `streamAdminAssistant` 와 같은
 * 것을 재사용하면 된다.
 *
 * @param {Object} params
 * @param {string} params.sessionId        재개할 세션 ID (필수)
 * @param {'approve'|'reject'} params.decision
 * @param {string} [params.comment]        사용자가 모달에 남긴 메모 (선택)
 * @param {Object} callbacks               streamAdminAssistant 와 동일 형태
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
export async function resumeAdminAssistant(
  { sessionId, decision, comment = '' },
  callbacks = {},
  signal,
) {
  if (!sessionId) {
    throw new Error('session_id 가 필요합니다 (재개할 대화를 특정할 수 없음).');
  }
  if (decision !== 'approve' && decision !== 'reject') {
    throw new Error("decision 은 'approve' 또는 'reject' 여야 합니다.");
  }
  return _postAdminAssistantSse(
    '/admin/assistant/resume',
    { session_id: sessionId, decision, comment },
    callbacks,
    signal,
  );
}


/**
 * 단일 SSE 블록(event: / data: 라인) 을 파싱해 콜백으로 dispatch 한다.
 */
function parseSseBlock(block, callbacks) {
  const lines = block.split('\n');
  let eventType = null;
  let dataStr = '';
  for (const line of lines) {
    if (line.startsWith('event:')) eventType = line.slice(6).trim();
    else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
  }
  if (!dataStr) return;

  let data;
  try {
    data = JSON.parse(dataStr);
  } catch {
    return;
  }

  // sse-starlette 이중 래핑 대응 (client chatApi.js 와 동일 패턴)
  if (typeof data === 'string' && data.includes('event:')) {
    parseSseBlock(data, callbacks);
    return;
  }

  dispatch(eventType, data, callbacks);
}


function dispatch(eventType, data, callbacks) {
  const {
    onSession,
    onStatus,
    onToolCall,
    onToolResult,
    onToken,
    onConfirmationRequired,
    onFormPrefill,
    onNavigation,
    onChartData,
    onTableData,
    onReportChunk,
    onDone,
    onError,
  } = callbacks;

  switch (eventType) {
    case 'session':
      onSession?.(data);
      break;
    case 'status':
      onStatus?.(data);
      break;
    case 'tool_call':
      onToolCall?.(data);
      break;
    case 'tool_result':
      onToolResult?.(data);
      break;
    case 'token':
      onToken?.(data);
      break;
    // v3 Phase F 신규 — AI 가 폼 초안을 완성했을 때 발행.
    // payload: { target_path, draft_fields, action_label, summary, tool_name }
    case 'form_prefill':
      onFormPrefill?.(data);
      break;
    // v3 Phase F 신규 — AI 가 대상 관리 화면 링크를 제공할 때 발행.
    // payload: { target_path, label, context_summary, candidates?, tool_name }
    case 'navigation':
      onNavigation?.(data);
      break;
    // 예비 보관 — v3 에서 미사용. Agent 가 발행하지 않으나 케이스 유지(호환성).
    case 'confirmation_required':
      onConfirmationRequired?.(data);
      break;
    case 'chart_data':
      onChartData?.(data);
      break;
    case 'table_data':
      onTableData?.(data);
      break;
    case 'report_chunk':
      onReportChunk?.(data);
      break;
    case 'done':
      onDone?.(data);
      break;
    case 'error':
      onError?.(data);
      break;
    default:
      // 미등록 이벤트는 조용히 무시 — Agent 가 신규 이벤트를 먼저 배포해도 폭주 방지
      break;
  }
}
