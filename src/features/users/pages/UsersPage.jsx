/**
 * 사용자 관리 페이지.
 *
 * 2026-04-08 개편:
 *  - "업적 마스터" 서브탭 흡수 (구 운영 도구 → 사용자 도메인 이관)
 *  - 최상위에 2개 서브탭 도입: "사용자 목록" / "업적 마스터"
 *
 * 2026-04-23: URL 쿼리파라미터 자동 반응 추가.
 *  - ?userId=u_xxx : 해당 사용자 자동 선택 + 상세 패널 오픈
 *  - ?action=suspend|activate|role|points-adjust|tokens-grant : UserDetailPanel 을 통해
 *    해당 action 모달을 자동 오픈 (userId 도 함께 있어야 동작)
 *  - location.state.draft 가 있으면 UserDetailPanel → UserActionModal 에 초기값 주입
 *
 * 사용자 목록 서브탭:
 * - 2단 레이아웃 구조 (좌: UserTable, 우: UserDetailPanel)
 * - 선택된 사용자가 없으면 1단으로 축소
 *
 * 업적 마스터 서브탭:
 * - 업적 코드/이름/설명/포인트 보상 CRUD
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import UserTable from '../components/UserTable';
import UserDetailPanel from '../components/UserDetailPanel';
import AchievementMasterTab from '../components/AchievementMasterTab';
import { useQueryParams } from '@/shared/hooks/useQueryParams';
import { useAiPrefill } from '@/shared/hooks/useAiPrefill';

/** 서브탭 정의 */
const TABS = [
  { key: 'list',        label: '사용자 목록' },
  { key: 'achievement', label: '업적 마스터' },
];

/** 유효한 action 값 집합 (UserActionModal mode 와 매핑) */
const VALID_ACTIONS = new Set(['suspend', 'activate', 'role', 'points-adjust', 'tokens-grant']);

/**
 * URL ?action= 값을 UserActionModal 의 mode 값으로 변환.
 * URL 에서는 하이픈 표기(points-adjust)를 사용하고 모달에서는 내부 mode 명(points, grant-tokens)을 사용한다.
 */
function actionToModalMode(action) {
  if (action === 'points-adjust') return 'points';
  if (action === 'tokens-grant')  return 'grant-tokens';
  return action; // suspend | activate | role
}

export default function UsersPage() {
  /* ── URL 쿼리파라미터 / AI prefill ── */
  /**
   * ?userId=u_xxx          : 해당 사용자 자동 선택 + 상세 패널 오픈
   * ?action=suspend|...    : userId 와 함께 사용 시 해당 액션 모달 자동 오픈
   * location.state.draft   : UserActionModal 초기값으로 전달
   */
  const { userId: queryUserId, action: queryAction } = useQueryParams();
  const { draft, isAiGenerated } = useAiPrefill();

  /** 현재 활성 탭 */
  const [activeTab, setActiveTab] = useState('list');

  /**
   * 현재 선택된 사용자 ID (사용자 목록 탭 전용).
   * null이면 상세 패널이 닫혀 있고 1단 레이아웃이 적용된다.
   * ?userId 쿼리가 있으면 초기값으로 사용.
   */
  const [selectedUserId, setSelectedUserId] = useState(() => queryUserId || null);

  /**
   * UserDetailPanel 에 전달할 자동 오픈 action.
   * ?action= 쿼리가 유효한 값이면 세팅, 상세 패널이 마운트된 후 한 번만 소비된다.
   */
  const [pendingAction, setPendingAction] = useState(() =>
    queryUserId && VALID_ACTIONS.has(queryAction) ? queryAction : null
  );

  /** UserTable onSelectUser 콜백 */
  function handleSelectUser(userId) {
    setSelectedUserId(userId);
    /* 수동 선택 시 AI pending action 초기화 */
    setPendingAction(null);
  }

  /** 상세 패널 닫기 */
  function handleCloseDetail() {
    setSelectedUserId(null);
    setPendingAction(null);
  }

  /**
   * ?userId 쿼리가 바뀌면 선택 사용자 동기화.
   * (브라우저 뒤로가기 등으로 URL 이 바뀌는 경우 대응)
   */
  useEffect(() => {
    if (queryUserId) {
      setSelectedUserId(queryUserId);
      if (VALID_ACTIONS.has(queryAction)) {
        setPendingAction(queryAction);
      }
      /* 사용자 목록 탭으로 자동 전환 */
      setActiveTab('list');
    }
  }, [queryUserId, queryAction]);

  /**
   * 액션(역할 변경/정지/복구) 완료 후 목록 새로고침용 key.
   * refreshKey 변경 시 UserTable이 재마운트되어 loadUsers 재실행.
   */
  const [refreshKey, setRefreshKey] = useState(0);

  function handleRefresh() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <Wrapper>
      {/* ── 페이지 헤더 ── */}
      <PageHeader>
        <PageTitle>사용자 관리</PageTitle>
        <PageDesc>
          회원 목록·역할·정지/복구·활동 내역 관리 및 업적 마스터 데이터 관리
        </PageDesc>
      </PageHeader>

      {/* ── 서브탭 네비게이션 ── */}
      <TabNav>
        {TABS.map((tab) => (
          <TabButton
            key={tab.key}
            $active={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </TabButton>
        ))}
      </TabNav>

      {/* ── 사용자 목록 탭 ── */}
      {activeTab === 'list' && (
        <TwoPane $hasDetail={!!selectedUserId}>
          {/* 좌측: 회원 목록 테이블 */}
          <ListPane>
            <UserTable
              key={refreshKey}
              selectedUserId={selectedUserId}
              onSelectUser={handleSelectUser}
            />
          </ListPane>

          {/* 우측: 상세 패널 (사용자 선택 시에만 렌더링) */}
          {selectedUserId && (
            <UserDetailPanel
              userId={selectedUserId}
              onClose={handleCloseDetail}
              onRefresh={handleRefresh}
              /**
               * AI 어시스턴트가 요청한 초기 오픈 액션.
               * UserDetailPanel 이 마운트되면 해당 mode 로 UserActionModal 을 자동 오픈.
               * 소비 후 null 로 초기화하여 재오픈 방지.
               */
              initialAction={pendingAction ? actionToModalMode(pendingAction) : null}
              onInitialActionConsumed={() => setPendingAction(null)}
              /**
               * AI draft 초기값 — UserActionModal 폼 필드에 주입.
               * source='ai_assistant' 인 경우에만 useAiPrefill 이 반환하므로 isAiGenerated 체크.
               */
              aiDraft={isAiGenerated ? draft : null}
            />
          )}
        </TwoPane>
      )}

      {/* ── 업적 마스터 탭 ── */}
      {activeTab === 'achievement' && <AchievementMasterTab />}
    </Wrapper>
  );
}

/* ── styled-components ── */

const Wrapper = styled.div``;

/** 페이지 상단 헤더 영역 */
const PageHeader = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const PageTitle = styled.h2`
  font-size: ${({ theme }) => theme.fontSizes.xxl};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const PageDesc = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.textMuted};
`;

/** 서브탭 네비게이션 */
const TabNav = styled.nav`
  display: flex;
  border-bottom: 2px solid ${({ theme }) => theme.colors.border};
  margin-bottom: ${({ theme }) => theme.spacing.xxl};
  gap: 0;
`;

const TabButton = styled.button`
  padding: 10px 20px;
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ $active, theme }) =>
    $active ? theme.fontWeights.semibold : theme.fontWeights.normal};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.primary : theme.colors.textSecondary};
  border-bottom: 2px solid ${({ $active, theme }) =>
    $active ? theme.colors.primary : 'transparent'};
  margin-bottom: -2px;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    color: ${({ theme }) => theme.colors.primary};
  }
`;

/**
 * 2단 그리드 레이아웃.
 * $hasDetail=true  → 목록(1fr) + 상세(420px)
 * $hasDetail=false → 목록(1fr) 단독
 */
const TwoPane = styled.div`
  display: grid;
  grid-template-columns: ${({ $hasDetail }) =>
    $hasDetail ? '1fr 420px' : '1fr'};
  gap: ${({ theme }) => theme.spacing.lg};
  align-items: start;
  transition: grid-template-columns ${({ theme }) => theme.transitions.normal};
`;

/** 좌측 목록 패널 */
const ListPane = styled.div`
  min-width: 0; /* 그리드 셀 오버플로우 방지 */
`;
