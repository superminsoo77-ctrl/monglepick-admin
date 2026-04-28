/**
 * 사용자 참여도 분석 탭 컴포넌트.
 *
 * 구성:
 * 1. KPI 카드 5개 (총출석/오늘출석/평균스트릭/활동사용자/위시리스트수)
 * 2. 활동별 참여 현황 Horizontal BarChart (REVIEW_CREATE, ATTENDANCE 등)
 * 3. 출석 연속일 구간 분포 BarChart (1일/2-3일/4-7일/8-14일/15-30일/31일+)
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
  MdEventAvailable,
  MdToday,
  MdLocalFireDepartment,
  MdPeople,
  MdFavorite,
} from 'react-icons/md';
import StatsCard from '@/shared/components/StatsCard';
import {
  fetchEngagementOverview,
  fetchActivityDistribution,
  fetchAttendanceStreak,
} from '../api/statsApi';

/** 활동 유형별 색상 */
const ACTIVITY_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

/** 스트릭 구간별 색상 (짧은 구간=회색, 긴 구간=보라) */
const STREAK_COLORS = ['#94a3b8', '#64748b', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899'];

/** 숫자 포맷 */
function fmt(val) {
  if (val === null || val === undefined) return '-';
  return Number(val).toLocaleString();
}

export default function EngagementTab() {
  /* 개요 KPI */
  const [overview, setOverview] = useState(null);
  const [ovLoading, setOvLoading] = useState(true);
  const [ovError, setOvError] = useState(null);

  /* 활동 분포 */
  const [activities, setActivities] = useState(null);
  const [actLoading, setActLoading] = useState(true);

  /* 스트릭 분포 */
  const [streaks, setStreaks] = useState(null);
  const [streakLoading, setStreakLoading] = useState(true);

  /** 최초 마운트: 3개 API 병렬 호출 */
  const loadAll = useCallback(async () => {
    setOvLoading(true);
    setActLoading(true);
    setStreakLoading(true);
    setOvError(null);

    const [ovRes, actRes, streakRes] = await Promise.allSettled([
      fetchEngagementOverview(),
      fetchActivityDistribution(),
      fetchAttendanceStreak(),
    ]);

    if (ovRes.status === 'fulfilled') setOverview(ovRes.value);
    else setOvError(ovRes.reason?.message ?? '참여도 개요를 불러올 수 없습니다.');
    setOvLoading(false);

    if (actRes.status === 'fulfilled') setActivities(actRes.value);
    setActLoading(false);

    if (streakRes.status === 'fulfilled') setStreaks(streakRes.value);
    setStreakLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  /* 안전 접근 */
  const ov = overview ?? {};
  const actItems = activities?.activities ?? [];
  const streakItems = streaks?.buckets ?? [];

  /** KPI 카드 정의 */
  const kpiCards = [
    { key: 'totalAttendance', icon: <MdEventAvailable size={18} />, title: '총 출석 체크', value: ovLoading ? '...' : `${fmt(ov.totalAttendance)}회`, subtitle: '누적 출석 체크 횟수', status: 'info' },
    { key: 'todayAttendance', icon: <MdToday size={18} />, title: '오늘 출석', value: ovLoading ? '...' : `${fmt(ov.todayAttendance)}명`, subtitle: '오늘 출석한 사용자', status: 'success' },
    { key: 'avgStreak', icon: <MdLocalFireDepartment size={18} />, title: '평균 연속 출석', value: ovLoading ? '...' : `${ov.avgStreakDays ?? 0}일`, subtitle: '전체 사용자 평균 스트릭', status: 'success' },
    { key: 'activeUsers', icon: <MdPeople size={18} />, title: '활동 사용자', value: ovLoading ? '...' : `${fmt(ov.activityUsers)}명`, subtitle: '1개 이상 활동 진행 중', status: 'info' },
    { key: 'wishlistCount', icon: <MdFavorite size={18} />, title: '위시리스트', value: ovLoading ? '...' : `${fmt(ov.totalWishlist)}건`, subtitle: '전체 위시리스트 항목', status: 'info' },
  ];

  return (
    <Wrapper>
      {/* ── KPI 카드 ── */}
      <SectionLabel>사용자 참여 지표</SectionLabel>
      {ovError && <ErrorMsg>{ovError}</ErrorMsg>}
      <KpiGrid>
        {kpiCards.map((card) => (
          <StatsCard key={card.key} icon={card.icon} title={card.title} value={card.value} subtitle={card.subtitle} status={card.status} />
        ))}
      </KpiGrid>

      {/* ── 활동별 참여 현황 ── */}
      <SectionLabel style={{ marginTop: '32px' }}>활동별 참여 현황</SectionLabel>
      <ChartCard>
        <ChartTitle>활동 유형별 참여 사용자 수 / 누적 활동 횟수</ChartTitle>
        <ChartBody>
          {actLoading ? (
            <LoadingMsg>데이터를 불러오는 중...</LoadingMsg>
          ) : actItems.length === 0 ? (
            <LoadingMsg>표시할 활동 데이터가 없습니다.</LoadingMsg>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(300, actItems.length * 45)}>
              <BarChart data={actItems} layout="vertical" margin={{ top: 4, right: 24, left: 120, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={120} />
                <Tooltip
                  formatter={(value, name) => [`${fmt(value)}`, name === 'userCount' ? '참여 사용자' : '누적 활동']}
                  contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }}
                />
                <Bar dataKey="totalActions" name="누적 활동" radius={[0, 4, 4, 0]} barSize={20}>
                  {actItems.map((_, idx) => (
                    <Cell key={`act-${idx}`} fill={ACTIVITY_COLORS[idx % ACTIVITY_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartBody>
      </ChartCard>

      {/* ── 출석 연속일 분포 ── */}
      <SectionLabel style={{ marginTop: '32px' }}>출석 연속일 분포</SectionLabel>
      <ChartCard>
        <ChartTitle>최근 출석 연속일 구간별 사용자 수</ChartTitle>
        <ChartBody>
          {streakLoading ? (
            <LoadingMsg>데이터를 불러오는 중...</LoadingMsg>
          ) : streakItems.length === 0 ? (
            <LoadingMsg>표시할 출석 데이터가 없습니다.</LoadingMsg>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={streakItems} margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="range" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value) => [`${fmt(value)}명`]}
                  contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }}
                />
                <Bar dataKey="count" name="사용자 수" radius={[4, 4, 0, 0]} barSize={48}>
                  {streakItems.map((_, idx) => (
                    <Cell key={`str-${idx}`} fill={STREAK_COLORS[idx % STREAK_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartBody>
      </ChartCard>
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
