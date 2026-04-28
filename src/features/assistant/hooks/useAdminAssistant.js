/**
 * 관리자 AI 어시스턴트 상태 머신 훅.
 *
 * 책임:
 *  - 대화 메시지 배열 관리 (user/assistant 구분)
 *  - SSE 스트림 상태 (idle / streaming / awaiting_confirmation / done / error) 유지
 *  - tool_call / tool_result 트레이스 누적 (투명성 — UI 에서 접힘 카드로 렌더)
 *  - session_id 영속 (같은 세션으로 멀티턴 유지)
 *  - 전송 도중 취소 (AbortController)
 *
 * Step 5b (2026-04-23): HITL 승인 흐름 추가.
 *  - Agent 가 risk_gate 에서 interrupt 하면 `confirmation_required` SSE 이벤트 도착
 *  - 훅은 `confirmation` state 에 payload 저장 + status='awaiting_confirmation' 으로 전이
 *  - 사용자가 ConfirmationDialog 에서 승인/거절하면 `approveTool()` / `rejectTool(comment)` 호출
 *  - 내부적으로 `resumeAdminAssistant` 로 /resume SSE 개시 → 동일 assistant 메시지에 결과 이어 쓰기
 *  - 승인/거절 후 toolCalls 의 해당 항목에 `decision` 필드를 주입해 ToolCallTrace 가 상태 표시
 *
 * Phase F (v3, 2026-04-23): form_prefill / navigation SSE 이벤트 연결.
 *  - Agent 가 `form_prefill` 이벤트를 발행하면 해당 assistant 메시지의 `formPrefill` 필드에 저장.
 *    AssistantChatPanel → FormPrefillCard 가 이를 읽어 "열기" 버튼을 렌더한다.
 *  - Agent 가 `navigation` 이벤트를 발행하면 `navigation` 필드에 저장.
 *    AssistantChatPanel → NavigationCard 가 이동 버튼을 렌더한다.
 *  - 상태머신은 기존 그대로 (streaming → done/error). 두 이벤트는 done 전에 도달한다.
 *
 * 상태 모델:
 *   messages: [{ id, role, text, status?, toolCalls?, toolResults?, formPrefill?, navigation?, error? }]
 *   status:   'idle' | 'streaming' | 'awaiting_confirmation' | 'done' | 'error'
 *   confirmation: ConfirmationPayload | null  (예비 보관 — v3 에서 미사용)
 *   sessionId: string
 */

import { useCallback, useRef, useState } from 'react';
import {
  resumeAdminAssistant,
  streamAdminAssistant,
} from '../api/assistantApi';


/** 단조 증가 로컬 메시지 ID 발급기. React key 충돌 방지용. */
let _localMsgSeq = 0;
function nextMsgId() {
  _localMsgSeq += 1;
  return `m_${Date.now()}_${_localMsgSeq}`;
}


export default function useAdminAssistant() {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('idle');
  const [sessionId, setSessionId] = useState('');
  const [lastError, setLastError] = useState(null);
  const [currentPhase, setCurrentPhase] = useState('');
  /** Agent 가 risk_gate 에서 interrupt 하면 채워지는 ConfirmationPayload. 결정 후 null. */
  const [confirmation, setConfirmation] = useState(null);

  /** 현재 진행 중인 요청 취소용 */
  const abortRef = useRef(null);
  /** 현재 스트리밍 중인 assistant 메시지 ID — 모든 SSE 콜백이 같은 메시지를 지목 */
  const activeAssistantIdRef = useRef(null);

  const updateAssistant = useCallback((id, patch) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    );
  }, []);

  const appendTrace = useCallback((id, key, entry) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const existing = m[key] || [];
        return { ...m, [key]: [...existing, entry] };
      })
    );
  }, []);

  /**
   * 가장 최근 tool_call 이 가리키는 항목에 `decision` 필드를 주입.
   * ToolCallTrace 가 'approved' / 'rejected' 배지를 그리는 근거.
   */
  const markLastToolCallDecision = useCallback((assistantId, decisionValue) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== assistantId) return m;
        const calls = m.toolCalls || [];
        if (calls.length === 0) return m;
        const lastIdx = calls.length - 1;
        const updated = calls.map((c, i) =>
          i === lastIdx ? { ...c, decision: decisionValue } : c
        );
        return { ...m, toolCalls: updated };
      })
    );
  }, []);

  /**
   * assistant 메시지 id / abort 시그널을 받아 공통 SSE 콜백 세트를 만든다.
   * chat(최초) 와 resume(재개) 이 같은 콜백 구조를 쓰므로 팩토리로 추출.
   *
   * @param {string} assistantId
   * @returns {Object} 콜백 객체
   */
  const _buildSseCallbacks = useCallback(
    (assistantId) => ({
      onSession: ({ session_id }) => {
        if (session_id) setSessionId(session_id);
      },
      onStatus: ({ message }) => {
        if (message) setCurrentPhase(message);
      },
      onToolCall: (payload) => {
        appendTrace(assistantId, 'toolCalls', payload);
      },
      onToolResult: (payload) => {
        appendTrace(assistantId, 'toolResults', payload);
      },
      onToken: ({ delta }) => {
        // Step 2 narrator 가 최종 응답 전체를 단일 token 으로 발행 → 덮어쓰기.
        if (typeof delta === 'string') {
          updateAssistant(assistantId, { text: delta });
        }
      },
      onConfirmationRequired: (payload) => {
        // v2 HITL 흐름 — v3 에서 Agent 가 발행하지 않으나 예비 보관
        setConfirmation(payload);
        setStatus('awaiting_confirmation');
        setCurrentPhase('관리자 승인을 기다리고 있어요...');
      },
      onFormPrefill: (payload) => {
        // v3 Phase F: AI 가 폼 초안을 완성했을 때 도착.
        // assistant 메시지의 formPrefill 필드에 저장 → FormPrefillCard 가 렌더.
        updateAssistant(assistantId, { formPrefill: payload });
      },
      onNavigation: (payload) => {
        // v3 Phase F: AI 가 대상 화면 링크를 제공할 때 도착.
        // assistant 메시지의 navigation 필드에 저장 → NavigationCard 가 렌더.
        updateAssistant(assistantId, { navigation: payload });
      },
      onDone: () => {
        updateAssistant(assistantId, { status: 'done' });
        setStatus('done');
        setCurrentPhase('');
      },
      onError: (payload) => {
        updateAssistant(assistantId, {
          status: 'error',
          error: payload?.message || '요청 처리 중 오류가 발생했어요.',
        });
        setLastError(payload?.message || 'unknown');
        setStatus('error');
        setCurrentPhase('');
      },
    }),
    [appendTrace, updateAssistant],
  );

  /**
   * SSE 에러(네트워크/HTTP) 를 assistant 메시지와 훅 상태에 반영.
   */
  const _handleSseException = useCallback(
    (assistantId, e) => {
      if (e?.name === 'AbortError') {
        updateAssistant(assistantId, {
          status: 'aborted',
          error: '요청이 취소되었어요.',
        });
        setStatus('idle');
        setCurrentPhase('');
        return;
      }
      let hint = '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.';
      if (e?.status === 401) hint = '인증이 만료되었어요. 다시 로그인해주세요.';
      if (e?.status === 403) hint = '이 기능은 관리자 권한이 필요해요.';
      updateAssistant(assistantId, { status: 'error', error: hint });
      setLastError(hint);
      setStatus('error');
      setCurrentPhase('');
    },
    [updateAssistant],
  );

  /**
   * 사용자 발화 전송.
   */
  const sendMessage = useCallback(
    async (text) => {
      const trimmed = (text || '').trim();
      if (!trimmed || status === 'streaming' || status === 'awaiting_confirmation') return;

      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userId = nextMsgId();
      const assistantId = nextMsgId();
      activeAssistantIdRef.current = assistantId;

      setMessages((prev) => [
        ...prev,
        { id: userId, role: 'user', text: trimmed },
        {
          id: assistantId,
          role: 'assistant',
          text: '',
          status: 'streaming',
          toolCalls: [],
          toolResults: [],
          formPrefill: null,  // form_prefill SSE 이벤트 수신 시 채워짐 → FormPrefillCard 렌더
          navigation: null,   // navigation SSE 이벤트 수신 시 채워짐 → NavigationCard 렌더
        },
      ]);
      setStatus('streaming');
      setLastError(null);
      setConfirmation(null);
      setCurrentPhase('요청을 전달하고 있어요...');

      try {
        await streamAdminAssistant(
          { message: trimmed, sessionId },
          _buildSseCallbacks(assistantId),
          controller.signal,
        );
      } catch (e) {
        _handleSseException(assistantId, e);
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [sessionId, status, _buildSseCallbacks, _handleSseException],
  );

  /**
   * 승인/거절 공통 실행기. ConfirmationDialog 버튼이 호출.
   */
  const _resume = useCallback(
    async (decision, comment = '') => {
      if (status !== 'awaiting_confirmation' || !sessionId) return;

      const assistantId = activeAssistantIdRef.current;
      if (!assistantId) return;

      // toolCall 카드에 결정 배지 선반영 (낙관적 업데이트)
      markLastToolCallDecision(assistantId, decision);

      // confirmation 닫고 다시 스트리밍 상태로 전이
      setConfirmation(null);
      setStatus('streaming');
      setLastError(null);
      setCurrentPhase(
        decision === 'approve'
          ? '승인된 작업을 실행하고 있어요...'
          : '작업을 취소하고 있어요...',
      );

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await resumeAdminAssistant(
          { sessionId, decision, comment },
          _buildSseCallbacks(assistantId),
          controller.signal,
        );
      } catch (e) {
        _handleSseException(assistantId, e);
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [status, sessionId, markLastToolCallDecision, _buildSseCallbacks, _handleSseException],
  );

  const approveTool = useCallback(
    (comment = '') => _resume('approve', comment),
    [_resume],
  );

  const rejectTool = useCallback(
    (comment = '') => _resume('reject', comment),
    [_resume],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const resetConversation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    activeAssistantIdRef.current = null;
    setMessages([]);
    setSessionId('');
    setStatus('idle');
    setLastError(null);
    setCurrentPhase('');
    setConfirmation(null);
  }, []);

  return {
    messages,
    status,
    sessionId,
    currentPhase,
    lastError,
    confirmation,
    sendMessage,
    approveTool,
    rejectTool,
    cancel,
    resetConversation,
  };
}
