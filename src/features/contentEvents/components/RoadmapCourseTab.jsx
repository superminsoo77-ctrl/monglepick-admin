/**
 * 운영 도구 — 도장깨기(RoadmapCourse) 템플릿 관리 탭.
 *
 * 기능:
 * - 코스 목록 조회 (페이징, 활성/비활성 모두)
 * - 신규 등록 모달 (course_id UNIQUE — 중복 시 409)
 * - 수정 모달 (course_id 제외 모든 필드)
 * - 활성/비활성 토글 버튼
 *
 * 영화 선택:
 * - 제목 검색(GET /movies/search)으로 영화를 찾아 추가.
 * - 선택된 영화는 순서 유지(위/아래 이동 가능)되며 제출 시 movieIds 배열로 변환.
 *
 * 비활성화 정책:
 * - 사용자 진행 기록(user_course_progress)이 course_id slug로 코스를 참조하므로
 *   hard delete 불가. 더 이상 사용하지 않는 코스는 토글로 비활성화만 한다.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { MdRefresh, MdAdd, MdEdit, MdToggleOn, MdToggleOff, MdSearch, MdClose, MdArrowUpward, MdArrowDownward } from 'react-icons/md';
import {
  fetchCourses,
  createCourse,
  updateCourse,
  updateCourseActive,
  searchMovies,
} from '../api/roadmapCourseApi';

/** 페이지 크기 */
const PAGE_SIZE = 10;

/** 난이도 옵션 (Backend RoadmapCourse.Difficulty enum과 매칭) */
const DIFFICULTY_OPTIONS = [
  { value: 'beginner', label: '초급 (beginner)' },
  { value: 'intermediate', label: '중급 (intermediate)' },
  { value: 'advanced', label: '고급 (advanced)' },
];

/** 모달 모드 */
const MODE_CREATE = 'CREATE';
const MODE_EDIT = 'EDIT';

/** 빈 폼 초기값 */
const EMPTY_FORM = {
  courseId: '',
  title: '',
  description: '',
  theme: '',
  difficulty: 'beginner',
  quizEnabled: false,
};

export default function RoadmapCourseTab() {
  /* ── 목록 상태 ── */
  const [courses, setCourses] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* ── 모달 상태 ── */
  const [modalMode, setModalMode] = useState(null);
  const [editTargetId, setEditTargetId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  /* ── 영화 선택 상태 ── */
  const [selectedMovies, setSelectedMovies] = useState([]); // [{ movieId, title?, titleEn?, releaseYear?, director? }]
  const [movieKeyword, setMovieKeyword] = useState('');
  const [movieResults, setMovieResults] = useState([]);
  const [movieSearching, setMovieSearching] = useState(false);
  const [movieSearchError, setMovieSearchError] = useState(null);
  const searchDebounceRef = useRef(null);

  /* ── 토글 상태 ── */
  const [togglingId, setTogglingId] = useState(null);

  /** 목록 조회 */
  const loadCourses = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchCourses({ page, size: PAGE_SIZE });
      setCourses(result?.content ?? []);
      setTotalPages(result?.totalPages ?? 0);
    } catch (err) {
      setError(err.message || '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  /** 신규 등록 모달 열기 */
  function openCreateModal() {
    setForm(EMPTY_FORM);
    setSelectedMovies([]);
    setMovieKeyword('');
    setMovieResults([]);
    setMovieSearchError(null);
    setEditTargetId(null);
    setModalMode(MODE_CREATE);
  }

  /** 수정 모달 열기 — 기존 값 로드 */
  function openEditModal(item) {
    setForm({
      courseId: item.courseId ?? '',
      title: item.title ?? '',
      description: item.description ?? '',
      theme: item.theme ?? '',
      difficulty: item.difficulty ?? 'beginner',
      quizEnabled: !!item.quizEnabled,
    });
    // 수정 시 movieIds만 있으므로 ID로 초기 목록 구성 (제목은 검색 후 추가)
    setSelectedMovies(
      Array.isArray(item.movieIds)
        ? item.movieIds.map((id) => ({ movieId: String(id) }))
        : []
    );
    setMovieKeyword('');
    setMovieResults([]);
    setMovieSearchError(null);
    setEditTargetId(item.roadmapCourseId);
    setModalMode(MODE_EDIT);
  }

  /** 모달 닫기 */
  function closeModal() {
    setModalMode(null);
    setEditTargetId(null);
    setForm(EMPTY_FORM);
    setSelectedMovies([]);
    setMovieKeyword('');
    setMovieResults([]);
    setMovieSearchError(null);
    setSubmitting(false);
  }

  /** 폼 입력 핸들러 */
  function handleFormChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  }

  /* ── 영화 검색 ── */

  /** 영화 검색 실행 */
  async function runMovieSearch(keyword) {
    if (!keyword.trim()) {
      setMovieResults([]);
      return;
    }
    try {
      setMovieSearching(true);
      setMovieSearchError(null);
      const results = await searchMovies(keyword.trim(), 15);
      setMovieResults(Array.isArray(results) ? results : []);
    } catch {
      setMovieSearchError('검색 중 오류가 발생했습니다.');
      setMovieResults([]);
    } finally {
      setMovieSearching(false);
    }
  }

  function handleMovieKeywordChange(e) {
    const val = e.target.value;
    setMovieKeyword(val);
    // 디바운스 300ms
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => runMovieSearch(val), 300);
  }

  function handleMovieSearchKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(searchDebounceRef.current);
      runMovieSearch(movieKeyword);
    }
  }

  /** 영화 추가 (이미 추가된 경우 무시) */
  function addMovie(movie) {
    setSelectedMovies((prev) => {
      if (prev.some((m) => m.movieId === movie.movieId)) return prev;
      return [...prev, movie];
    });
  }

  /** 영화 제거 */
  function removeMovie(movieId) {
    setSelectedMovies((prev) => prev.filter((m) => m.movieId !== movieId));
  }

  /** 영화 순서 위로 */
  function moveMovieUp(index) {
    if (index === 0) return;
    setSelectedMovies((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }

  /** 영화 순서 아래로 */
  function moveMovieDown(index) {
    setSelectedMovies((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }

  /** 폼 제출 — CREATE/EDIT 분기 */
  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    if (selectedMovies.length === 0) {
      alert('영화를 1개 이상 추가하세요.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        title: form.title?.trim(),
        description: form.description || null,
        theme: form.theme || null,
        movieIds: selectedMovies.map((m) => m.movieId),
        difficulty: form.difficulty || 'beginner',
        quizEnabled: !!form.quizEnabled,
      };

      if (modalMode === MODE_CREATE) {
        payload.courseId = form.courseId?.trim();
        await createCourse(payload);
      } else if (modalMode === MODE_EDIT && editTargetId != null) {
        await updateCourse(editTargetId, payload);
      }
      closeModal();
      loadCourses();
    } catch (err) {
      alert(err.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  /** 활성/비활성 토글 */
  async function handleToggleActive(item) {
    if (togglingId === item.roadmapCourseId) return;
    try {
      setTogglingId(item.roadmapCourseId);
      await updateCourseActive(item.roadmapCourseId, !item.isActive);
      loadCourses();
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
        <ToolbarTitle>도장깨기 템플릿 관리</ToolbarTitle>
        <ToolbarRight>
          <PrimaryButton onClick={openCreateModal}>
            <MdAdd size={16} /> 신규 등록
          </PrimaryButton>
          <IconButton onClick={loadCourses} disabled={loading} title="새로고침">
            <MdRefresh size={16} />
          </IconButton>
        </ToolbarRight>
      </Toolbar>

      {/* ── 안내 문구 ── */}
      <HelperText>
        도장깨기 코스는 사용자 진행 기록과 연결되어 <strong>물리 삭제가 불가능합니다</strong>.
        더 이상 사용하지 않는 코스는 활성/비활성 토글로 관리하세요.
      </HelperText>

      {/* ── 에러 ── */}
      {error && <ErrorMsg>{error}</ErrorMsg>}

      {/* ── 테이블 ── */}
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th $w="60px">ID</Th>
              <Th $w="160px">슬러그</Th>
              <Th>제목</Th>
              <Th $w="100px">테마</Th>
              <Th $w="80px">영화수</Th>
              <Th $w="100px">난이도</Th>
              <Th $w="60px">퀴즈</Th>
              <Th $w="80px">활성</Th>
              <Th $w="180px">액션</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9}><CenterCell>불러오는 중...</CenterCell></td></tr>
            ) : courses.length === 0 ? (
              <tr><td colSpan={9}><CenterCell>등록된 코스가 없습니다.</CenterCell></td></tr>
            ) : (
              courses.map((item) => (
                <Tr key={item.roadmapCourseId}>
                  <Td><MutedText>{item.roadmapCourseId}</MutedText></Td>
                  <Td><CodeText>{item.courseId}</CodeText></Td>
                  <Td>
                    <NameText>{item.title}</NameText>
                    {item.description && <DescText>{item.description}</DescText>}
                  </Td>
                  <Td><MutedText>{item.theme ?? '-'}</MutedText></Td>
                  <Td><MutedText>{item.movieCount ?? 0}</MutedText></Td>
                  <Td><MutedText>{item.difficulty ?? '-'}</MutedText></Td>
                  <Td><MutedText>{item.quizEnabled ? 'O' : '-'}</MutedText></Td>
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
                        disabled={togglingId === item.roadmapCourseId}
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
              {modalMode === MODE_CREATE ? '도장깨기 코스 등록' : '도장깨기 코스 수정'}
            </DialogTitle>
            <form onSubmit={handleSubmit}>
              {/* 슬러그 */}
              <Field>
                <Label>코스 슬러그 (UNIQUE)</Label>
                <Input
                  type="text"
                  name="courseId"
                  value={form.courseId}
                  onChange={handleFormChange}
                  placeholder="예: nolan-filmography"
                  required={modalMode === MODE_CREATE}
                  disabled={modalMode === MODE_EDIT}
                  maxLength={50}
                />
                {modalMode === MODE_EDIT && (
                  <FieldHint>코스 슬러그는 사용자 진행 기록과 연결되어 변경 불가합니다.</FieldHint>
                )}
              </Field>
              {/* 제목 */}
              <Field>
                <Label>제목 *</Label>
                <Input
                  type="text"
                  name="title"
                  value={form.title}
                  onChange={handleFormChange}
                  placeholder="예: 크리스토퍼 놀란 필모그래피 정복"
                  required
                  maxLength={300}
                />
              </Field>
              {/* 설명 */}
              <Field>
                <Label>설명</Label>
                <Textarea
                  name="description"
                  value={form.description}
                  onChange={handleFormChange}
                  placeholder="코스 안내 문구"
                  rows={3}
                />
              </Field>
              {/* 테마 / 난이도 */}
              <FieldRow>
                <Field>
                  <Label>테마</Label>
                  <Input
                    type="text"
                    name="theme"
                    value={form.theme}
                    onChange={handleFormChange}
                    placeholder="감독별 / 장르별 / 시대별"
                    maxLength={100}
                  />
                </Field>
                <Field>
                  <Label>난이도</Label>
                  <Select name="difficulty" value={form.difficulty} onChange={handleFormChange}>
                    {DIFFICULTY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </Select>
                </Field>
              </FieldRow>

              {/* ── 영화 검색 & 선택 ── */}
              <Field>
                <Label>영화 목록 * ({selectedMovies.length}편 선택됨)</Label>

                {/* 검색 입력 */}
                <MovieSearchRow>
                  <MovieSearchInput
                    type="text"
                    value={movieKeyword}
                    onChange={handleMovieKeywordChange}
                    onKeyDown={handleMovieSearchKeyDown}
                    placeholder="영화 제목으로 검색 (한글/영문)"
                  />
                  <SearchIconButton
                    type="button"
                    onClick={() => { clearTimeout(searchDebounceRef.current); runMovieSearch(movieKeyword); }}
                    disabled={movieSearching}
                  >
                    <MdSearch size={16} />
                  </SearchIconButton>
                </MovieSearchRow>

                {/* 검색 결과 */}
                {movieSearchError && <FieldHint style={{ color: 'red' }}>{movieSearchError}</FieldHint>}
                {movieSearching && <FieldHint>검색 중...</FieldHint>}
                {!movieSearching && movieResults.length > 0 && (
                  <MovieResultList>
                    {movieResults.map((movie) => {
                      const alreadyAdded = selectedMovies.some((m) => m.movieId === movie.movieId);
                      return (
                        <MovieResultItem key={movie.movieId} $added={alreadyAdded}>
                          <MovieResultInfo>
                            <MovieResultTitle>
                              {movie.title}
                              {movie.titleEn && <MovieResultTitleEn> ({movie.titleEn})</MovieResultTitleEn>}
                            </MovieResultTitle>
                            <MovieResultMeta>
                              {[movie.releaseYear, movie.director].filter(Boolean).join(' · ')}
                              <MovieIdBadge>ID: {movie.movieId}</MovieIdBadge>
                            </MovieResultMeta>
                          </MovieResultInfo>
                          <AddMovieButton
                            type="button"
                            onClick={() => addMovie(movie)}
                            disabled={alreadyAdded}
                          >
                            {alreadyAdded ? '추가됨' : '+ 추가'}
                          </AddMovieButton>
                        </MovieResultItem>
                      );
                    })}
                  </MovieResultList>
                )}
                {!movieSearching && movieKeyword.trim() && movieResults.length === 0 && !movieSearchError && (
                  <FieldHint>검색 결과가 없습니다.</FieldHint>
                )}

                {/* 선택된 영화 목록 */}
                {selectedMovies.length > 0 ? (
                  <SelectedMovieList>
                    <SelectedMovieListHeader>선택된 영화 (순서 = 시청 권장 순서)</SelectedMovieListHeader>
                    {selectedMovies.map((movie, idx) => (
                      <SelectedMovieItem key={movie.movieId}>
                        <SelectedMovieOrder>{idx + 1}</SelectedMovieOrder>
                        <SelectedMovieInfo>
                          <SelectedMovieTitle>
                            {movie.title || <span style={{ color: '#aaa' }}>ID: {movie.movieId}</span>}
                          </SelectedMovieTitle>
                          {movie.title && (
                            <SelectedMovieMeta>
                              {[movie.releaseYear, movie.director].filter(Boolean).join(' · ')}
                              <MovieIdBadge>ID: {movie.movieId}</MovieIdBadge>
                            </SelectedMovieMeta>
                          )}
                        </SelectedMovieInfo>
                        <SelectedMovieActions>
                          <OrderButton type="button" onClick={() => moveMovieUp(idx)} disabled={idx === 0} title="위로">
                            <MdArrowUpward size={13} />
                          </OrderButton>
                          <OrderButton type="button" onClick={() => moveMovieDown(idx)} disabled={idx === selectedMovies.length - 1} title="아래로">
                            <MdArrowDownward size={13} />
                          </OrderButton>
                          <RemoveButton type="button" onClick={() => removeMovie(movie.movieId)} title="제거">
                            <MdClose size={13} />
                          </RemoveButton>
                        </SelectedMovieActions>
                      </SelectedMovieItem>
                    ))}
                  </SelectedMovieList>
                ) : (
                  <EmptyMovieHint>위에서 영화를 검색하여 추가하세요.</EmptyMovieHint>
                )}
              </Field>

              {/* 퀴즈 활성화 */}
              <Field>
                <CheckboxLabel>
                  <input
                    type="checkbox"
                    name="quizEnabled"
                    checked={form.quizEnabled}
                    onChange={handleFormChange}
                  />
                  <span>퀴즈 활성화 (코스 내 영화별 퀴즈 제공)</span>
                </CheckboxLabel>
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
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
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
  max-width: 640px;
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
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; outline: none; }
`;

const FieldHint = styled.span`
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const CheckboxLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
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

/* ── 영화 검색 UI ── */

const MovieSearchRow = styled.div`
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
`;

const MovieSearchInput = styled.input`
  flex: 1;
  padding: 7px 10px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.bgCard};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; outline: none; }
`;

const SearchIconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgHover};
  &:hover:not(:disabled) { border-color: ${({ theme }) => theme.colors.primary}; color: ${({ theme }) => theme.colors.primary}; }
  &:disabled { opacity: 0.4; }
`;

const MovieResultList = styled.ul`
  list-style: none;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 8px;
`;

const MovieResultItem = styled.li`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight};
  background: ${({ $added, theme }) => $added ? theme.colors.bgHover : 'transparent'};
  &:last-child { border-bottom: none; }
`;

const MovieResultInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const MovieResultTitle = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const MovieResultTitleEn = styled.span`
  font-weight: 400;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const MovieResultMeta = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textMuted};
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
`;

const MovieIdBadge = styled.span`
  font-family: 'Menlo', 'Monaco', monospace;
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 3px;
  background: ${({ theme }) => theme.colors.bgHover};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const AddMovieButton = styled.button`
  flex-shrink: 0;
  padding: 3px 10px;
  font-size: 12px;
  border: 1px solid ${({ theme }) => theme.colors.primary};
  border-radius: 3px;
  color: ${({ theme }) => theme.colors.primary};
  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.primary}; color: #fff; }
  &:disabled { opacity: 0.4; border-color: ${({ theme }) => theme.colors.border}; color: ${({ theme }) => theme.colors.textMuted}; }
`;

const SelectedMovieList = styled.ul`
  list-style: none;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  margin-top: 8px;
  max-height: 240px;
  overflow-y: auto;
`;

const SelectedMovieListHeader = styled.div`
  padding: 6px 10px;
  font-size: 11px;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textMuted};
  background: ${({ theme }) => theme.colors.bgHover};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const SelectedMovieItem = styled.li`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight};
  &:last-child { border-bottom: none; }
`;

const SelectedMovieOrder = styled.span`
  flex-shrink: 0;
  width: 20px;
  text-align: center;
  font-size: 11px;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textMuted};
`;

const SelectedMovieInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const SelectedMovieTitle = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const SelectedMovieMeta = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textMuted};
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
`;

const SelectedMovieActions = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
`;

const OrderButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 3px;
  color: ${({ theme }) => theme.colors.textMuted};
  &:hover:not(:disabled) { border-color: ${({ theme }) => theme.colors.primary}; color: ${({ theme }) => theme.colors.primary}; }
  &:disabled { opacity: 0.3; }
`;

const RemoveButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 3px;
  color: ${({ theme }) => theme.colors.textMuted};
  &:hover:not(:disabled) { border-color: #ef4444; color: #ef4444; }
`;

const EmptyMovieHint = styled.div`
  margin-top: 8px;
  padding: 12px;
  text-align: center;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  border: 1px dashed ${({ theme }) => theme.colors.border};
  border-radius: 4px;
`;
