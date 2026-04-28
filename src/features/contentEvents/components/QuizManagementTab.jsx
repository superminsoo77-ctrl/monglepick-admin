/**
 * 운영 도구 — 퀴즈(Quiz) 관리 탭.
 *
 * 기능:
 * - 퀴즈 목록 조회 (페이징 + 상태 필터)
 * - 신규 등록 모달 (PENDING 상태로 INSERT)
 * - 수정 모달 (movieId/question/explanation/correctAnswer/options/rewardPoint/quizDate)
 * - 상태 전이 버튼 (PENDING→APPROVED/REJECTED, APPROVED→PUBLISHED/REJECTED 등)
 * - 삭제 버튼 (PENDING/REJECTED만 hard delete 허용)
 *
 * 상태 전이 정책:
 * - PENDING   → APPROVED, REJECTED
 * - APPROVED  → PUBLISHED, REJECTED
 * - REJECTED  → PENDING (재검수)
 * - PUBLISHED → REJECTED (긴급 회수)
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { MdRefresh, MdAdd, MdEdit, MdDelete } from 'react-icons/md';
import {
  fetchQuizzes,
  createQuiz,
  updateQuiz,
  updateQuizStatus,
  deleteQuiz,
} from '../api/quizApi';
/*
 * 2026-04-14: 운영자가 movie_id(VARCHAR PK) 를 외워 입력하던 부담을 제거하기 위해
 * 영화 제목 기반 Autocomplete(MovieSearchPicker) 로 전환한다.
 *
 *  - 상단 필터 바의 "영화 ID (부분 일치)" 텍스트 입력 → MovieSearchPicker
 *    * state: movieIdFilter(string) → filterMovie(Movie|null)
 *    * loadQuizzes 는 filterMovie?.movieId 만 추출해 Backend 에 전달 (API 시그니처 불변)
 *  - 신규/수정 모달의 "영화 ID (선택)" 텍스트 입력 → MovieSearchPicker
 *    * state: form.movieId(string) → formMovie(Movie|null)
 *    * 편집 모드 진입 시 fetchMovieDetail(item.movieId) 로 chip 복원
 *
 * Backend `AdminQuizRepository.searchByFilters()` 는 movieId 를 부분 일치 LIKE 로 받지만
 * 정확한 PK 를 보내도 동일하게 매칭되므로 기존 JPQL 수정 없음.
 */
import MovieSearchPicker from '@/shared/components/MovieSearchPicker';
import { normalizeMovie } from '@/shared/components/movieSearchPickerUtils';
import { fetchMovieDetail } from '@/features/data/api/dataApi';
import { useAiPrefill } from '@/shared/hooks/useAiPrefill';
import AiPrefillBanner from '@/shared/components/AiPrefillBanner';

/** 페이지 크기 */
const PAGE_SIZE = 10;

/** 상태 필터 옵션 */
const STATUS_FILTER_OPTIONS = [
  { value: '', label: '전체 상태' },
  { value: 'PENDING', label: '검수 대기 (PENDING)' },
  { value: 'APPROVED', label: '검수 통과 (APPROVED)' },
  { value: 'REJECTED', label: '탈락 (REJECTED)' },
  { value: 'PUBLISHED', label: '출제 중 (PUBLISHED)' },
];

/** 상태별 색상 (배지) */
const STATUS_COLOR = {
  PENDING: '#f59e0b',
  APPROVED: '#3b82f6',
  REJECTED: '#ef4444',
  PUBLISHED: '#10b981',
};

/**
 * 상태별 가능한 전이 액션 (Backend AdminQuizService.STATUS_TRANSITIONS와 동일).
 */
const STATUS_TRANSITION_BUTTONS = {
  PENDING: [
    { label: '승인', target: 'APPROVED' },
    { label: '탈락', target: 'REJECTED' },
  ],
  APPROVED: [
    { label: '출제', target: 'PUBLISHED' },
    { label: '탈락', target: 'REJECTED' },
  ],
  REJECTED: [
    { label: '재검수', target: 'PENDING' },
  ],
  PUBLISHED: [
    { label: '회수', target: 'REJECTED' },
  ],
};

/** 모달 모드 */
const MODE_CREATE = 'CREATE';
const MODE_EDIT = 'EDIT';

/**
 * 빈 폼 초기값.
 *
 * 2026-04-14: movieId 는 별도 state(formMovie: Movie|null)로 분리했다.
 * MovieSearchPicker 가 전체 영화 객체(movieId/title/...)를 넘겨주므로 form 내부에
 * 문자열로 들고 있을 필요가 없어졌다. 제출 시 formMovie?.movieId 를 그대로 사용.
 */
/**
 * EMPTY_FORM.options 는 A~D 순서의 4개 문자열 배열.
 *
 * QA #76 (2026-04-23): JSON textarea → 4지선다 개별 입력 필드로 전환.
 * - Backend Quiz.options 는 여전히 JSON 문자열 컬럼이므로 제출 직전 `JSON.stringify(filtered)` 로 직렬화.
 * - 주관식(options 모두 공란)은 `null` 로 Backend 에 전달.
 * - 편집 모드에서는 기존 JSON 을 파싱해 4칸에 복원하며, 파싱 실패 시 빈 4칸으로 시작.
 */
const EMPTY_FORM = {
  question: '',
  explanation: '',
  correctAnswer: '',
  options: ['', '', '', ''],
  rewardPoint: 10,
  quizDate: '',
};

/** 4지선다 라벨 (UI 전용, Backend 저장 시에는 지문 문자열만 배열로 직렬화) */
const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

/**
 * Backend 에서 내려온 options JSON 문자열을 4칸 배열로 복원한다.
 *
 * - 정상 JSON 배열이면 앞에서 4개만 취해 빈 칸은 '' 로 패딩.
 * - 문자열이 아닌 경우(null/undefined/배열 자체) 도 안전하게 처리.
 * - 파싱 실패 시 빈 4칸 반환 — 운영자는 기존 데이터를 잃지 않고 다시 입력할 수 있도록 유도.
 */
function parseOptionsJson(raw) {
  const fallback = ['', '', '', ''];
  if (raw == null || raw === '') return fallback;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return fallback;
    return [0, 1, 2, 3].map((i) => (typeof parsed[i] === 'string' ? parsed[i] : ''));
  } catch {
    return fallback;
  }
}

/**
 * @param {Object} props
 * @param {string|null} [props.aiModal] - ContentEventsPage 가 전달하는 queryModal 값.
 *   'create' 이면 AI 어시스턴트 draft prefill 과 함께 신규 등록 모달을 자동 오픈한다.
 */
export default function QuizManagementTab({ aiModal }) {
  /* ── AI prefill (quiz_draft: ?tab=quiz&modal=create) ── */
  const { draft, bannerText } = useAiPrefill();

  /* ── 목록 상태 ── */
  const [quizzes, setQuizzes] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /*
   * ── 서버 사이드 복합 필터 (2026-04-09 P1-⑫ 전역 검색 승급) ──
   *
   * 이 파일의 최초 MVP (2026-04-09 오전) 는 클라이언트 측 `filteredQuizzes` 로 현재
   * 페이지(10건) 내에서만 필터링했으나, 같은 날 Backend `AdminQuizRepository.searchByFilters()`
   * JPQL 을 추가하여 DB 전역 검색으로 승급되었다.
   *
   * state 이름과 UI 는 유지하고 `loadQuizzes()` 의 params 객체에 직접 전달한다.
   * 클라이언트 필터링(`filteredQuizzes`) 은 제거되었고, `quizzes` 배열을 그대로 렌더링한다.
   * 필터 변경 시 `page` 를 0 으로 리셋하여 전역 검색 결과의 첫 페이지가 표시되도록 한다.
   */
  /**
   * 상단 필터 바의 "영화" 필터.
   *
   * 2026-04-14: 텍스트 입력(movieIdFilter:string) → MovieSearchPicker(filterMovie:Movie|null)
   * 로 승급. Backend 파라미터 시그니처(movieId:string)는 그대로이며,
   * loadQuizzes 에서 filterMovie?.movieId 만 추출해 전달한다.
   */
  const [filterMovie, setFilterMovie] = useState(null);
  const [keywordFilter, setKeywordFilter] = useState('');
  const [fromDateFilter, setFromDateFilter] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');
  /** 전역 검색 결과 총 건수 — UI 상태 라벨에 표시 */
  const [totalElements, setTotalElements] = useState(0);

  /* ── 모달 상태 ── */
  const [modalMode, setModalMode] = useState(null);
  const [editTargetId, setEditTargetId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  /**
   * 모달 내부의 "영화" 선택 상태.
   *
   * 2026-04-14: form.movieId(string) 을 MovieSearchPicker 와 궁합이 맞도록 Movie 객체로
   * 분리했다. null 이면 "영화 선택 없음(일반 퀴즈)" 을 의미하며 제출 시 movieId=null 로 보낸다.
   */
  const [formMovie, setFormMovie] = useState(null);
  /** 편집 모드에서 기존 movieId 로 영화 상세를 불러오는 중인지 여부 */
  const [formMovieLoading, setFormMovieLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /* ── 작업 진행 상태 ── */
  const [busyId, setBusyId] = useState(null);

  /**
   * 목록 조회 — 2026-04-09 P1-⑫ 서버 전역 검색으로 승급.
   *
   * 모든 필터 state 를 params 에 직접 실어 Backend 로 전달한다. 빈 문자열/빈 값은
   * 포함하지 않아 axios URLSearchParams 에 나타나지 않으며, Backend 에서는
   * `@RequestParam(required=false)` 로 null 수신하여 JPQL `:param IS NULL` 조건이
   * 활성화된다.
   */
  const loadQuizzes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = { page, size: PAGE_SIZE };
      if (statusFilter) params.status = statusFilter;
      /* 2026-04-14: MovieSearchPicker 로 선택된 영화가 있을 때만 movieId 파라미터 전달.
       * Backend 시그니처(@RequestParam String movieId)는 변경 없음. */
      if (filterMovie?.movieId) params.movieId = filterMovie.movieId;
      if (keywordFilter.trim()) params.keyword = keywordFilter.trim();
      if (fromDateFilter) params.fromDate = fromDateFilter;
      if (toDateFilter)   params.toDate   = toDateFilter;

      const result = await fetchQuizzes(params);
      setQuizzes(result?.content ?? []);
      setTotalPages(result?.totalPages ?? 0);
      setTotalElements(result?.totalElements ?? 0);
    } catch (err) {
      setError(err.message || '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, filterMovie, keywordFilter, fromDateFilter, toDateFilter]);

  // ──────────────────────────────────────────────
  // 추가 필터 상태 헬퍼 (2026-04-09 P1-⑫ 전역 검색)
  // ──────────────────────────────────────────────

  /** status 외 추가 필터가 하나라도 적용되어 있는지 */
  const hasExtraFilter =
    !!filterMovie ||
    !!keywordFilter.trim() ||
    !!fromDateFilter ||
    !!toDateFilter;

  /** 추가 필터 전체 초기화 (status 는 별도 드롭다운이므로 유지) */
  function handleClearExtraFilters() {
    setFilterMovie(null);
    setKeywordFilter('');
    setFromDateFilter('');
    setToDateFilter('');
    setPage(0);
  }

  useEffect(() => {
    loadQuizzes();
  }, [loadQuizzes]);

  /**
   * aiModal='create' 일 때 신규 등록 모달을 자동 오픈.
   * draft 가 있으면 quiz_draft 필드(question/choices→options/answerIndex→correctAnswer/explanation)를
   * 폼 초기값으로 주입한다.
   *
   * draft_fields: movieId, question, choices(string[]), answerIndex(number), explanation
   */
  useEffect(() => {
    if (aiModal !== 'create' || modalMode !== null) return;

    const prefill = draft
      ? {
          ...EMPTY_FORM,
          question:      draft.question    ?? EMPTY_FORM.question,
          explanation:   draft.explanation ?? EMPTY_FORM.explanation,
          /* choices(string[]) → 4칸 배열. 빈 칸은 '' 로 패딩. */
          options: Array.isArray(draft.choices)
            ? [0, 1, 2, 3].map((i) => draft.choices[i] ?? '')
            : EMPTY_FORM.options,
          /* answerIndex(0-based) → 해당 보기 텍스트를 correctAnswer 로 변환. */
          correctAnswer:
            typeof draft.answerIndex === 'number' && Array.isArray(draft.choices)
              ? (draft.choices[draft.answerIndex] ?? EMPTY_FORM.correctAnswer)
              : EMPTY_FORM.correctAnswer,
        }
      : EMPTY_FORM;

    /* movieId draft 가 있으면 MovieSearchPicker chip 도 초기화 */
    if (draft?.movieId) {
      fetchMovieDetail(draft.movieId)
        .then((detail) => {
          const normalized = normalizeMovie(detail);
          if (normalized) setFormMovie(normalized);
        })
        .catch(() => {
          setFormMovie({ movieId: String(draft.movieId), title: draft.movieId, titleEn: '', releaseYear: '', posterPath: '' });
        });
    }

    setForm(prefill);
    setEditTargetId(null);
    setModalMode(MODE_CREATE);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiModal]);

  /** 상태 필터 변경 — 첫 페이지로 초기화 */
  function handleStatusFilterChange(e) {
    setStatusFilter(e.target.value);
    setPage(0);
  }

  /** 신규 등록 모달 */
  function openCreateModal() {
    setForm(EMPTY_FORM);
    setFormMovie(null);
    setEditTargetId(null);
    setModalMode(MODE_CREATE);
  }

  /**
   * 수정 모달 — 기존 값 로드.
   *
   * 2026-04-14: movieId 문자열이 아니라 MovieSearchPicker chip 으로 복원한다.
   * 퀴즈 목록 응답에는 영화 제목이 없어서(`item.movieId` 만 보유) Agent 의
   * `fetchMovieDetail(movieId)` 를 비동기 호출해 title/titleEn/releaseYear 를 얻는다.
   * 실패하더라도 chip 은 최소한 movieId 만 가진 객체로 복원해 운영자가 해제 후
   * 다시 검색할 수 있도록 한다.
   */
  function openEditModal(item) {
    setForm({
      question: item.question ?? '',
      explanation: item.explanation ?? '',
      correctAnswer: item.correctAnswer ?? '',
      /* QA #76: Backend 의 options JSON 문자열을 4칸 배열로 복원. */
      options: parseOptionsJson(item.options),
      rewardPoint: item.rewardPoint ?? 10,
      quizDate: item.quizDate ?? '',
    });
    setEditTargetId(item.quizId);
    setModalMode(MODE_EDIT);

    /* 영화 chip 복원 */
    if (item.movieId) {
      setFormMovieLoading(true);
      /* 제목 로딩 중에도 운영자가 즉시 식별할 수 있도록 movieId 만 먼저 세팅 */
      setFormMovie({
        movieId: String(item.movieId),
        title: item.movieId,
        titleEn: '',
        releaseYear: '',
        posterPath: '',
      });
      fetchMovieDetail(item.movieId)
        .then((detail) => {
          const normalized = normalizeMovie(detail);
          if (normalized) setFormMovie(normalized);
        })
        .catch(() => {
          /* 상세 실패 시 movieId-only chip 유지. 운영자는 해제 후 다시 검색 가능. */
        })
        .finally(() => setFormMovieLoading(false));
    } else {
      setFormMovie(null);
    }
  }

  /** 모달 닫기 */
  function closeModal() {
    setModalMode(null);
    setEditTargetId(null);
    setForm(EMPTY_FORM);
    setFormMovie(null);
    setFormMovieLoading(false);
    setSubmitting(false);
  }

  /** 폼 입력 핸들러 (단일 필드) */
  function handleFormChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  /**
   * 4지선다 개별 지문 입력 핸들러.
   *
   * QA #76: JSON textarea 를 4개 입력 필드로 분리하면서 인덱스 기반 업데이트가 필요.
   * prev.options 배열을 복사해 해당 인덱스만 교체한다 (immutable update).
   */
  function handleOptionChange(index, value) {
    setForm((prev) => {
      const next = Array.isArray(prev.options) ? [...prev.options] : ['', '', '', ''];
      next[index] = value;
      return { ...prev, options: next };
    });
  }

  /** 폼 제출 */
  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    try {
      setSubmitting(true);
      /* QA #76: 4칸 지문을 공백 제거 후 빈 문자열 제거 → 2개 이상이면 JSON 직렬화.
       * - 2개 미만이면 객관식이 성립하지 않으므로 null 로 저장(주관식 퀴즈). */
      const trimmedOptions = (form.options ?? [])
        .map((o) => (o ?? '').trim())
        .filter(Boolean);
      if (trimmedOptions.length > 0 && trimmedOptions.length < 2) {
        alert('객관식 퀴즈는 최소 2개 이상의 선택지가 필요합니다. (주관식은 4칸 모두 비워두세요.)');
        setSubmitting(false);
        return;
      }
      const optionsJson = trimmedOptions.length >= 2 ? JSON.stringify(trimmedOptions) : null;

      const payload = {
        /* 2026-04-14: MovieSearchPicker 로 선택된 영화의 movieId 만 추출.
         * 영화 선택 없음(일반 퀴즈) 일 경우 null — Backend 는 nullable 허용. */
        movieId: formMovie?.movieId || null,
        question: form.question?.trim(),
        explanation: form.explanation || null,
        correctAnswer: form.correctAnswer?.trim(),
        options: optionsJson,
        rewardPoint: form.rewardPoint === '' ? 10 : Number(form.rewardPoint),
        quizDate: form.quizDate || null,
      };

      if (modalMode === MODE_CREATE) {
        // 신규 등록 — generateQuiz 는 quizDate 미지원이므로 본문만 전달
        await createQuiz({
          movieId: payload.movieId,
          question: payload.question,
          correctAnswer: payload.correctAnswer,
          options: payload.options,
          explanation: payload.explanation,
          rewardPoint: payload.rewardPoint,
        });
      } else if (modalMode === MODE_EDIT && editTargetId != null) {
        await updateQuiz(editTargetId, payload);
      }
      closeModal();
      loadQuizzes();
    } catch (err) {
      alert(err.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  /** 상태 전이 */
  async function handleTransition(item, targetStatus) {
    if (busyId === item.quizId) return;
    if (!confirm(`퀴즈 #${item.quizId}를 ${targetStatus} 상태로 전이합니다. 진행하시겠습니까?`)) {
      return;
    }
    try {
      setBusyId(item.quizId);
      await updateQuizStatus(item.quizId, targetStatus);
      loadQuizzes();
    } catch (err) {
      alert(err.message || '상태 전이 실패');
    } finally {
      setBusyId(null);
    }
  }

  /** 삭제 */
  async function handleDelete(item) {
    if (busyId === item.quizId) return;
    if (!confirm(`퀴즈 #${item.quizId}를 삭제합니다. 이 작업은 되돌릴 수 없습니다.`)) {
      return;
    }
    try {
      setBusyId(item.quizId);
      await deleteQuiz(item.quizId);
      loadQuizzes();
    } catch (err) {
      alert(err.message || '삭제 실패');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Container>
      {/* ── 툴바 (서버 필터 + 액션 버튼) ── */}
      <Toolbar>
        <ToolbarLeft>
          <ToolbarTitle>퀴즈 관리</ToolbarTitle>
          <FilterSelect value={statusFilter} onChange={handleStatusFilterChange}>
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </FilterSelect>
        </ToolbarLeft>
        <ToolbarRight>
          <PrimaryButton onClick={openCreateModal}>
            <MdAdd size={16} /> 신규 등록
          </PrimaryButton>
          <IconButton onClick={loadQuizzes} disabled={loading} title="새로고침">
            <MdRefresh size={16} />
          </IconButton>
        </ToolbarRight>
      </Toolbar>

      {/*
        복합 필터 바 — 2026-04-09 P1-⑫ (전역 검색 승급).
        최초 MVP 는 클라이언트 측 filter 였으나, 같은 날 Backend `searchByFilters()` JPQL 추가로
        서버 전역 검색으로 승급되었다. 각 입력의 onChange 에서 `setPage(0)` 으로 첫 페이지 리셋.
        styled-components 이름(`ClientFilterBar` 등)은 호환성 유지 위해 그대로 둔다.
      */}
      <ClientFilterBar>
        {/*
         * 2026-04-14: 영화 ID 텍스트 입력 → MovieSearchPicker.
         * 운영자는 영화 제목으로 검색해 선택하고, Backend 에는 선택된 영화의 movieId 만 전달된다.
         * 선택/해제 시 페이지를 0으로 리셋해 새 필터 결과의 첫 페이지가 표시되게 한다.
         */}
        <FilterMoviePickerWrap>
          <MovieSearchPicker
            selectedMovie={filterMovie}
            onChange={(m) => { setFilterMovie(m); setPage(0); }}
            placeholder="영화 제목으로 검색"
          />
        </FilterMoviePickerWrap>
        <ClientFilterInput
          type="text"
          value={keywordFilter}
          onChange={(e) => { setKeywordFilter(e.target.value); setPage(0); }}
          placeholder="문제/정답/해설 키워드"
          maxLength={100}
          $flex
        />
        <ClientDateGroup>
          <ClientDateLabel>출제일</ClientDateLabel>
          <ClientFilterDate
            type="date"
            value={fromDateFilter}
            onChange={(e) => { setFromDateFilter(e.target.value); setPage(0); }}
            max={toDateFilter || undefined}
            title="시작 출제일 (inclusive)"
          />
          <ClientDateSep>~</ClientDateSep>
          <ClientFilterDate
            type="date"
            value={toDateFilter}
            onChange={(e) => { setToDateFilter(e.target.value); setPage(0); }}
            min={fromDateFilter || undefined}
            title="종료 출제일 (inclusive)"
          />
        </ClientDateGroup>
        {hasExtraFilter && (
          <ClientFilterResetButton type="button" onClick={handleClearExtraFilters}>
            필터 초기화
          </ClientFilterResetButton>
        )}
      </ClientFilterBar>

      {/* ── 안내 ──
       *   원본 영문 상태 흐름(PENDING→APPROVED/REJECTED …)은 운영자 친화적이지 않아
       *   한국어 라벨 기준으로 다시 정리한다. 상태 라벨은 STATUS_FILTER_OPTIONS 와 일관.
       */}
      <HelperText>
        <strong>상태 전이 규칙</strong>
        <TransitionList>
          <li><StatusChip $color={STATUS_COLOR.PENDING}>검수 대기</StatusChip> → 승인 / 탈락</li>
          <li><StatusChip $color={STATUS_COLOR.APPROVED}>검수 통과</StatusChip> → 출제 / 탈락</li>
          <li><StatusChip $color={STATUS_COLOR.REJECTED}>탈락</StatusChip> → 재검수(대기 복귀)</li>
          <li><StatusChip $color={STATUS_COLOR.PUBLISHED}>출제 중</StatusChip> → 긴급 회수(탈락)</li>
        </TransitionList>
        <strong>삭제는 '검수 대기' 또는 '탈락' 상태에서만 가능합니다.</strong>
        {hasExtraFilter && (
          <>
            {' '}
            <em>
              ※ 영화 / 키워드 / 출제일 필터는 <strong>DB 전역 검색</strong>으로
              적용됩니다 (총 {totalElements.toLocaleString()}건).
            </em>
          </>
        )}
      </HelperText>

      {error && <ErrorMsg>{error}</ErrorMsg>}

      {/* ── 테이블 ── */}
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th $w="60px">ID</Th>
              <Th $w="100px">영화ID</Th>
              <Th>문제</Th>
              <Th $w="100px">정답</Th>
              <Th $w="80px">보상P</Th>
              <Th $w="100px">상태</Th>
              <Th $w="100px">출제일</Th>
              <Th $w="280px">액션</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8}><CenterCell>불러오는 중...</CenterCell></td></tr>
            ) : quizzes.length === 0 ? (
              /*
                2026-04-09 P1-⑫ 전역 검색 승급 후: 서버가 빈 페이지를 반환하는 경우를 통합 처리.
                필터가 걸려 있으면 "필터 조건에 해당 없음" / 없으면 "등록 데이터 없음" 분기.
              */
              <tr>
                <td colSpan={8}>
                  <CenterCell>
                    {hasExtraFilter || statusFilter
                      ? '지정한 필터 조건에 해당하는 퀴즈가 없습니다.'
                      : '등록된 퀴즈가 없습니다.'}
                  </CenterCell>
                </td>
              </tr>
            ) : (
              quizzes.map((item) => (
                <Tr key={item.quizId}>
                  <Td><MutedText>{item.quizId}</MutedText></Td>
                  <Td><MutedText>{item.movieId ?? '-'}</MutedText></Td>
                  <Td>
                    <QuestionText>{item.question}</QuestionText>
                  </Td>
                  <Td><MutedText>{item.correctAnswer ?? '-'}</MutedText></Td>
                  <Td><MutedText>{(item.rewardPoint ?? 0).toLocaleString()}</MutedText></Td>
                  <Td>
                    <StatusPill $color={STATUS_COLOR[item.status] ?? '#888'}>
                      {item.status}
                    </StatusPill>
                  </Td>
                  <Td><MutedText>{item.quizDate ?? '-'}</MutedText></Td>
                  <Td>
                    <ActionGroup>
                      <SmallButton onClick={() => openEditModal(item)} title="수정">
                        <MdEdit size={13} /> 수정
                      </SmallButton>
                      {(STATUS_TRANSITION_BUTTONS[item.status] ?? []).map((btn) => (
                        <SmallButton
                          key={btn.target}
                          onClick={() => handleTransition(item, btn.target)}
                          disabled={busyId === item.quizId}
                          title={`${item.status} → ${btn.target}`}
                        >
                          {btn.label}
                        </SmallButton>
                      ))}
                      {(item.status === 'PENDING' || item.status === 'REJECTED') && (
                        <DangerSmallButton
                          onClick={() => handleDelete(item)}
                          disabled={busyId === item.quizId}
                          title="삭제"
                        >
                          <MdDelete size={13} /> 삭제
                        </DangerSmallButton>
                      )}
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
              {modalMode === MODE_CREATE ? '퀴즈 신규 등록 (PENDING)' : '퀴즈 수정'}
            </DialogTitle>
            <form onSubmit={handleSubmit}>
              {/* ── AI 어시스턴트 prefill 안내 배너 (quiz_draft 가 있을 때만 노출) ── */}
              {bannerText && <AiPrefillBanner text={bannerText} />}

              <FieldRow>
                <Field>
                  {/*
                   * 2026-04-14: 영화 ID 텍스트 입력 → MovieSearchPicker.
                   * 일반 퀴즈(영화 불특정) 는 선택하지 않고 그대로 제출하면 되며,
                   * 편집 모드에서는 openEditModal 이 기존 movieId 로 상세를 조회해 chip 을 복원한다.
                   */}
                  <Label>
                    영화 (선택){formMovieLoading && <LoadingHint> · 영화 정보 로딩 중...</LoadingHint>}
                  </Label>
                  <MovieSearchPicker
                    selectedMovie={formMovie}
                    onChange={setFormMovie}
                    placeholder="영화 제목으로 검색 (일반 퀴즈는 비워둠)"
                  />
                </Field>
                <Field>
                  <Label>보상 포인트</Label>
                  <Input
                    type="number"
                    name="rewardPoint"
                    value={form.rewardPoint}
                    onChange={handleFormChange}
                    min={0}
                  />
                </Field>
              </FieldRow>
              <Field>
                <Label>문제 *</Label>
                <Textarea
                  name="question"
                  value={form.question}
                  onChange={handleFormChange}
                  required
                  rows={3}
                  placeholder="퀴즈 문제 본문"
                />
              </Field>
              <Field>
                <Label>정답 *</Label>
                <Input
                  type="text"
                  name="correctAnswer"
                  value={form.correctAnswer}
                  onChange={handleFormChange}
                  required
                  maxLength={500}
                  placeholder="예: A 또는 정답 본문"
                />
              </Field>
              <Field>
                {/*
                 * QA #76 (2026-04-23): JSON textarea → 4지선다 개별 입력.
                 * 운영자는 A/B/C/D 각 지문을 평문으로 입력하고, 제출 직전에 JSON 배열로 직렬화된다.
                 * 주관식 퀴즈를 등록하려면 4칸 모두 공란으로 둔다.
                 * "정답" 필드에는 정답 지문 본문 또는 "A"/"B"/"C"/"D" 라벨을 입력한다 (Backend 동일).
                 */}
                <Label>선택지 (4지선다 · 객관식만)</Label>
                <OptionList>
                  {OPTION_LETTERS.map((letter, i) => (
                    <OptionRow key={letter}>
                      <OptionLetter>{letter}</OptionLetter>
                      <Input
                        type="text"
                        value={form.options?.[i] ?? ''}
                        onChange={(e) => handleOptionChange(i, e.target.value)}
                        maxLength={200}
                        placeholder={`${letter} 지문`}
                      />
                    </OptionRow>
                  ))}
                </OptionList>
                <FieldHint>
                  주관식 퀴즈는 4칸 모두 비워두세요. 2개 이상 입력 시 객관식으로 저장됩니다.
                  정답 필드에는 지문 본문 또는 A/B/C/D 라벨을 입력합니다.
                </FieldHint>
              </Field>
              <Field>
                <Label>해설</Label>
                <Textarea
                  name="explanation"
                  value={form.explanation}
                  onChange={handleFormChange}
                  rows={2}
                  placeholder="정답 해설 (선택)"
                />
              </Field>
              {/* quizDate 는 신규 등록 EP 미지원 — 수정 모달에서만 노출 */}
              {modalMode === MODE_EDIT && (
                <Field>
                  <Label>출제 예정일 (YYYY-MM-DD)</Label>
                  <Input
                    type="date"
                    name="quizDate"
                    value={form.quizDate}
                    onChange={handleFormChange}
                  />
                </Field>
              )}
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

/**
 * 복합 필터 바 안에 들어가는 MovieSearchPicker 래퍼.
 *
 * 2026-04-14: ClientFilterBar 는 flex-row 컨테이너인데 MovieSearchPicker 의 Wrapper
 * 가 `width: 100%` 라 의도보다 크게 늘어나므로 고정 폭(260px)으로 제한한다.
 * 드롭다운(position: absolute)은 Wrapper 에 붙어있어 그대로 잘 렌더된다.
 */
const FilterMoviePickerWrap = styled.div`
  width: 260px;
  max-width: 260px;
  flex: 0 0 auto;
`;

/** 수정 모달에서 영화 상세 로딩 중임을 알리는 인라인 힌트 */
const LoadingHint = styled.span`
  color: ${({ theme }) => theme.colors.textMuted};
  font-weight: ${({ theme }) => theme.fontWeights.regular};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  margin-left: 4px;
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const ToolbarLeft = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;
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

const FilterSelect = styled.select`
  padding: 6px 10px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.bgCard};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; outline: none; }
`;

const HelperText = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  background: ${({ theme }) => theme.colors.bgHover};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-radius: 4px;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  border-left: 3px solid ${({ theme }) => theme.colors.primary};
  line-height: 1.55;
`;

/**
 * 상태 전이 규칙을 시각적으로 정렬해 보여주는 세로 리스트.
 * 원본 영문(PENDING→APPROVED …) 대신 한국어 Chip + 화살표로 운영자 가독성 향상.
 */
const TransitionList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 6px 0 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  li {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
`;

/** 상태 라벨 Chip — STATUS_COLOR 와 동일한 색상 팔레트 사용. */
const StatusChip = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  background: ${({ $color }) => `${$color}22`};
  color: ${({ $color }) => $color};
  border: 1px solid ${({ $color }) => `${$color}55`};
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

const QuestionText = styled.div`
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  max-width: 400px;
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
  background: ${({ $color }) => $color};
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

const DangerSmallButton = styled(SmallButton)`
  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.error};
    color: ${({ theme }) => theme.colors.error};
  }
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
  max-width: 600px;
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

const FieldHint = styled.span`
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textMuted};
`;

/* QA #76 — 4지선다 입력 그룹 */
const OptionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const OptionRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

/** A/B/C/D 라벨 — 고정 폭 원형 배지로 각 지문 입력란을 시각 구분 */
const OptionLetter = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.bgHover};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 11px;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  border: 1px solid ${({ theme }) => theme.colors.border};
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

// ──────────────────────────────────────────────
// 클라이언트 필터 바 (2026-04-09 P1-⑫ 신규)
// ──────────────────────────────────────────────

/**
 * 퀴즈 목록 위에 표시되는 클라이언트 측 필터 바.
 * 텍스트 입력 2개(영화 ID / 키워드) + 날짜 범위(시작~종료) + 리셋 버튼을 가로 배치.
 * 좁은 화면에서는 자동 줄바꿈한다.
 */
const ClientFilterBar = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
  background: ${({ theme }) => theme.colors.bgHover};
  border: 1px solid ${({ theme }) => theme.colors.borderLight};
  border-radius: 6px;
`;

/**
 * 클라이언트 필터 텍스트 입력.
 * $flex=true 면 남은 공간을 채움 — 키워드 입력처럼 넓게 써야 할 때 사용.
 */
const ClientFilterInput = styled.input`
  height: 30px;
  padding: 0 10px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  background: #ffffff;
  color: ${({ theme }) => theme.colors.textPrimary};
  min-width: 140px;
  ${({ $flex }) => $flex && 'flex: 1; min-width: 180px;'}

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

/** 출제일 범위 입력 그룹 — 라벨 + date + 물결 + date */
const ClientDateGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const ClientDateLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  margin-right: 2px;
  white-space: nowrap;
`;

const ClientFilterDate = styled.input`
  height: 30px;
  padding: 0 6px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  background: #ffffff;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const ClientDateSep = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
`;

/** 필터 전체 초기화 outline 버튼 — 필터가 하나라도 적용된 경우에만 표시 */
const ClientFilterResetButton = styled.button`
  height: 30px;
  padding: 0 12px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  white-space: nowrap;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    background: ${({ theme }) => theme.colors.bgHover};
    color: ${({ theme }) => theme.colors.textPrimary};
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;
