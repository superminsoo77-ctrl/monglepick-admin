/**
 * 영화 데이터 탭 메인 페이지 (구 "데이터 관리").
 *
 * 2026-04-08 개편:
 *  - 탭 라벨 "데이터 관리" → "영화 데이터"로 변경 (경로 /admin/data 유지)
 *  - "영화 마스터" / "장르 마스터" 서브탭 흡수 (구 운영 도구에서 이관)
 *  - 조회(데이터 현황/수집 이력)와 조작(영화/장르 CRUD·파이프라인)이 한 탭에 통합됨
 *
 * 6개 서브탭:
 *  - 데이터 현황 : 5DB 건수, 소스별 분포, 품질 점수 (조회 — DataStatsCard)
 *  - 영화 데이터 : 키워드/소스 검색, 테이블, 상세 모달 (MovieTable)
 *  - 영화 마스터 : 영화 엔티티 CRUD (신규 흡수)
 *  - 장르 마스터 : 장르 엔티티 CRUD (신규 흡수)
 *  - 파이프라인  : 9개 작업 선택 + 실행/취소 + SSE 로그 (PipelineExecutor)
 *  - 수집 이력  : 실행 이력 테이블 + 재시도 버튼 (PipelineHistory)
 */

import { useState } from 'react';
import styled from 'styled-components';
import DataStatsCard from '../components/DataStatsCard';
import MovieTable from '../components/MovieTable';
import MovieMasterTab from '../components/MovieMasterTab';
import GenreMasterTab from '../components/GenreMasterTab';
import PipelineExecutor from '../components/PipelineExecutor';
import PipelineHistory from '../components/PipelineHistory';

/** 서브탭 목록 */
const SUB_TABS = [
  { key: 'stats',        label: '데이터 현황' },
  { key: 'movies',       label: '영화 데이터' },
  { key: 'movie_master', label: '영화 마스터' },
  { key: 'genre_master', label: '장르 마스터' },
  { key: 'pipeline',     label: '파이프라인' },
  { key: 'history',      label: '수집 이력' },
];

export default function DataPage() {
  const [activeTab, setActiveTab] = useState('stats');

  return (
    <Wrapper>
      {/* 페이지 헤더 */}
      <PageHeader>
        <PageTitle>영화 데이터</PageTitle>
        <PageDesc>
          5DB 데이터 현황 및 영화/장르 마스터 CRUD, 수집/임베딩 파이프라인 실행과
          수집 이력을 관리합니다.
        </PageDesc>
      </PageHeader>

      {/* 서브탭 네비게이션 */}
      <TabNav>
        {SUB_TABS.map((tab) => (
          <TabButton
            key={tab.key}
            $active={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </TabButton>
        ))}
      </TabNav>

      {/* 서브탭 콘텐츠 */}
      <TabContent>
        {activeTab === 'stats'        && <DataStatsCard />}
        {activeTab === 'movies'       && <MovieTable />}
        {activeTab === 'movie_master' && <MovieMasterTab />}
        {activeTab === 'genre_master' && <GenreMasterTab />}
        {activeTab === 'pipeline'     && <PipelineExecutor />}
        {activeTab === 'history'      && <PipelineHistory />}
      </TabContent>
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

const TabNav = styled.div`
  display: flex;
  gap: 2px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  margin-bottom: ${({ theme }) => theme.spacing.xxl};
  flex-wrap: wrap;
`;

const TabButton = styled.button`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.xl};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.primary : theme.colors.textMuted};
  border-bottom: 2px solid ${({ $active, theme }) =>
    $active ? theme.colors.primary : 'transparent'};
  transition: all ${({ theme }) => theme.transitions.fast};
  margin-bottom: -1px;

  &:hover {
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const TabContent = styled.div``;
