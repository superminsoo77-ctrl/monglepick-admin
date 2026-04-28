/**
 * 사용자 상세 패널 컴포넌트 — 2026-04-09 P2-⑮ "사용자 360도 뷰" 확장.
 *
 * 우측 sticky 패널로 렌더링되며 다음 섹션으로 구성된다:
 * 1. 프로필 섹션: 닉네임, 이메일, 역할, 상태, 가입일
 * 2. 포인트 섹션: 잔액, 등급
 * 3. 활동 카운트: 게시글 수, 리뷰 수, 댓글 수
 * 4. 액션 버튼: 역할 변경 / 계정 정지 or 계정 복구
 * 5. 하단 미니 탭:
 *    - **통합 타임라인** (2026-04-09 신규) — 5개 소스(활동/포인트/결제/제재/감사)를
 *      병렬 조회하여 시간순 단일 피드로 통합 렌더링
 *    - 활동 이력
 *    - 포인트 내역
 *    - 결제 내역
 *
 * ## 통합 타임라인 설계
 *
 * 기존에는 활동/포인트/결제 3개 탭이 각각 10건씩 분리 표시되어 "이 사용자에게
 * 최근 무슨 일이 있었는가" 를 한눈에 파악하기 어려웠다. 통합 타임라인은 아래 5개
 * 소스를 `Promise.allSettled` 로 병렬 조회한 뒤 정규화된 `TimelineEvent` 배열로
 * 병합하고 `createdAt` 내림차순 정렬하여 최근 50건을 렌더링한다.
 *
 * 1. `fetchUserActivity` — 게시글/리뷰/댓글 작성 이력
 * 2. `fetchUserPoints` — 포인트 변동 (획득/사용)
 * 3. `fetchUserPayments` — 결제 주문
 * 4. `fetchSuspensionHistory` — 계정 제재/복구 원장
 * 5. `fetchAuditLogs({ targetType: 'USER', targetId: userId })` — 관리자가 이 사용자에게
 *    가한 조치 (역할 변경/수동 포인트/이용권 발급 등). 2026-04-09 P2-⑮ 확장으로
 *    Backend `searchByFilters()` 에 targetId 파라미터가 추가되어 정밀 조회 가능.
 *
 * 한쪽 API 실패는 나머지 소스 표시를 막지 않으며, 실패한 소스는 조용히 스킵한다.
 *
 * @param {Object}   props
 * @param {string}   props.userId     - 조회할 사용자 ID
 * @param {Function} props.onClose    - 패널 닫기 콜백
 * @param {Function} props.onRefresh  - 외부 목록 갱신 콜백 (액션 완료 후 호출)
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import {
  MdClose,
  MdEdit,
  MdBlock,
  MdCheckCircle,
  MdPerson,
  MdTimeline,
  MdChatBubbleOutline,
  MdMonetizationOn,
  MdPayment,
  MdGavel,
  MdAdminPanelSettings,
} from 'react-icons/md';
import {
  fetchUserDetail,
  fetchUserActivity,
  fetchUserPoints,
  fetchUserPayments,
  fetchSuspensionHistory,
  /* 2026-04-14 신설 — 사용자 리워드 진행 현황 */
  fetchUserRewards,
} from '../api/usersApi';
import { fetchAuditLogs } from '@/features/settings/api/settingsApi';
import StatusBadge from '@/shared/components/StatusBadge';
import UserActionModal from './UserActionModal';

/** 날짜 포맷 헬퍼: ISO → YYYY.MM.DD HH:MM */
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 계정 상태 → StatusBadge 매핑 */
const STATUS_BADGE = {
  ACTIVE:    { status: 'success', label: '활성' },
  SUSPENDED: { status: 'error',   label: '정지' },
  LOCKED:    { status: 'warning', label: '잠금' },
};

/** 역할 → StatusBadge 매핑 */
const ROLE_BADGE = {
  ADMIN: { status: 'info',    label: 'ADMIN' },
  USER:  { status: 'default', label: 'USER' },
};

/** 등급 → StatusBadge 매핑 (gradeCode 기준) */
const GRADE_BADGE = {
  NORMAL:   { status: 'default', label: 'NORMAL' },
  BRONZE:   { status: 'warning', label: 'BRONZE' },
  SILVER:   { status: 'info',    label: 'SILVER' },
  GOLD:     { status: 'warning', label: 'GOLD' },
  PLATINUM: { status: 'success', label: 'PLATINUM' },
  DIAMOND:  { status: 'info',    label: 'DIAMOND' },
};

/**
 * 하단 미니 탭 정의.
 * 2026-04-09 P2-⑮: "통합 타임라인" 첫 번째 위치에 추가.
 */
const MINI_TABS = [
  { id: 'timeline', label: '통합 타임라인' },
  { id: 'rewards',  label: '리워드 현황' }, /* 2026-04-14 신설 — 활동 진행도 + 마일스톤 달성률 */
  { id: 'activity', label: '활동 이력' },
  { id: 'points',   label: '포인트 내역' },
  { id: 'payments', label: '결제 내역' },
];

/**
 * 통합 타임라인에서 가져올 소스별 최대 건수.
 * 5 소스 × 20건 = 최대 100건 병합 → 정렬 후 상위 50건만 렌더링.
 */
const TIMELINE_PER_SOURCE = 20;
const TIMELINE_MAX_RENDER = 50;

/**
 * 타임라인 소스 별 시각화 메타 — 아이콘/색상/라벨.
 * 렌더링 시 {@code source} 값으로 lookup 하여 일관된 UI 제공.
 */
const TIMELINE_SOURCE_META = {
  activity:   { label: '활동',     color: '#3b82f6', icon: MdChatBubbleOutline },
  point:      { label: '포인트',   color: '#10b981', icon: MdMonetizationOn },
  payment:    { label: '결제',     color: '#f59e0b', icon: MdPayment },
  suspension: { label: '제재',     color: '#ef4444', icon: MdGavel },
  audit:      { label: '관리조치', color: '#8b5cf6', icon: MdAdminPanelSettings },
};

/**
 * 금액 포맷 — 천 단위 콤마, 양수는 "+" prefix.
 * 포인트 변동 이벤트에서 사용.
 */
function formatSignedAmount(n, suffix = 'P') {
  if (n == null || Number.isNaN(Number(n))) return '-';
  const num = Number(n);
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toLocaleString()}${suffix}`;
}

/**
 * @param {Object}   props
 * @param {string}   props.userId                  - 조회할 사용자 ID
 * @param {Function} props.onClose                 - 패널 닫기 콜백
 * @param {Function} props.onRefresh               - 외부 목록 갱신 콜백
 * @param {string|null} [props.initialAction]      - AI 어시스턴트가 요청한 초기 모달 mode
 *   ('role' | 'suspend' | 'activate' | 'points' | 'grant-tokens').
 *   사용자 상세 로드 완료 후 해당 모달을 자동 오픈한다.
 * @param {Function} [props.onInitialActionConsumed] - initialAction 소비 후 부모에 알림
 * @param {Object|null} [props.aiDraft]            - AI 어시스턴트가 채운 폼 초기값
 */
export default function UserDetailPanel({
  userId,
  onClose,
  onRefresh,
  initialAction = null,
  onInitialActionConsumed,
  aiDraft = null,
}) {
  /* ── 사용자 상세 상태 ── */
  const [detail, setDetail]               = useState(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [detailError, setDetailError]     = useState(null);

  /* ── 미니 탭 상태 ── */
  /** 현재 활성 미니 탭 ID — 2026-04-09 P2-⑮: 기본값을 'timeline' 으로 변경 */
  const [activeTab, setActiveTab] = useState('timeline');
  /** 탭별 데이터 캐시: { activity: [], points: [], payments: [] } */
  const [tabData, setTabData]     = useState({});
  /** 탭별 로딩 상태 */
  const [tabLoading, setTabLoading] = useState({});
  /** 탭별 에러 메시지 */
  const [tabError, setTabError]   = useState({});
  /** 한 번이라도 로드된 탭 목록 (중복 요청 방지) */
  const [loadedTabs, setLoadedTabs] = useState(new Set());

  /* ── 액션 모달 상태 ── */
  /** 열려 있는 모달 모드: 'role' | 'suspend' | 'activate' | 'points' | 'grant-tokens' | null */
  const [modalMode, setModalMode] = useState(null);

  /**
   * 사용자 상세 정보 조회.
   * userId 변경 시 기존 상태를 초기화하고 새로 요청한다.
   */
  const loadDetail = useCallback(async () => {
    if (!userId) return;
    try {
      setDetailLoading(true);
      setDetailError(null);
      setDetail(null);
      // 탭 캐시도 초기화 (다른 사용자 선택 시 오염 방지)
      setTabData({});
      setLoadedTabs(new Set());
      /* 2026-04-09 P2-⑮: 사용자 전환 시 통합 타임라인을 기본 첫 화면으로 복귀 */
      setActiveTab('timeline');
      const result = await fetchUserDetail(userId);
      setDetail(result);
    } catch (err) {
      setDetailError(err.message || '상세 정보를 불러올 수 없습니다.');
    } finally {
      setDetailLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  /* 상세 로드 완료 후 initialAction 이 있으면 해당 모달 자동 오픈 (AI 어시스턴트 연동) */
  useEffect(() => {
    if (detail && initialAction) {
      setModalMode(initialAction);
      onInitialActionConsumed?.();
    }
  // detail.userId 기준으로 1회만 실행 — initialAction/onInitialActionConsumed 는 렌더마다 변하지 않음
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.userId]);

  /**
   * 미니 탭 데이터 로딩.
   * 이미 로드된 탭은 재요청하지 않는다 (lazy 캐싱).
   *
   * @param {string} tabId - 'timeline' | 'activity' | 'points' | 'payments'
   */
  const loadTabData = useCallback(async (tabId) => {
    if (!userId || loadedTabs.has(tabId)) return;

    try {
      setTabLoading((prev) => ({ ...prev, [tabId]: true }));
      setTabError((prev) => ({ ...prev, [tabId]: null }));

      let items;

      if (tabId === 'timeline') {
        /*
         * 통합 타임라인 — 2026-04-09 P2-⑮ 신규.
         *
         * 5개 소스를 Promise.allSettled 로 병렬 호출하여 한쪽 실패가 나머지를 막지
         * 않도록 한다. 각 결과를 normalize...() 헬퍼로 TimelineEvent 배열로 변환한 뒤
         * 하나의 배열로 병합하여 createdAt 내림차순 정렬, 최근 TIMELINE_MAX_RENDER 건만
         * 반환한다.
         */
        const [
          activityResult,
          pointsResult,
          paymentsResult,
          suspensionResult,
          auditResult,
        ] = await Promise.allSettled([
          fetchUserActivity(userId, { page: 0, size: TIMELINE_PER_SOURCE }),
          fetchUserPoints(userId,   { page: 0, size: TIMELINE_PER_SOURCE }),
          fetchUserPayments(userId, { page: 0, size: TIMELINE_PER_SOURCE }),
          fetchSuspensionHistory(userId),
          /* targetType=USER + targetId=userId 필터로 "이 사용자에게 가해진 관리 조치" 만 조회.
           * Backend searchByFilters() 가 2026-04-09 P2-⑮ 확장으로 targetId 파라미터를 받는다. */
          fetchAuditLogs({
            targetType: 'USER',
            targetId:   userId,
            page:       0,
            size:       TIMELINE_PER_SOURCE,
          }),
        ]);

        const events = [];

        /* ── 활동 이력 ── */
        if (activityResult.status === 'fulfilled') {
          const raw = activityResult.value;
          const arr = Array.isArray(raw?.content) ? raw.content : (Array.isArray(raw) ? raw : []);
          arr.forEach((it, idx) => {
            const type = it.type ?? it.activityType ?? 'ACTIVITY';
            events.push({
              id: `activity-${it.id ?? idx}-${it.createdAt ?? idx}`,
              source: 'activity',
              title: type,
              description: it.description ?? it.content ?? '-',
              createdAt: it.createdAt,
            });
          });
        }

        /* ── 포인트 이력 ── */
        if (pointsResult.status === 'fulfilled') {
          const raw = pointsResult.value;
          const arr = Array.isArray(raw?.content) ? raw.content : (Array.isArray(raw) ? raw : []);
          arr.forEach((it, idx) => {
            /* 포인트 변동량 필드는 백엔드에서 pointChange 로 내려오지만, 일부 레거시
             * 응답에서는 amount/changeAmount 로도 확인되므로 안전하게 fallback 한다. */
            const amount = it.pointChange ?? it.amount ?? it.changeAmount ?? 0;
            const typeLabel = it.pointType ?? it.type ?? '변동';
            events.push({
              id: `point-${it.id ?? it.pointsHistoryId ?? idx}-${it.createdAt ?? idx}`,
              source: 'point',
              title: `${typeLabel} ${formatSignedAmount(amount)}`,
              description: it.description ?? it.reason ?? '-',
              createdAt: it.createdAt,
            });
          });
        }

        /* ── 결제 이력 ── */
        if (paymentsResult.status === 'fulfilled') {
          const raw = paymentsResult.value;
          const arr = Array.isArray(raw?.content) ? raw.content : (Array.isArray(raw) ? raw : []);
          arr.forEach((it, idx) => {
            const amount = it.amount ?? 0;
            const orderType = it.orderType ?? it.type ?? '결제';
            const status = it.status ?? '';
            events.push({
              id: `payment-${it.paymentOrderId ?? it.orderId ?? it.id ?? idx}`,
              source: 'payment',
              title: `${orderType} ${Number(amount).toLocaleString()}원${status ? ` · ${status}` : ''}`,
              description: it.description ?? it.productName ?? '-',
              createdAt: it.createdAt,
            });
          });
        }

        /* ── 제재 이력 ── */
        if (suspensionResult.status === 'fulfilled') {
          const arr = Array.isArray(suspensionResult.value) ? suspensionResult.value : [];
          arr.forEach((it, idx) => {
            const statusLabel = it.status === 'SUSPENDED' ? '계정 정지' : '계정 복구';
            const until = it.suspendedUntil ? ` · ~${formatDate(it.suspendedUntil)}` : '';
            events.push({
              id: `suspension-${it.userStatusId ?? it.id ?? idx}`,
              source: 'suspension',
              title: `${statusLabel}${until}`,
              description: it.suspendReason ?? '-',
              createdAt: it.createdAt ?? it.suspendedAt,
            });
          });
        }

        /* ── 감사 로그 (관리자가 이 사용자에게 가한 조치) ── */
        if (auditResult.status === 'fulfilled') {
          const raw = auditResult.value;
          const arr = Array.isArray(raw?.content) ? raw.content : (Array.isArray(raw) ? raw : []);
          arr.forEach((it, idx) => {
            events.push({
              id: `audit-${it.id ?? idx}`,
              source: 'audit',
              title: it.actionType ?? '관리 조치',
              description: it.description ?? '-',
              createdAt: it.createdAt,
            });
          });
        }

        /* 시간순 정렬 (내림차순) + 최신 N건만 */
        events.sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tb - ta;
        });
        items = events.slice(0, TIMELINE_MAX_RENDER);
      } else if (tabId === 'rewards') {
        /*
         * 리워드 진행 현황 — 2026-04-14 신규.
         *
         * Backend GET /api/v1/admin/users/{userId}/rewards 호출.
         * 사용자 본인이 /api/v1/point/progress 로 보는 것과 동일 구조. 응답이
         * 배열이 아닌 단일 객체(UserRewardStatusResponse) 이므로 tabData 에도
         * 객체로 그대로 저장한다. 렌더링 시 `tabData.rewards?.activities` 등으로
         * 구조 분해한다.
         */
        const reward = await fetchUserRewards(userId);
        /* 배열/비어있음 분기가 있는 기본 렌더 로직에 걸리지 않도록 "0이 아닌 배열" 형태로 래핑 */
        items = reward ? [reward] : [];
      } else if (tabId === 'activity') {
        const result = await fetchUserActivity(userId, { page: 0, size: 10 });
        items = result?.content ?? result ?? [];
      } else if (tabId === 'points') {
        const result = await fetchUserPoints(userId, { page: 0, size: 10 });
        items = result?.content ?? result ?? [];
      } else if (tabId === 'payments') {
        const result = await fetchUserPayments(userId, { page: 0, size: 10 });
        items = result?.content ?? result ?? [];
      }

      setTabData((prev) => ({ ...prev, [tabId]: items ?? [] }));
      setLoadedTabs((prev) => new Set([...prev, tabId]));
    } catch (err) {
      setTabError((prev) => ({
        ...prev,
        [tabId]: err.message || '데이터를 불러올 수 없습니다.',
      }));
    } finally {
      setTabLoading((prev) => ({ ...prev, [tabId]: false }));
    }
  }, [userId, loadedTabs]);

  /**
   * 미니 탭 전환 핸들러.
   * 처음 방문하는 탭에 한해 API를 호출한다.
   */
  function handleTabChange(tabId) {
    setActiveTab(tabId);
    loadTabData(tabId);
  }

  /*
   * 컴포넌트 마운트 시 첫 번째 탭(timeline) 자동 로드 — 2026-04-09 P2-⑮ 변경.
   * 통합 타임라인이 기본 첫 화면이므로 여기서 자동 호출한다.
   */
  useEffect(() => {
    if (userId && !loadedTabs.has('timeline')) {
      loadTabData('timeline');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  /**
   * 액션 완료 콜백.
   * 모달을 닫고, 상세 정보를 재조회하며, 외부 목록도 갱신한다.
   */
  function handleActionSuccess() {
    setModalMode(null);
    // 탭 캐시를 무효화하여 다음 조회 시 최신 데이터를 가져오도록 함
    setLoadedTabs(new Set());
    loadDetail();
    onRefresh?.();
  }

  /* ── 렌더링 ── */

  return (
    <Panel>
      {/* ── 패널 헤더 (sticky) ── */}
      <PanelHeader>
        <PanelTitle>
          {detailLoading ? '불러오는 중...' : (detail?.nickname ?? detail?.email ?? '사용자 상세')}
        </PanelTitle>
        <CloseButton onClick={onClose} title="닫기">
          <MdClose size={18} />
        </CloseButton>
      </PanelHeader>

      {/* ── 에러 상태 ── */}
      {detailError && (
        <ErrorSection>
          <ErrorMsg>{detailError}</ErrorMsg>
        </ErrorSection>
      )}

      {/* ── 로딩 상태 ── */}
      {detailLoading && (
        <LoadingSection>불러오는 중...</LoadingSection>
      )}

      {/* ── 상세 내용 ── */}
      {!detailLoading && detail && (
        <>
          {/* 1. 프로필 섹션 */}
          <Section>
            <SectionTitle>
              <MdPerson size={14} />
              프로필
            </SectionTitle>
            <ProfileGrid>
              <MetaItem>
                <MetaLabel>닉네임</MetaLabel>
                <MetaValue>{detail.nickname ?? '-'}</MetaValue>
              </MetaItem>
              <MetaItem>
                <MetaLabel>이메일</MetaLabel>
                <MetaValue title={detail.email}>{detail.email ?? '-'}</MetaValue>
              </MetaItem>
              <MetaItem>
                <MetaLabel>역할</MetaLabel>
                <StatusBadge
                  status={ROLE_BADGE[detail.userRole]?.status ?? 'default'}
                  label={ROLE_BADGE[detail.userRole]?.label ?? (detail.userRole ?? '-')}
                />
              </MetaItem>
              <MetaItem>
                <MetaLabel>상태</MetaLabel>
                <StatusBadge
                  status={STATUS_BADGE[detail.status]?.status ?? 'default'}
                  label={STATUS_BADGE[detail.status]?.label ?? (detail.status ?? '-')}
                />
              </MetaItem>
              <MetaItem>
                <MetaLabel>가입일</MetaLabel>
                <MetaValue>{formatDate(detail.createdAt)}</MetaValue>
              </MetaItem>
              <MetaItem>
                <MetaLabel>최근 로그인</MetaLabel>
                <MetaValue>{formatDate(detail.lastLoginAt)}</MetaValue>
              </MetaItem>
            </ProfileGrid>
          </Section>

          {/* 2. 포인트 / 등급 섹션 */}
          <Section>
            <SectionTitle>포인트 / 등급</SectionTitle>
            <StatRow>
              <StatCard>
                <StatLabel>보유 포인트</StatLabel>
                <StatValue $accent>
                  {(detail.pointBalance ?? 0).toLocaleString()}P
                </StatValue>
              </StatCard>
              <StatCard>
                <StatLabel>등급</StatLabel>
                <StatusBadge
                  status={GRADE_BADGE[detail.gradeCode]?.status ?? 'default'}
                  label={detail.gradeName ?? GRADE_BADGE[detail.gradeCode]?.label ?? (detail.gradeCode ?? '-')}
                />
              </StatCard>
            </StatRow>
          </Section>

          {/* 3. 활동 카운트 섹션 */}
          <Section>
            <SectionTitle>활동 통계</SectionTitle>
            <StatRow>
              <StatCard>
                <StatLabel>게시글</StatLabel>
                <StatValue>{(detail.postCount ?? 0).toLocaleString()}</StatValue>
              </StatCard>
              <StatCard>
                <StatLabel>리뷰</StatLabel>
                <StatValue>{(detail.reviewCount ?? 0).toLocaleString()}</StatValue>
              </StatCard>
              <StatCard>
                <StatLabel>댓글</StatLabel>
                <StatValue>{(detail.commentCount ?? 0).toLocaleString()}</StatValue>
              </StatCard>
            </StatRow>
          </Section>

          {/* 4. 액션 버튼 섹션 */}
          <Section>
            <SectionTitle>관리 액션</SectionTitle>
            <ActionRow>
              {/* 역할 변경 버튼 */}
              <ActionButton
                $variant="primary"
                onClick={() => setModalMode('role')}
                title="역할 변경"
              >
                <MdEdit size={14} />
                역할 변경
              </ActionButton>

              {/* 계정 정지 / 복구 버튼 (상태에 따라 토글) */}
              {detail.status === 'SUSPENDED' ? (
                <ActionButton
                  $variant="success"
                  onClick={() => setModalMode('activate')}
                  title="계정 복구"
                >
                  <MdCheckCircle size={14} />
                  계정 복구
                </ActionButton>
              ) : (
                <ActionButton
                  $variant="danger"
                  onClick={() => setModalMode('suspend')}
                  title="계정 정지"
                  disabled={detail.userRole === 'ADMIN'} // 관리자 계정 정지 방지
                >
                  <MdBlock size={14} />
                  계정 정지
                </ActionButton>
              )}

              {/* 제재 이력 조회 (Phase 6-1 보강) */}
              <ActionButton
                $variant="default"
                onClick={() => setModalMode('history')}
                title="제재 이력 조회"
              >
                제재 이력
              </ActionButton>

              {/* 수동 포인트 조정 (Phase 6-2) */}
              <ActionButton
                $variant="primary"
                onClick={() => setModalMode('points')}
                title="수동 포인트 지급/회수"
              >
                포인트 조정
              </ActionButton>

              {/* 수동 AI 이용권 발급 (Phase 6-3) */}
              <ActionButton
                $variant="primary"
                onClick={() => setModalMode('grant-tokens')}
                title="수동 AI 이용권 발급"
              >
                이용권 발급
              </ActionButton>
            </ActionRow>
            {/* 관리자 계정 정지 불가 안내 */}
            {detail.userRole === 'ADMIN' && detail.status !== 'SUSPENDED' && (
              <AdminNotice>관리자 계정은 정지할 수 없습니다.</AdminNotice>
            )}
          </Section>

          {/* 5. 하단 미니 탭 섹션 */}
          <Section $noBorder>
            {/* 미니 탭 네비게이션 */}
            <MiniTabNav>
              {MINI_TABS.map((tab) => (
                <MiniTabButton
                  key={tab.id}
                  $active={activeTab === tab.id}
                  onClick={() => handleTabChange(tab.id)}
                >
                  {tab.label}
                </MiniTabButton>
              ))}
            </MiniTabNav>

            {/* 탭 콘텐츠 */}
            <MiniTabContent>
              {tabLoading[activeTab] ? (
                <TabLoading>불러오는 중...</TabLoading>
              ) : tabError[activeTab] ? (
                <TabErrorMsg>{tabError[activeTab]}</TabErrorMsg>
              ) : !tabData[activeTab] || tabData[activeTab].length === 0 ? (
                <TabEmpty>내역이 없습니다.</TabEmpty>
              ) : activeTab === 'timeline' ? (
                /*
                 * 통합 타임라인 렌더링 — 2026-04-09 P2-⑮ 신규.
                 *
                 * 각 이벤트는 source 에 따라 아이콘/색상이 결정되며, 좌측에 컬러 dot 과
                 * 세로 연결선이 표시되어 시간순 흐름을 시각화한다. 하단에 표시된 총 건수는
                 * TIMELINE_MAX_RENDER 에 의해 상한이 있음을 사용자에게 명시적으로 알린다.
                 */
                <TimelineList>
                  {tabData.timeline.map((event) => {
                    const meta = TIMELINE_SOURCE_META[event.source] ?? TIMELINE_SOURCE_META.activity;
                    const IconComp = meta.icon;
                    return (
                      <TimelineItem key={event.id}>
                        <TimelineIconWrap $color={meta.color}>
                          <IconComp size={14} />
                        </TimelineIconWrap>
                        <TimelineBody>
                          <TimelineHeader>
                            <TimelineSourceBadge $color={meta.color}>
                              {meta.label}
                            </TimelineSourceBadge>
                            <TimelineTitle>{event.title}</TimelineTitle>
                          </TimelineHeader>
                          {event.description && event.description !== '-' && (
                            <TimelineDesc title={event.description}>
                              {event.description}
                            </TimelineDesc>
                          )}
                          <TimelineDate>{formatDate(event.createdAt)}</TimelineDate>
                        </TimelineBody>
                      </TimelineItem>
                    );
                  })}
                  <TimelineFooter>
                    최근 {tabData.timeline.length}건 표시 (최대 {TIMELINE_MAX_RENDER}건)
                  </TimelineFooter>
                </TimelineList>
              ) : activeTab === 'rewards' ? (
                /*
                 * 리워드 진행 현황 렌더링 — 2026-04-14 신규.
                 *
                 * fetchUserRewards 응답은 단일 객체지만 공통 empty 검사(length===0)
                 * 를 통과시키기 위해 [reward] 로 래핑해서 저장했으므로 여기서 인덱스 0
                 * 을 꺼낸다. 요약 4항목(잔액/누적/활동누적/등급) + 활동 리스트 + 마일스톤 리스트.
                 */
                (() => {
                  const reward = tabData.rewards?.[0];
                  if (!reward) return <TabEmpty>리워드 데이터가 없습니다.</TabEmpty>;
                  const { totalEarned, earnedByActivity, currentBalance, gradeCode,
                          activities = [], milestones = [] } = reward;
                  return (
                    <RewardBody>
                      {/* 요약 4칸 */}
                      <RewardSummary>
                        <RewardSummaryItem>
                          <RewardSummaryLabel>현재 잔액</RewardSummaryLabel>
                          <RewardSummaryValue>
                            {Number(currentBalance ?? 0).toLocaleString()}P
                          </RewardSummaryValue>
                        </RewardSummaryItem>
                        <RewardSummaryItem>
                          <RewardSummaryLabel>누적 획득</RewardSummaryLabel>
                          <RewardSummaryValue>
                            {Number(totalEarned ?? 0).toLocaleString()}P
                          </RewardSummaryValue>
                        </RewardSummaryItem>
                        <RewardSummaryItem>
                          <RewardSummaryLabel>활동 누적 (등급 기준)</RewardSummaryLabel>
                          <RewardSummaryValue>
                            {Number(earnedByActivity ?? 0).toLocaleString()}P
                          </RewardSummaryValue>
                        </RewardSummaryItem>
                        <RewardSummaryItem>
                          <RewardSummaryLabel>등급</RewardSummaryLabel>
                          <RewardSummaryValue>{gradeCode ?? 'NORMAL'}</RewardSummaryValue>
                        </RewardSummaryItem>
                      </RewardSummary>

                      {/* 활동 진행도 */}
                      <RewardBlockTitle>활동별 현황 ({activities.length}건)</RewardBlockTitle>
                      {activities.length === 0 ? (
                        <TabEmpty>활동 기록이 없습니다.</TabEmpty>
                      ) : (
                        <RewardActivityList>
                          {activities.map((act) => {
                            const dailyLimit = act.dailyLimit ?? 0;
                            const rewardedToday = act.rewardedTodayCount ?? 0;
                            const percent = dailyLimit > 0
                              ? Math.min(100, Math.round((rewardedToday * 100) / dailyLimit))
                              : 0;
                            return (
                              <RewardActivityItem key={act.actionType}>
                                <RewardActivityHead>
                                  <RewardActivityName>{act.activityName}</RewardActivityName>
                                  <RewardActivityMeta>
                                    +{(act.pointsAmount ?? 0).toLocaleString()}P
                                  </RewardActivityMeta>
                                </RewardActivityHead>
                                {dailyLimit > 0 && (
                                  <RewardGaugeRow>
                                    <RewardGaugeTrack>
                                      <RewardGaugeFill $percent={percent} />
                                    </RewardGaugeTrack>
                                    <RewardGaugeLabel>
                                      오늘 {rewardedToday}/{dailyLimit}
                                    </RewardGaugeLabel>
                                  </RewardGaugeRow>
                                )}
                                <RewardCounterRow>
                                  <span>누적 {Number(act.totalCount ?? 0).toLocaleString()}회</span>
                                  <span>지급 {Number(act.rewardedTotalCount ?? 0).toLocaleString()}회</span>
                                  {act.currentStreak > 0 && (
                                    <span>연속 {act.currentStreak}회 (최고 {act.maxStreak ?? 0})</span>
                                  )}
                                </RewardCounterRow>
                              </RewardActivityItem>
                            );
                          })}
                        </RewardActivityList>
                      )}

                      {/* 마일스톤 진행률 */}
                      <RewardBlockTitle>마일스톤 진행률 ({milestones.length}건)</RewardBlockTitle>
                      {milestones.length === 0 ? (
                        <TabEmpty>마일스톤 정책이 없습니다.</TabEmpty>
                      ) : (
                        <RewardActivityList>
                          {milestones.map((m) => {
                            const percent = m.progressPercent ?? 0;
                            const current = m.currentValue ?? 0;
                            const threshold = m.thresholdCount ?? 0;
                            return (
                              <RewardActivityItem key={m.actionType} $achieved={m.achieved}>
                                <RewardActivityHead>
                                  <RewardActivityName>
                                    {m.activityName}
                                    {m.achieved && <RewardAchievedTag>달성</RewardAchievedTag>}
                                  </RewardActivityName>
                                  <RewardActivityMeta>
                                    +{(m.pointsAmount ?? 0).toLocaleString()}P
                                  </RewardActivityMeta>
                                </RewardActivityHead>
                                <RewardGaugeRow>
                                  <RewardGaugeTrack>
                                    <RewardGaugeFill $percent={percent} $achieved={m.achieved} />
                                  </RewardGaugeTrack>
                                  <RewardGaugeLabel>
                                    {current}/{threshold} ({percent}%)
                                  </RewardGaugeLabel>
                                </RewardGaugeRow>
                              </RewardActivityItem>
                            );
                          })}
                        </RewardActivityList>
                      )}
                    </RewardBody>
                  );
                })()
              ) : (
                <TabList>
                  {tabData[activeTab].map((item, idx) => (
                    /* 각 탭 데이터에 고유 id가 있으면 사용, 없으면 복합 key */
                    <TabListItem key={item.id ?? `${activeTab}-${idx}`}>
                      {/* 활동 이력 행 */}
                      {activeTab === 'activity' && (
                        <>
                          <TabItemLeft>
                            <TabItemType>{item.type ?? item.activityType ?? '-'}</TabItemType>
                            <TabItemDesc>{item.description ?? item.content ?? '-'}</TabItemDesc>
                          </TabItemLeft>
                          <TabItemDate>{formatDate(item.createdAt)}</TabItemDate>
                        </>
                      )}

                      {/* 포인트 내역 행 */}
                      {activeTab === 'points' && (
                        <>
                          <TabItemLeft>
                            <TabItemType>{item.pointType ?? item.type ?? item.changeType ?? '-'}</TabItemType>
                            <TabItemDesc>{item.description ?? item.reason ?? '-'}</TabItemDesc>
                          </TabItemLeft>
                          <TabItemRight>
                            <TabItemAmount
                              $positive={(item.pointChange ?? item.amount ?? item.changeAmount ?? 0) > 0}
                            >
                              {(item.pointChange ?? item.amount ?? item.changeAmount ?? 0) > 0 ? '+' : ''}
                              {(item.pointChange ?? item.amount ?? item.changeAmount ?? 0).toLocaleString()}P
                            </TabItemAmount>
                            <TabItemDate>{formatDate(item.createdAt)}</TabItemDate>
                          </TabItemRight>
                        </>
                      )}

                      {/* 결제 내역 행 */}
                      {activeTab === 'payments' && (
                        <>
                          <TabItemLeft>
                            <TabItemType>{item.type ?? item.paymentType ?? '-'}</TabItemType>
                            <TabItemDesc>{item.description ?? item.productName ?? '-'}</TabItemDesc>
                          </TabItemLeft>
                          <TabItemRight>
                            <TabItemAmount $positive={false}>
                              {(item.amount ?? 0).toLocaleString()}원
                            </TabItemAmount>
                            <TabItemDate>{formatDate(item.createdAt)}</TabItemDate>
                          </TabItemRight>
                        </>
                      )}
                    </TabListItem>
                  ))}
                </TabList>
              )}
            </MiniTabContent>
          </Section>
        </>
      )}

      {/* ── 액션 모달 ── */}
      <UserActionModal
        isOpen={modalMode !== null}
        mode={modalMode}
        user={detail ? {
          userId:   detail.userId,
          nickname: detail.nickname,
          email:    detail.email,
          userRole: detail.userRole,
          status:   detail.status,
        } : null}
        onClose={() => setModalMode(null)}
        onSuccess={handleActionSuccess}
        aiDraft={aiDraft}
        aiDraftFromAssistant={Boolean(aiDraft)}
      />
    </Panel>
  );
}

/* ── styled-components ── */

/**
 * 패널 컨테이너.
 * sticky 위치로 고정되며, 최대 높이를 초과하면 내부 스크롤.
 */
const Panel = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  overflow-y: auto;
  max-height: calc(100vh - 200px);
  position: sticky;
  top: ${({ theme }) => theme.layout.headerHeight};
`;

/** 패널 헤더 (스크롤해도 고정) */
const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bgHover};
  position: sticky;
  top: 0;
  z-index: 10;
`;

const PanelTitle = styled.h4`
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textMuted};
  flex-shrink: 0;
  &:hover {
    background: ${({ theme }) => theme.colors.border};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

/** 에러/로딩 전용 섹션 */
const ErrorSection = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
`;

const ErrorMsg = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.error};
  background: ${({ theme }) => theme.colors.errorBg};
  border-radius: 4px;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
`;

const LoadingSection = styled.div`
  padding: ${({ theme }) => theme.spacing.xxl};
  text-align: center;
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

/**
 * 각 정보 섹션.
 * $noBorder prop이 true면 하단 구분선을 제거한다.
 */
const Section = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
  border-bottom: ${({ $noBorder, theme }) =>
    $noBorder ? 'none' : `1px solid ${theme.colors.borderLight}`};
`;

const SectionTitle = styled.h5`
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

/** 2열 그리드 (프로필 메타 정보) */
const ProfileGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.md};
`;

const MetaItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0; /* 오버플로우 방지 */
`;

const MetaLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
`;

const MetaValue = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

/** 통계 카드 행 */
const StatRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const StatCard = styled.div`
  flex: 1;
  background: ${({ theme }) => theme.colors.bgHover};
  border: 1px solid ${({ theme }) => theme.colors.borderLight};
  border-radius: 6px;
  padding: ${({ theme }) => theme.spacing.md};
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
`;

const StatLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
`;

const StatValue = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ $accent, theme }) =>
    $accent ? theme.colors.primary : theme.colors.textPrimary};
`;

/** 액션 버튼 행 */
const ActionRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-wrap: wrap;
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  border-radius: 4px;
  transition: all ${({ theme }) => theme.transitions.fast};

  /* $variant에 따른 색상 */
  ${({ $variant, theme }) => {
    switch ($variant) {
      case 'primary':
        return `
          border: 1px solid ${theme.colors.primary};
          color: ${theme.colors.primary};
          background: ${theme.colors.primaryLight};
          &:hover:not(:disabled) { background: ${theme.colors.primary}; color: #fff; }
        `;
      case 'danger':
        return `
          border: 1px solid ${theme.colors.error};
          color: ${theme.colors.error};
          background: ${theme.colors.errorBg};
          &:hover:not(:disabled) { background: ${theme.colors.error}; color: #fff; }
        `;
      case 'success':
        return `
          border: 1px solid ${theme.colors.success};
          color: ${theme.colors.success};
          background: transparent;
          &:hover:not(:disabled) { background: ${theme.colors.success}; color: #fff; }
        `;
      default:
        return `
          border: 1px solid ${theme.colors.border};
          color: ${theme.colors.textSecondary};
        `;
    }
  }}

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

/** 관리자 계정 정지 불가 안내 텍스트 */
const AdminNotice = styled.p`
  margin-top: ${({ theme }) => theme.spacing.xs};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
`;

/* ── 미니 탭 ── */

const MiniTabNav = styled.div`
  display: flex;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const MiniTabButton = styled.button`
  padding: 6px 12px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ $active, theme }) =>
    $active ? theme.fontWeights.semibold : theme.fontWeights.normal};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.primary : theme.colors.textSecondary};
  border-bottom: 2px solid ${({ $active, theme }) =>
    $active ? theme.colors.primary : 'transparent'};
  margin-bottom: -1px;
  transition: all ${({ theme }) => theme.transitions.fast};
  white-space: nowrap;
  &:hover { color: ${({ theme }) => theme.colors.primary}; }
`;

const MiniTabContent = styled.div`
  min-height: 80px;
`;

const TabLoading = styled.p`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl};
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.xs};
`;

const TabErrorMsg = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.error};
  padding: ${({ theme }) => theme.spacing.sm};
`;

const TabEmpty = styled.p`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl};
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.xs};
`;

const TabList = styled.ul`
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 1px;
`;

const TabListItem = styled.li`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: 7px ${({ theme }) => theme.spacing.sm};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.bgHover};
  font-size: ${({ theme }) => theme.fontSizes.xs};
`;

const TabItemLeft = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
`;

const TabItemRight = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
`;

/** 활동 유형 / 결제 유형 라벨 */
const TabItemType = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

/** 활동 설명 텍스트 */
const TabItemDesc = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
`;

/** 포인트/금액: $positive true면 초록색, false면 기본색 */
const TabItemAmount = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ $positive, theme }) =>
    $positive ? theme.colors.success : theme.colors.textPrimary};
  font-family: ${({ theme }) => theme.fonts.mono};
`;

const TabItemDate = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textMuted};
  font-family: ${({ theme }) => theme.fonts.mono};
  white-space: nowrap;
`;

// ──────────────────────────────────────────────
// 통합 타임라인 styled-components (2026-04-09 P2-⑮ 신규)
// ──────────────────────────────────────────────

/**
 * 타임라인 리스트 컨테이너.
 * 좌측 아이콘 컬럼과 우측 본문 컬럼을 flex 로 배치하며,
 * 각 아이템 사이 세로 연결선은 TimelineItem 의 border-left 로 구현한다.
 */
const TimelineList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

/**
 * 타임라인 개별 아이템.
 * - 좌측: 컬러 dot (아이콘 포함)
 * - 우측: 제목/설명/시간
 * - 마지막 아이템을 제외하고는 세로 연결선이 dot 아래로 내려와 다음 아이템과 이어진다.
 */
const TimelineItem = styled.li`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.md};
  padding-bottom: ${({ theme }) => theme.spacing.md};
  position: relative;

  /*
   * 마지막이 아닌 경우 dot 아래로 세로 연결선 그리기 — 아이콘 래퍼의 중심 X=12px에
   * 맞춰 절대 위치로 얇은 회색 선을 그린다.
   */
  &:not(:last-of-type)::before {
    content: '';
    position: absolute;
    left: 11px;
    top: 24px;
    bottom: 0;
    width: 2px;
    background: ${({ theme }) => theme.colors.borderLight};
  }
`;

/**
 * 타임라인 아이콘 래퍼 — 소스별 컬러 배경의 원형.
 * z-index 로 연결선보다 앞에 표시되어 dot 이 선 위에 얹혀 보인다.
 */
const TimelineIconWrap = styled.div`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
  box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.bgCard};
`;

/** 타임라인 본문 — 제목/설명/시간 세로 배치 */
const TimelineBody = styled.div`
  flex: 1;
  min-width: 0;
`;

/** 타임라인 헤더 행 — 소스 배지 + 제목 */
const TimelineHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
`;

/** 소스 라벨 배지 (활동/포인트/결제/제재/관리조치) */
const TimelineSourceBadge = styled.span`
  display: inline-block;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 700;
  color: #ffffff;
  background: ${({ $color }) => $color};
  border-radius: 3px;
  letter-spacing: 0.3px;
  flex-shrink: 0;
`;

/** 타임라인 이벤트 제목 */
const TimelineTitle = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
`;

/** 타임라인 이벤트 설명 — 120자 truncate, 전체 내용은 title hover */
const TimelineDesc = styled.p`
  margin-top: 2px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-all;
`;

/** 타임라인 이벤트 시각 */
const TimelineDate = styled.div`
  margin-top: 3px;
  font-size: 10px;
  color: ${({ theme }) => theme.colors.textMuted};
  font-family: ${({ theme }) => theme.fonts.mono};
`;

/** 타임라인 하단 안내 — "최근 N건 표시" */
const TimelineFooter = styled.li`
  list-style: none;
  margin-top: ${({ theme }) => theme.spacing.xs};
  padding-top: ${({ theme }) => theme.spacing.sm};
  border-top: 1px dashed ${({ theme }) => theme.colors.borderLight};
  font-size: 10px;
  color: ${({ theme }) => theme.colors.textMuted};
  text-align: center;
`;

/* ══════════════════════════════════════════════ */
/* 리워드 현황 탭 (2026-04-14 신설)               */
/* ══════════════════════════════════════════════ */

/** 리워드 탭 본체 레이아웃 */
const RewardBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

/** 요약 4칸 (2×2 그리드) */
const RewardSummary = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: ${({ theme }) => theme.spacing.sm};
`;

const RewardSummaryItem = styled.div`
  background: ${({ theme }) => theme.colors.bgHover};
  border: 1px solid ${({ theme }) => theme.colors.borderLight};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const RewardSummaryLabel = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
`;

const RewardSummaryValue = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

/** 리워드 서브 블록 제목 ("활동별 현황", "마일스톤 진행률") */
const RewardBlockTitle = styled.h5`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: ${({ theme }) => theme.spacing.xs} 0 0 0;
  padding-top: ${({ theme }) => theme.spacing.sm};
  border-top: 1px dashed ${({ theme }) => theme.colors.borderLight};
`;

/** 활동/마일스톤 리스트 컨테이너 */
const RewardActivityList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

/** 활동/마일스톤 단건 카드 */
const RewardActivityItem = styled.li`
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid
    ${({ $achieved, theme }) =>
      $achieved ? theme.colors.primary : theme.colors.borderLight};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const RewardActivityHead = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const RewardActivityName = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  display: inline-flex;
  align-items: center;
  gap: 6px;
`;

const RewardActivityMeta = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.primary};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  white-space: nowrap;
`;

/** 달성 배지 */
const RewardAchievedTag = styled.span`
  display: inline-block;
  padding: 1px 8px;
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  border-radius: 999px;
  font-size: 10px;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`;

/** 게이지 행 */
const RewardGaugeRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const RewardGaugeTrack = styled.div`
  flex: 1;
  height: 5px;
  background: ${({ theme }) => theme.colors.borderLight};
  border-radius: 3px;
  overflow: hidden;
`;

const RewardGaugeFill = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== '$percent' && prop !== '$achieved',
})`
  width: ${({ $percent }) => Math.min(100, Math.max(0, Number($percent) || 0))}%;
  height: 100%;
  background: ${({ theme, $achieved }) =>
    $achieved ? (theme.colors.success ?? theme.colors.primary) : theme.colors.primary};
  transition: width 0.3s ease-out;
`;

const RewardGaugeLabel = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textMuted};
  white-space: nowrap;
  min-width: 90px;
  text-align: right;
`;

/** 카운터 행 (누적/지급/연속) */
const RewardCounterRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  flex-wrap: wrap;
`;
