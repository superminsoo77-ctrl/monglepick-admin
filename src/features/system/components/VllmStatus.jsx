/**
 * vLLM 모델 상태 카드 (시스템 탭).
 *
 * 운영서버(VM4) vLLM Chat/Vision 서버 2종의 연결 상태와 실제 서빙 중인
 * 모델 ID 를 표시한다. Ollama 카드와 동일한 레이아웃/스타일을 따라서
 * 시각적 일관성을 유지한다.
 *
 * - Chat   : EXAONE 4.0 1.2B  (VLLM_CHAT_BASE_URL   기본 :18000/v1)
 * - Vision : Qwen2.5-VL-3B    (VLLM_VISION_BASE_URL 기본 :18001/v1)
 *
 * 서버 응답 (GET /api/v1/admin/system/vllm):
 *   {
 *     enabled: bool,               // VLLM_ENABLED
 *     timeoutSeconds: int,
 *     chat:   { connected, baseUrl, expectedModel, loadedModels[], healthStatus, error },
 *     vision: { ... }
 *   }
 *
 * VLLM_ENABLED=False 일 경우 비활성 뱃지 + 설정값만 표시한다.
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { MdRefresh } from 'react-icons/md';
import { fetchVllmStatus } from '../api/systemApi';
import StatusBadge from '@/shared/components/StatusBadge';

/** 단일 vLLM 엔드포인트(Chat/Vision) 카드 렌더링 */
function VllmEndpointCard({ title, endpoint }) {
  // endpoint 가 비어있으면(응답 없음) 확인 중 상태로만 표시
  if (!endpoint) {
    return (
      <ModelItem>
        <ModelHeader>
          <ModelName>{title}</ModelName>
          <StatusBadge status="default" label="확인 중" />
        </ModelHeader>
      </ModelItem>
    );
  }

  const connected = endpoint.connected === true;
  const disabled = endpoint.healthStatus === 'disabled';

  // 뱃지 상태 결정 — disabled 면 회색, 연결되면 성공, 그 외 장애
  let badgeStatus = 'error';
  let badgeLabel = '장애';
  if (disabled) {
    badgeStatus = 'default';
    badgeLabel = '비활성';
  } else if (connected) {
    badgeStatus = 'success';
    badgeLabel = '연결';
  }

  return (
    <ModelItem>
      <ModelHeader>
        <ModelName>{title}</ModelName>
        <StatusBadge status={badgeStatus} label={badgeLabel} />
      </ModelHeader>

      {/* 설정된 base URL (디버깅 시 관리자가 즉시 확인 가능) */}
      {endpoint.baseUrl && (
        <MetricText>URL: {endpoint.baseUrl}</MetricText>
      )}

      {/* .env 에 지정된 기대 모델 */}
      {endpoint.expectedModel && (
        <MetricText>설정 모델: {endpoint.expectedModel}</MetricText>
      )}

      {/* 실제 서빙 중인 모델 목록 (vLLM 은 보통 프로세스당 1개) */}
      {endpoint.loadedModels && endpoint.loadedModels.length > 0 && (
        <MetricText>
          서빙 중: {endpoint.loadedModels.join(', ')}
        </MetricText>
      )}

      {/* 헬스 상태 */}
      {endpoint.healthStatus && (
        <MetricText>health: {endpoint.healthStatus}</MetricText>
      )}

      {/* 연결 실패 사유 */}
      {!connected && endpoint.error && !disabled && (
        <ErrorLine>에러: {endpoint.error}</ErrorLine>
      )}
    </ModelItem>
  );
}

export default function VllmStatus() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const result = await fetchVllmStatus();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // 비활성화 여부(전체 서버 사용 안함) — VLLM_ENABLED=False
  const enabled = data?.enabled === true;
  // 두 엔드포인트가 모두 연결되었는지
  const chatConnected = data?.chat?.connected === true;
  const visionConnected = data?.vision?.connected === true;

  // 상단 헤더 뱃지: 비활성 > 모두 연결 > 부분/전체 장애
  let headerBadge;
  if (!data) {
    headerBadge = { status: 'default', label: '확인 중' };
  } else if (!enabled) {
    headerBadge = { status: 'default', label: '비활성 (VLLM_ENABLED=False)' };
  } else if (chatConnected && visionConnected) {
    headerBadge = { status: 'success', label: '연결' };
  } else if (chatConnected || visionConnected) {
    headerBadge = { status: 'warning', label: '부분 장애' };
  } else {
    headerBadge = { status: 'error', label: '장애' };
  }

  return (
    <Section>
      <SectionHeader>
        <SectionTitle>LLM 상태 (vLLM)</SectionTitle>
        <RefreshButton onClick={loadData} disabled={loading}>
          <MdRefresh size={16} />
        </RefreshButton>
      </SectionHeader>

      {error && <ErrorMsg>vLLM 상태를 불러올 수 없습니다: {error}</ErrorMsg>}

      <Card>
        <CardTop>
          <span>vLLM 서버 (운영 GPU VM)</span>
          <StatusBadge status={headerBadge.status} label={headerBadge.label} />
        </CardTop>

        {data?.timeoutSeconds !== undefined && (
          <InfoRow>VLLM_TIMEOUT: {data.timeoutSeconds}s</InfoRow>
        )}

        {/* Chat / Vision 2개 엔드포인트를 개별 카드로 표시 */}
        <ModelList>
          <VllmEndpointCard title="Chat (EXAONE 4.0 1.2B)" endpoint={data?.chat} />
          <VllmEndpointCard title="Vision (Qwen2.5-VL-3B)" endpoint={data?.vision} />
        </ModelList>
      </Card>
    </Section>
  );
}

/* ── styled-components ──
 * OllamaStatus.jsx 와 동일한 시각 스타일을 사용해서 "시스템" 페이지 내에서
 * 두 LLM 카드의 톤앤매너를 맞춘다. 필요 시 공통 컴포넌트로 추출 가능하지만
 * 현재는 2개뿐이라 중복 허용.
 */

const Section = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.xxl};
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const SectionTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.heading};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`;

const RefreshButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.border};
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
  &:disabled { opacity: 0.5; }
`;

const ErrorMsg = styled.p`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const Card = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  padding: ${({ theme }) => theme.spacing.xl};
  box-shadow: ${({ theme }) => theme.shadows.card};
`;

const CardTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`;

const InfoRow = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-family: ${({ theme }) => theme.fonts.mono};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  padding-bottom: ${({ theme }) => theme.spacing.md};
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight};
`;

const ModelList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const ModelItem = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.bgMain};
  border-radius: 6px;
`;

const ModelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const ModelName = styled.span`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

const MetricText = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  margin-top: 2px;
  font-family: ${({ theme }) => theme.fonts.mono};
  word-break: break-all;
`;

const ErrorLine = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.error};
  margin-top: 4px;
  word-break: break-all;
`;
