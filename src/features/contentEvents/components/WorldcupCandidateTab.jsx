/**
 * 운영 도구 — 월드컵 후보 영화(WorldcupCandidate) 관리 탭.
 *
 * 기능:
 * - 후보 목록 조회 (페이징 + 카테고리 필터)
 * - 신규 후보 등록 모달 (영화 제목/인기도 범위 검색 + 다중 선택 + 기존 category 선택)
 * - 월드컵 카테고리 관리 모달 (등록 + 수정)
 * - 메타 수정 모달
 * - 활성/비활성 토글
 * - 인기도 임계값 미만 일괄 비활성화 (인기 없는 영화 일괄 제외)
 * - hard delete
 *
 * 운영 모델:
 * - WorldcupService.startWorldcup() 진입 시 활성 후보 풀에서 우선 선택
 * - 카테고리(예: DEFAULT/ACTION/DIRECTOR_NOLAN)별로 후보 묶어 다양한 토너먼트 운영
 * - (movieId, category_id) 복합 UNIQUE — 같은 영화를 여러 카테고리에 등록 가능
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { MdRefresh, MdAdd, MdEdit, MdDelete, MdToggleOn, MdToggleOff, MdFilterList, MdSearch, MdClose } from 'react-icons/md';
import {
  fetchCandidates,
  createCandidatesBulk,
  updateCandidate,
  updateCandidateActive,
  deactivateBelowPopularity,
  deleteCandidate,
  searchMovies,
} from '../api/worldcupCandidateApi';
import {
  fetchAllWorldcupCategories,
  createWorldcupCategory,
  updateWorldcupCategory,
} from '../api/worldcupCategoryApi';

const PAGE_SIZE = 10;
const MODE_CREATE = 'CREATE';
const MODE_EDIT = 'EDIT';
const EMPTY_FORM = {
  movieId: '',
  category: '',
  isActive: true,
};
const EMPTY_CATEGORY_FORM = {
  categoryCode: '',
  categoryName: '',
  description: '',
  enabled: true,
  displayOrder: '0',
};

export default function WorldcupCandidateTab() {
  /* ── 목록 상태 ── */
  const [candidates, setCandidates] = useState([]);
  const [categories, setCategories] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categoryFilterInput, setCategoryFilterInput] = useState('');
  const [categoryFilterHovered, setCategoryFilterHovered] = useState(false);
  const [categoryFilterFocused, setCategoryFilterFocused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [error, setError] = useState(null);

  /* ── 모달 상태 ── */
  const [modalMode, setModalMode] = useState(null);
  const [editTargetId, setEditTargetId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryModalMode, setCategoryModalMode] = useState(MODE_CREATE);
  const [categoryEditTargetId, setCategoryEditTargetId] = useState(null);
  const [categoryForm, setCategoryForm] = useState(EMPTY_CATEGORY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [categorySubmitting, setCategorySubmitting] = useState(false);
  const [movieKeyword, setMovieKeyword] = useState('');
  const [moviePopularityMin, setMoviePopularityMin] = useState('');
  const [moviePopularityMax, setMoviePopularityMax] = useState('');
  const [movieResults, setMovieResults] = useState([]);
  const [movieSearching, setMovieSearching] = useState(false);
  const [movieSearchError, setMovieSearchError] = useState(null);
  const [moviePage, setMoviePage] = useState(0);
  const [movieTotalPages, setMovieTotalPages] = useState(0);
  const [selectedMovies, setSelectedMovies] = useState([]);
  const searchDebounceRef = useRef(null);

  /* ── 일괄 작업 상태 ── */
  const [busyId, setBusyId] = useState(null);
  const [bulkThreshold, setBulkThreshold] = useState(5.0);
  const [bulkBusy, setBulkBusy] = useState(false);

  const getDefaultCategoryCode = useCallback(() => {
    const defaultCategory = categories.find((item) => item.categoryCode === 'DEFAULT');
    return defaultCategory?.categoryCode ?? categories[0]?.categoryCode ?? '';
  }, [categories]);
  const selectedCategoryMissing = Boolean(
    form.category && !categories.some((item) => item.categoryCode === form.category)
  );
  const filteredCategoryOptions = categories.filter((item) => {
    const keyword = categoryFilterInput.trim().toLowerCase();
    if (!keyword) return true;
    return (
      item.categoryCode?.toLowerCase().includes(keyword) ||
      item.categoryName?.toLowerCase().includes(keyword)
    );
  });
  const isCategoryFilterDropdownVisible =
    (categoryFilterHovered || categoryFilterFocused) && categories.length > 0;

  const loadCandidates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = { page, size: PAGE_SIZE };
      if (categoryFilter) params.category = categoryFilter;
      const result = await fetchCandidates(params);
      setCandidates(result?.content ?? []);
      setTotalPages(result?.totalPages ?? 0);
    } catch (err) {
      setError(err.message || '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [page, categoryFilter]);

  const loadCategories = useCallback(async () => {
    try {
      setCategoriesLoading(true);
      const result = await fetchAllWorldcupCategories();
      setCategories(Array.isArray(result) ? result : []);
    } catch (err) {
      setCategories([]);
      console.error('월드컵 카테고리 목록 조회 실패:', err);
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  useEffect(() => { loadCandidates(); }, [loadCandidates]);
  useEffect(() => { loadCategories(); }, [loadCategories]);
  useEffect(() => () => clearTimeout(searchDebounceRef.current), []);

  function handleCategoryFilterChange(e) {
    const value = e.target.value;
    setCategoryFilterInput(value);
    setPage(0);

    const normalizedValue = value.trim().toLowerCase();
    if (!normalizedValue) {
      setCategoryFilter('');
      return;
    }

    const exactMatch = categories.find((item) =>
      item.categoryCode?.toLowerCase() === normalizedValue ||
      item.categoryName?.toLowerCase() === normalizedValue
    );

    setCategoryFilter(exactMatch?.categoryCode ?? '');
  }

  function handleCategoryFilterSelect(category) {
    setCategoryFilterInput(category.categoryName ?? category.categoryCode ?? '');
    setCategoryFilter(category.categoryCode ?? '');
    setPage(0);
    setCategoryFilterFocused(false);
  }

  function handleCategoryFilterClear() {
    setCategoryFilterInput('');
    setCategoryFilter('');
    setPage(0);
    setCategoryFilterFocused(false);
  }

  function openCreateModal() {
    if (categoriesLoading) {
      alert('카테고리 목록을 불러오는 중입니다. 잠시 후 다시 시도하세요.');
      return;
    }
    if (categories.length === 0) {
      alert('등록된 월드컵 카테고리가 없습니다. 먼저 `카테고리 등록`으로 카테고리를 추가하세요.');
      return;
    }
    setForm({
      ...EMPTY_FORM,
      category: getDefaultCategoryCode(),
    });
    setMovieKeyword('');
    setMoviePopularityMin('');
    setMoviePopularityMax('');
    setMovieResults([]);
    setMovieSearchError(null);
    setMoviePage(0);
    setMovieTotalPages(0);
    setSelectedMovies([]);
    setEditTargetId(null);
    setModalMode(MODE_CREATE);
  }

  function openEditModal(item) {
    setForm({
      movieId: item.movieId ?? '',
      category: item.category ?? '',
      isActive: !!item.isActive,
    });
    setMovieKeyword('');
    setMoviePopularityMin('');
    setMoviePopularityMax('');
    setMovieResults([]);
    setMovieSearchError(null);
    setMoviePage(0);
    setMovieTotalPages(0);
    setSelectedMovies([]);
    setEditTargetId(item.id);
    setModalMode(MODE_EDIT);
  }

  function openCategoryModal() {
    setCategoryForm(EMPTY_CATEGORY_FORM);
    setCategoryModalMode(MODE_CREATE);
    setCategoryEditTargetId(null);
    setCategorySubmitting(false);
    setCategoryModalOpen(true);
  }

  function startCategoryCreate() {
    setCategoryForm(EMPTY_CATEGORY_FORM);
    setCategoryModalMode(MODE_CREATE);
    setCategoryEditTargetId(null);
    setCategorySubmitting(false);
  }

  function startCategoryEdit(category) {
    setCategoryForm({
      categoryCode: category.categoryCode ?? '',
      categoryName: category.categoryName ?? '',
      description: category.description ?? '',
      enabled: category.enabled ?? true,
      displayOrder: String(category.displayOrder ?? 0),
    });
    setCategoryModalMode(MODE_EDIT);
    setCategoryEditTargetId(category.categoryId);
    setCategorySubmitting(false);
  }

  function closeModal() {
    clearTimeout(searchDebounceRef.current);
    setModalMode(null);
    setEditTargetId(null);
    setForm(EMPTY_FORM);
    setMovieKeyword('');
    setMoviePopularityMin('');
    setMoviePopularityMax('');
    setMovieResults([]);
    setMovieSearchError(null);
    setMoviePage(0);
    setMovieTotalPages(0);
    setSelectedMovies([]);
    setSubmitting(false);
  }

  function closeCategoryModal() {
    setCategoryModalOpen(false);
    setCategoryForm(EMPTY_CATEGORY_FORM);
    setCategoryModalMode(MODE_CREATE);
    setCategoryEditTargetId(null);
    setCategorySubmitting(false);
  }

  function handleFormChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  }

  function handleCategoryFormChange(e) {
    const { name, value, type, checked } = e.target;
    setCategoryForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  }

  function parseOptionalNumber(value) {
    if (value === '' || value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  async function runMovieSearch({ page: nextPage = 0, keyword = movieKeyword } = {}) {
    const normalizedKeyword = keyword.trim();
    const popularityMin = parseOptionalNumber(moviePopularityMin);
    const popularityMax = parseOptionalNumber(moviePopularityMax);

    if (!normalizedKeyword && popularityMin == null && popularityMax == null) {
      setMovieResults([]);
      setMovieTotalPages(0);
      setMoviePage(0);
      setMovieSearchError(null);
      return;
    }

    if (popularityMin != null && popularityMax != null && popularityMin > popularityMax) {
      setMovieResults([]);
      setMovieTotalPages(0);
      setMoviePage(0);
      setMovieSearchError('인기도 최소값은 최대값보다 클 수 없습니다.');
      return;
    }

    try {
      setMovieSearching(true);
      setMovieSearchError(null);
      const result = await searchMovies({
        keyword: normalizedKeyword || undefined,
        popularityMin: popularityMin ?? undefined,
        popularityMax: popularityMax ?? undefined,
        page: nextPage,
        size: 50,
      });
      setMovieResults(Array.isArray(result?.content) ? result.content : []);
      setMoviePage(result?.number ?? nextPage);
      setMovieTotalPages(result?.totalPages ?? 0);
    } catch (err) {
      setMovieSearchError(err.message || '검색 중 오류가 발생했습니다.');
      setMovieResults([]);
      setMovieTotalPages(0);
      setMoviePage(0);
    } finally {
      setMovieSearching(false);
    }
  }

  function handleMovieKeywordChange(e) {
    const value = e.target.value;
    setMovieKeyword(value);
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => runMovieSearch({ page: 0, keyword: value }), 300);
  }

  function handleMovieSearchKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(searchDebounceRef.current);
      runMovieSearch({ page: 0 });
    }
  }

  function handleMoviePopularityMinChange(e) {
    setMoviePopularityMin(e.target.value);
  }

  function handleMoviePopularityMaxChange(e) {
    setMoviePopularityMax(e.target.value);
  }

  function isMovieSelected(movieId) {
    return selectedMovies.some((movie) => movie.movieId === movieId);
  }

  function addMovie(movie) {
    setSelectedMovies((prev) => {
      if (prev.some((item) => item.movieId === movie.movieId)) return prev;
      return [...prev, movie];
    });
  }

  function removeSelectedMovie(movieId) {
    setSelectedMovies((prev) => prev.filter((movie) => movie.movieId !== movieId));
  }

  function handleMovieSearchClick() {
    clearTimeout(searchDebounceRef.current);
    runMovieSearch({ page: 0 });
  }

  function handleMoviePageChange(nextPage) {
    if (nextPage < 0 || nextPage >= movieTotalPages) return;
    clearTimeout(searchDebounceRef.current);
    runMovieSearch({ page: nextPage });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    if (modalMode === MODE_CREATE && selectedMovies.length === 0) {
      alert('후보에 추가할 영화를 1개 이상 선택하세요.');
      return;
    }
    if (!form.category?.trim()) {
      alert('등록할 카테고리를 선택하세요.');
      return;
    }
    try {
      setSubmitting(true);
      const payload = {
        isActive: !!form.isActive,
      };
      if (modalMode === MODE_CREATE) {
        const category = form.category.trim();
        const result = await createCandidatesBulk({
          movieIds: selectedMovies.map((movie) => movie.movieId),
          category,
        });
        if (result.created === 0) {
          alert(result.failed[0] || '후보 등록에 실패했습니다.');
          return;
        }
        const failedCount = result.failed.length;
        alert(
          failedCount > 0
            ? `${result.created}개 후보를 등록했고 ${failedCount}개는 실패했습니다.`
            : `${result.created}개 후보를 등록했습니다.`
        );
      } else if (modalMode === MODE_EDIT && editTargetId != null) {
        await updateCandidate(editTargetId, payload);
      }
      closeModal();
      loadCandidates();
    } catch (err) {
      alert(err.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCategorySubmit(e) {
    e.preventDefault();
    if (categorySubmitting) return;

    const categoryCode = categoryForm.categoryCode?.trim();
    const categoryName = categoryForm.categoryName?.trim();
    const description = categoryForm.description?.trim() || null;
    const enabled = !!categoryForm.enabled;
    const displayOrderRaw = `${categoryForm.displayOrder ?? ''}`.trim();
    const displayOrder = displayOrderRaw === '' ? 0 : Number(displayOrderRaw);

    if (!categoryCode || !categoryName) {
      alert('카테고리 코드와 카테고리 명을 입력하세요.');
      return;
    }
    if (!Number.isInteger(displayOrder) || displayOrder < 0) {
      alert('노출 우선순위는 0 이상의 정수만 입력할 수 있습니다.');
      return;
    }

    try {
      setCategorySubmitting(true);
      if (categoryModalMode === MODE_CREATE) {
        await createWorldcupCategory({
          categoryCode,
          categoryName,
          description,
          enabled,
          displayOrder,
        });
      } else {
        if (categoryEditTargetId == null) {
          alert('수정할 카테고리를 다시 선택하세요.');
          return;
        }
        await updateWorldcupCategory(categoryEditTargetId, {
          categoryName,
          description,
          enabled,
          displayOrder,
        });
      }
      await loadCategories();
      await loadCandidates();
      if (categoryModalMode === MODE_CREATE) {
        startCategoryCreate();
        alert(`카테고리 ${categoryCode}를 등록했습니다.`);
      } else {
        alert(`카테고리 ${categoryCode}를 수정했습니다.`);
      }
    } catch (err) {
      alert(err.message || '카테고리 저장 중 오류가 발생했습니다.');
    } finally {
      setCategorySubmitting(false);
    }
  }

  async function handleToggleActive(item) {
    if (busyId === item.id) return;
    try {
      setBusyId(item.id);
      await updateCandidateActive(item.id, !item.isActive);
      loadCandidates();
    } catch (err) {
      alert(err.message || '상태 변경 실패');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item) {
    if (busyId === item.id) return;
    if (!confirm(`월드컵 후보 #${item.id} (영화 ${item.movieId}, 카테고리 ${item.category})를 삭제합니다.\n이 작업은 되돌릴 수 없습니다.`)) {
      return;
    }
    try {
      setBusyId(item.id);
      await deleteCandidate(item.id);
      loadCandidates();
    } catch (err) {
      alert(err.message || '삭제 실패');
    } finally {
      setBusyId(null);
    }
  }

  /** 인기도 임계값 미만 일괄 비활성화 */
  async function handleBulkDeactivate() {
    if (bulkBusy) return;
    if (!confirm(
      `movies.popularity_score < ${bulkThreshold} 인 모든 활성 후보를 비활성화합니다.\n` +
      `이 작업은 인기 없는 영화를 월드컵 풀에서 일괄 제외합니다.\n` +
      `계속하시겠습니까?`
    )) {
      return;
    }
    try {
      setBulkBusy(true);
      const result = await deactivateBelowPopularity(Number(bulkThreshold));
      alert(result?.message ?? `${result?.affected ?? 0}개 후보가 비활성화되었습니다.`);
      loadCandidates();
    } catch (err) {
      alert(err.message || '일괄 비활성화 실패');
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <Container>
      {/* ── 툴바 ── */}
      <Toolbar>
        <ToolbarLeft>
          <ToolbarTitle>월드컵 후보 영화 관리</ToolbarTitle>
          <FilterWrap
            onMouseEnter={() => setCategoryFilterHovered(true)}
            onMouseLeave={() => setCategoryFilterHovered(false)}
          >
            <FilterInput
              type="text"
              placeholder="카테고리 필터 검색 (코드/이름)"
              value={categoryFilterInput}
              onChange={handleCategoryFilterChange}
              onFocus={() => setCategoryFilterFocused(true)}
              onBlur={() => setCategoryFilterFocused(false)}
            />
            {isCategoryFilterDropdownVisible && (
              <FilterDropdown>
                <FilterDropdownItem
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleCategoryFilterClear();
                  }}
                >
                  전체 카테고리
                </FilterDropdownItem>
                {filteredCategoryOptions.length === 0 ? (
                  <FilterDropdownEmpty>일치하는 카테고리가 없습니다.</FilterDropdownEmpty>
                ) : (
                  filteredCategoryOptions.map((category) => (
                    <FilterDropdownItem
                      key={category.categoryId}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleCategoryFilterSelect(category);
                      }}
                    >
                      <FilterDropdownName>{category.categoryName}</FilterDropdownName>
                      <FilterDropdownCode>{category.categoryCode}</FilterDropdownCode>
                    </FilterDropdownItem>
                  ))
                )}
              </FilterDropdown>
            )}
          </FilterWrap>
        </ToolbarLeft>
        <ToolbarRight>
          <PrimaryButton onClick={openCreateModal}>
            <MdAdd size={16} /> 신규 등록
          </PrimaryButton>
          <SecondaryButton onClick={openCategoryModal}>
            <MdAdd size={16} /> 카테고리 등록
          </SecondaryButton>
          <IconButton onClick={loadCandidates} disabled={loading} title="새로고침">
            <MdRefresh size={16} />
          </IconButton>
        </ToolbarRight>
      </Toolbar>

      {/* ── 일괄 작업 패널 ── */}
      <BulkPanel>
        <BulkLabel>
          <MdFilterList size={16} />
          인기 없는 영화 일괄 비활성화 — movies.popularity_score &lt;
        </BulkLabel>
        <BulkInput
          type="number"
          step="0.1"
          min="0"
          value={bulkThreshold}
          onChange={(e) => setBulkThreshold(e.target.value)}
        />
        <BulkButton onClick={handleBulkDeactivate} disabled={bulkBusy}>
          {bulkBusy ? '처리 중...' : '실행'}
        </BulkButton>
        <BulkHint>
          임계값 미만의 모든 활성 후보가 isActive=false로 일괄 전환됩니다.
        </BulkHint>
      </BulkPanel>

      <HelperText>
        월드컵 시작 시 <strong>활성 후보 풀</strong>에서 우선 선택됩니다. 카테고리 매칭 → 셔플 →
        부족 시 전체 활성 풀 → 최후 fallback Movie 랜덤 조회 순서로 동작합니다.
        같은 영화를 여러 카테고리에 등록 가능합니다.
      </HelperText>

      {error && <ErrorMsg>{error}</ErrorMsg>}

      {/* ── 테이블 ── */}
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th $w="60px">ID</Th>
              <Th $w="280px">영화 제목</Th>
              <Th $w="180px">카테고리</Th>
              <Th $w="100px">인기도</Th>
              <Th $w="80px">활성</Th>
              <Th $w="220px">액션</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6}><CenterCell>불러오는 중...</CenterCell></td></tr>
            ) : candidates.length === 0 ? (
              <tr><td colSpan={6}><CenterCell>등록된 후보가 없습니다.</CenterCell></td></tr>
            ) : (
              candidates.map((item) => (
                <Tr key={item.id}>
                  <Td><MutedText>{item.id}</MutedText></Td>
                  <Td>
                    <MovieTitleCell>
                      <MovieListTitle>{item.movieTitle ?? item.movieId}</MovieListTitle>
                      {item.movieTitleEn && item.movieTitleEn !== item.movieTitle && (
                        <MovieListTitleEn>{item.movieTitleEn}</MovieListTitleEn>
                      )}
                      <MovieListMeta>
                        <CodeText>{item.movieId}</CodeText>
                      </MovieListMeta>
                    </MovieTitleCell>
                  </Td>
                  <Td>
                    <CategoryCell>
                      <CategoryBadge>{item.category}</CategoryBadge>
                      <CategoryNameText>{item.categoryName ?? '-'}</CategoryNameText>
                    </CategoryCell>
                  </Td>
                  <Td><MutedText>{(item.popularity ?? 0).toFixed(2)}</MutedText></Td>
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
                        disabled={busyId === item.id}
                        title={item.isActive ? '비활성화' : '활성화'}
                      >
                        {item.isActive ? <MdToggleOff size={14} /> : <MdToggleOn size={14} />}
                        {item.isActive ? ' 비활성' : ' 활성'}
                      </SmallButton>
                      <DangerSmallButton
                        onClick={() => handleDelete(item)}
                        disabled={busyId === item.id}
                      >
                        <MdDelete size={13} /> 삭제
                      </DangerSmallButton>
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
              {modalMode === MODE_CREATE ? '월드컵 후보 신규 등록' : '월드컵 후보 수정'}
            </DialogTitle>
            <form onSubmit={handleSubmit}>
              {modalMode === MODE_CREATE && (
                <Field>
                  <Label>영화 검색 *</Label>
                  <MovieSearchRow>
                    <MovieSearchInput
                      type="text"
                      value={movieKeyword}
                      onChange={handleMovieKeywordChange}
                      onKeyDown={handleMovieSearchKeyDown}
                      placeholder="영화 제목으로 검색 (한글/영문)"
                    />
                    <MovieSearchNumberInput
                      type="number"
                      min="0"
                      step="0.1"
                      value={moviePopularityMin}
                      onChange={handleMoviePopularityMinChange}
                      onKeyDown={handleMovieSearchKeyDown}
                      placeholder="인기도 최소"
                    />
                    <MovieSearchNumberInput
                      type="number"
                      min="0"
                      step="0.1"
                      value={moviePopularityMax}
                      onChange={handleMoviePopularityMaxChange}
                      onKeyDown={handleMovieSearchKeyDown}
                      placeholder="인기도 최대"
                    />
                    <SearchIconButton
                      type="button"
                      onClick={handleMovieSearchClick}
                      disabled={movieSearching}
                      title="검색"
                    >
                      <MdSearch size={16} />
                    </SearchIconButton>
                  </MovieSearchRow>
                  <FieldHint>
                    제목 또는 인기도 범위로 검색할 수 있습니다. 인기도는 최소/최대 중 하나만 넣어도 됩니다.
                  </FieldHint>
                  {movieSearchError && <FieldHint $error>{movieSearchError}</FieldHint>}
                  {movieSearching && <FieldHint>검색 중...</FieldHint>}
                  {!movieSearching && movieResults.length > 0 && (
                    <>
                      <MovieResultList>
                        {movieResults.map((movie) => {
                          const isSelected = isMovieSelected(movie.movieId);
                          return (
                            <MovieResultItem key={movie.movieId} $selected={isSelected}>
                              <MovieResultInfo>
                                <MovieResultTitle>
                                  {movie.title}
                                  {movie.titleEn && <MovieResultTitleEn> ({movie.titleEn})</MovieResultTitleEn>}
                                </MovieResultTitle>
                                <MovieResultMeta>
                                  {[
                                    movie.releaseYear,
                                    movie.director,
                                    typeof movie.popularity === 'number' ? `POP ${movie.popularity.toFixed(2)}` : null,
                                  ].filter(Boolean).join(' · ')}
                                  <MovieIdBadge>ID: {movie.movieId}</MovieIdBadge>
                                </MovieResultMeta>
                              </MovieResultInfo>
                              {isSelected ? (
                                <RemoveMovieButton
                                  type="button"
                                  onClick={() => removeSelectedMovie(movie.movieId)}
                                >
                                  선택 해제
                                </RemoveMovieButton>
                              ) : (
                                <SelectMovieButton
                                  type="button"
                                  onClick={() => addMovie(movie)}
                                >
                                  후보 추가
                                </SelectMovieButton>
                              )}
                            </MovieResultItem>
                          );
                        })}
                      </MovieResultList>
                      {movieTotalPages > 1 && (
                        <SearchPagination>
                          <PageButton
                            type="button"
                            onClick={() => handleMoviePageChange(moviePage - 1)}
                            disabled={moviePage === 0 || movieSearching}
                          >
                            이전 50개
                          </PageButton>
                          <PageInfo>{moviePage + 1} / {movieTotalPages}</PageInfo>
                          <PageButton
                            type="button"
                            onClick={() => handleMoviePageChange(moviePage + 1)}
                            disabled={moviePage + 1 >= movieTotalPages || movieSearching}
                          >
                            다음 50개
                          </PageButton>
                        </SearchPagination>
                      )}
                    </>
                  )}
                  {!movieSearching && (movieKeyword.trim() || moviePopularityMin || moviePopularityMax) && movieResults.length === 0 && !movieSearchError && (
                    <FieldHint>검색 결과가 없습니다.</FieldHint>
                  )}
                  {selectedMovies.length > 0 && (
                    <SelectedMovieSection>
                      <SelectedMovieSectionTitle>
                        선택한 후보 영화 {selectedMovies.length}개
                      </SelectedMovieSectionTitle>
                      <SelectedMovieList>
                        {selectedMovies.map((movie) => (
                          <SelectedMovieCard key={movie.movieId}>
                            <SelectedMovieInfo>
                              <SelectedMovieTitle>{movie.title}</SelectedMovieTitle>
                              <SelectedMovieMeta>
                                {[
                                  movie.releaseYear,
                                  movie.director,
                                  typeof movie.popularity === 'number' ? `POP ${movie.popularity.toFixed(2)}` : null,
                                ].filter(Boolean).join(' · ')}
                                <MovieIdBadge>ID: {movie.movieId}</MovieIdBadge>
                              </SelectedMovieMeta>
                            </SelectedMovieInfo>
                            <SelectedMovieRemoveButton
                              type="button"
                              onClick={() => removeSelectedMovie(movie.movieId)}
                              title="선택 해제"
                            >
                              <MdClose size={14} />
                            </SelectedMovieRemoveButton>
                          </SelectedMovieCard>
                        ))}
                      </SelectedMovieList>
                    </SelectedMovieSection>
                  )}
                </Field>
              )}
              <FieldRow>
                {modalMode === MODE_EDIT && (
                  <Field>
                    <Label>영화 ID *</Label>
                    <Input
                      type="text"
                      name="movieId"
                      value={form.movieId}
                      onChange={handleFormChange}
                      disabled
                      maxLength={50}
                    />
                  </Field>
                )}
                <Field>
                  <Label>카테고리 *</Label>
                  <Select
                    name="category"
                    value={form.category}
                    onChange={handleFormChange}
                    disabled={modalMode === MODE_EDIT || categoriesLoading || categories.length === 0}
                  >
                    {selectedCategoryMissing && (
                      <option value={form.category}>{form.category}</option>
                    )}
                    {categories.length === 0 ? (
                      <option value="">등록된 카테고리 없음</option>
                    ) : (
                      categories.map((category) => (
                        <option key={category.categoryId} value={category.categoryCode}>
                          {category.categoryName} ({category.categoryCode})
                        </option>
                      ))
                    )}
                  </Select>
                </Field>
              </FieldRow>
              {modalMode === MODE_EDIT ? (
                <FieldHint>
                  영화 ID와 카테고리는 식별자이므로 변경 불가합니다. 다른 카테고리에 등록하려면 신규 등록하세요.
                </FieldHint>
              ) : (
                <FieldHint>
                  선택한 영화들이 모두 같은 기존 카테고리로 등록됩니다. 새 카테고리는 상단 `카테고리 등록` 버튼에서만 만들 수 있습니다.
                </FieldHint>
              )}
              <Field>
                <Label>인기도 (자동 반영)</Label>
                <FieldHint>
                  movies.popularity_score를 자동 반영합니다. 신규 등록과 수정 저장 시 최신 값으로 다시 동기화됩니다.
                </FieldHint>
              </Field>
              {modalMode === MODE_EDIT && (
                <Field>
                  <CheckboxLabel>
                    <input
                      type="checkbox"
                      name="isActive"
                      checked={form.isActive}
                      onChange={handleFormChange}
                    />
                    <span>활성화 (월드컵 풀에 노출)</span>
                  </CheckboxLabel>
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

      {categoryModalOpen && (
        <Overlay onClick={closeCategoryModal}>
          <DialogBox onClick={(e) => e.stopPropagation()}>
            <DialogTitle>
              {categoryModalMode === MODE_CREATE ? '월드컵 카테고리 등록' : '월드컵 카테고리 수정'}
            </DialogTitle>
            <form onSubmit={handleCategorySubmit}>
              <Field>
                <Label>카테고리 코드 *</Label>
                <Input
                  type="text"
                  name="categoryCode"
                  value={categoryForm.categoryCode}
                  onChange={handleCategoryFormChange}
                  maxLength={100}
                  disabled={categoryModalMode === MODE_EDIT}
                  placeholder="DEFAULT / ACTION_THEME / DIRECTOR_NOLAN"
                />
              </Field>
              <Field>
                <Label>카테고리 명 *</Label>
                <Input
                  type="text"
                  name="categoryName"
                  value={categoryForm.categoryName}
                  onChange={handleCategoryFormChange}
                  maxLength={100}
                  placeholder="액션 특집 / 놀란 감독전"
                />
              </Field>
              <Field>
                <Label>카테고리 설명</Label>
                <Textarea
                  name="description"
                  value={categoryForm.description}
                  onChange={handleCategoryFormChange}
                  rows={3}
                  placeholder="이 카테고리에 포함할 후보 영화 기준을 설명합니다."
                />
              </Field>
              <FieldRow>
                <Field>
                  <Label>카테고리 활성화</Label>
                  <ToggleLabel>
                    <ToggleInput
                      type="checkbox"
                      name="enabled"
                      checked={!!categoryForm.enabled}
                      onChange={handleCategoryFormChange}
                    />
                    <ToggleTrack $checked={!!categoryForm.enabled}>
                      <ToggleThumb $checked={!!categoryForm.enabled} />
                    </ToggleTrack>
                    <ToggleText>{categoryForm.enabled ? '활성화' : '비활성화'}</ToggleText>
                  </ToggleLabel>
                  <FieldHint>
                    비활성화하면 사용자 월드컵 카테고리 목록에서 숨겨집니다.
                  </FieldHint>
                </Field>
                <Field>
                  <Label>노출 우선순위</Label>
                  <Input
                    type="number"
                    name="displayOrder"
                    value={categoryForm.displayOrder}
                    onChange={handleCategoryFormChange}
                    min="0"
                    step="1"
                    placeholder="0"
                  />
                  <FieldHint>
                    0 이상의 정수. 값이 높을수록 먼저 노출됩니다.
                  </FieldHint>
                </Field>
              </FieldRow>
              {categoryModalMode === MODE_EDIT && (
                <FieldHint>
                  카테고리 코드는 식별자이므로 수정할 수 없습니다. 다른 코드가 필요하면 새 카테고리를 등록하세요.
                </FieldHint>
              )}
              <DialogFooter>
                {categoryModalMode === MODE_EDIT && (
                  <SecondaryButton type="button" onClick={startCategoryCreate}>
                    새 카테고리 입력
                  </SecondaryButton>
                )}
                <CancelButton type="button" onClick={closeCategoryModal}>취소</CancelButton>
                <PrimaryButton type="submit" disabled={categorySubmitting}>
                  {categorySubmitting
                    ? (categoryModalMode === MODE_CREATE ? '생성 중...' : '수정 중...')
                    : (categoryModalMode === MODE_CREATE ? '생성' : '수정')}
                </PrimaryButton>
              </DialogFooter>
            </form>
            <CategoryManageSection>
              <CategoryManageHeader>
                <CategoryManageTitle>기존 카테고리</CategoryManageTitle>
                <CategoryManageHint>
                  수정할 카테고리를 선택하면 위 입력폼이 수정 모드로 전환됩니다.
                </CategoryManageHint>
              </CategoryManageHeader>
              {categoriesLoading ? (
                <FieldHint>카테고리 목록을 불러오는 중...</FieldHint>
              ) : categories.length === 0 ? (
                <FieldHint>등록된 카테고리가 없습니다.</FieldHint>
              ) : (
                <CategoryManageList>
                  {categories.map((category) => (
                    <CategoryManageItem
                      key={category.categoryId}
                      $active={category.categoryId === categoryEditTargetId}
                    >
                      <CategoryManageInfo>
                        <CategoryManageCode>{category.categoryCode}</CategoryManageCode>
                        <CategoryManageName>{category.categoryName}</CategoryManageName>
                        <CategoryMetaRow>
                          <StatusPill $active={category.enabled}>
                            {category.enabled ? '활성' : '비활성'}
                          </StatusPill>
                          <CategoryPriorityBadge>
                            노출 우선순위 {category.displayOrder ?? 0}
                          </CategoryPriorityBadge>
                        </CategoryMetaRow>
                        <CategoryManageDescription>
                          {category.description?.trim() || '설명 없음'}
                        </CategoryManageDescription>
                      </CategoryManageInfo>
                      <SmallButton
                        type="button"
                        onClick={() => startCategoryEdit(category)}
                      >
                        <MdEdit size={13} /> 수정
                      </SmallButton>
                    </CategoryManageItem>
                  ))}
                </CategoryManageList>
              )}
            </CategoryManageSection>
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
const FilterWrap = styled.div`
  position: relative;
  width: 260px;
`;
const FilterInput = styled.input`
  padding: 6px 10px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.bgCard};
  color: ${({ theme }) => theme.colors.textPrimary};
  width: 100%;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; outline: none; }
`;
const FilterDropdown = styled.div`
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 30;
  max-height: 280px;
  overflow-y: auto;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  background: ${({ theme }) => theme.colors.bgCard};
  box-shadow: ${({ theme }) => theme.shadows.md};
`;
const FilterDropdownItem = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  text-align: left;
  background: transparent;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight};

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: ${({ theme }) => theme.colors.bgHover};
  }
`;
const FilterDropdownName = styled.span`
  min-width: 0;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
`;
const FilterDropdownCode = styled.span`
  flex-shrink: 0;
  font-family: 'Menlo', 'Monaco', monospace;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.bgHover};
  color: ${({ theme }) => theme.colors.textSecondary};
`;
const FilterDropdownEmpty = styled.div`
  padding: 12px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
`;

/* 일괄 작업 패널 */
const BulkPanel = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  background: ${({ theme }) => theme.colors.bgHover};
  padding: ${({ theme }) => theme.spacing.md};
  border-radius: 4px;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;
`;
const BulkLabel = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;
const BulkInput = styled.input`
  width: 80px;
  padding: 5px 8px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.bgCard};
  color: ${({ theme }) => theme.colors.textPrimary};
`;
const BulkButton = styled.button`
  padding: 5px 14px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  background: ${({ theme }) => theme.colors.warning ?? '#f59e0b'};
  color: #fff;
  border-radius: 4px;
  &:hover:not(:disabled) { opacity: 0.9; }
  &:disabled { opacity: 0.5; }
`;
const BulkHint = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textMuted};
  flex-basis: 100%;
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
const SecondaryButton = styled(PrimaryButton)`
  background: ${({ theme }) => theme.colors.bgCard};
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.border};

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.primary};
    background: ${({ theme }) => theme.colors.bgHover};
    opacity: 1;
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
const MovieTitleCell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;
const MovieListTitle = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
  line-height: 1.35;
`;
const MovieListTitleEn = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  line-height: 1.3;
`;
const MovieListMeta = styled.div`
  margin-top: 2px;
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
const CategoryCell = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
`;
const CategoryNameText = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
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
  max-width: 560px;
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
  flex-wrap: wrap;
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
const Select = styled.select`
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
const FieldHint = styled.span`
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: ${({ $error, theme }) => ($error ? theme.colors.error : theme.colors.textMuted)};
`;
const CheckboxLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
`;
const ToggleLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
`;
const ToggleInput = styled.input`
  position: absolute;
  opacity: 0;
  pointer-events: none;
`;
const ToggleTrack = styled.span`
  position: relative;
  width: 46px;
  height: 26px;
  border-radius: 999px;
  background: ${({ $checked, theme }) =>
    $checked ? theme.colors.primary : theme.colors.border};
  transition: background ${({ theme }) => theme.transitions.fast};
  box-shadow: ${({ $checked, theme }) =>
    $checked ? `0 0 0 4px ${theme.colors.primary}22` : 'none'};
`;
const ToggleThumb = styled.span`
  position: absolute;
  top: 3px;
  left: ${({ $checked }) => ($checked ? '23px' : '3px')};
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.28);
  transition: left ${({ theme }) => theme.transitions.fast};
`;
const ToggleText = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;
const DialogFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.lg};
  flex-wrap: wrap;
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

const MovieSearchRow = styled.div`
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
  flex-wrap: wrap;
`;

const MovieSearchInput = styled.input`
  flex: 1;
  min-width: 180px;
  padding: 7px 10px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.bgCard};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; outline: none; }
`;

const MovieSearchNumberInput = styled.input`
  width: 120px;
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
  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.primary};
  }
  &:disabled { opacity: 0.4; }
`;

const MovieResultList = styled.ul`
  list-style: none;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  max-height: 220px;
  overflow-y: auto;
  margin-bottom: 8px;
`;

const SearchPagination = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: 8px;
`;

const MovieResultItem = styled.li`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight};
  background: ${({ $selected, theme }) => ($selected ? theme.colors.bgHover : 'transparent')};
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
  flex-wrap: wrap;
`;

const MovieIdBadge = styled.span`
  font-family: 'Menlo', 'Monaco', monospace;
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 3px;
  background: ${({ theme }) => theme.colors.bgHover};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const SelectMovieButton = styled.button`
  flex-shrink: 0;
  padding: 3px 10px;
  font-size: 12px;
  border: 1px solid ${({ theme }) => theme.colors.primary};
  border-radius: 3px;
  color: ${({ theme }) => theme.colors.primary};
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primary};
    color: #fff;
  }
  &:disabled {
    opacity: 0.4;
    border-color: ${({ theme }) => theme.colors.border};
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const RemoveMovieButton = styled(SelectMovieButton)`
  border-color: ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textSecondary};

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.error};
    background: ${({ theme }) => theme.colors.error};
    color: #fff;
  }
`;

const SelectedMovieSection = styled.div`
  margin-top: 10px;
`;

const SelectedMovieSectionTitle = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 6px;
`;

const SelectedMovieList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SelectedMovieCard = styled.div`
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.bgHover};
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
`;

const SelectedMovieInfo = styled.div`
  min-width: 0;
  flex: 1;
`;

const SelectedMovieTitle = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const SelectedMovieMeta = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textMuted};
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  flex-wrap: wrap;
`;

const SelectedMovieRemoveButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textMuted};
  background: ${({ theme }) => theme.colors.bgCard};
  flex-shrink: 0;

  &:hover {
    border-color: ${({ theme }) => theme.colors.error};
    color: ${({ theme }) => theme.colors.error};
  }
`;

const CategoryManageSection = styled.div`
  margin-top: ${({ theme }) => theme.spacing.xl};
  padding-top: ${({ theme }) => theme.spacing.lg};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`;

const CategoryManageHeader = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const CategoryManageTitle = styled.h4`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: 4px;
`;

const CategoryManageHint = styled.p`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const CategoryManageList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 240px;
  overflow-y: auto;
`;

const CategoryManageItem = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid ${({ $active, theme }) =>
    $active ? theme.colors.primary : theme.colors.border};
  border-radius: 4px;
  background: ${({ $active, theme }) =>
    $active ? theme.colors.bgHover : theme.colors.bgCard};
`;

const CategoryManageInfo = styled.div`
  min-width: 0;
  flex: 1;
`;

const CategoryManageCode = styled.div`
  display: inline-block;
  font-family: 'Menlo', 'Monaco', monospace;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 3px;
  background: ${({ theme }) => theme.colors.bgHover};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 6px;
`;

const CategoryManageName = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const CategoryMetaRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 6px;
`;

const CategoryPriorityBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgHover};
  border: 1px solid ${({ theme }) => theme.colors.border};
`;

const CategoryManageDescription = styled.div`
  margin-top: 3px;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textMuted};
  line-height: 1.45;
  white-space: pre-wrap;
`;
