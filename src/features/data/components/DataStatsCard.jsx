/**
 * 데이터 현황 카드 컴포넌트.
 * Agent admin_data.py 의 3개 EP 를 병렬 호출하여 요약 카드 + 소스 분포 + 품질 지표를 렌더링한다.
 *   - GET /admin/data/overview     → 5DB 건수 (MySQL/Qdrant/Neo4j/ES/Redis)
 *   - GET /admin/data/distribution → 소스별(TMDB/KOBIS/…) 영화 분포
 *   - GET /admin/data/quality      → NULL 비율 + 중복 타이틀 + 평균 평점
 *
 * 2026-04-14 재작성:
 *   과거 구현은 존재하지 않는 `/data/stats`, `/data/health` 를 호출하고
 *   `stats.totalMovies`, `health.syncRate`, `quality.average` 같은 없는 필드를 참조해
 *   "데이터 현황" 탭이 항상 빈 화면이었다. 실제 API 응답 구조에 맞춰 전면 개편.
 *
 * @param {Object} props - 없음 (자체 데이터 fetch)
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import {
  MdRefresh, MdStorage, MdVerified, MdSpeed,
  MdCloudQueue, MdAccountTree, MdSearch, MdMemory,
} from 'react-icons/md';
import StatsCard from '@/shared/components/StatsCard';
import StatusBadge from '@/shared/components/StatusBadge';
import { fetchDataOverview, fetchDataDistribution, fetchDataQuality } from '../api/dataApi';

/** 소스 한국어 라벨 매핑 */
const SOURCE_LABELS = {
  tmdb: 'TMDB',
  kobis: 'KOBIS',
  kmdb: 'KMDb',
  kaggle: 'Kaggle',
  manual: '수동 등록',
  admin: '관리자 등록',
  unknown: '미지정',
};

/** NULL 비율 라벨 */
const NULL_RATE_LABELS = {
  overview: '줄거리',
  genres: '장르',
  posterPath: '포스터',
  director: '감독',
};

/** NULL 비율에 따른 상태(낮을수록 좋음) */
function getNullRateStatus(ratio) {
  if (ratio == null) return 'default';
  if (ratio <= 5) return 'success';
  if (ratio <= 20) return 'warning';
  return 'error';
}

/** 숫자 안전 포맷 (null/undefined → '-') */
function fmtNum(n) {
  if (n == null) return '-';
  return Number(n).toLocaleString();
}

export default function DataStatsCard() {
  // 3개 EP 응답 상태 — 각각 overview/distribution/quality
  const [overview, setOverview] = useState(null);
  const [distribution, setDistribution] = useState(null);
  const [quality, setQuality] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /** 3개 API 병렬 조회 (`Promise.allSettled` — 일부 실패해도 나머지 렌더) */
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ovRes, distRes, qRes] = await Promise.allSettled([
        fetchDataOverview(),
        fetchDataDistribution(),
        fetchDataQuality(),
      ]);
      if (ovRes.status === 'fulfilled') setOverview(ovRes.value);
      if (distRes.status === 'fulfilled') setDistribution(distRes.value);
      if (qRes.status === 'fulfilled') setQuality(qRes.value);

      // 모두 실패한 경우만 전체 에러 표기
      if (
        ovRes.status === 'rejected' &&
        distRes.status === 'rejected' &&
        qRes.status === 'rejected'
      ) {
        setError('데이터를 불러올 수 없습니다.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Overview 각 DB 요약 (각 블록은 error 일 수 있음)
  const mysql = overview?.mysql;
  const qdrant = overview?.qdrant;
  const neo4j = overview?.neo4j;
  const es = overview?.elasticsearch;
  const redis = overview?.redis;

  // 품질 지표에서 NULL 비율 리스트 생성
  const nullRates = quality?.nullRates ?? {};
  const nullRateEntries = Object.entries(nullRates); // [[key, {count, ratio}], ...]

  return (
    <Section>
      <SectionHeader>
        <SectionTitle>데이터 현황</SectionTitle>
        <RefreshButton onClick={loadAll} disabled={loading} title="새로고침">
          <MdRefresh size={16} />
        </RefreshButton>
      </SectionHeader>

      {error && <ErrorMsg>{error}</ErrorMsg>}

      {/* 상단: 5DB 건수 카드 (MySQL 기준 영화 수 / 총 벡터 / 그래프 / 문서 / 캐시) */}
      <StatsRow>
        <StatsCard
          icon={<MdStorage />}
          title="MySQL 영화"
          value={mysql?.error ? '-' : fmtNum(mysql?.movieCount) + '건'}
          subtitle={mysql?.error ? mysql.error : `유저 ${fmtNum(mysql?.userCount)}명`}
          status={mysql?.error ? 'error' : 'info'}
        />
        <StatsCard
          icon={<MdCloudQueue />}
          title="Qdrant 벡터"
          value={qdrant?.error ? '-' : fmtNum(qdrant?.vectorCount)}
          subtitle={qdrant?.error ? qdrant.error : `${qdrant?.collection ?? '-'} / ${qdrant?.vectorSize ?? '?'}d`}
          status={qdrant?.error ? 'error' : 'info'}
        />
        <StatsCard
          icon={<MdAccountTree />}
          title="Neo4j 그래프"
          value={neo4j?.error ? '-' : fmtNum(neo4j?.nodeCount) + ' 노드'}
          subtitle={neo4j?.error ? neo4j.error : `관계 ${fmtNum(neo4j?.relationshipCount)}개`}
          status={neo4j?.error ? 'error' : 'info'}
        />
        <StatsCard
          icon={<MdSearch />}
          title="Elasticsearch"
          value={es?.error ? '-' : fmtNum(es?.documentCount) + ' 문서'}
          subtitle={es?.error ? es.error : `${es?.indexName ?? '-'} / ${es?.indexSizeMB ?? 0}MB`}
          status={es?.error ? 'error' : 'info'}
        />
        <StatsCard
          icon={<MdMemory />}
          title="Redis 키"
          value={redis?.error ? '-' : fmtNum(redis?.keyCount)}
          subtitle={redis?.error ? redis.error : '캐시 키 개수'}
          status={redis?.error ? 'error' : 'info'}
        />
      </StatsRow>

      {/* 중단: 소스별 분포 */}
      {distribution?.distribution?.length > 0 && (
        <SubSection>
          <SubTitle>
            소스별 분포
            <TotalHint>(총 {fmtNum(distribution.total)}건)</TotalHint>
          </SubTitle>
          <SourceGrid>
            {distribution.distribution.map((item) => (
              <SourceCard key={item.source}>
                <SourceLabel>{SOURCE_LABELS[item.source] || item.source}</SourceLabel>
                <SourceCount>{fmtNum(item.count)}</SourceCount>
                <SourceRatio>{item.percentage?.toFixed(1) ?? '0.0'}%</SourceRatio>
                <SourceBar
                  $ratio={distribution.total > 0 ? item.count / distribution.total : 0}
                />
              </SourceCard>
            ))}
          </SourceGrid>
        </SubSection>
      )}

      {/* 하단: 품질 지표 — NULL 비율 + 중복 + 평균 평점 */}
      {quality && !quality.error && (
        <SubSection>
          <SubTitle>
            데이터 품질
            <TotalHint>
              (전체 {fmtNum(quality.totalMovies)}건 · 중복 제목 {fmtNum(quality.duplicateTitles)}건
              {' · '}평균 평점 {quality.averageRating ?? '-'})
            </TotalHint>
          </SubTitle>
          <QualityRow>
            {nullRateEntries.map(([key, info]) => {
              const status = getNullRateStatus(info?.ratio);
              return (
                <QualityItem key={key}>
                  <QualityLabel>{NULL_RATE_LABELS[key] ?? key} NULL 비율</QualityLabel>
                  <QualityScore $status={status}>
                    {info?.ratio != null ? `${info.ratio}%` : '-'}
                  </QualityScore>
                  <QualitySub>누락 {fmtNum(info?.count)}건</QualitySub>
                  <StatusBadge
                    status={status}
                    label={
                      status === 'success' ? '양호' :
                      status === 'warning' ? '주의' :
                      status === 'error' ? '미흡' : '확인 중'
                    }
                  />
                </QualityItem>
              );
            })}
          </QualityRow>
        </SubSection>
      )}

      {/* 마지막 확인 시각 */}
      {overview?.checkedAt && (
        <CheckedAt>
          <MdVerified size={14} />
          마지막 확인: {new Date(overview.checkedAt).toLocaleString('ko-KR')}
        </CheckedAt>
      )}
    </Section>
  );
}

/* ── styled-components ── */

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
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
  &:disabled { opacity: 0.5; }
`;

const ErrorMsg = styled.p`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

/* 상단 5DB 카드 — 5열 그리드 (좁아지면 자동 줄바꿈) */
const StatsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: ${({ theme }) => theme.spacing.lg};
  margin-bottom: ${({ theme }) => theme.spacing.xl};

  @media (max-width: 1280px) {
    grid-template-columns: repeat(3, 1fr);
  }
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const SubSection = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const SubTitle = styled.h4`
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.md};
  display: flex;
  align-items: baseline;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const TotalHint = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  font-weight: ${({ theme }) => theme.fontWeights.normal};
`;

const SourceGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
`;

const SourceCard = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  padding: ${({ theme }) => theme.spacing.lg};
  box-shadow: ${({ theme }) => theme.shadows.card};
`;

const SourceLabel = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const SourceCount = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.xl};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
  font-family: ${({ theme }) => theme.fonts.mono};
`;

const SourceRatio = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const SourceBar = styled.div`
  height: 4px;
  border-radius: 2px;
  background: ${({ theme }) => theme.colors.primary};
  width: ${({ $ratio }) => `${Math.round($ratio * 100)}%`};
  min-width: 4px;
  opacity: 0.7;
`;

const QualityRow = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: ${({ theme }) => theme.spacing.lg};

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

const QualityItem = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  padding: ${({ theme }) => theme.spacing.xl};
  box-shadow: ${({ theme }) => theme.shadows.card};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const QualityLabel = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
`;

const QualityScore = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.xxl};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ $status, theme }) =>
    $status === 'success' ? theme.colors.success :
    $status === 'error' ? theme.colors.error :
    $status === 'warning' ? theme.colors.warning :
    theme.colors.textPrimary};
`;

const QualitySub = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
`;

const CheckedAt = styled.p`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  margin-top: ${({ theme }) => theme.spacing.md};
`;
