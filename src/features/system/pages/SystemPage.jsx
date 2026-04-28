/**
 * 시스템 탭 메인 페이지.
 *
 * 2026-04-08 개편:
 *  - 구 "설정 > 감사 로그"를 본 탭으로 이동 (조회 전용 성격 통합)
 *
 * 2026-04-08 재개편 (서브탭 → 단일 페이지):
 *  - 5개 서브탭을 제거하고 모든 섹션을 하나의 세로 스택으로 통합
 *  - 관리자가 탭 전환 없이 전체 시스템 상태를 한 번에 조망할 수 있게 함
 *
 * 2026-04-15 추가:
 *  - 모니터링 접속 가이드 섹션 (Grafana / Kibana / Prometheus / Alertmanager 외부 URL +
 *    공통 Basic Auth 계정 + 각 도구 용도/간단 사용법 + 주요 알림 룰 요약).
 *    단일 진실 원본은 `docs/모니터링_관찰성_스택.md`.
 *
 * 2026-04-16 개편:
 *  - 모니터링 접속 가이드에서 Prometheus 카드 제거 (운영자는 Grafana 로 소화)
 *  - Neo4j Browser 섹션 추가 (빠른 쿼리 프리필 5종 포함, URL 기반 자동 실행 불가 안내)
 *  - Swagger / OpenAPI 문서 카드 3종 추가 (Backend / Agent / Recommend)
 *
 * 2026-04-23 Phase G 배치 C:
 *  - URL 쿼리파라미터 `?q=...&actor=...&action=...` 을 AuditLogTab 에 초기 필터로 전달.
 *    AI 어시스턴트의 goto_audit_log 이벤트로 특정 조건으로 자동 조회 가능.
 *
 * 7개 섹션 (모두 조회 전용, 위→아래 순):
 *  - 서비스 상태: 4개 서비스 헬스체크 (Spring Boot / Agent / Recommend / Nginx)
 *  - DB 상태: 5개 DB 커넥션/쿼리 상태 (MySQL / Redis / Qdrant / Neo4j / ES)
 *  - Ollama: 로컬 LLM 상태
 *  - vLLM: 운영 GPU VM 의 vLLM Chat/Vision 2종 상태 (2026-04-15 추가)
 *  - 모니터링 접속: Grafana/Kibana/Prometheus/Alertmanager 외부 URL + 가이드 (2026-04-15 추가)
 *  - 설정 조회: 현재 런타임 설정값
 *  - 감사 로그: 관리자 활동 감사 로그
 */

import styled from 'styled-components';
import ServiceStatus from '../components/ServiceStatus';
import DbStatus from '../components/DbStatus';
import OllamaStatus from '../components/OllamaStatus';
import VllmStatus from '../components/VllmStatus';
import MonitoringGuide from '../components/MonitoringGuide';
import ConfigViewer from '../components/ConfigViewer';
import AuditLogTab from '../components/AuditLogTab';
import { useQueryParams } from '@/shared/hooks/useQueryParams';

export default function SystemPage() {
  const queryParams = useQueryParams();

  /**
   * AI 어시스턴트 goto_audit_log 이벤트로 전달된 초기 검색 필터.
   * - q      → actionType 키워드 (예: "DELETE", "REFUND")
   * - actor  → 관리자 ID 필터 (AuditLogTab 의 adminId 검색)
   * - action → actionType 과 동의어. q 가 없을 때 fallback 으로 사용.
   * 셋 모두 없으면 undefined — AuditLogTab 기본값(빈 문자열)으로 폴백.
   */
  const aiAuditFilter = (queryParams.q || queryParams.actor || queryParams.action)
    ? {
        actionType: queryParams.q || queryParams.action || undefined,
        adminId:    queryParams.actor || undefined,
      }
    : null;

  return (
    <Wrapper>
      <PageHeader>
        <PageTitle>시스템</PageTitle>
        <PageDesc>
          서비스 헬스체크, DB/LLM(Ollama·vLLM) 상태, 모니터링 스택 접속 가이드,
          현재 설정값, 관리자 감사 로그를 확인합니다. (모두 조회 전용)
        </PageDesc>
      </PageHeader>

      {/* 모든 섹션을 세로 스택으로 한 페이지에 표시 */}
      <Stack>
        <ServiceStatus />
        <DbStatus />
        <OllamaStatus />
        <VllmStatus />
        <MonitoringGuide />
        <ConfigViewer />
        <AuditLogTab aiAuditFilter={aiAuditFilter} />
      </Stack>
    </Wrapper>
  );
}

/* ── styled-components ── */

const Wrapper = styled.div``;

const PageHeader = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.xxl};
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

/**
 * 섹션 스택 컨테이너.
 * 각 컴포넌트가 이미 내부에 `<Section>` + margin-bottom 을 가지고 있으므로
 * 별도 gap 없이 자연스럽게 세로로 쌓이도록 구성한다.
 */
const Stack = styled.div`
  display: flex;
  flex-direction: column;
`;
