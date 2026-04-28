/**
 * 검색 분석 탭 컴포넌트.
 *
 * 2026-04-08 개편:
 *  - 하단에 "인기 검색어 운영 관리" 섹션(PopularSearchManage) 추가 —
 *    구 운영 도구 > 인기 검색어 탭을 흡수. 조회(품질 지표/TOP 20)와
 *    조작(블랙리스트/강제 노출 CRUD)을 한 탭에서 함께 관리한다.
 *
 * 구성:
 * 1. 기간 선택 버튼 그룹 (7d / 30d)
 * 2. 검색 품질 지표 카드 3개 (성공률, 총 검색 수, 0건 검색 수)
 * 3. 인기 검색어 테이블 (순위, 키워드, 검색 수, 전환율) — 조회 전용
 * 4. 인기 검색어 운영 관리 (CRUD + 블랙리스트)
 *
 * 데이터 패칭:
 * - Promise.allSettled로 품질 지표 + 인기 검색어 병렬 호출
 * - 기간 변경 시 두 API 모두 재호출
 *
 * @param {Object} props - 없음 (내부 상태 관리)
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import {
  MdSearch,
  MdCheckCircle,
  MdSearchOff,
} from 'react-icons/md';
import StatsCard from '@/shared/components/StatsCard';
import { fetchPopularKeywords, fetchSearchQuality } from '../api/statsApi';
import PopularSearchManage from './PopularSearchManage';

/** 기간 선택 옵션 (검색 분석은 7d / 30d 두 가지) */
const PERIOD_OPTIONS = [
  { value: '7d',  label: '7일' },
  { value: '30d', label: '30일' },
];

/**
 * 숫자 천 단위 포맷.
 *
 * @param {number|null|undefined} val
 * @returns {string}
 */
function fmt(val) {
  if (val === null || val === undefined) return '-';
  return Number(val).toLocaleString();
}

/**
 * 퍼센트 포맷. 0.9234 → "92.3%"
 *
 * @param {number|null|undefined} val
 * @returns {string}
 */
function fmtPct(val) {
  if (val === null || val === undefined) return '-';
  return `${(Number(val) * 100).toFixed(1)}%`;
}

export default function SearchTab() {
  /** 현재 선택된 기간 */
  const [period, setPeriod] = useState('7d');

  /** 검색 품질 지표 상태 */
  const [quality, setQuality] = useState(null);
  const [qualityLoading, setQualityLoading] = useState(true);
  const [qualityError, setQualityError] = useState(null);

  /** 인기 검색어 상태 */
  const [keywords, setKeywords] = useState([]);
  const [keywordsLoading, setKeywordsLoading] = useState(true);
  const [keywordsError, setKeywordsError] = useState(null);

  /**
   * 품질 지표 + 인기 검색어 병렬 호출.
   *
   * @param {string} p - 기간 (7d | 30d)
   */
  const loadData = useCallback(async (p) => {
    setQualityLoading(true);
    setKeywordsLoading(true);
    setQualityError(null);
    setKeywordsError(null);

    const [qualityResult, keywordsResult] = await Promise.allSettled([
      fetchSearchQuality({ period: p }),
      fetchPopularKeywords({ period: p, size: 20 }),
    ]);

    /* 품질 지표 처리 */
    if (qualityResult.status === 'fulfilled') {
      setQuality(qualityResult.value);
    } else {
      setQualityError(qualityResult.reason?.message ?? '검색 품질 데이터를 불러올 수 없습니다.');
    }
    setQualityLoading(false);

    /* 인기 검색어 처리 */
    if (keywordsResult.status === 'fulfilled') {
      setKeywords(
        Array.isArray(keywordsResult.value) ? keywordsResult.value : [],
      );
    } else {
      setKeywordsError(keywordsResult.reason?.message ?? '인기 검색어를 불러올 수 없습니다.');
    }
    setKeywordsLoading(false);
  }, []);

  /* 최초 마운트 + 기간 변경 시 데이터 로드 */
  useEffect(() => {
    loadData(period);
  }, [period, loadData]);

  /* 품질 지표 안전 접근 */
  const q = quality ?? {};

  /** 품질 지표 카드 정의 */
  const qualityCards = [
    {
      key: 'successRate',
      icon: <MdCheckCircle size={18} />,
      title: '검색 성공률',
      value: qualityLoading ? '...' : fmtPct(q.successRate),
      subtitle: '1건 이상 결과 반환 비율',
      status: 'success',
    },
    {
      key: 'totalSearches',
      icon: <MdSearch size={18} />,
      title: '총 검색 수',
      value: qualityLoading ? '...' : fmt(q.totalSearches),
      subtitle: '기간 내 전체 검색 횟수',
      status: 'info',
    },
    {
      key: 'zeroResults',
      icon: <MdSearchOff size={18} />,
      title: '0건 검색 수',
      value: qualityLoading ? '...' : fmt(q.zeroResultSearches),
      subtitle: '결과 없음 반환 횟수',
      /* 0건 검색이 전체의 10% 초과면 warning */
      status: qualityLoading
        ? 'info'
        : (q.zeroResultSearches ?? 0) / Math.max(q.totalSearches ?? 1, 1) > 0.1
          ? 'warning'
          : 'info',
    },
  ];

  return (
    <Wrapper>
      {/* ── 기간 선택 ── */}
      <FilterRow>
        <FilterLabel>집계 기간</FilterLabel>
        <PeriodGroup>
          {PERIOD_OPTIONS.map((opt) => (
            <PeriodButton
              key={opt.value}
              $active={period === opt.value}
              onClick={() => setPeriod(opt.value)}
            >
              {opt.label}
            </PeriodButton>
          ))}
        </PeriodGroup>
      </FilterRow>

      {/* ── 검색 품질 지표 카드 ── */}
      <SectionLabel>검색 품질 지표</SectionLabel>
      {qualityError && <ErrorMsg>{qualityError}</ErrorMsg>}
      <QualityGrid>
        {qualityCards.map((card) => (
          <StatsCard
            key={card.key}
            icon={card.icon}
            title={card.title}
            value={card.value}
            subtitle={card.subtitle}
            status={card.status}
          />
        ))}
      </QualityGrid>

      {/* ── 인기 검색어 테이블 ── */}
      <SectionLabel style={{ marginTop: '32px' }}>인기 검색어</SectionLabel>
      {keywordsError && <ErrorMsg>{keywordsError}</ErrorMsg>}
      <TableCard>
        <TableHeader>
          <CardTitle>인기 검색어 TOP 20</CardTitle>
          {!keywordsLoading && (
            <TableMeta>총 {keywords.length}개 키워드</TableMeta>
          )}
        </TableHeader>
        <TableWrapper>
          <Table>
            <thead>
              <tr>
                <Th style={{ width: '60px' }}>순위</Th>
                <Th>키워드</Th>
                <Th style={{ textAlign: 'right' }}>검색 수</Th>
                <Th style={{ textAlign: 'right' }}>전환율</Th>
              </tr>
            </thead>
            <tbody>
              {keywordsLoading ? (
                <tr>
                  <Td colSpan={4} style={{ textAlign: 'center' }}>
                    데이터를 불러오는 중...
                  </Td>
                </tr>
              ) : keywords.length === 0 ? (
                <tr>
                  <Td colSpan={4} style={{ textAlign: 'center' }}>
                    검색어 데이터가 없습니다.
                  </Td>
                </tr>
              ) : (
                keywords.map((kw, idx) => (
                  /* keyword를 key로, 중복 시 idx 보조 */
                  <tr key={`${kw.keyword}-${idx}`}>
                    <Td>
                      {/* 상위 3위는 색상 강조 */}
                      <RankBadge $rank={kw.rank ?? idx + 1}>
                        {kw.rank ?? idx + 1}
                      </RankBadge>
                    </Td>
                    <Td>
                      <KeywordText>{kw.keyword ?? '-'}</KeywordText>
                    </Td>
                    <Td style={{ textAlign: 'right' }}>
                      {fmt(kw.searchCount)}
                    </Td>
                    <Td style={{ textAlign: 'right' }}>
                      {/* 전환율이 높으면 초록, 낮으면 기본 */}
                      <ConversionRate
                        $high={(kw.conversionRate ?? 0) >= 0.3}
                      >
                        {fmtPct(kw.conversionRate)}
                      </ConversionRate>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </TableWrapper>
      </TableCard>

      {/* ── 인기 검색어 운영 관리 (CRUD) ── */}
      <SectionLabel style={{ marginTop: '48px' }}>인기 검색어 운영 관리</SectionLabel>
      <PopularSearchManage />
    </Wrapper>
  );
}

/* ── styled-components ── */

const Wrapper = styled.div``;

const FilterRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.lg};
  margin-bottom: ${({ theme }) => theme.spacing.xxl};
`;

const FilterLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const PeriodGroup = styled.div`
  display: flex;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  overflow: hidden;
`;

const PeriodButton = styled.button`
  padding: 5px ${({ theme }) => theme.spacing.lg};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ $active, theme }) =>
    $active ? '#ffffff' : theme.colors.textSecondary};
  background: ${({ $active, theme }) =>
    $active ? theme.colors.primary : 'transparent'};
  transition: all ${({ theme }) => theme.transitions.fast};
  white-space: nowrap;

  & + & {
    border-left: 1px solid ${({ theme }) => theme.colors.border};
  }

  &:hover {
    background: ${({ $active, theme }) =>
      $active ? theme.colors.primaryHover : theme.colors.bgHover};
  }
`;

const SectionLabel = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const QualityGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: ${({ theme }) => theme.spacing.lg};
`;

const ErrorMsg = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.error};
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid #fecaca;
  border-radius: 6px;
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const TableCard = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  padding: ${({ theme }) => theme.spacing.xl};
  box-shadow: ${({ theme }) => theme.shadows.card};
`;

const TableHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const CardTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.heading};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const TableMeta = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
`;

const TableWrapper = styled.div`
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

const Th = styled.th`
  text-align: left;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  white-space: nowrap;
`;

const Td = styled.td`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight};
  vertical-align: middle;

  tr:nth-child(even) & {
    background: ${({ theme }) => theme.colors.bgHover};
  }
`;

/**
 * 순위 배지.
 * 1~3위: 금/은/동 색상, 나머지: 기본 회색.
 *
 * @param {number} $rank - 순위
 */
const RankBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  background: ${({ $rank }) =>
    $rank === 1 ? '#fbbf24' :
    $rank === 2 ? '#94a3b8' :
    $rank === 3 ? '#cd7c3a' :
    '#e2e8f0'};
  color: ${({ $rank }) =>
    $rank <= 3 ? '#ffffff' : '#475569'};
`;

const KeywordText = styled.span`
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

/**
 * 전환율 텍스트.
 * 30% 이상이면 초록, 미만이면 기본.
 *
 * @param {boolean} $high - 전환율 높음 여부
 */
const ConversionRate = styled.span`
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ $high, theme }) =>
    $high ? theme.colors.success : theme.colors.textSecondary};
`;
