/**
 * 관리자 AI 어시스턴트 전용 페이지.
 *
 * 경로: /admin/assistant
 * 위치: 사이드바 최상단 (모든 탭보다 위) — 관리자가 "먼저 물어본다" 는 UX 지향.
 *
 * Step 3 (2026-04-23):
 *  - 화면 전체 폭을 채워 채팅 패널 렌더 (차트/표가 나오기 시작하면 공간 필요)
 *  - useAdminAssistant 훅이 SSE 스트림을 관리
 *  - Agent `/api/v1/admin/assistant/chat` 에 JWT 포함 요청
 *
 * Phase F (v3, 2026-04-23):
 *  - form_prefill / navigation SSE 이벤트 → FormPrefillCard / NavigationCard 렌더
 *  - ConfirmationDialog 렌더 지점 제거 (컴포넌트 파일은 예비 보관)
 *  - AI 는 쓰기를 수행하지 않음. 저장/실행은 관리자가 해당 화면에서 직접.
 *
 * 설계서: docs/관리자_AI에이전트_v3_재설계.md §7 (Admin Client 연동)
 *
 * 후속 작업:
 *  - 좌측 세션 리스트 (과거 대화 재진입)
 *  - 대상 페이지(NoticeCreateModal 등) location.state.draft 초기 폼 주입
 *  - ChartRenderer / TableRenderer (chart_data / table_data 이벤트)
 */

import styled from 'styled-components';
import AssistantChatPanel from '../components/AssistantChatPanel';
import useAdminAssistant from '../hooks/useAdminAssistant';


export default function AdminAssistantPage() {
  const {
    messages,
    status,
    currentPhase,
    lastError,
    confirmation,
    sendMessage,
    approveTool,
    rejectTool,
    cancel,
    resetConversation,
  } = useAdminAssistant();

  return (
    <Wrapper>
      <PageHeader>
        <PageTitle>🤖 AI 어시스턴트</PageTitle>
        <PageDesc>
          자연어로 통계·조회·공지 초안 작성 등 관리 작업을 요청하세요. AI 는 데이터를
          조회하고 폼을 채워주거나 화면으로 안내합니다. 실제 저장·실행은 해당 화면에서
          관리자가 직접 수행합니다.
        </PageDesc>
      </PageHeader>

      <PanelContainer>
        <AssistantChatPanel
          messages={messages}
          status={status}
          currentPhase={currentPhase}
          lastError={lastError}
          confirmation={confirmation}
          onSubmit={sendMessage}
          onApprove={approveTool}
          onReject={rejectTool}
          onCancel={cancel}
          onReset={resetConversation}
        />
      </PanelContainer>
    </Wrapper>
  );
}


/* ── styled-components ── */

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const PageHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const PageTitle = styled.h2`
  font-size: ${({ theme }) => theme.fontSizes.xxl};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const PageDesc = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.textMuted};
  margin: 0;
`;

/**
 * 채팅 패널 컨테이너 — 페이지 헤더 아래 나머지 높이를 전부 점유.
 *
 * AdminLayout 의 컨텐츠 영역이 min-height 기반이라, 여기서 `flex: 1 + min-height: 0`
 * 조합으로 자식 AssistantChatPanel 의 스크롤이 올바르게 동작하게 한다.
 */
const PanelContainer = styled.div`
  flex: 1;
  min-height: 0;

  /* 입력창 + 말풍선이 충분히 보이도록 최소 높이 보장 */
  @media (max-width: 768px) {
    min-height: 70vh;
  }
`;
