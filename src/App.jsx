/**
 * 몽글픽 관리자 앱 라우팅 (11탭 + 로그인).
 *
 * 모든 관리자 페이지는 AdminGuard(인증+ADMIN 역할 검증)로 보호된다.
 *
 * 2026-04-08 재배치:
 *  - /admin/content(콘텐츠 관리) → /admin/board(게시판 관리) 로 경로/라벨 변경
 *  - /admin/operations(운영 도구) 페이지 해체 → /admin/content-events(콘텐츠·이벤트) 신설
 *    나머지 11개 서브탭은 각 도메인 탭으로 이관(사용자/게시판/영화데이터/결제/통계/고객센터)
 *  - 데이터 관리 라벨은 "영화 데이터"로 변경, 경로 /admin/data 는 그대로 유지
 *
 * 11개 탭: 대시보드, 사용자, 게시판, 결제/포인트, 콘텐츠·이벤트, 영화 데이터,
 *          AI 운영, 통계/분석, 고객센터, 시스템, 설정
 */

import { Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from '@/shared/components/AdminLayout';
import AdminGuard from '@/shared/components/AdminGuard';
import LoginPage from '@/features/auth/pages/LoginPage';

/* ── 11개 탭 페이지 import ── */
import AdminAssistantPage from '@/features/assistant/pages/AdminAssistantPage';
import DashboardPage from '@/features/dashboard/pages/DashboardPage';
import UsersPage from '@/features/users/pages/UsersPage';
import BoardPage from '@/features/board/pages/BoardPage';
import PaymentPage from '@/features/payment/pages/PaymentPage';
import ContentEventsPage from '@/features/contentEvents/pages/ContentEventsPage';
import DataPage from '@/features/data/pages/DataPage';
import AiOpsPage from '@/features/ai/pages/AiOpsPage';
import StatsPage from '@/features/stats/pages/StatsPage';
import SupportPage from '@/features/support/pages/SupportPage';
import SystemPage from '@/features/system/pages/SystemPage';
import SettingsPage from '@/features/settings/pages/SettingsPage';

export default function App() {
  return (
    <Routes>
      {/* 로그인 (공개) */}
      <Route path="/login" element={<LoginPage />} />

      {/* 관리자 (인증+ADMIN 필수) */}
      <Route
        path="/admin"
        element={
          <AdminGuard>
            <AdminLayout />
          </AdminGuard>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="assistant" element={<AdminAssistantPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="board" element={<BoardPage />} />
        <Route path="payment" element={<PaymentPage />} />
        <Route path="content-events" element={<ContentEventsPage />} />
        <Route path="data" element={<DataPage />} />
        <Route path="ai" element={<AiOpsPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="support" element={<SupportPage />} />
        <Route path="system" element={<SystemPage />} />
        <Route path="settings" element={<SettingsPage />} />

        {/* 구 경로 호환 리다이렉트 (북마크/히스토리 보호) */}
        <Route path="content" element={<Navigate to="/admin/board" replace />} />
        <Route path="operations" element={<Navigate to="/admin/content-events" replace />} />
      </Route>

      {/* 루트 → 관리자 대시보드 */}
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
