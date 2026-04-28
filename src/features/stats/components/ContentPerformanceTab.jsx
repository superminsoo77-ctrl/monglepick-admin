/**
 * 콘텐츠 성과 분석 탭 컴포넌트.
 *
 * 구성:
 * 1. KPI 카드 5개 (코스진행/완주/업적달성/퀴즈시도/퀴즈정답률)
 * 2. 코스별 완주율 Horizontal BarChart
 * 3. 리뷰 품질 — 카테고리별 리뷰 분포 BarChart + 평점 구간 분포 BarChart (2열)
 *
 * 데이터 패칭:
 * - Promise.allSettled로 3개 API 병렬 호출
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  MdSchool,
  MdCheckCircle,
  MdEmojiEvents,
  MdQuiz,
  MdPercent,
} from 'react-icons/md';
import StatsCard from '@/shared/components/StatsCard';
import {
  fetchContentPerformanceOverview,
  fetchCourseCompletion,
  fetchReviewQuality,
} from '../api/statsApi';

/** 코스 완주율 색상 */
const COURSE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

/** 리뷰 카테고리 색상 */
const REVIEW_CAT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6'];

/** 평점 분포 색상 (1점=빨강 → 5점=초록) */
const RATING_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981'];

/** 숫자 포맷 */
function fmt(val) {
  if (val === null || val === undefined) return '-';
  return Number(val).toLocaleString();
}

export default function ContentPerformanceTab() {
  /* 개요 KPI */
  const [overview, setOverview] = useState(null);
  const [ovLoading, setOvLoading] = useState(true);
  const [ovError, setOvError] = useState(null);

  /* 코스 완주율 */
  const [courses, setCourses] = useState(null);
  const [courseLoading, setCourseLoading] = useState(true);

  /* 리뷰 품질 */
  const [reviewQuality, setReviewQuality] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(true);

  /** 최초 마운트: 3개 API 병렬 호출 */
  const loadAll = useCallback(async () => {
    setOvLoading(true);
    setCourseLoading(true);
    setReviewLoading(true);
    setOvError(null);

    const [ovRes, courseRes, reviewRes] = await Promise.allSettled([
      fetchContentPerformanceOverview(),
      fetchCourseCompletion(),
      fetchReviewQuality(),
    ]);

    if (ovRes.status === 'fulfilled') setOverview(ovRes.value);
    else setOvError(ovRes.reason?.message ?? '콘텐츠 개요를 불러올 수 없습니다.');
    setOvLoading(false);

    if (courseRes.status === 'fulfilled') setCourses(courseRes.value);
    setCourseLoading(false);

    if (reviewRes.status === 'fulfilled') setReviewQuality(reviewRes.value);
    setReviewLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  /* 안전 접근 */
  const ov = overview ?? {};
  const courseItems = courses?.courses ?? [];
  const rq = reviewQuality ?? {};
  const catItems = rq.categoryDistribution ?? [];
  const ratingItems = rq.ratingDistribution ?? [];

  /** KPI 카드 정의 */
  const kpiCards = [
    { key: 'courseProgress', icon: <MdSchool size={18} />, title: '코스 진행', value: ovLoading ? '...' : `${fmt(ov.totalCourseProgress)}건`, subtitle: '전체 코스 진행 수', status: 'info' },
    { key: 'courseCompleted', icon: <MdCheckCircle size={18} />, title: '코스 완주', value: ovLoading ? '...' : `${fmt(ov.completedCourses)}건`, subtitle: '완주된 코스 수', status: 'success' },
    { key: 'achievements', icon: <MdEmojiEvents size={18} />, title: '업적 달성', value: ovLoading ? '...' : `${fmt(ov.totalAchievements)}건`, subtitle: '누적 업적 달성 수', status: 'success' },
    { key: 'quizAttempts', icon: <MdQuiz size={18} />, title: '퀴즈 시도', value: ovLoading ? '...' : `${fmt(ov.totalQuizAttempts)}회`, subtitle: '누적 퀴즈 시도 횟수', status: 'info' },
    { key: 'quizCorrectRate', icon: <MdPercent size={18} />, title: '퀴즈 정답률', value: ovLoading ? '...' : `${ov.quizCorrectRate ?? 0}%`, subtitle: '전체 퀴즈 정답 비율', status: (ov.quizCorrectRate ?? 0) >= 60 ? 'success' : 'warning' },
  ];

  return (
    <Wrapper>
      {/* ── KPI 카드 ── */}
      <SectionLabel>콘텐츠 성과 지표</SectionLabel>
      {ovError && <ErrorMsg>{ovError}</ErrorMsg>}
      <KpiGrid>
        {kpiCards.map((card) => (
          <StatsCard key={card.key} icon={card.icon} title={card.title} value={card.value} subtitle={card.subtitle} status={card.status} />
        ))}
      </KpiGrid>

      {/* ── 코스별 완주율 ── */}
      <SectionLabel style={{ marginTop: '32px' }}>코스별 완주율</SectionLabel>
      <ChartCard>
        <ChartTitle>코스별 시작자 수 / 완주자 수 / 평균 진행률</ChartTitle>
        <ChartBody>
          {courseLoading ? (
            <LoadingMsg>데이터를 불러오는 중...</LoadingMsg>
          ) : courseItems.length === 0 ? (
            <LoadingMsg>표시할 코스 데이터가 없습니다.</LoadingMsg>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(280, courseItems.length * 50)}>
              <BarChart data={courseItems} layout="vertical" margin={{ top: 4, right: 24, left: 100, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="courseId" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={100} />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === 'completionRate') return [`${value}%`, '완주율'];
                    return [`${fmt(value)}명`, name === 'started' ? '시작자' : '완주자'];
                  }}
                  contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }}
                />
                <Bar dataKey="started" name="시작자" fill="#94a3b8" radius={[0, 4, 4, 0]} barSize={16} />
                <Bar dataKey="completed" name="완주자" fill="#10b981" radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartBody>
      </ChartCard>

      {/* ── 리뷰 품질 (2열) ── */}
      <SectionLabel style={{ marginTop: '32px' }}>리뷰 품질 분석</SectionLabel>
      <TwoColGrid>
        {/* 카테고리별 리뷰 분포 */}
        <ChartCard>
          <ChartTitle>리뷰 작성 경로별 분포</ChartTitle>
          <ChartBody>
            {reviewLoading ? (
              <LoadingMsg>데이터를 불러오는 중...</LoadingMsg>
            ) : catItems.length === 0 ? (
              <LoadingMsg>표시할 데이터가 없습니다.</LoadingMsg>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={catItems} margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value) => [`${fmt(value)}건`]} contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }} />
                  <Bar dataKey="count" name="리뷰 수" radius={[4, 4, 0, 0]} barSize={36}>
                    {catItems.map((_, idx) => (
                      <Cell key={`rc-${idx}`} fill={REVIEW_CAT_COLORS[idx % REVIEW_CAT_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartBody>
        </ChartCard>

        {/* 평점 구간 분포 */}
        <ChartCard>
          <ChartTitle>평점 분포</ChartTitle>
          <ChartBody>
            {reviewLoading ? (
              <LoadingMsg>데이터를 불러오는 중...</LoadingMsg>
            ) : ratingItems.length === 0 ? (
              <LoadingMsg>표시할 데이터가 없습니다.</LoadingMsg>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={ratingItems} margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="rating" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value) => [`${fmt(value)}건`]} contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }} />
                  <Bar dataKey="count" name="리뷰 수" radius={[4, 4, 0, 0]} barSize={40}>
                    {ratingItems.map((_, idx) => (
                      <Cell key={`rat-${idx}`} fill={RATING_COLORS[idx % RATING_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartBody>
        </ChartCard>
      </TwoColGrid>
    </Wrapper>
  );
}

/* ── styled-components ── */
const Wrapper = styled.div``;
const SectionLabel = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: ${({ theme }) => theme.spacing.md};
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
const KpiGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: ${({ theme }) => theme.spacing.lg};
  margin-bottom: ${({ theme }) => theme.spacing.xxl};
`;
const TwoColGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: ${({ theme }) => theme.spacing.lg};
`;
const ChartCard = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  padding: ${({ theme }) => theme.spacing.xl};
  box-shadow: ${({ theme }) => theme.shadows.card};
`;
const ChartTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.heading};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;
const ChartBody = styled.div`
  min-height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
`;
const LoadingMsg = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.textMuted};
  text-align: center;
`;
