/**
 * 운영 도구 — 업적(AchievementType) 마스터 관리 탭.
 *
 * 기능:
 * - 업적 마스터 목록 조회 (페이징, 활성/비활성 모두)
 * - 신규 등록 모달 (achievement_code UNIQUE 검증은 서버에서 409로 반환)
 * - 수정 모달 (코드 제외 표시명/설명/조건/보상/아이콘/카테고리)
 * - 활성/비활성 토글 버튼 (PATCH /active)
 *
 * 비활성화 정책:
 * - 사용자 달성 기록(user_achievement)이 FK로 마스터를 참조하므로 hard delete 불가
 * - 더 이상 사용하지 않는 업적은 토글로 비활성화만 한다 (기존 기록은 보존)
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { MdRefresh, MdAdd, MdEdit, MdToggleOn, MdToggleOff } from 'react-icons/md';
import {
  fetchAchievements,
  createAchievement,
  updateAchievement,
  updateAchievementActive,
} from '../api/achievementApi';
/* 2026-04-09 P2-⑬ 확장: 대량 CSV 등록 인프라 재사용 */
import CsvImportButton from '@/shared/components/CsvImportButton';

/** 페이지 크기 */
const PAGE_SIZE = 10;

/** 업적 카테고리 옵션 (Backend AchievementType.category 값과 동일) */
const CATEGORY_OPTIONS = [
  { value: '', label: '미분류' },
  { value: 'VIEWING', label: '시청 (VIEWING)' },
  { value: 'SOCIAL', label: '소셜 (SOCIAL)' },
  { value: 'COLLECTION', label: '수집 (COLLECTION)' },
  { value: 'CHALLENGE', label: '도전 (CHALLENGE)' },
];

/**
 * CSV 대량 등록 컬럼 정의 — 2026-04-09 P2-⑬.
 *
 * 기존 `createAchievement()` payload 와 필드명 1:1 일치. 기존 폼의 "빈 값 → null" 규칙을
 * transform 에서 동일하게 재현:
 * - `requiredCount`: 빈 값이면 null (쿼리 조건 없음), 값이 있으면 양수 정수
 * - `rewardPoints`: 빈 값이면 0 (기본값)
 * - `category`: 드롭다운 4종 중 하나 또는 빈 값 (미분류)
 *
 * 중복 `achievementCode` 는 Backend 에서 409 로 반환되어 실패 행 목록에 수집된다.
 *
 * ## 필수
 * - `achievementCode`: 시스템 식별자 (영문 대문자/언더스코어 권장)
 * - `achievementName`: 사용자 노출용 표시명
 *
 * ## 선택
 * - 나머지 5개 필드
 */
const CSV_IMPORT_COLUMNS = [
  {
    key: 'achievementCode',
    header: 'achievementCode',
    required: true,
    description: '시스템 식별자 (예: FIRST_REVIEW, WATCH_100)',
    example: 'FIRST_REVIEW',
    example2: 'WATCH_100',
  },
  {
    key: 'achievementName',
    header: 'achievementName',
    required: true,
    description: '사용자 노출 표시명 (예: 첫 리뷰 작성)',
    example: '첫 리뷰 작성',
    example2: '100편 감상 달성',
  },
  {
    key: 'description',
    header: 'description',
    description: '업적 설명 (선택)',
    example: '첫 리뷰를 작성하면 획득',
    example2: '영화 100편 감상 시 획득',
  },
  {
    key: 'requiredCount',
    header: 'requiredCount',
    description: '달성 필요 횟수 (정수, 빈 값이면 null)',
    example: 1,
    example2: 100,
    transform: (raw) => {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) throw new Error('0 이상의 정수여야 합니다');
      return n;
    },
  },
  {
    key: 'rewardPoints',
    header: 'rewardPoints',
    description: '달성 보상 포인트 (정수, 기본 0)',
    example: 50,
    example2: 500,
    transform: (raw) => {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) throw new Error('0 이상의 정수여야 합니다');
      return n;
    },
  },
  {
    key: 'iconUrl',
    header: 'iconUrl',
    description: '아이콘 이미지 URL (선택)',
    example: 'https://example.com/icons/first-review.svg',
  },
  {
    key: 'category',
    header: 'category',
    description: 'VIEWING / SOCIAL / COLLECTION / CHALLENGE 중 하나 (선택)',
    example: 'SOCIAL',
    example2: 'VIEWING',
    transform: (raw) => {
      const allowed = ['VIEWING', 'SOCIAL', 'COLLECTION', 'CHALLENGE'];
      const upper = String(raw).toUpperCase();
      if (!allowed.includes(upper)) {
        throw new Error(`허용값: ${allowed.join(', ')}`);
      }
      return upper;
    },
  },
];

/** 모달 모드 */
const MODE_CREATE = 'CREATE';
const MODE_EDIT = 'EDIT';

/** 빈 폼 초기값 */
const EMPTY_FORM = {
  achievementCode: '',
  achievementName: '',
  description: '',
  requiredCount: '',
  rewardPoints: 0,
  iconUrl: '',
  category: '',
};

export default function AchievementMasterTab() {
  /* ── 목록 상태 ── */
  const [achievements, setAchievements] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* ── 모달 상태 ── */
  const [modalMode, setModalMode] = useState(null); // null | CREATE | EDIT
  const [editTargetId, setEditTargetId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  /* ── 토글 진행 상태 ── */
  const [togglingId, setTogglingId] = useState(null);

  /** 목록 조회 */
  const loadAchievements = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchAchievements({ page, size: PAGE_SIZE });
      setAchievements(result?.content ?? []);
      setTotalPages(result?.totalPages ?? 0);
    } catch (err) {
      setError(err.message || '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadAchievements();
  }, [loadAchievements]);

  /** 신규 등록 모달 열기 */
  function openCreateModal() {
    setForm(EMPTY_FORM);
    setEditTargetId(null);
    setModalMode(MODE_CREATE);
  }

  /** 수정 모달 열기 — 기존 값을 폼에 로드 */
  function openEditModal(item) {
    setForm({
      achievementCode: item.achievementCode ?? '',
      achievementName: item.achievementName ?? '',
      description: item.description ?? '',
      requiredCount: item.requiredCount ?? '',
      rewardPoints: item.rewardPoints ?? 0,
      iconUrl: item.iconUrl ?? '',
      category: item.category ?? '',
    });
    setEditTargetId(item.achievementTypeId);
    setModalMode(MODE_EDIT);
  }

  /** 모달 닫기 */
  function closeModal() {
    setModalMode(null);
    setEditTargetId(null);
    setForm(EMPTY_FORM);
    setSubmitting(false);
  }

  /** 폼 입력 핸들러 */
  function handleFormChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  /** 폼 제출 — CREATE/EDIT 분기 */
  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    try {
      setSubmitting(true);
      // requiredCount/rewardPoints는 빈 문자열이면 null로 변환
      const payload = {
        achievementName: form.achievementName?.trim(),
        description: form.description || null,
        requiredCount: form.requiredCount === '' ? null : Number(form.requiredCount),
        rewardPoints: form.rewardPoints === '' ? 0 : Number(form.rewardPoints),
        iconUrl: form.iconUrl || null,
        category: form.category || null,
      };

      if (modalMode === MODE_CREATE) {
        // 신규: achievementCode 포함
        payload.achievementCode = form.achievementCode?.trim();
        await createAchievement(payload);
      } else if (modalMode === MODE_EDIT && editTargetId != null) {
        // 수정: achievementCode 제외
        await updateAchievement(editTargetId, payload);
      }
      closeModal();
      loadAchievements();
    } catch (err) {
      alert(err.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  /** 활성/비활성 토글 */
  async function handleToggleActive(item) {
    if (togglingId === item.achievementTypeId) return;
    try {
      setTogglingId(item.achievementTypeId);
      await updateAchievementActive(item.achievementTypeId, !item.isActive);
      loadAchievements();
    } catch (err) {
      alert(err.message || '상태 변경 중 오류가 발생했습니다.');
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <Container>
      {/* ── 툴바 ── */}
      <Toolbar>
        <ToolbarTitle>업적 마스터 관리</ToolbarTitle>
        <ToolbarRight>
          <PrimaryButton onClick={openCreateModal}>
            <MdAdd size={16} /> 신규 등록
          </PrimaryButton>
          {/*
            CSV 대량 등록 — 2026-04-09 P2-⑬ 확장.
            `createAchievement()` 를 행별로 순차 호출. 중복 achievementCode 는
            Backend 409 로 반환되어 실패 행 목록에 수집된다.
          */}
          <CsvImportButton
            label="CSV 가져오기"
            columns={CSV_IMPORT_COLUMNS}
            onRowImport={createAchievement}
            onComplete={(result) => {
              if (result.succeeded > 0) loadAchievements();
            }}
            disabled={loading}
            templateName="achievements"
          />
          <IconButton onClick={loadAchievements} disabled={loading} title="새로고침">
            <MdRefresh size={16} />
          </IconButton>
        </ToolbarRight>
      </Toolbar>

      {/* ── 안내 문구 ── */}
      <HelperText>
        업적은 사용자 달성 기록과 연결되어 있어 <strong>물리 삭제가 불가능합니다</strong>.
        더 이상 사용하지 않는 업적은 활성/비활성 토글로 관리하세요.
      </HelperText>

      {/* ── 에러 메시지 ── */}
      {error && <ErrorMsg>{error}</ErrorMsg>}

      {/* ── 테이블 ── */}
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th $w="60px">ID</Th>
              <Th $w="180px">코드</Th>
              <Th>표시명</Th>
              <Th $w="100px">카테고리</Th>
              <Th $w="80px">조건</Th>
              <Th $w="80px">보상P</Th>
              <Th $w="80px">활성</Th>
              <Th $w="180px">액션</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8}><CenterCell>불러오는 중...</CenterCell></td></tr>
            ) : achievements.length === 0 ? (
              <tr><td colSpan={8}><CenterCell>등록된 업적이 없습니다.</CenterCell></td></tr>
            ) : (
              achievements.map((item) => (
                <Tr key={item.achievementTypeId}>
                  <Td><MutedText>{item.achievementTypeId}</MutedText></Td>
                  <Td><CodeText>{item.achievementCode}</CodeText></Td>
                  <Td>
                    <NameText>{item.achievementName}</NameText>
                    {item.description && <DescText>{item.description}</DescText>}
                  </Td>
                  <Td><MutedText>{item.category ?? '-'}</MutedText></Td>
                  <Td><MutedText>{item.requiredCount ?? '-'}</MutedText></Td>
                  <Td><MutedText>{(item.rewardPoints ?? 0).toLocaleString()}</MutedText></Td>
                  <Td>
                    <StatusPill $active={item.isActive}>
                      {item.isActive ? '활성' : '비활성'}
                    </StatusPill>
                  </Td>
                  <Td>
                    <ActionGroup>
                      <SmallButton onClick={() => openEditModal(item)}>
                        <MdEdit size={13} /> 수정
                      </SmallButton>
                      <SmallButton
                        onClick={() => handleToggleActive(item)}
                        disabled={togglingId === item.achievementTypeId}
                        title={item.isActive ? '비활성화' : '활성화'}
                      >
                        {item.isActive ? <MdToggleOff size={14} /> : <MdToggleOn size={14} />}
                        {item.isActive ? ' 비활성화' : ' 활성화'}
                      </SmallButton>
                    </ActionGroup>
                  </Td>
                </Tr>
              ))
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
          <PageInfo>{page + 1} / {totalPages}</PageInfo>
          <PageButton onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= totalPages}>
            다음
          </PageButton>
        </Pagination>
      )}

      {/* ── 등록/수정 모달 ── */}
      {modalMode && (
        <Overlay onClick={closeModal}>
          <DialogBox onClick={(e) => e.stopPropagation()}>
            <DialogTitle>
              {modalMode === MODE_CREATE ? '업적 마스터 등록' : '업적 마스터 수정'}
            </DialogTitle>
            <form onSubmit={handleSubmit}>
              {/* 코드 — 신규 등록 시에만 입력 가능 */}
              <Field>
                <Label>업적 코드 (UNIQUE)</Label>
                <Input
                  type="text"
                  name="achievementCode"
                  value={form.achievementCode}
                  onChange={handleFormChange}
                  placeholder="예: course_complete"
                  required={modalMode === MODE_CREATE}
                  disabled={modalMode === MODE_EDIT}
                  maxLength={50}
                />
                {modalMode === MODE_EDIT && (
                  <FieldHint>업적 코드는 사용자 달성 기록과 연결되어 변경 불가합니다.</FieldHint>
                )}
              </Field>
              {/* 표시명 */}
              <Field>
                <Label>표시명 *</Label>
                <Input
                  type="text"
                  name="achievementName"
                  value={form.achievementName}
                  onChange={handleFormChange}
                  placeholder="예: 코스 완주"
                  required
                  maxLength={100}
                />
              </Field>
              {/* 설명 */}
              <Field>
                <Label>설명</Label>
                <Textarea
                  name="description"
                  value={form.description}
                  onChange={handleFormChange}
                  placeholder="달성 조건 및 안내 문구"
                  rows={3}
                />
              </Field>
              {/* 카테고리 */}
              <Field>
                <Label>카테고리</Label>
                <Select name="category" value={form.category} onChange={handleFormChange}>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </Select>
              </Field>
              {/* 조건 횟수 / 보상 포인트 */}
              <FieldRow>
                <Field>
                  <Label>달성 조건 횟수</Label>
                  <Input
                    type="number"
                    name="requiredCount"
                    value={form.requiredCount}
                    onChange={handleFormChange}
                    min={0}
                    placeholder="비워두면 1회"
                  />
                </Field>
                <Field>
                  <Label>보상 포인트</Label>
                  <Input
                    type="number"
                    name="rewardPoints"
                    value={form.rewardPoints}
                    onChange={handleFormChange}
                    min={0}
                  />
                </Field>
              </FieldRow>
              {/* 아이콘 URL */}
              <Field>
                <Label>아이콘 URL</Label>
                <Input
                  type="text"
                  name="iconUrl"
                  value={form.iconUrl}
                  onChange={handleFormChange}
                  placeholder="https://..."
                  maxLength={500}
                />
              </Field>
              {/* 액션 */}
              <DialogFooter>
                <CancelButton type="button" onClick={closeModal}>취소</CancelButton>
                <PrimaryButton type="submit" disabled={submitting}>
                  {submitting ? '저장 중...' : '저장'}
                </PrimaryButton>
              </DialogFooter>
            </form>
          </DialogBox>
        </Overlay>
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
  margin-bottom: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const ToolbarTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ToolbarRight = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const HelperText = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  background: ${({ theme }) => theme.colors.bgHover};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-radius: 4px;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  border-left: 3px solid ${({ theme }) => theme.colors.primary};
`;

const ErrorMsg = styled.p`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  margin-bottom: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.errorBg};
  border-radius: 4px;
`;

const PrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 14px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  border-radius: 4px;
  &:hover:not(:disabled) { opacity: 0.9; }
  &:disabled { opacity: 0.5; }
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
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
  &:disabled { opacity: 0.4; }
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
  &:last-child { border-bottom: none; }
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
`;

const Td = styled.td`
  padding: 10px 12px;
  color: ${({ theme }) => theme.colors.textPrimary};
  vertical-align: middle;
`;

const CodeText = styled.code`
  display: inline-block;
  font-family: 'Menlo', 'Monaco', monospace;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 3px;
  background: ${({ theme }) => theme.colors.bgHover};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const NameText = styled.div`
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const DescText = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  margin-top: 2px;
`;

const MutedText = styled.span`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.xs};
`;

const StatusPill = styled.span`
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  border-radius: 10px;
  color: #fff;
  background: ${({ $active, theme }) =>
    $active ? theme.colors.success ?? '#10b981' : theme.colors.textMuted};
`;

const ActionGroup = styled.div`
  display: flex;
  gap: 4px;
`;

const SmallButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px 8px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 3px;
  color: ${({ theme }) => theme.colors.textSecondary};
  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.primary};
  }
  &:disabled { opacity: 0.4; }
`;

const CenterCell = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xxxl};
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.sm};
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
  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.bgHover}; }
  &:disabled { opacity: 0.4; }
`;

const PageInfo = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
`;

/* ── 모달 ── */

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
`;

const DialogBox = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  width: 100%;
  max-width: 540px;
  max-height: 90vh;
  overflow-y: auto;
  padding: ${({ theme }) => theme.spacing.xxl};
  box-shadow: ${({ theme }) => theme.shadows.lg};
`;

const DialogTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Field = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.md};
  flex: 1;
`;

const FieldRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Label = styled.label`
  display: block;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 4px;
`;

const Input = styled.input`
  width: 100%;
  padding: 7px 10px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.bgCard};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; outline: none; }
  &:disabled { background: ${({ theme }) => theme.colors.bgHover}; opacity: 0.7; }
`;

const Textarea = styled.textarea`
  width: 100%;
  padding: 7px 10px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  resize: vertical;
  background: ${({ theme }) => theme.colors.bgCard};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; outline: none; }
`;

const Select = styled.select`
  width: 100%;
  padding: 7px 10px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.bgCard};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; outline: none; }
`;

const FieldHint = styled.span`
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const DialogFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.lg};
`;

const CancelButton = styled.button`
  padding: 7px 16px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgCard};
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
`;
