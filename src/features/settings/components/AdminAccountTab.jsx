/**
 * 관리자 계정 관리 서브탭.
 *
 * 기능:
 * - 관리자 목록 테이블 (userId, adminRole, isActive 배지, lastLoginAt, createdAt, 역할 변경)
 * - 역할 변경: select 드롭다운 (7종 RBAC) + 확인 alert + 역할별 설명 안내 박스
 * - 새로고침 버튼
 * - 페이지네이션 (10건/페이지)
 *
 * 역할 변경은 즉시 API를 호출하며, 변경 전 confirm 다이얼로그로 실수 방지.
 *
 * 2026-04-09 P2-⑫ RBAC 확장:
 * - 기존 2종(ADMIN/SUPER_ADMIN) → 7종 세분화 역할로 확장
 * - Backend `AdminRole` enum (SUPER_ADMIN/ADMIN/MODERATOR/FINANCE_ADMIN/SUPPORT_ADMIN/DATA_ADMIN/AI_OPS_ADMIN) 과 1:1 매칭
 * - 각 역할에 한국어 라벨과 업무 범위 설명 추가 — 운영자가 역할 선택 시 "어떤 권한까지 허용되는가" 즉시 파악 가능
 * - Spring Security 엔드포인트 레벨 강제 적용(@PreAuthorize) 은 별도 이슈 — 본 작업은 "라벨링 인프라" 까지
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { MdRefresh, MdAdminPanelSettings, MdInfoOutline, MdAdd } from 'react-icons/md';
import { fetchAdmins, updateAdminRole } from '../api/settingsApi';
import AdminAccountCreateModal from './AdminAccountCreateModal';
import StatusBadge from '@/shared/components/StatusBadge';

/**
 * 관리자 역할 옵션 — 2026-04-09 P2-⑫ RBAC 세분화.
 *
 * Backend `AdminRole` enum (global/constants/AdminRole.java) 의 7종 코드와 정확히 일치해야 한다.
 * 순서는 권한 강도 기준 내림차순 (SUPER_ADMIN 이 가장 높음).
 *
 * - `value`: Backend 에 전송되는 코드 (대문자 고정, 변경 금지)
 * - `label`: 드롭다운 옵션에 노출되는 한국어 표시명
 * - `description`: 업무 범위 설명 — 역할 선택 시 하단 안내 박스에 표시
 */
const ROLES = [
  {
    value: 'SUPER_ADMIN',
    label: '최고 관리자 (SUPER_ADMIN)',
    description: '모든 기능 + 관리자 계정 관리 + 시스템 설정',
  },
  {
    value: 'ADMIN',
    label: '일반 관리자 (ADMIN)',
    description: '관리자 계정·시스템 설정 제외 전체 운영 기능',
  },
  {
    value: 'MODERATOR',
    label: '모더레이터 (MODERATOR)',
    description: '게시판 관리 전담 — 신고/혐오표현/게시글/리뷰',
  },
  {
    value: 'FINANCE_ADMIN',
    label: '재무 관리자 (FINANCE_ADMIN)',
    description: '결제·포인트·구독·환불·리워드 정책',
  },
  {
    value: 'SUPPORT_ADMIN',
    label: '고객센터 관리자 (SUPPORT_ADMIN)',
    description: '공지·FAQ·티켓·도움말',
  },
  {
    value: 'DATA_ADMIN',
    label: '데이터 관리자 (DATA_ADMIN)',
    description: '영화 마스터·장르·데이터 파이프라인',
  },
  {
    value: 'AI_OPS_ADMIN',
    label: 'AI 운영 관리자 (AI_OPS_ADMIN)',
    description: 'AI 퀴즈 생성·채팅 로그·모델 버전 관리',
  },
  /*
   * 2026-04-14 추가: 통계/분석 전담 역할.
   * 쓰기 권한 없이 통계 12탭 + 대시보드 조회만 필요한 분석가/기획자 롤.
   */
  {
    value: 'STATS_ADMIN',
    label: '통계/분석 관리자 (STATS_ADMIN)',
    description: '대시보드·통계·분석 탭 조회 전용 (쓰기 권한 없음)',
  },
];

/**
 * 역할 코드 → 설명 빠른 조회 맵.
 * 테이블에서 역할 배지 옆에 툴팁으로 노출할 때 사용.
 */
const ROLE_DESCRIPTION = ROLES.reduce((acc, r) => {
  acc[r.value] = r.description;
  return acc;
}, {});

/**
 * 역할 배지 색상 맵 — 권한 강도에 따른 시각적 차별화.
 * SUPER_ADMIN=warning(주황) 가장 눈에 띄게, 그 외 도메인별 톤 분리.
 */
const ROLE_BADGE = {
  SUPER_ADMIN:   'warning',
  ADMIN:         'info',
  MODERATOR:     'default',
  FINANCE_ADMIN: 'success',
  SUPPORT_ADMIN: 'info',
  DATA_ADMIN:    'default',
  AI_OPS_ADMIN:  'default',
  /* 2026-04-14 STATS_ADMIN 추가 — 쓰기 권한 없는 조회 전용 롤이므로 중립 톤(default) */
  STATS_ADMIN:   'default',
};

/** 날짜+시간 포맷 함수 */
function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminAccountTab() {
  /* ── 목록 상태 ── */
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* ── 페이지네이션 상태 ── */
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const PAGE_SIZE = 10;

  /* ── 역할 변경 로딩 상태 (adminId → boolean 맵) ── */
  const [roleChanging, setRoleChanging] = useState({});

  /*
   * 관리자 신규 등록 모달 표시 상태 — 2026-04-14 추가.
   * 모달이 서버 등록 성공 시 onSuccess 콜백으로 목록 재조회를 트리거한다.
   */
  const [createModalOpen, setCreateModalOpen] = useState(false);

  /** 관리자 목록 조회 */
  const loadAdmins = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchAdmins({ page, size: PAGE_SIZE });
      setAdmins(result?.content ?? (Array.isArray(result) ? result : []));
      setTotalPages(result?.totalPages ?? 0);
    } catch (err) {
      setError(err.message ?? '관리자 목록 조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadAdmins();
  }, [loadAdmins]);

  /**
   * 역할 변경 핸들러.
   * select 드롭다운 변경 시 confirm 후 API 호출.
   * @param {string|number} id - 관리자 ID
   * @param {string} currentRole - 현재 역할
   * @param {string} newRole - 변경할 역할
   */
  async function handleRoleChange(id, currentRole, newRole) {
    // 같은 역할로 변경 시도 시 무시
    if (currentRole === newRole) return;

    // 변경 전 확인
    const confirmed = window.confirm(
      `역할을 "${currentRole}" → "${newRole}"(으)로 변경하시겠습니까?\n\n관리자 ID: ${id}`
    );
    if (!confirmed) return;

    try {
      // 해당 관리자만 로딩 상태로 표시
      setRoleChanging((prev) => ({ ...prev, [id]: true }));
      await updateAdminRole(id, { adminRole: newRole });
      // 목록 새로고침으로 최신 상태 반영
      await loadAdmins();
    } catch (err) {
      alert(err.message ?? '역할 변경 중 오류가 발생했습니다.');
    } finally {
      setRoleChanging((prev) => ({ ...prev, [id]: false }));
    }
  }

  return (
    <Container>
      {/* ── 툴바 ── */}
      <Toolbar>
        <ToolbarLeft>
          <SectionTitle>관리자 계정</SectionTitle>
        </ToolbarLeft>
        <ToolbarRight>
          {/*
            2026-04-14 추가: 관리자 계정 신규 등록 버튼.
            클릭 시 AdminAccountCreateModal 이 열리며, 등록 성공 시 목록이 재조회된다.
          */}
          <PrimaryButton onClick={() => setCreateModalOpen(true)} title="기존 사용자를 관리자로 승격">
            <MdAdd size={16} />
            <span>관리자 추가</span>
          </PrimaryButton>
          <IconButton onClick={loadAdmins} disabled={loading} title="새로고침">
            <MdRefresh size={16} />
          </IconButton>
        </ToolbarRight>
      </Toolbar>

      {/* ── 관리자 신규 등록 모달 (createModalOpen === true 일 때만 렌더) ── */}
      {createModalOpen && (
        <AdminAccountCreateModal
          onClose={() => setCreateModalOpen(false)}
          onSuccess={() => {
            // 서버 등록 성공 → 목록 재조회하여 최신 상태 반영
            loadAdmins();
          }}
        />
      )}

      {/* ── 에러 메시지 ── */}
      {error && <ErrorMsg>{error}</ErrorMsg>}

      {/*
        RBAC 역할 안내 박스 — 2026-04-09 P2-⑫ 추가.
        7종 역할의 권한 범위를 한눈에 파악할 수 있도록 축약 안내. 운영자가 관리자 계정에
        역할을 부여할 때 실수 방지 + 조직 내 업무 분장 문서화 역할.
        ⚠️ Spring Security 엔드포인트 강제 적용은 별도 이슈이므로 본 UI 는 "라벨링"까지만.
      */}
      <RoleGuide>
        <RoleGuideHeader>
          <MdInfoOutline size={16} />
          <RoleGuideTitle>관리자 세부 역할 (RBAC)</RoleGuideTitle>
        </RoleGuideHeader>
        <RoleGuideGrid>
          {ROLES.map((r) => (
            <RoleGuideItem key={r.value}>
              <RoleGuideItemLabel>
                <StatusBadge
                  status={ROLE_BADGE[r.value] ?? 'default'}
                  label={r.value}
                />
              </RoleGuideItemLabel>
              <RoleGuideItemDesc>{r.description}</RoleGuideItemDesc>
            </RoleGuideItem>
          ))}
        </RoleGuideGrid>
        <RoleGuideNote>
          ※ 현재는 역할 라벨링만 제공되며, 엔드포인트 레벨 권한 차단은 추후 적용 예정입니다.
          모든 관리자는 여전히 전체 기능에 접근 가능하므로 역할은 <strong>조직 내 업무 분장 표시</strong>로 사용하세요.
        </RoleGuideNote>
      </RoleGuide>

      {/* ── 목록 테이블 ── */}
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th $w="130px">관리자 ID</Th>
              <Th>이메일</Th>
              <Th $w="110px">닉네임</Th>
              <Th $w="120px">역할</Th>
              <Th $w="80px">활성</Th>
              <Th $w="140px">마지막 로그인</Th>
              <Th $w="120px">등록일</Th>
              <Th $w="150px">역할 변경</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8}>
                  <CenterCell>불러오는 중...</CenterCell>
                </td>
              </tr>
            ) : admins.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <CenterCell>
                    <EmptyIconWrap>
                      <MdAdminPanelSettings size={32} />
                    </EmptyIconWrap>
                    등록된 관리자가 없습니다.
                  </CenterCell>
                </td>
              </tr>
            ) : (
              admins.map((admin) => {
                const id = admin.adminId ?? admin.id;
                const role = admin.adminRole ?? admin.role ?? 'ADMIN';
                const isChanging = roleChanging[id] === true;

                return (
                  <Tr key={id}>
                    {/* 관리자 ID */}
                    <Td>
                      <MonoText>{id}</MonoText>
                    </Td>

                    {/* 이메일 */}
                    <Td>
                      <EmailText>{admin.email ?? '-'}</EmailText>
                    </Td>

                    {/* 닉네임 */}
                    <Td>{admin.nickname ?? admin.name ?? '-'}</Td>

                    {/*
                      현재 역할 배지 — 2026-04-09 P2-⑫ RBAC 확장.
                      hover 시 역할 설명 툴팁이 노출되도록 title 속성 부착.
                      AdminRole enum 에 정의되지 않은 레거시 값(예: 기존 "ADMIN")도
                      그대로 표시하되, 매핑이 없으면 "미정의 역할" 안내.
                    */}
                    <Td title={ROLE_DESCRIPTION[role] ?? `미정의 역할 코드: ${role}`}>
                      <StatusBadge
                        status={ROLE_BADGE[role] ?? 'default'}
                        label={role}
                      />
                    </Td>

                    {/* 활성 여부 배지 */}
                    <Td>
                      <StatusBadge
                        status={admin.isActive !== false ? 'success' : 'default'}
                        label={admin.isActive !== false ? '활성' : '비활성'}
                      />
                    </Td>

                    {/* 마지막 로그인 */}
                    <Td>
                      <TimeText>{formatDateTime(admin.lastLoginAt)}</TimeText>
                    </Td>

                    {/* 등록일 */}
                    <Td>
                      <TimeText>{formatDateTime(admin.createdAt)}</TimeText>
                    </Td>

                    {/* 역할 변경 드롭다운 */}
                    <Td>
                      <RoleChangeWrap>
                        <RoleSelect
                          value={role}
                          onChange={(e) => handleRoleChange(id, role, e.target.value)}
                          disabled={isChanging}
                          title="역할을 선택하면 즉시 변경됩니다"
                        >
                          {ROLES.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </RoleSelect>
                        {/* 변경 중 로딩 텍스트 */}
                        {isChanging && <ChangingText>변경 중...</ChangingText>}
                      </RoleChangeWrap>
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </Table>
      </TableWrap>

      {/* ── 페이지네이션 ── */}
      {totalPages > 1 && (
        <Pagination>
          <PageButton onClick={() => setPage((p) => p - 1)} disabled={page === 0}>
            이전
          </PageButton>
          <PageInfo>
            {page + 1} / {totalPages}
          </PageInfo>
          <PageButton
            onClick={() => setPage((p) => p + 1)}
            disabled={page + 1 >= totalPages}
          >
            다음
          </PageButton>
        </Pagination>
      )}
    </Container>
  );
}

/* ── styled-components ── */

const Container = styled.div``;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const ToolbarLeft = styled.div`
  display: flex;
  align-items: center;
`;

const ToolbarRight = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const SectionTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

/**
 * 관리자 신규 등록 버튼 — 툴바 우측에 노출.
 * 2026-04-14 추가. 색 채움 primary 로직으로 "새 작업 시작" CTA 를 시각적으로 강조한다.
 */
const PrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  background: ${({ theme }) => theme.colors.primary};
  color: white;
  border-radius: 4px;
  transition: opacity ${({ theme }) => theme.transitions.fast};
  &:hover:not(:disabled) {
    opacity: 0.9;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const IconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  transition: background ${({ theme }) => theme.transitions.fast};
  &:hover {
    background: ${({ theme }) => theme.colors.bgHover};
  }
  &:disabled {
    opacity: 0.4;
  }
`;

const ErrorMsg = styled.p`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  margin-bottom: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.errorBg};
  border-radius: 4px;
`;

const TableWrap = styled.div`
  overflow-x: auto;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

const Th = styled.th`
  text-align: left;
  padding: 10px 12px;
  background: ${({ theme }) => theme.colors.bgHover};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  white-space: nowrap;
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
  vertical-align: middle;
`;

/* 고정폭 ID 텍스트 */
const MonoText = styled.span`
  font-family: 'Courier New', monospace;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const EmailText = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const TimeText = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  white-space: nowrap;
`;

/* 역할 변경 영역 (select + 로딩 텍스트) */
const RoleChangeWrap = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const RoleSelect = styled.select`
  padding: 5px 8px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  background: white;
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  outline: none;
  transition: border-color ${({ theme }) => theme.transitions.fast};
  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.primary};
  }
  &:focus {
    border-color: ${({ theme }) => theme.colors.primary};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ChangingText = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  white-space: nowrap;
`;

const CenterCell = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xxxl};
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

const EmptyIconWrap = styled.div`
  display: flex;
  justify-content: center;
  margin-bottom: ${({ theme }) => theme.spacing.sm};
  color: ${({ theme }) => theme.colors.border};
`;

const Pagination = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.md};
  margin-top: ${({ theme }) => theme.spacing.lg};
`;

const PageButton = styled.button`
  padding: 5px 14px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.bgHover};
  }
  &:disabled {
    opacity: 0.4;
  }
`;

const PageInfo = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
`;

// ──────────────────────────────────────────────
// RBAC 역할 안내 박스 (2026-04-09 P2-⑫ 신규)
// ──────────────────────────────────────────────

/**
 * 역할 안내 박스 — 테이블 상단에 표시되는 RBAC 가이드.
 * 7종 역할의 권한 범위를 한눈에 파악할 수 있도록 grid 레이아웃으로 카드 나열.
 */
const RoleGuide = styled.section`
  padding: ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.bgHover};
  border: 1px solid ${({ theme }) => theme.colors.borderLight};
  border-radius: 6px;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const RoleGuideHeader = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  color: ${({ theme }) => theme.colors.primary};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const RoleGuideTitle = styled.h4`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.primary};
`;

/**
 * 7개 역할 카드를 반응형 그리드로 배치.
 * 최소 220px, 남은 공간을 균등 분할.
 */
const RoleGuideGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const RoleGuideItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.borderLight};
  border-radius: 4px;
`;

const RoleGuideItemLabel = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const RoleGuideItemDesc = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  line-height: 1.4;
`;

/**
 * 하단 안내 문구 — @PreAuthorize 강제 적용 미완료 상태 고지.
 * 운영자가 "역할을 바꾸면 권한이 즉시 차단되는가" 오해하지 않도록 명시적으로 안내.
 */
const RoleGuideNote = styled.p`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.md};
  background: #fffbeb;
  border-left: 3px solid #f59e0b;
  border-radius: 3px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: #92400e;
  line-height: 1.5;

  strong {
    color: #78350f;
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
  }
`;
