/**
 * 모더레이션 큐 탭 — 2026-04-09 P0-① 신규.
 *
 * 기존 게시판 관리 탭의 **신고 관리**(ReportTab) 와 **혐오표현**(ToxicityTab) 은
 * 각각 독립된 서브탭으로 분리되어 있어 관리자가 "어떤 항목을 먼저 처리해야 하는가"
 * 를 판단하기 어려웠다. 특히 Toss·커뮤니티 운영 이슈 발생 시 "신고 5건 + 혐오표현
 * 10건" 을 따로 열어 확인하고 우선순위를 수동으로 판정해야 했다.
 *
 * 본 탭은 두 소스를 **단일 처리 대기 큐(Moderation Queue)** 로 통합하여 다음을 제공한다.
 *
 * ## 핵심 기능
 *
 * 1. **통합 조회**: `fetchReports({status: 'pending'})` + `fetchToxicityLogs({minScore: 0.5})`
 *    를 병렬 호출하여 하나의 큐로 정규화.
 * 2. **우선순위 자동 정렬**: 독성 점수 + 소스 가산점 + 최신성 가산점 기반 score 로
 *    내림차순 정렬. 관리자는 위에서부터 처리하면 된다.
 * 3. **KPI 카드**: 대기 총 건수 / 고위험(score ≥ 0.8) / 신고 타입 카운트.
 * 4. **필터**: 전체 / 고위험 / 신고 타입만 / 혐오표현 타입만.
 * 5. **빠른 처리 2-버튼**: "무시/기각" 과 "삭제" — 공통 사유 prompt 로 API 호출.
 *    세부 조치(블라인드 vs 경고 등)가 필요하면 기존 ReportTab/ToxicityTab 로 이동.
 *
 * ## 설계 결정
 *
 * - **원본 탭 유지**: ReportTab/ToxicityTab 은 상세 처리용으로 그대로 두고, 본 탭은
 *   "큐 뷰" 역할만 수행한다. 중복 UI 가 아니라 목적이 다르다 — 한쪽은 속도 최적화,
 *   다른 쪽은 상세 조치 최적화.
 * - **Bulk 미지원**: 모더레이션은 항목마다 맥락 판단이 필요하므로 일괄 처리가 위험.
 *   개별 처리만 제공한다.
 * - **페이지네이션 미구현**: 초기 조회에서 각 소스당 최대 50건씩 가져와 통합 정렬.
 *   실무상 대기 큐가 100건을 넘으면 운영 이슈이므로 그 시점에 별도 대응 필요 (운영자
 *   알림 등). 100건 초과 시 "더 많은 건이 있습니다" 경고 노출.
 * - **Backend 변경 없음**: 기존 `reports` / `toxicity` API 를 그대로 재사용.
 *   데이터 적재/DB 세팅 중이어도 UI 가 빈 큐로 동작한다.
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { MdRefresh, MdWarning, MdCheck, MdDelete, MdOpenInNew } from 'react-icons/md';
import {
  fetchReports,
  fetchToxicityLogs,
  processReport,
  processToxicity,
} from '../api/contentApi';
import StatusBadge from '@/shared/components/StatusBadge';

/**
 * 각 소스에서 한 번에 가져올 최대 건수.
 * 총 100건(신고 50 + 혐오표현 50)을 넘으면 운영 이슈 수준으로 간주하여 경고 표시.
 */
const PER_SOURCE_LIMIT = 50;

/**
 * 혐오표현 조회 시 최소 점수 임계값.
 * 0.5 미만은 노이즈로 간주하고 모더레이션 큐에 노출하지 않는다.
 */
const TOXICITY_MIN_SCORE = 0.5;

/**
 * 고위험 판정 임계값 — KPI 카드와 필터 버튼에서 공통 사용.
 */
const HIGH_RISK_THRESHOLD = 0.8;

/** 대상 유형 한국어 레이블 */
const TARGET_TYPE_LABEL = {
  POST:    '게시글',
  COMMENT: '댓글',
  REVIEW:  '리뷰',
  CHAT:    '채팅',
  USER:    '사용자',
  OTHER:   '기타',
};

const SEVERITY_LABEL = {
  LOW: '경미',
  MEDIUM: '주의',
  HIGH: '고위험',
  CRITICAL: '긴급',
};

/** 필터 옵션 */
const FILTER_OPTIONS = [
  { value: 'all',      label: '전체' },
  { value: 'high',     label: '고위험만' },
  { value: 'report',   label: '신고' },
  { value: 'toxicity', label: '혐오표현' },
];

/**
 * 독성 점수를 배지 status 로 변환.
 * 0.8 이상 → error, 0.5 이상 → warning, 0.3 이상 → info, 그 외 → default.
 */
function scoreToBadgeStatus(score) {
  if (score >= 0.8) return 'error';
  if (score >= 0.5) return 'warning';
  if (score >= 0.3) return 'info';
  return 'default';
}

/** 날짜 포맷 (YYYY.MM.DD HH:MM) */
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseDetectedWords(detectedWords) {
  if (!detectedWords) return [];

  try {
    const parsed = JSON.parse(detectedWords);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((word) => typeof word === 'string')
        .map((word) => word.trim())
        .filter(Boolean);
    }
  } catch {
    // JSON이 아니면 아래 문자열 fallback 사용
  }

  return String(detectedWords)
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replaceAll('"', '')
    .split(',')
    .map((word) => word.trim())
    .filter(Boolean);
}

function buildToxicityPreview(log) {
  if (log.inputText?.trim()) {
    return log.inputText.trim();
  }

  const detectedWords = parseDetectedWords(log.detectedWords);
  if (detectedWords.length > 0) {
    return `감지 단어: ${detectedWords.join(', ')}`;
  }

  const targetType = log.targetType ?? log.contentType;
  const targetLabel = TARGET_TYPE_LABEL[targetType] ?? targetType ?? '콘텐츠';
  if (log.contentId != null) {
    return `${targetLabel} #${log.contentId}`;
  }
  return '(내용 없음)';
}

function buildToxicityReason(log) {
  if (log.toxicityType?.trim()) {
    return `자동 탐지 · ${log.toxicityType.trim()}`;
  }

  const severity = String(log.severity ?? '').trim().toUpperCase();
  if (severity) {
    return `자동 탐지 · ${SEVERITY_LABEL[severity] ?? severity}`;
  }
  return '자동 탐지';
}

/**
 * 얼마나 최근 사건인지 0~1 로 반환 (24시간 = 1.0, 1주 = 0.0).
 * 우선순위 계산 시 가산점으로 사용하여 최근 사건이 큐 상단으로 올라오게 한다.
 *
 * @param {string} dateStr - ISO 날짜 문자열
 * @returns {number} 0~1 사이 최신성 점수
 */
function recencyScore(dateStr) {
  if (!dateStr) return 0;
  const d = new Date(dateStr).getTime();
  if (Number.isNaN(d)) return 0;
  const ageMs = Date.now() - d;
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  if (ageMs <= 0) return 1;
  if (ageMs >= weekMs) return 0;
  return 1 - ageMs / weekMs;
}

/**
 * 통합 큐 아이템 우선순위 계산.
 *
 * 수식: `(toxicityScore || 0.5) * 100 + reportBonus + recencyBonus`
 *
 * - 독성 점수 없는 신고는 중간값(0.5)로 가정
 * - 사람이 신고한 건에 +15 가산점 — 자동 탐지보다 신뢰도 높음
 * - 최근 사건에 최대 +20 가산점
 *
 * 결과적으로 "높은 독성 + 사용자 신고 + 최근" 순으로 큐 상단 배치.
 */
function computePriority(item) {
  const base = (item.toxicityScore ?? 0.5) * 100;
  const reportBonus = item.source === 'report' ? 15 : 0;
  const recencyBonus = recencyScore(item.createdAt) * 20;
  return base + reportBonus + recencyBonus;
}

/**
 * Report 응답을 통합 큐 아이템으로 정규화한다.
 */
function normalizeReport(report) {
  return {
    queueId: `report-${report.id}`,
    source: 'report',
    originalId: report.id,
    toxicityScore: report.toxicityScore ?? null,
    targetType: report.targetType ?? 'OTHER',
    preview: report.targetPreview
      ? report.targetPreview.slice(0, 120)
      : (report.declarationContent ?? '(내용 없음)').slice(0, 120),
    reason: report.declarationContent ?? '-',
    userId: report.userId ?? '-',
    createdAt: report.createdAt,
    priority: 0, // 아래에서 계산 후 채움
  };
}

/**
 * Toxicity 로그를 통합 큐 아이템으로 정규화한다.
 */
function normalizeToxicity(log) {
  return {
    queueId: `toxicity-${log.id}`,
    source: 'toxicity',
    originalId: log.id,
    toxicityScore: log.toxicityScore ?? null,
    targetType: log.targetType ?? log.contentType ?? 'OTHER',
    preview: buildToxicityPreview(log).slice(0, 120),
    reason: buildToxicityReason(log),
    userId: log.userId ?? '-',
    createdAt: log.createdAt,
    priority: 0,
  };
}

export default function ModerationQueueTab() {
  /* ── 큐 상태 ── */
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [filter, setFilter]   = useState('all');
  /** 각 소스별 실제 건수 — 100건 초과 경고에 사용 */
  const [overflow, setOverflow] = useState({ report: false, toxicity: false });

  /** 개별 처리 중인 queueId — 중복 클릭/동시 처리 방지 */
  const [processingId, setProcessingId] = useState(null);

  /**
   * 큐 데이터 조회.
   *
   * 두 API 를 Promise.allSettled 로 병렬 호출한다. 한쪽이 실패해도 나머지는 정상 표시.
   */
  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [reportsResult, toxicityResult] = await Promise.allSettled([
      fetchReports({ status: 'pending', page: 0, size: PER_SOURCE_LIMIT }),
      fetchToxicityLogs({ minScore: TOXICITY_MIN_SCORE, page: 0, size: PER_SOURCE_LIMIT }),
    ]);

    const normalized = [];
    const overflowFlags = { report: false, toxicity: false };
    const errors = [];

    /* 신고 처리 */
    if (reportsResult.status === 'fulfilled') {
      const data = reportsResult.value;
      const content = Array.isArray(data?.content) ? data.content : [];
      content.forEach((r) => normalized.push(normalizeReport(r)));
      const total = data?.totalElements ?? content.length;
      if (total > PER_SOURCE_LIMIT) overflowFlags.report = true;
    } else {
      errors.push(`신고 조회 실패: ${reportsResult.reason?.message ?? '알 수 없음'}`);
    }

    /* 혐오표현 처리 */
    if (toxicityResult.status === 'fulfilled') {
      const data = toxicityResult.value;
      const content = Array.isArray(data?.content) ? data.content : [];
      content.forEach((l) => normalized.push(normalizeToxicity(l)));
      const total = data?.totalElements ?? content.length;
      if (total > PER_SOURCE_LIMIT) overflowFlags.toxicity = true;
    } else {
      errors.push(`혐오표현 조회 실패: ${toxicityResult.reason?.message ?? '알 수 없음'}`);
    }

    /* 우선순위 계산 + 내림차순 정렬 */
    normalized.forEach((it) => {
      it.priority = computePriority(it);
    });
    normalized.sort((a, b) => b.priority - a.priority);

    setItems(normalized);
    setOverflow(overflowFlags);
    if (errors.length > 0) setError(errors.join(' / '));
    setLoading(false);
  }, []);

  /* 최초 마운트 시 큐 로딩 */
  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  /**
   * 필터 적용된 아이템 배열.
   * 'high' = 독성 점수 0.8 이상만.
   */
  const filteredItems = items.filter((it) => {
    if (filter === 'all') return true;
    if (filter === 'high') return (it.toxicityScore ?? 0) >= HIGH_RISK_THRESHOLD;
    if (filter === 'report') return it.source === 'report';
    if (filter === 'toxicity') return it.source === 'toxicity';
    return true;
  });

  /** KPI 카드 통계 */
  const totalCount     = items.length;
  const highRiskCount  = items.filter((it) => (it.toxicityScore ?? 0) >= HIGH_RISK_THRESHOLD).length;
  const reportCount    = items.filter((it) => it.source === 'report').length;
  const toxicityCount  = items.filter((it) => it.source === 'toxicity').length;

  /**
   * 빠른 처리 핸들러.
   *
   * @param {Object} item   - 정규화된 큐 아이템
   * @param {'dismiss' | 'delete'} decision - 처리 결정
   *
   * decision 을 각 소스의 Backend action 으로 매핑:
   * - report + dismiss → action='dismiss' (신고 기각)
   * - report + delete  → action='delete'  (게시물 삭제)
   * - toxicity + dismiss → action='restore' (경고 무시, 정상 처리)
   * - toxicity + delete  → action='delete'  (대상 삭제)
   */
  async function handleQuickAction(item, decision) {
    const label = decision === 'dismiss' ? '기각(무시)' : '삭제';
    // eslint-disable-next-line no-alert
    const reason = window.prompt(
      `"${label}" 처리 사유를 입력해주세요.\n` +
      '감사 로그에 기록되며 이후 검토 근거가 됩니다.',
      decision === 'dismiss' ? '위반사항 없음' : '이용약관 위반',
    );
    if (reason === null) return;
    if (!reason.trim()) {
      // eslint-disable-next-line no-alert
      alert('사유는 필수입니다.');
      return;
    }

    try {
      setProcessingId(item.queueId);

      if (item.source === 'report') {
        const action = decision === 'dismiss' ? 'dismiss' : 'delete';
        await processReport(item.originalId, { action, reason: reason.trim() });
      } else {
        const action = decision === 'dismiss' ? 'restore' : 'delete';
        await processToxicity(item.originalId, { action, reason: reason.trim() });
      }

      /* 처리 완료된 아이템을 즉시 목록에서 제거 — 큐 재호출 대신 낙관적 업데이트 */
      setItems((prev) => prev.filter((it) => it.queueId !== item.queueId));
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(`처리 실패: ${err?.message ?? '알 수 없는 오류'}`);
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <Container>
      {/* ── 헤더 ── */}
      <Header>
        <HeaderLeft>
          <PageTitle>모더레이션 큐</PageTitle>
          <PageDesc>
            신고와 자동 탐지된 혐오표현을 통합하여 우선순위 순으로 처리합니다.
            높은 독성 점수와 최근 사건이 큐 상단에 배치됩니다.
          </PageDesc>
        </HeaderLeft>
        <RefreshButton onClick={loadQueue} disabled={loading} title="새로고침">
          <MdRefresh size={16} />
          {loading ? '로딩 중...' : '새로고침'}
        </RefreshButton>
      </Header>

      {/* ── 넘침 경고 ── */}
      {(overflow.report || overflow.toxicity) && (
        <WarningBanner>
          <MdWarning size={16} />
          대기 큐가 {PER_SOURCE_LIMIT}건을 초과했습니다. 상단 우선순위부터 처리하고,
          누락 건이 있는지 기존 탭(
          {overflow.report && <strong>신고 관리</strong>}
          {overflow.report && overflow.toxicity && ' / '}
          {overflow.toxicity && <strong>혐오표현</strong>}
          )에서 추가 확인이 필요합니다.
        </WarningBanner>
      )}

      {/* ── KPI 카드 ── */}
      <KpiGrid>
        <KpiCard $tone="neutral">
          <KpiLabel>대기 총 건수</KpiLabel>
          <KpiValue>{totalCount}</KpiValue>
        </KpiCard>
        <KpiCard $tone="danger">
          <KpiLabel>고위험 (≥{HIGH_RISK_THRESHOLD})</KpiLabel>
          <KpiValue>{highRiskCount}</KpiValue>
        </KpiCard>
        <KpiCard $tone="info">
          <KpiLabel>사용자 신고</KpiLabel>
          <KpiValue>{reportCount}</KpiValue>
        </KpiCard>
        <KpiCard $tone="warning">
          <KpiLabel>자동 탐지</KpiLabel>
          <KpiValue>{toxicityCount}</KpiValue>
        </KpiCard>
      </KpiGrid>

      {/* ── 필터 버튼 그룹 ── */}
      <FilterGroup>
        {FILTER_OPTIONS.map((opt) => (
          <FilterButton
            key={opt.value}
            $active={filter === opt.value}
            onClick={() => setFilter(opt.value)}
          >
            {opt.label}
          </FilterButton>
        ))}
      </FilterGroup>

      {/* ── 에러 메시지 ── */}
      {error && <ErrorMsg>{error}</ErrorMsg>}

      {/* ── 큐 테이블 ── */}
      <TableWrapper>
        <Table>
          <thead>
            <tr>
              <Th $w="70px">우선도</Th>
              <Th $w="80px">출처</Th>
              <Th $w="80px">대상</Th>
              <Th $w="70px">점수</Th>
              <Th>내용 미리보기</Th>
              <Th $w="100px">사용자</Th>
              <Th $w="140px">감지 시각</Th>
              <Th $w="170px">빠른 처리</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8}>
                  <CenterCell>큐를 불러오는 중...</CenterCell>
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <CenterCell>
                    {items.length === 0
                      ? '처리 대기 중인 항목이 없습니다. 수고하셨습니다 👍'
                      : '필터 조건에 해당하는 항목이 없습니다.'}
                  </CenterCell>
                </td>
              </tr>
            ) : (
              filteredItems.map((item, idx) => {
                const score = item.toxicityScore ?? 0;
                const badgeStatus = scoreToBadgeStatus(score);
                const isProcessing = processingId === item.queueId;

                return (
                  <Tr key={item.queueId}>
                    <Td>
                      <PriorityCell>
                        <PriorityRank>#{idx + 1}</PriorityRank>
                      </PriorityCell>
                    </Td>
                    <Td>
                      <SourceBadge $source={item.source}>
                        {item.source === 'report' ? '신고' : '자동'}
                      </SourceBadge>
                    </Td>
                    <Td>
                      <MutedText>
                        {TARGET_TYPE_LABEL[item.targetType] ?? item.targetType}
                      </MutedText>
                    </Td>
                    <Td>
                      {item.toxicityScore != null ? (
                        <StatusBadge
                          status={badgeStatus}
                          label={score.toFixed(2)}
                        />
                      ) : (
                        <MutedText>-</MutedText>
                      )}
                    </Td>
                    <Td>
                      <PreviewText title={item.preview}>{item.preview}</PreviewText>
                      <SubText>{item.reason}</SubText>
                    </Td>
                    <Td>
                      <MutedText>{item.userId}</MutedText>
                    </Td>
                    <Td>
                      <MutedText>{formatDate(item.createdAt)}</MutedText>
                    </Td>
                    <Td>
                      <ActionGroup>
                        <DismissButton
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleQuickAction(item, 'dismiss')}
                          title="문제없음으로 처리"
                        >
                          <MdCheck size={14} />
                          무시
                        </DismissButton>
                        <DeleteButton
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleQuickAction(item, 'delete')}
                          title="콘텐츠 삭제"
                        >
                          <MdDelete size={14} />
                          삭제
                        </DeleteButton>
                      </ActionGroup>
                      {isProcessing && <ProcessingText>처리 중...</ProcessingText>}
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </Table>
      </TableWrapper>

      {/* ── 하단 안내 ── */}
      <FooterNote>
        <MdOpenInNew size={14} />
        세부 조치(블라인드/경고 등)나 처리 이력 확인은 상단의{' '}
        <strong>신고 관리</strong> / <strong>혐오표현</strong> 서브탭에서 가능합니다.
      </FooterNote>
    </Container>
  );
}

/* ── styled-components ── */

const Container = styled.div``;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.lg};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
  flex-wrap: wrap;
`;

const HeaderLeft = styled.div`
  flex: 1;
  min-width: 0;
`;

const PageTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const PageDesc = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
  line-height: 1.5;
`;

const RefreshButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: 6px ${({ theme }) => theme.spacing.lg};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.bgCard};
  transition: all ${({ theme }) => theme.transitions.fast};
  white-space: nowrap;
  flex-shrink: 0;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.bgHover};
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

/** 큐 과다 경고 배너 */
const WarningBanner = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  background: #fffbeb;
  border-left: 3px solid #f59e0b;
  border-radius: 4px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: #92400e;
  margin-bottom: ${({ theme }) => theme.spacing.lg};

  strong {
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
    color: #78350f;
  }
`;

/** KPI 4열 그리드 */
const KpiGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

/**
 * KPI 카드 — $tone 에 따라 좌측 컬러 바 색상이 바뀐다.
 * neutral/info/warning/danger 4가지.
 */
const KpiCard = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-left: 4px solid
    ${({ $tone }) => {
      if ($tone === 'danger') return '#ef4444';
      if ($tone === 'warning') return '#f59e0b';
      if ($tone === 'info') return '#3b82f6';
      return '#94a3b8';
    }};
  border-radius: 6px;
  box-shadow: ${({ theme }) => theme.shadows.card};
`;

const KpiLabel = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const KpiValue = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.xxl};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

/** 필터 버튼 그룹 */
const FilterGroup = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xs};
  margin-bottom: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;
`;

const FilterButton = styled.button`
  padding: 5px 14px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ $active, theme }) =>
    $active ? theme.fontWeights.semibold : theme.fontWeights.normal};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.primary : theme.colors.textSecondary};
  background: ${({ $active, theme }) =>
    $active ? theme.colors.primaryLight : 'transparent'};
  border: 1px solid ${({ $active, theme }) =>
    $active ? theme.colors.primary : theme.colors.border};
  border-radius: 4px;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.primary};
  }
`;

const ErrorMsg = styled.p`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.error};
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid #fecaca;
  border-radius: 4px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const TableWrapper = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  overflow-x: auto;
  box-shadow: ${({ theme }) => theme.shadows.card};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  min-width: 900px;
`;

const Th = styled.th`
  padding: 10px 12px;
  text-align: left;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgHover};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  white-space: nowrap;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  width: ${({ $w }) => $w ?? 'auto'};
`;

const Tr = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight};

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: ${({ theme }) => theme.colors.bgHover};
  }
`;

const Td = styled.td`
  padding: 10px 12px;
  color: ${({ theme }) => theme.colors.textPrimary};
  vertical-align: top;
`;

const CenterCell = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xxxl};
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

/** 우선도 랭크 셀 */
const PriorityCell = styled.div`
  display: flex;
  align-items: center;
`;

const PriorityRank = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

/**
 * 출처 배지 — report 는 파랑, toxicity 는 회색.
 * 자동 탐지(toxicity) 는 사용자 신고(report) 보다 신뢰도가 낮다는 시각적 단서.
 */
const SourceBadge = styled.span`
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 3px;
  letter-spacing: 0.3px;

  ${({ $source }) =>
    $source === 'report'
      ? 'background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd;'
      : 'background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;'}
`;

const MutedText = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  font-family: ${({ theme }) => theme.fonts.mono};
`;

/** 120자 제한된 미리보기 — title 속성으로 전체 내용 hover 노출 */
const PreviewText = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
`;

/** 서브 텍스트 (신고 사유 / 탐지 유형) */
const SubText = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  margin-top: 2px;
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

/** 빠른 처리 버튼 그룹 */
const ActionGroup = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xs};
`;

/** 빠른 처리 공통 버튼 베이스 */
const QuickButtonBase = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px 10px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  border-radius: 4px;
  transition: opacity ${({ theme }) => theme.transitions.fast};
  white-space: nowrap;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

/** 무시/기각 버튼 — outline 스타일 (파괴적이지 않은 액션) */
const DismissButton = styled(QuickButtonBase)`
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.bgHover};
    color: ${({ theme }) => theme.colors.success ?? '#10b981'};
    border-color: ${({ theme }) => theme.colors.success ?? '#10b981'};
  }
`;

/** 삭제 버튼 — error 톤 (파괴적 액션임을 명확히 표시) */
const DeleteButton = styled(QuickButtonBase)`
  color: #ffffff;
  background: ${({ theme }) => theme.colors.error};
  border: 1px solid ${({ theme }) => theme.colors.error};

  &:hover:not(:disabled) {
    opacity: 0.85;
  }
`;

/** 처리 중 표시 */
const ProcessingText = styled.span`
  display: block;
  margin-top: 4px;
  font-size: 10px;
  color: ${({ theme }) => theme.colors.primary};
`;

/** 하단 안내문 — 기존 탭으로의 이동 유도 */
const FooterNote = styled.p`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: ${({ theme }) => theme.spacing.lg};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.bgHover};
  border-radius: 4px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  line-height: 1.5;

  strong {
    color: ${({ theme }) => theme.colors.primary};
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
  }
`;
