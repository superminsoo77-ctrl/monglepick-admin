/**
 * 운영 도구 — 리워드 정책(RewardPolicy) 관리 탭.
 *
 * 기능:
 * - 정책 목록 조회 (페이징)
 * - 신규 정책 등록 모달
 * - 정책 수정 모달 (actionType 제외, 변경 사유 입력)
 * - 활성/비활성 토글
 * - 변경 이력 패널 (INSERT-ONLY 원장 표시)
 *
 * 운영 주의:
 * - actionType은 시스템 식별 코드. 신규 등록 시에만 입력 가능
 * - 모든 변경 작업은 RewardPolicyHistory에 자동 기록 (변경/삭제 불가)
 * - 폐지된 정책은 hard delete 미지원, 활성/비활성 토글만 가능
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { MdRefresh, MdAdd, MdEdit, MdToggleOn, MdToggleOff, MdHistory } from 'react-icons/md';
import {
  fetchRewardPolicies,
  fetchRewardPolicyHistory,
  createRewardPolicy,
  updateRewardPolicy,
  updateRewardPolicyActive,
} from '../api/rewardPolicyApi';
/* 2026-04-09 P2-⑬ 확장: 대량 CSV 등록 인프라 재사용 */
import CsvImportButton from '@/shared/components/CsvImportButton';
/* 2026-04-09 P2-⑰ 확장: 전체 정책 변경 이력 대시보드 모달 */
import PolicyHistoryDashboardModal from './PolicyHistoryDashboardModal';
/* v3 Phase G P1-B: AI 어시스턴트 draft 주입 인프라 */
import { useQueryParams } from '@/shared/hooks/useQueryParams';
import { useAiPrefill } from '@/shared/hooks/useAiPrefill';
import AiPrefillBanner from '@/shared/components/AiPrefillBanner';

const PAGE_SIZE = 10;

/** 활동 카테고리 옵션 */
const CATEGORY_OPTIONS = [
  { value: 'CONTENT', label: 'CONTENT (콘텐츠 생산)' },
  { value: 'ENGAGEMENT', label: 'ENGAGEMENT (참여)' },
  { value: 'MILESTONE', label: 'MILESTONE (마일스톤)' },
  { value: 'ATTENDANCE', label: 'ATTENDANCE (출석)' },
];

/** 포인트 유형 */
const POINT_TYPES = [
  { value: 'earn', label: 'earn (등급 배율 적용)' },
  { value: 'bonus', label: 'bonus (고정 보너스)' },
];

/**
 * CSV 대량 등록 컬럼 정의 — 2026-04-09 P2-⑬ (2026-04-14 템플릿 가독성 개편).
 *
 * RewardPolicy 는 14개 필드 중 대부분이 숫자/선택 필드이고, Backend `createRewardPolicy()` 는
 * `changeReason` 을 필수로 받는다 (정책 변경 이력 INSERT-ONLY 원장 기록용). CSV 행에도
 * `changeReason` 컬럼이 있어야 하며, 값이 없으면 기본 "신규 정책 CSV 일괄 등록" 으로 채운다.
 *
 * ## 설계 주의
 *
 * - **actionType 신규 등록 한정**: 수정은 CSV 임포트로 하지 않는다. 기존 actionType 과 충돌 시
 *   Backend 에서 409 로 반환되어 실패 목록에 수집된다. 업데이트가 필요하면 개별 수정 모달 사용.
 * - **RewardPolicy 이력 테이블**: 각 row 가 성공적으로 등록되면 `RewardPolicyHistory` 에 자동
 *   INSERT 되므로 이력 추적이 보장된다.
 * - **정수 필드 기본 0**: 기존 폼이 `toIntOrZero()` 로 빈 값을 0 으로 변환하는 것과 동일하게
 *   CSV 에서도 생략 시 0 으로 간주하도록 transform 에서 빈 값이 들어오면 0 을 반환한다.
 *   단, CSV 의 빈 셀은 `rowToPayload()` 에서 이미 제외되므로 transform 이 호출되지 않는다.
 *   따라서 빈 값은 payload 에서 아예 빠지고 Backend 가 기본값(0)을 쓴다.
 *
 * ## 2026-04-14 개편 내역 — 템플릿 가독성 문제 해결
 *
 * 1. **영문 헤더 → 한글 헤더**: CSV 를 Excel 로 열었을 때 `actionType`, `limitType` 같은
 *    DB 컬럼명이 그대로 노출되는 문제를 해결. 헤더를 "액션 코드", "제한 유형" 등 한글로 바꾸되
 *    각 헤더에 `(필수)` / `(허용: CONTENT/ENGAGEMENT/...)` / `(0=무제한)` 같은 인라인 힌트를 넣어
 *    운영자가 템플릿만 보고도 의미를 파악할 수 있게 했다.
 * 2. **파서는 `col.header` 로 매칭**하므로 헤더만 바꿔도 임포트는 그대로 동작한다.
 *    Backend payload 필드명은 `col.key` (영문 그대로) 이므로 서버 계약은 불변.
 * 3. **예시 행 4건으로 확장**: 기존 CONTENT 2건 → CONTENT/CONTENT/ATTENDANCE/MILESTONE 4건.
 *    출석(일일 한도), 업적(총한도=1, bonus 타입) 등 특수 케이스를 보여 주어 운영자가 각 필드의
 *    실제 의미를 예시로 학습할 수 있게 한다. `example3`/`example4` 는 `downloadCsvTemplate()` 이
 *    2026-04-14 확장으로 자동 지원한다.
 * 4. **description 강화**: 미리보기 모달의 "필수/설명" 컬럼에 노출되는 문구를 구체화하여
 *    허용값·단위·기본값·예시를 모두 한 줄로 담았다.
 */
const CSV_IMPORT_COLUMNS = [
  {
    key: 'actionType',
    header: '액션 코드 (필수)',
    required: true,
    description:
      '정책을 식별하는 시스템 코드. UNIQUE 제약이며 대문자+언더스코어 권장. ' +
      '예: POST_CREATE, REVIEW_WRITE, ATTENDANCE_DAILY, ACHIEVEMENT_UNLOCK',
    example: 'POST_CREATE',
    example2: 'REVIEW_WRITE',
    example3: 'ATTENDANCE_DAILY',
    example4: 'ACHIEVEMENT_FIRST_REVIEW',
  },
  {
    key: 'activityName',
    header: '활동명 (필수)',
    required: true,
    description: '관리자 화면 / 사용자에게 노출되는 한국어 활동명',
    example: '게시글 작성',
    example2: '리뷰 작성',
    example3: '일일 출석',
    example4: '첫 리뷰 작성 업적',
  },
  {
    key: 'actionCategory',
    header: '카테고리 (필수, CONTENT/ENGAGEMENT/MILESTONE/ATTENDANCE)',
    required: true,
    description:
      '활동 분류 — CONTENT(콘텐츠 작성: 게시글·리뷰), ENGAGEMENT(참여: 좋아요·댓글), ' +
      'MILESTONE(업적·마일스톤), ATTENDANCE(출석·연속 출석) 중 하나',
    example: 'CONTENT',
    example2: 'CONTENT',
    example3: 'ATTENDANCE',
    example4: 'MILESTONE',
    transform: (raw) => {
      const allowed = ['CONTENT', 'ENGAGEMENT', 'MILESTONE', 'ATTENDANCE'];
      const upper = String(raw).toUpperCase();
      if (!allowed.includes(upper)) {
        throw new Error(`허용값: ${allowed.join(', ')}`);
      }
      return upper;
    },
  },
  {
    key: 'pointsAmount',
    header: '지급 포인트 (필수, 정수)',
    required: true,
    description: '활동 완료 시 지급되는 포인트 수량. 1P=10원. 정수만 허용',
    example: 10,
    example2: 20,
    example3: 5,
    example4: 100,
    transform: (raw) => {
      const n = Number(raw);
      if (!Number.isInteger(n)) throw new Error('정수여야 합니다');
      return n;
    },
  },
  {
    key: 'pointType',
    header: '포인트 유형 (earn / bonus, 기본 earn)',
    description:
      '포인트 지급 방식 — earn: 사용자 등급 배율(×1.0~×1.5) 적용되는 일반 획득 / ' +
      'bonus: 등급 배율 미적용 고정 보너스(업적·이벤트용). 생략 시 earn',
    example: 'earn',
    example2: 'earn',
    example3: 'earn',
    example4: 'bonus',
    transform: (raw) => {
      const v = String(raw).toLowerCase();
      if (!['earn', 'bonus'].includes(v)) {
        throw new Error('earn 또는 bonus');
      }
      return v;
    },
  },
  {
    key: 'dailyLimit',
    header: '일일 한도 횟수 (0=무제한)',
    description: '하루 동안 이 활동으로 포인트를 받을 수 있는 최대 횟수. 0이면 무제한',
    example: 5,
    example2: 3,
    example3: 1,
    example4: 0,
    transform: (raw) => {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) throw new Error('0 이상의 정수');
      return n;
    },
  },
  {
    key: 'maxCount',
    header: '평생 총 한도 (0=무제한)',
    description: '한 사용자가 이 활동으로 포인트를 받을 수 있는 누적 최대 횟수. 0이면 무제한. 업적처럼 1회성이면 1',
    example: 0,
    example2: 0,
    example3: 0,
    example4: 1,
    transform: (raw) => {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) throw new Error('0 이상의 정수');
      return n;
    },
  },
  {
    key: 'cooldownSeconds',
    header: '쿨다운 초 (0=없음)',
    description: '직전 획득 이후 다음 획득까지 필요한 대기 시간(초). 0이면 쿨다운 없음. 예: 300(5분)',
    example: 0,
    example2: 0,
    example3: 0,
    example4: 0,
    transform: (raw) => {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) throw new Error('0 이상의 정수');
      return n;
    },
  },
  {
    key: 'minContentLength',
    header: '최소 글자 수 (0=제한없음)',
    description: '게시글·리뷰 등 콘텐츠 길이 요구 조건. 이 길이 미만이면 포인트 미지급. 0이면 길이 제한 없음',
    example: 20,
    example2: 100,
    example3: 0,
    example4: 0,
    transform: (raw) => {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) throw new Error('0 이상의 정수');
      return n;
    },
  },
  {
    key: 'limitType',
    header: '제한 유형 (선택, PER_TARGET / GLOBAL)',
    description:
      '한도 계산 범위 — PER_TARGET: 대상(게시글 ID·영화 ID)별로 한도 적용 ' +
      '(예: 같은 게시글에 좋아요 1회) / GLOBAL: 사용자 전역 한도. 비워두면 서버 기본값',
    example: 'PER_TARGET',
    example2: 'PER_TARGET',
    example3: 'GLOBAL',
    example4: 'GLOBAL',
  },
  {
    key: 'thresholdCount',
    header: '임계 횟수 (0=사용안함)',
    description: '누적 N회 도달 시에만 지급하는 조건. 업적·마일스톤에서 주로 사용. 0이면 조건 미사용',
    example: 0,
    example2: 0,
    example3: 0,
    example4: 1,
    transform: (raw) => {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) throw new Error('0 이상의 정수');
      return n;
    },
  },
  {
    key: 'thresholdTarget',
    header: '임계 대상 코드 (선택)',
    description: '임계 조건이 참조하는 대상 코드 (예: 업적 코드). 일반 정책은 비워 둠',
    example4: 'FIRST_REVIEW',
  },
  {
    key: 'parentActionType',
    header: '상위 액션 코드 (선택)',
    description: '계층 구조가 필요한 경우에만 상위 정책의 액션 코드를 지정. 대부분 비움',
  },
  {
    key: 'isActive',
    header: '활성 여부 (true / false, 기본 true)',
    description: '정책 활성 상태. true: 적용 / false: 비활성(지급 중단). 1/0/yes/no 도 허용',
    example: 'true',
    example2: 'true',
    example3: 'true',
    example4: 'true',
    transform: (raw) => {
      const v = String(raw).toLowerCase().trim();
      if (['true', '1', 'y', 'yes'].includes(v)) return true;
      if (['false', '0', 'n', 'no'].includes(v)) return false;
      throw new Error('true/false/1/0');
    },
  },
  {
    key: 'description',
    header: '정책 설명 (선택)',
    description: '관리자가 정책 의도를 기억할 수 있도록 상세 설명을 남겨 두는 자유 텍스트',
    example: '일반 게시글 작성 시 10P 지급 (20자 이상)',
    example2: '리뷰 작성 시 20P 지급 (100자 이상)',
    example3: '하루에 한 번 출석하면 5P 지급',
    example4: '최초 리뷰 작성 업적 달성 시 100P 보너스 (1회성)',
  },
  {
    key: 'changeReason',
    header: '변경 사유 (선택, 미입력 시 "신규 정책 CSV 일괄 등록")',
    description: '감사 로그(RewardPolicyHistory)에 기록되는 사유. 비워 두면 기본 문구로 자동 저장',
    example: 'CSV 초기 세팅',
    example2: 'CSV 초기 세팅',
    example3: 'CSV 초기 세팅',
    example4: 'CSV 초기 세팅',
    transform: (raw) => raw || '신규 정책 CSV 일괄 등록',
  },
];

const MODE_CREATE = 'CREATE';
const MODE_EDIT = 'EDIT';

const EMPTY_FORM = {
  actionType: '',
  activityName: '',
  actionCategory: 'CONTENT',
  pointsAmount: 0,
  pointType: 'earn',
  dailyLimit: 0,
  maxCount: 0,
  cooldownSeconds: 0,
  minContentLength: 0,
  limitType: '',
  thresholdCount: 0,
  thresholdTarget: '',
  parentActionType: '',
  isActive: true,
  description: '',
  changeReason: '',
};

export default function RewardPolicyTab() {
  const [policies, setPolicies] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [modalMode, setModalMode] = useState(null);
  const [editTargetId, setEditTargetId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState(null);

  /* ── v3 Phase G P1-B: AI 어시스턴트 자동 모달 오픈 ── */
  const queryParams = useQueryParams();
  const { draft, isAiGenerated, bannerText } = useAiPrefill();
  /** ?modal=create 자동 오픈은 마운트 1회만 실행 */
  const aiModalConsumedRef = useRef(false);

  /* ── 변경 이력 패널 (기존 — 개별 정책 단위) ── */
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  /*
   * ── 전체 변경 이력 대시보드 모달 상태 (2026-04-09 P2-⑰ 신규) ──
   *
   * 기존 `historyOpen` 은 개별 정책(`historyTarget`) 의 이력만 조회하는 용도인 반면,
   * 본 state 는 모든 정책의 변경 이력을 복합 필터로 통합 조회하는 대시보드 모달용.
   * 두 기능은 공존하며, 운영자는 필요에 따라 개별/전체 뷰를 선택한다.
   */
  const [dashboardOpen, setDashboardOpen] = useState(false);

  const loadPolicies = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchRewardPolicies({ page, size: PAGE_SIZE });
      setPolicies(result?.content ?? []);
      setTotalPages(result?.totalPages ?? 0);
    } catch (err) {
      setError(err.message || '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { loadPolicies(); }, [loadPolicies]);

  /* v3 Phase G P1-B: ?modal=create 진입 시 생성 모달 자동 오픈.
   * AI draft 가 있으면 draft.code → actionType, draft.pointAmount → pointsAmount,
   * draft.condition → description 으로 매핑해 폼 초기값 주입.
   * consumedRef 로 중복 발동을 차단한다. */
  useEffect(() => {
    if (aiModalConsumedRef.current) return;
    if (queryParams.modal !== 'create') return;
    aiModalConsumedRef.current = true;
    const prefill = isAiGenerated && draft
      ? {
          ...EMPTY_FORM,
          /* draft.code → actionType, draft.pointAmount → pointsAmount,
           * draft.condition → description 매핑 */
          actionType:   draft.code          ?? EMPTY_FORM.actionType,
          pointsAmount: draft.pointAmount   ?? EMPTY_FORM.pointsAmount,
          description:  draft.condition     ?? EMPTY_FORM.description,
        }
      : EMPTY_FORM;
    setForm(prefill);
    setEditTargetId(null);
    setModalMode(MODE_CREATE);
  }, [queryParams.modal, isAiGenerated, draft]);

  function openCreateModal() {
    setForm(EMPTY_FORM);
    setEditTargetId(null);
    setModalMode(MODE_CREATE);
  }

  function openEditModal(item) {
    setForm({
      actionType: item.actionType ?? '',
      activityName: item.activityName ?? '',
      actionCategory: item.actionCategory ?? 'CONTENT',
      pointsAmount: item.pointsAmount ?? 0,
      pointType: item.pointType ?? 'earn',
      dailyLimit: item.dailyLimit ?? 0,
      maxCount: item.maxCount ?? 0,
      cooldownSeconds: item.cooldownSeconds ?? 0,
      minContentLength: item.minContentLength ?? 0,
      limitType: item.limitType ?? '',
      thresholdCount: item.thresholdCount ?? 0,
      thresholdTarget: item.thresholdTarget ?? '',
      parentActionType: item.parentActionType ?? '',
      isActive: !!item.isActive,
      description: item.description ?? '',
      changeReason: '',
    });
    setEditTargetId(item.policyId);
    setModalMode(MODE_EDIT);
  }

  function closeModal() {
    setModalMode(null);
    setEditTargetId(null);
    setForm(EMPTY_FORM);
    setSubmitting(false);
  }

  function handleFormChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    try {
      setSubmitting(true);
      const toIntOrZero = (v) => (v === '' || v == null ? 0 : Number(v));
      if (modalMode === MODE_CREATE) {
        const payload = {
          actionType: form.actionType?.trim(),
          activityName: form.activityName?.trim(),
          actionCategory: form.actionCategory,
          pointsAmount: toIntOrZero(form.pointsAmount),
          pointType: form.pointType || 'earn',
          dailyLimit: toIntOrZero(form.dailyLimit),
          maxCount: toIntOrZero(form.maxCount),
          cooldownSeconds: toIntOrZero(form.cooldownSeconds),
          minContentLength: toIntOrZero(form.minContentLength),
          limitType: form.limitType || null,
          thresholdCount: toIntOrZero(form.thresholdCount),
          thresholdTarget: form.thresholdTarget || null,
          parentActionType: form.parentActionType || null,
          isActive: !!form.isActive,
          description: form.description || null,
          changeReason: form.changeReason || '신규 정책 등록',
        };
        await createRewardPolicy(payload);
      } else if (modalMode === MODE_EDIT && editTargetId != null) {
        const payload = {
          pointsAmount: toIntOrZero(form.pointsAmount),
          dailyLimit: toIntOrZero(form.dailyLimit),
          maxCount: toIntOrZero(form.maxCount),
          cooldownSeconds: toIntOrZero(form.cooldownSeconds),
          minContentLength: toIntOrZero(form.minContentLength),
          description: form.description || null,
          changeReason: form.changeReason || '정책 메타 수정',
        };
        await updateRewardPolicy(editTargetId, payload);
      }
      closeModal();
      loadPolicies();
    } catch (err) {
      alert(err.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(item) {
    if (busyId === item.policyId) return;
    const reason = prompt(
      `정책 "${item.actionType}"를 ${item.isActive ? '비활성화' : '활성화'}합니다.\n변경 사유를 입력하세요:`,
      item.isActive ? '정책 일시 중단' : '정책 재활성화'
    );
    if (reason == null) return;
    try {
      setBusyId(item.policyId);
      await updateRewardPolicyActive(item.policyId, !item.isActive, reason);
      loadPolicies();
    } catch (err) {
      alert(err.message || '상태 변경 실패');
    } finally {
      setBusyId(null);
    }
  }

  /** 변경 이력 패널 열기 */
  async function openHistory(item) {
    setHistoryOpen(true);
    setHistoryTarget(item);
    setHistory([]);
    try {
      setHistoryLoading(true);
      const result = await fetchRewardPolicyHistory(item.policyId);
      setHistory(Array.isArray(result) ? result : []);
    } catch (err) {
      alert(err.message || '이력 조회 실패');
    } finally {
      setHistoryLoading(false);
    }
  }

  function closeHistory() {
    setHistoryOpen(false);
    setHistoryTarget(null);
    setHistory([]);
  }

  return (
    <Container>
      <Toolbar>
        <ToolbarTitle>리워드 정책 관리</ToolbarTitle>
        <ToolbarRight>
          <PrimaryButton onClick={openCreateModal}>
            <MdAdd size={16} /> 신규 등록
          </PrimaryButton>
          {/*
            전체 변경 이력 대시보드 — 2026-04-09 P2-⑰ 신규.
            기존 행별 "이력" 버튼이 개별 정책 이력만 조회하는 반면, 본 버튼은 모든 정책의
            변경 이력을 복합 필터로 통합 조회하는 대시보드 모달을 연다. 운영 감사 관점에서
            "어떤 정책이 언제 누구에 의해 변경되었는가" 를 한 화면에서 파악한다.
          */}
          <HistoryDashboardButton
            type="button"
            onClick={() => setDashboardOpen(true)}
            disabled={loading}
            title="모든 정책의 변경 이력을 통합 조회"
          >
            <MdHistory size={16} />
            전체 변경 이력
          </HistoryDashboardButton>
          {/*
            CSV 대량 등록 — 2026-04-09 P2-⑬ 확장.
            `createRewardPolicy()` 를 행별로 순차 호출. 중복 actionType 은 Backend 409 로
            반환되어 실패 행 목록에 수집된다. 각 성공 행은 RewardPolicyHistory 에 자동 기록.
            수정은 CSV 로 하지 않고 개별 수정 모달을 사용한다 (ChangeReason 수동 입력 권장).
          */}
          <CsvImportButton
            label="CSV 가져오기"
            columns={CSV_IMPORT_COLUMNS}
            onRowImport={createRewardPolicy}
            onComplete={(result) => {
              if (result.succeeded > 0) loadPolicies();
            }}
            disabled={loading}
            templateName="reward_policies"
          />
          <IconButton onClick={loadPolicies} disabled={loading} title="새로고침">
            <MdRefresh size={16} />
          </IconButton>
        </ToolbarRight>
      </Toolbar>

      <HelperText>
        활동별 포인트 정책 마스터를 관리합니다. <strong>action_type</strong>은 시스템 식별 코드이며 신규 등록 시에만 입력 가능합니다.
        모든 변경 작업은 <strong>RewardPolicyHistory(INSERT-ONLY 원장)</strong>에 자동 기록되며, 이력은 수정·삭제할 수 없습니다.
      </HelperText>

      {error && <ErrorMsg>{error}</ErrorMsg>}

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th $w="60px">ID</Th>
              <Th $w="180px">활동 코드</Th>
              <Th>표시명</Th>
              <Th $w="100px">카테고리</Th>
              <Th $w="80px">포인트</Th>
              <Th $w="80px">유형</Th>
              <Th $w="80px">일한도</Th>
              <Th $w="80px">평한도</Th>
              <Th $w="80px">활성</Th>
              <Th $w="240px">액션</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10}><CenterCell>불러오는 중...</CenterCell></td></tr>
            ) : policies.length === 0 ? (
              <tr><td colSpan={10}><CenterCell>등록된 정책이 없습니다.</CenterCell></td></tr>
            ) : (
              policies.map((item) => (
                <Tr key={item.policyId}>
                  <Td><MutedText>{item.policyId}</MutedText></Td>
                  <Td><CodeText>{item.actionType}</CodeText></Td>
                  <Td>
                    <NameText>{item.activityName}</NameText>
                    {item.description && <DescText>{item.description}</DescText>}
                  </Td>
                  <Td><CategoryBadge>{item.actionCategory}</CategoryBadge></Td>
                  <Td><PointsText>{(item.pointsAmount ?? 0).toLocaleString()}P</PointsText></Td>
                  <Td><MutedText>{item.pointType ?? '-'}</MutedText></Td>
                  <Td><MutedText>{item.dailyLimit === 0 ? '∞' : item.dailyLimit}</MutedText></Td>
                  <Td><MutedText>{item.maxCount === 0 ? '∞' : item.maxCount}</MutedText></Td>
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
                        disabled={busyId === item.policyId}
                      >
                        {item.isActive ? <MdToggleOff size={14} /> : <MdToggleOn size={14} />}
                        {item.isActive ? ' 비활성' : ' 활성'}
                      </SmallButton>
                      <SmallButton onClick={() => openHistory(item)}>
                        <MdHistory size={13} /> 이력
                      </SmallButton>
                    </ActionGroup>
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </TableWrap>

      {totalPages > 1 && (
        <Pagination>
          <PageButton onClick={() => setPage((p) => p - 1)} disabled={page === 0}>이전</PageButton>
          <PageInfo>{page + 1} / {totalPages}</PageInfo>
          <PageButton onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= totalPages}>다음</PageButton>
        </Pagination>
      )}

      {/* ── 등록/수정 모달 ── */}
      {modalMode && (
        <Overlay onClick={closeModal}>
          <DialogBox onClick={(e) => e.stopPropagation()}>
            <DialogTitle>
              {modalMode === MODE_CREATE ? '리워드 정책 신규 등록' : '리워드 정책 수정'}
            </DialogTitle>
            {/* v3 Phase G P1-B: AI 어시스턴트 draft 주입 시 안내 배너 */}
            {modalMode === MODE_CREATE && isAiGenerated && (
              <AiPrefillBanner text={bannerText} />
            )}
            <form onSubmit={handleSubmit}>
              {modalMode === MODE_CREATE && (
                <FieldRow>
                  <Field>
                    <Label>활동 코드 (UNIQUE) *</Label>
                    <Input
                      type="text"
                      name="actionType"
                      value={form.actionType}
                      onChange={handleFormChange}
                      required
                      maxLength={50}
                      placeholder="예: REVIEW_CREATE, ATTENDANCE_BASE"
                    />
                  </Field>
                  <Field>
                    <Label>활동 표시명 *</Label>
                    <Input
                      type="text"
                      name="activityName"
                      value={form.activityName}
                      onChange={handleFormChange}
                      required
                      maxLength={100}
                    />
                  </Field>
                </FieldRow>
              )}
              {modalMode === MODE_CREATE && (
                <FieldRow>
                  <Field>
                    <Label>카테고리 *</Label>
                    <Select name="actionCategory" value={form.actionCategory} onChange={handleFormChange}>
                      {CATEGORY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field>
                    <Label>포인트 유형</Label>
                    <Select name="pointType" value={form.pointType} onChange={handleFormChange}>
                      {POINT_TYPES.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </Select>
                  </Field>
                </FieldRow>
              )}
              <FieldRow>
                <Field>
                  <Label>지급 포인트 *</Label>
                  <Input
                    type="number"
                    name="pointsAmount"
                    value={form.pointsAmount}
                    onChange={handleFormChange}
                    required
                    min="0"
                  />
                </Field>
                <Field>
                  <Label>일일 한도 (0=무제한)</Label>
                  <Input
                    type="number"
                    name="dailyLimit"
                    value={form.dailyLimit}
                    onChange={handleFormChange}
                    min="0"
                  />
                </Field>
                <Field>
                  <Label>평생 한도 (0=무제한)</Label>
                  <Input
                    type="number"
                    name="maxCount"
                    value={form.maxCount}
                    onChange={handleFormChange}
                    min="0"
                  />
                </Field>
              </FieldRow>
              <FieldRow>
                <Field>
                  <Label>쿨다운 (초)</Label>
                  <Input
                    type="number"
                    name="cooldownSeconds"
                    value={form.cooldownSeconds}
                    onChange={handleFormChange}
                    min="0"
                  />
                </Field>
                <Field>
                  <Label>최소 콘텐츠 길이</Label>
                  <Input
                    type="number"
                    name="minContentLength"
                    value={form.minContentLength}
                    onChange={handleFormChange}
                    min="0"
                  />
                </Field>
              </FieldRow>
              {modalMode === MODE_CREATE && (
                <FieldRow>
                  <Field>
                    <Label>limit_type (보조 분류)</Label>
                    <Input
                      type="text"
                      name="limitType"
                      value={form.limitType}
                      onChange={handleFormChange}
                      maxLength={20}
                      placeholder="ONCE / DAILY / STREAK / PER_REF"
                    />
                  </Field>
                  <Field>
                    <Label>thresholdTarget</Label>
                    <Input
                      type="text"
                      name="thresholdTarget"
                      value={form.thresholdTarget}
                      onChange={handleFormChange}
                      maxLength={30}
                      placeholder="TOTAL / DAILY / STREAK"
                    />
                  </Field>
                </FieldRow>
              )}
              {modalMode === MODE_CREATE && (
                <FieldRow>
                  <Field>
                    <Label>thresholdCount</Label>
                    <Input
                      type="number"
                      name="thresholdCount"
                      value={form.thresholdCount}
                      onChange={handleFormChange}
                      min="0"
                    />
                  </Field>
                  <Field>
                    <Label>parentActionType</Label>
                    <Input
                      type="text"
                      name="parentActionType"
                      value={form.parentActionType}
                      onChange={handleFormChange}
                      maxLength={50}
                      placeholder="예: REVIEW_CREATE (마일스톤만)"
                    />
                  </Field>
                </FieldRow>
              )}
              <Field>
                <Label>설명</Label>
                <Textarea
                  name="description"
                  value={form.description}
                  onChange={handleFormChange}
                  rows={2}
                  maxLength={500}
                  placeholder="정책 의도, 주의사항 등"
                />
              </Field>
              <Field>
                <Label>변경 사유 (이력 기록용)</Label>
                <Textarea
                  name="changeReason"
                  value={form.changeReason}
                  onChange={handleFormChange}
                  rows={2}
                  placeholder="이 변경의 사유를 입력하세요 (RewardPolicyHistory에 기록됨)"
                />
              </Field>
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

      {/* ── 변경 이력 패널 ── */}
      {historyOpen && (
        <Overlay onClick={closeHistory}>
          <DialogBox $wide onClick={(e) => e.stopPropagation()}>
            <DialogTitle>
              변경 이력 — {historyTarget?.actionType}
            </DialogTitle>
            <HistoryList>
              {historyLoading ? (
                <CenterCell>불러오는 중...</CenterCell>
              ) : history.length === 0 ? (
                <CenterCell>변경 이력이 없습니다.</CenterCell>
              ) : (
                history.map((h) => (
                  <HistoryItem key={h.historyId}>
                    <HistoryHead>
                      <span>
                        <strong>#{h.historyId}</strong> · {h.changedBy ?? 'SYSTEM'}
                      </span>
                      <MutedText>{h.createdAt}</MutedText>
                    </HistoryHead>
                    <HistoryReason>{h.changeReason}</HistoryReason>
                    {h.beforeValue && (
                      <HistoryDiff>
                        <DiffLabel>BEFORE</DiffLabel>
                        <DiffJson>{h.beforeValue}</DiffJson>
                      </HistoryDiff>
                    )}
                    <HistoryDiff>
                      <DiffLabel $after>AFTER</DiffLabel>
                      <DiffJson>{h.afterValue}</DiffJson>
                    </HistoryDiff>
                  </HistoryItem>
                ))
              )}
            </HistoryList>
            <DialogFooter>
              <CancelButton type="button" onClick={closeHistory}>닫기</CancelButton>
            </DialogFooter>
          </DialogBox>
        </Overlay>
      )}

      {/*
        전체 변경 이력 대시보드 모달 — 2026-04-09 P2-⑰.
        dashboardOpen=true 일 때만 내부 렌더링. 모든 정책의 변경 이력을
        복합 필터(policyId/changedBy/시간 범위)로 페이징 조회한다.
      */}
      <PolicyHistoryDashboardModal
        isOpen={dashboardOpen}
        onClose={() => setDashboardOpen(false)}
      />
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

/**
 * 전체 변경 이력 대시보드 버튼 — 2026-04-09 P2-⑰ 신규.
 * primary outline 스타일로 "신규 등록" primary 필드와 시각적 구분.
 * 운영 감사 관점의 조회 성격이므로 파괴적이지 않은 outline.
 */
const HistoryDashboardButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 14px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.primary};
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.primary};
  border-radius: 4px;
  transition: all ${({ theme }) => theme.transitions.fast};
  white-space: nowrap;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primaryLight};
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
  font-size: 11px;
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
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;
const CategoryBadge = styled.span`
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  border-radius: 10px;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgHover};
  border: 1px solid ${({ theme }) => theme.colors.border};
`;
const PointsText = styled.span`
  color: ${({ theme }) => theme.colors.primary};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  font-family: 'Menlo', 'Monaco', monospace;
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
  flex-wrap: wrap;
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
  background: ${({ theme }) => theme.colors.bgCard};
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
  max-width: ${({ $wide }) => ($wide ? '720px' : '640px')};
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
  font-family: inherit;
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

/* ── 변경 이력 ── */
const HistoryList = styled.div`
  max-height: 60vh;
  overflow-y: auto;
`;
const HistoryItem = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.borderLight};
  border-radius: 4px;
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;
const HistoryHead = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;
const HistoryReason = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;
const HistoryDiff = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;
const DiffLabel = styled.div`
  display: inline-block;
  padding: 2px 8px;
  font-size: 10px;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  border-radius: 3px;
  color: #fff;
  background: ${({ $after, theme }) =>
    $after ? theme.colors.success ?? '#10b981' : theme.colors.textMuted};
  margin-bottom: 4px;
`;
const DiffJson = styled.pre`
  font-family: 'Menlo', 'Monaco', monospace;
  font-size: 11px;
  background: ${({ theme }) => theme.colors.bgHover};
  padding: ${({ theme }) => theme.spacing.sm};
  border-radius: 3px;
  white-space: pre-wrap;
  word-break: break-all;
  color: ${({ theme }) => theme.colors.textSecondary};
  max-height: 200px;
  overflow-y: auto;
`;
